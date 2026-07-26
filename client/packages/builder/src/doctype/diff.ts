/**
 * diffMeta (Gate 6) — DIFF tất định giữa 2 canonical DocTypeMeta (baseline ↔ draft).
 * Builder KHÔNG sinh metadata riêng: nó là trình sửa có kiểm soát trên chính schema Frappe.
 * Diff này là nền cho: xem trước thay đổi, validate-trước-apply, và semantic-equality của round-trip.
 *
 * Tất định: so theo `fieldname` (không theo vị trí), thứ tự output sắp xếp ổn định.
 * Bỏ qua khoá tính toán (`_compat`) và `idx` khi so field-props (thứ tự xử lý riêng ở `reordered`).
 */
import type { DocTypeMeta, DocField, DocPerm } from "@metaforge/core";

/** thay đổi 1 prop của field/doctype. */
export interface PropChange {
  from: unknown;
  to: unknown;
}

export interface FieldChange {
  fieldname: string;
  props: Record<string, PropChange>;
}

/** khoá định danh 1 rule DocPerm — Frappe cho phép NHIỀU hàng CÙNG role+permlevel khác nhau chỉ ở
 * if_owner (vd "Desk User" permlevel 0: 1 hàng if_owner=0 read-only + 1 hàng if_owner=1 write) ⇒
 * (role, permlevel) KHÔNG đủ để định danh duy nhất, PHẢI gồm if_owner. */
export function permRuleKey(p: DocPerm): string {
  return `${p.role}|${p.permlevel ?? 0}|${p.if_owner ?? 0}`;
}

export interface PermRuleChange {
  key: string;
  role: string;
  permlevel: number;
  if_owner: 0 | 1;
  props: Record<string, PropChange>;
}

export interface PermDiff {
  /** rule (role+permlevel+if_owner) có trong draft, không có trong baseline. */
  added: DocPerm[];
  /** rule có trong baseline, không có trong draft. */
  removed: DocPerm[];
  /** rule TRÙNG khoá nhưng khác ptype (read/write/create/delete/submit/cancel/amend/…). */
  changed: PermRuleChange[];
}

export interface ReorderMove {
  fieldname: string;
  from: number; // vị trí trong danh sách field CHUNG của baseline
  to: number; // vị trí trong danh sách field CHUNG của draft
}

export interface MetaDiff {
  /** field có trong draft, không có trong baseline. */
  added: DocField[];
  /** field có trong baseline, không có trong draft. */
  removed: DocField[];
  /** field cùng fieldname nhưng khác prop (không tính _compat/idx). */
  changed: FieldChange[];
  /** thứ tự các field CHUNG có đổi không. */
  reordered: boolean;
  /** chi tiết di chuyển (chỉ field chung đổi vị trí tương đối). */
  moves: ReorderMove[];
  /** prop cấp doctype đổi (title_field, is_submittable, autoname…). */
  doc: Record<string, PropChange>;
  /** P2-BUILDER-01 (review độc lập) — diff RIÊNG cho DocPerm; trước đây diffMeta bỏ qua hoàn toàn
   * `permissions` ⇒ 1 thay đổi CHỈ-permission (không đụng field/doc prop nào) báo hasChanges=false
   * (nút Apply không bật) và metaEqual coi 2 meta khác permission là "giống hệt" sau round-trip. */
  permissions: PermDiff;
}

/** prop cấp field bỏ qua khi so — khoá TÍNH TOÁN (_compat) · THỨ TỰ (idx) · PLUMBING child-row của
 * Frappe (doctype/parent/parentfield/parenttype). Đây là hạ tầng, KHÔNG phải định nghĩa ngữ nghĩa
 * ⇒ bỏ qua để semantic-equality bền vững qua round-trip save→reload (Gate 6.3/6.4). */
const FIELD_IGNORE = new Set(["_compat", "idx", "doctype", "parent", "parentfield", "parenttype", "name", "creation", "modified", "modified_by", "owner"]);
/** prop scalar cấp doctype được so (fields/permissions xử lý riêng). */
const DOC_PROPS = [
  "name", "module", "issingle", "istable", "is_submittable", "is_tree",
  "autoname", "title_field", "image_field", "track_changes",
] as const;

function byFieldname(fields: DocField[]): Map<string, DocField> {
  const m = new Map<string, DocField>();
  for (const f of fields) if (f?.fieldname) m.set(f.fieldname, f);
  return m;
}

/** so sánh sâu 2 giá trị (ổn định — dùng JSON với key đã sắp). `undefined`/`null`/`0` coi TƯƠNG ĐƯƠNG
 * (P2-BUILDER-01, phát hiện LIVE): field/DocPerm dạng checkbox (0|1 — reqd/hidden/read/write/…) mà
 * Frappe lưu ở DB LUÔN có giá trị 0 tường minh khi "chưa bật", nhưng 1 draft user/Builder tự construct
 * (chỉ set ptype nào họ chạm tới) thường ĐỂ TRỐNG key thay vì set 0 — nếu so strict, "chưa set" (draft)
 * ≠ "0 tường minh" (server reload) → báo changed SAI dù ngữ nghĩa giống hệt (round-trip PERM live đã
 * bắt được đúng case này: rule mới chỉ set read/write/create/delete/if_owner, server trả về kèm cả
 * submit/cancel/amend=0 → diffPermissions báo lệch nếu không coi 2 giá trị này tương đương). KHÔNG áp
 * cho giá trị khác 0/null/undefined (vd 1 khác "Open" vẫn so strict như cũ). */
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const na = a === undefined || a === null ? 0 : a;
  const nb = b === undefined || b === null ? 0 : b;
  if (na === nb) return true;
  return stable(a) === stable(b);
}
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val as Record<string, unknown>).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val,
  );
}

