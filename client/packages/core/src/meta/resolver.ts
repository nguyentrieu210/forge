/**
 * MetaResolver — tính trạng thái RUNTIME của từng field từ meta + doc + quyền.
 * Mirror hành vi Frappe Desk form renderer (KHÔNG hardcode nghiệp vụ):
 *   depends_on · mandatory_depends_on · read_only_depends_on · permlevel · docstatus · masked_fields.
 *
 * Ranh giới bảo mật là SERVER (masked value + perm). Resolver chỉ mirror để UX đúng;
 * masked_fields (từ FormMeta) là nguồn AUTHORITATIVE cho việc che giá trị.
 */
import type { DocTypeMeta, DocField, DocPerm } from "../types/meta.js";
import { NO_VALUE_FIELDTYPES } from "../types/fieldtype.js";
import { evalDependsOn } from "./eval.js";

/** Trạng thái tương tác hiệu lực của 1 field. */
export type FieldState = "hidden" | "masked" | "locked" | "editable";

export interface ResolvedField {
  field: DocField;
  /** field bố cục (Section/Column/Tab/HTML/Button…) — không mang value. */
  layout: boolean;
  /** hiển thị (không hidden + depends_on thoả). */
  visible: boolean;
  /** giá trị bị che (permlevel không đọc được / trong masked_fields). */
  masked: boolean;
  /** không sửa được (read_only / read_only_depends_on / thiếu quyền ghi / docstatus khoá). */
  readOnly: boolean;
  /** bắt buộc (reqd / mandatory_depends_on) — chỉ tính khi visible & !readOnly. */
  required: boolean;
  state: FieldState;
}

export interface ResolveContext {
  /** doc hiện tại (giá trị field cho eval + docstatus). */
  doc?: Record<string, unknown>;
  /** doc cha (khi resolve child table). */
  parent?: Record<string, unknown>;
  /** role của user (khớp DocPerm.role). */
  roles?: string[];
  /** field bị che giá trị — nguồn server (FormMeta.masked_fields). Ưu tiên tuyệt đối. */
  maskedFields?: string[];
  /** ép chế độ chỉ đọc toàn form (vd đang submit/không quyền). */
  forceReadOnly?: boolean;
  /**
   * Bỏ QUA gate quyền-ghi theo permlevel (dùng cho CHILD table): quyền ghi bảng con kế thừa từ
   * cha — DocType con (istable=1) mang `permissions` rỗng nên không tự quyết được. Caller (grid)
   * đã gate bằng readOnly của field cha. Vẫn tôn trọng read_only/read_only_depends_on/docstatus và
   * masked_fields từ server. KHÔNG dùng cho form gốc.
   */
  assumeWritable?: boolean;
}

interface PermLevels {
  read: Set<number>;
  write: Set<number>;
}

/** Tập permlevel user đọc/ghi được = DocPerm có role∈roles và read/write=1. */
export function permLevelsFor(permissions: DocPerm[], roles: string[]): PermLevels {
  const read = new Set<number>();
  const write = new Set<number>();
  const roleSet = new Set(roles);
  for (const p of permissions) {
    if (!roleSet.has(p.role)) continue;
    const lvl = p.permlevel ?? 0;
    if (p.read) read.add(lvl);
    if (p.write) write.add(lvl);
  }
  return { read, write };
}

function docstatusLocks(field: DocField, docstatus: number): boolean {
  if (docstatus === 2) return true; // cancelled → khoá hết
  if (docstatus === 1) return field.allow_on_submit ? false : true; // submitted → khoá trừ allow_on_submit
  return false; // draft
}

/** Resolve 1 field. */
export function resolveField(field: DocField, meta: DocTypeMeta, ctx: ResolveContext = {}): ResolvedField {
  const doc = ctx.doc ?? {};
  const roles = ctx.roles ?? [];
  const layout = NO_VALUE_FIELDTYPES.has(field.fieldtype);
  const permlevel = field.permlevel ?? 0;
  const perms = permLevelsFor(meta.permissions ?? [], roles);
  const docstatus = Number(doc.docstatus ?? 0);

  // visible: !hidden + depends_on
  const visible = field.hidden ? false : evalDependsOn(field.depends_on, doc, ctx.parent);

  // masked: server masked_fields ưu tiên; nếu không có, suy từ permlevel không đọc được.
  // level 0 = đọc được nếu đã mở được doc; level>0 cần read perm ĐÚNG level đó.
  // assumeWritable (child grid): quyền đọc kế thừa cha → chỉ che khi server masked_fields nói che.
  const serverMasked = (ctx.maskedFields ?? meta.masked_fields ?? []).includes(field.fieldname);
  const permReadable = ctx.assumeWritable ? true : permlevel === 0 ? true : perms.read.has(permlevel);
  const masked = !layout && (serverMasked || !permReadable);

  // read-only: field.read_only | read_only_depends_on | thiếu quyền ghi ở permlevel | docstatus | forceReadOnly
  // PHẢI có write perm ĐÚNG permlevel — KHÔNG fallback theo size:
  // {read:1,write:0} nghĩa là "có metadata quyền nhưng KHÔNG được ghi" ⇒ read-only (không phải editable).
  // assumeWritable (child grid): quyền ghi kế thừa cha (grid đã gate bằng readOnly field cha).
  const permWritable = ctx.assumeWritable ? true : perms.write.has(permlevel);
  const roReasons =
    ctx.forceReadOnly === true ||
    field.read_only === 1 ||
    evalDependsOnRO(field.read_only_depends_on, doc, ctx.parent) ||
    docstatusLocks(field, docstatus) ||
    !permWritable;
  const readOnly = !layout && roReasons;

  // required: reqd | mandatory_depends_on — chỉ khi visible & !readOnly (Frappe không ép field ẩn/khoá)
  const required =
    !layout &&
    visible &&
    !readOnly &&
    (field.reqd === 1 || evalDependsOnRO(field.mandatory_depends_on, doc, ctx.parent));

  let state: FieldState;
  if (!visible) state = "hidden";
  else if (masked) state = "masked";
  else if (readOnly) state = "locked";
  else state = "editable";

  return { field, layout, visible, masked, readOnly, required, state };
}

/** depends_on cho mandatory/read_only: rỗng = KHÔNG áp dụng (false), khác với visibility (rỗng=true). */
function evalDependsOnRO(
  expr: string | undefined,
  doc: Record<string, unknown>,
  parent?: Record<string, unknown>,
): boolean {
  if (!expr) return false;
  return evalDependsOn(expr, doc, parent);
}

/** Resolve toàn bộ field của 1 DocType (giữ thứ tự meta). */
export function resolveMeta(meta: DocTypeMeta, ctx: ResolveContext = {}): ResolvedField[] {
  return (meta.fields ?? []).map((f) => resolveField(f, meta, ctx));
}

/** Chỉ field có value + đang hiển thị (dùng cho serialize/validate). */
export function editableFields(resolved: ResolvedField[]): ResolvedField[] {
  return resolved.filter((r) => !r.layout && r.visible && !r.readOnly);
}