function diffProps(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, PropChange> {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, PropChange> = {};
  for (const k of [...keys].sort()) {
    if (FIELD_IGNORE.has(k)) continue;
    if (!eq(a[k], b[k])) out[k] = { from: a[k], to: b[k] };
  }
  return out;
}

function byPermKey(perms: DocPerm[]): Map<string, DocPerm> {
  const m = new Map<string, DocPerm>();
  for (const p of perms) m.set(permRuleKey(p), p);
  return m;
}

/** diffPermissions (P2-BUILDER-01) — khoá (role, permlevel, if_owner); mọi ptype khác (read/write/
 * create/delete/submit/cancel/amend/…) so qua diffProps CHUNG với field (bỏ cùng tập plumbing). */
export function diffPermissions(baseline: DocPerm[], draft: DocPerm[]): PermDiff {
  const bMap = byPermKey(baseline);
  const dMap = byPermKey(draft);

  const added = [...dMap.entries()].filter(([k]) => !bMap.has(k)).map(([, p]) => p).sort((a, b) => permRuleKey(a).localeCompare(permRuleKey(b)));
  const removed = [...bMap.entries()].filter(([k]) => !dMap.has(k)).map(([, p]) => p).sort((a, b) => permRuleKey(a).localeCompare(permRuleKey(b)));

  const changed: PermRuleChange[] = [];
  for (const [key, bp] of bMap) {
    const dp = dMap.get(key);
    if (!dp) continue;
    const props = diffProps(bp, dp);
    if (Object.keys(props).length) changed.push({ key, role: bp.role, permlevel: bp.permlevel ?? 0, if_owner: (bp.if_owner ?? 0) as 0 | 1, props });
  }
  changed.sort((x, y) => x.key.localeCompare(y.key));

  return { added, removed, changed };
}

export function diffMeta(baseline: DocTypeMeta, draft: DocTypeMeta): MetaDiff {
  const bFields = baseline.fields ?? [];
  const dFields = draft.fields ?? [];
  const bMap = byFieldname(bFields);
  const dMap = byFieldname(dFields);

  const added = dFields.filter((f) => f.fieldname && !bMap.has(f.fieldname)).slice().sort((x, y) => x.fieldname.localeCompare(y.fieldname));
  const removed = bFields.filter((f) => f.fieldname && !dMap.has(f.fieldname)).slice().sort((x, y) => x.fieldname.localeCompare(y.fieldname));

  const changed: FieldChange[] = [];
  for (const [fieldname, bf] of bMap) {
    const df = dMap.get(fieldname);
    if (!df) continue;
    const props = diffProps(bf, df);
    if (Object.keys(props).length) changed.push({ fieldname, props });
  }
  changed.sort((x, y) => x.fieldname.localeCompare(y.fieldname));

  // reorder: chỉ xét các field CHUNG, so thứ tự tương đối.
  const commonB = bFields.map((f) => f.fieldname).filter((n) => dMap.has(n));
  const commonD = dFields.map((f) => f.fieldname).filter((n) => bMap.has(n));
  const reordered = commonB.join(" ") !== commonD.join(" ");
  const moves: ReorderMove[] = [];
  if (reordered) {
    const posB = new Map(commonB.map((n, i) => [n, i]));
    commonD.forEach((n, i) => {
      const from = posB.get(n)!;
      if (from !== i) moves.push({ fieldname: n, from, to: i });
    });
    moves.sort((x, y) => x.fieldname.localeCompare(y.fieldname));
  }

  const doc: Record<string, PropChange> = {};
  for (const k of DOC_PROPS) {
    if (!eq((baseline as Record<string, unknown>)[k], (draft as Record<string, unknown>)[k])) {
      doc[k] = { from: (baseline as Record<string, unknown>)[k], to: (draft as Record<string, unknown>)[k] };
    }
  }

  const permissions = diffPermissions(baseline.permissions ?? [], draft.permissions ?? []);

  return { added, removed, changed, reordered, moves, doc, permissions };
}

/** metaEqual — semantic equality (diff rỗng, GỒM permissions — P2-BUILDER-01). Dùng cho round-trip
 * test (Gate 6.4): 2 meta khác NHAU CHỈ ở quyền không còn bị báo "giống hệt". */
export function metaEqual(a: DocTypeMeta, b: DocTypeMeta): boolean {
  const d = diffMeta(a, b);
  return (
    d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0 && !d.reordered && Object.keys(d.doc).length === 0 &&
    d.permissions.added.length === 0 && d.permissions.removed.length === 0 && d.permissions.changed.length === 0
  );
}

/** hasChanges — draft có khác baseline không, GỒM permissions (dùng để bật/tắt nút Apply — P2-BUILDER-01:
 * trước đây 1 thay đổi CHỈ-permission không bật được nút Apply vì hasChanges bỏ qua permissions). */
export function hasChanges(diff: MetaDiff): boolean {
  return (
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0 || diff.reordered || Object.keys(diff.doc).length > 0 ||
    diff.permissions.added.length > 0 || diff.permissions.removed.length > 0 || diff.permissions.changed.length > 0
  );
}
