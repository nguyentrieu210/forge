/**
 * Form Profile — chọn lọc field hiển thị trên Form/List của MỘT DocType cho MỘT app.
 *
 * Vấn đề: DocType chuẩn ERPNext rất rộng (Purchase Receipt ~150 field, Stock Entry ~120) vì phải
 * phục vụ mọi ngành, mọi quốc gia. Render hết ra thì thủ kho phải cuộn qua hàng chục field ngoại tệ,
 * chi phí nhập khẩu, thuế, subcontracting… chỉ để nhập 5 dòng hàng. Đó không còn là "app đơn giản".
 *
 * Cách làm: KHÔNG sửa DocType phía server (§6 nguyên tắc #2 của BRD — không đụng lõi ERPNext).
 * Chỉ lọc `meta.fields` ở phía client trước khi render. Dữ liệu vẫn nguyên vẹn: field bị ẩn không
 * được gửi lên trong payload thay đổi, nên giá trị mặc định/server-side vẫn chạy bình thường.
 *
 * BA QUY TẮC AN TOÀN (đừng gỡ nếu chưa hiểu hậu quả):
 *  1. KHÔNG BAO GIỜ ẩn field `reqd: 1`. Ẩn đi thì người dùng không có chỗ nhập, form không lưu được
 *     và thông báo lỗi trỏ tới một field họ không nhìn thấy — bế tắc hoàn toàn.
 *  2. Field đang được field khác tham chiếu qua `depends_on` / `mandatory_depends_on` /
 *     `read_only_depends_on` phải được giữ nếu field phụ thuộc còn hiển thị, nếu không biểu thức
 *     điều kiện sẽ đọc `undefined` và ẩn/hiện sai.
 *  3. Sau khi lọc phải DỌN các thanh phân đoạn rỗng (Section/Column/Tab Break không còn field nào
 *     bên dưới), nếu không form đầy tiêu đề mục trống — còn xấu hơn lúc chưa lọc.
 */
import type { DocField, DocTypeMeta } from "../types/meta.js";

export interface FormProfile {
  /** Chỉ giữ đúng các field này (kèm field bắt buộc + phụ thuộc). Bỏ trống = giữ tất cả. */
  keep?: string[];
  /** Ẩn các field này. Áp dụng SAU `keep`. Dùng khi chỉ muốn bỏ vài field thừa. */
  hide?: string[];
}

/** Field chỉ để bố cục — không mang dữ liệu. */
const LAYOUT_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "Fold"]);
/** Field bố cục CÓ hiển thị nội dung riêng — giữ như field thường nếu profile chọn. */
const CONTENT_TYPES = new Set(["HTML", "Heading"]);

function isLayout(f: DocField): boolean {
  return LAYOUT_TYPES.has(f.fieldtype);
}

/** Rút tên field xuất hiện trong biểu thức `depends_on` kiểu `eval:doc.abc` hoặc `abc`. */
function fieldsInExpression(expr: string | undefined): string[] {
  if (!expr) return [];
  // eval: → lấy mọi `doc.<field>`; không eval: → cả chuỗi chính là tên field.
  if (expr.startsWith("eval:")) {
    return [...expr.matchAll(/\bdoc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]!);
  }
  const bare = expr.trim();
  return bare && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bare) ? [bare] : [];
}

/**
 * Trả về meta mới với `fields` đã lọc. Meta gốc KHÔNG bị sửa (các container dùng chung một object
 * meta từ cache react-query; sửa tại chỗ sẽ làm hỏng mọi màn khác đang dùng cùng doctype).
 */
export function applyFormProfile(meta: DocTypeMeta, profile: FormProfile | undefined): DocTypeMeta {
  if (!profile || (!profile.keep?.length && !profile.hide?.length)) return meta;
  const all = meta.fields ?? [];
  if (all.length === 0) return meta;

  const keep = profile.keep?.length ? new Set(profile.keep) : null;
  const hide = new Set(profile.hide ?? []);
  // title_field là thứ hiện trên tiêu đề form/breadcrumb; ẩn nó đi thì bản ghi mất tên gọi.
  if (keep && meta.title_field) keep.add(meta.title_field);
  hide.delete(meta.title_field ?? "");

  // Bước 1 — quyết định giữ/bỏ cho từng field MANG DỮ LIỆU.
  const visible = new Set<string>();
  for (const f of all) {
    if (isLayout(f)) continue;
    if (CONTENT_TYPES.has(f.fieldtype) && !keep) { visible.add(f.fieldname); continue; }
    // Quy tắc 1: field bắt buộc luôn hiển thị, kể cả khi profile quên liệt kê hoặc cố tình ẩn.
    if (f.reqd === 1) { visible.add(f.fieldname); continue; }
    if (hide.has(f.fieldname)) continue;
    if (keep && !keep.has(f.fieldname)) continue;
    visible.add(f.fieldname);
  }

  // Bước 2 — quy tắc 2: kéo thêm field bị các field đang hiển thị tham chiếu trong biểu thức điều kiện.
  // Lặp tới khi ổn định vì field vừa kéo vào cũng có thể có depends_on riêng.
  const byName = new Map(all.map((f) => [f.fieldname, f] as const));
  for (let pass = 0; pass < 5; pass++) {
    let added = false;
    for (const name of [...visible]) {
      const f = byName.get(name);
      if (!f) continue;
      const deps = [
        ...fieldsInExpression(f.depends_on),
        ...fieldsInExpression(f.mandatory_depends_on),
        ...fieldsInExpression(f.read_only_depends_on),
      ];
      for (const d of deps) {
        if (!visible.has(d) && byName.has(d)) { visible.add(d); added = true; }
      }
    }
    if (!added) break;
  }

  // Bước 3 — dựng danh sách theo ĐÚNG thứ tự gốc, giữ nguyên mọi thanh phân đoạn (dọn ở bước 4).
  const kept = all.filter((f) => isLayout(f) || visible.has(f.fieldname));

  // Bước 4 — quy tắc 3: bỏ thanh phân đoạn không còn nội dung.
  return { ...meta, fields: pruneEmptyBreaks(kept) };
}

/**
 * `surface=internal` is a hard visibility boundary for canonical Meta, stronger than a FormProfile.
 *
 * FormProfile deliberately keeps required/title/dependency fields visible as a safety net for
 * legacy schemas. Older metadata may already carry a `surface` hint without the canonical
 * ownership fields. Treating that hint as the v1 boundary would silently hide required inputs.
 * Canonical fields are distinguishable because they carry ownership/enforcement metadata.
 */
function isCanonicalInternalField(field: DocField): boolean {
  return field.surface === "internal" && (
    field.valueSource !== undefined
    || field.editMode !== undefined
    || field.serverEnforced !== undefined
  );
}

function stripInternalSurface(meta: DocTypeMeta): DocTypeMeta {
  return {
    ...meta,
    fields: pruneEmptyBreaks(meta.fields.filter((field) => !isCanonicalInternalField(field))),
  };
}

/**
 * Compact quick-entry is opt-in metadata, never a guess based on field type.
 *
 * The caller must keep using the original meta for defaults and serialisation. This
 * function only returns the schema rendered by FormView, so expanded/internal fields
 * can still be populated by defaults, Link fetches and server controllers.
 */
export function applyFormSurface(meta: DocTypeMeta, surface: "quick" | "expanded"): DocTypeMeta {
  const declared = meta.fields.filter((field) => field.surface !== undefined);
  if (!declared.length) return meta;
  if (surface === "expanded") {
    return stripInternalSurface(applyFormProfile(meta, {
      hide: meta.fields.filter((field) => field.surface === "internal").map((field) => field.fieldname),
    }));
  }
  const quick = meta.fields
    .filter((field) => field.surface === "quick")
    .map((field) => field.fieldname);
  return stripInternalSurface(applyFormProfile(meta, { keep: quick }));
}

/**
 * Bỏ Section/Column/Tab Break rỗng. Duyệt NGƯỢC từ cuối: một thanh là "rỗng" khi giữa nó và thanh
 * kế tiếp (cùng cấp hoặc cao hơn) không còn field dữ liệu nào. Duyệt ngược cho phép quyết định
 * trong một lượt — thanh cuối cùng luôn rỗng nếu không có gì sau nó.
 */
function pruneEmptyBreaks(fields: DocField[]): DocField[] {
  const drop = new Set<number>();

  // Column Break: rỗng nếu tới field kế tiếp đã là break khác (hoặc hết danh sách).
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i]!;
    if (f.fieldtype !== "Column Break") continue;
    let hasContent = false;
    for (let j = i + 1; j < fields.length; j++) {
      if (drop.has(j)) continue;
      const g = fields[j]!;
      if (isLayout(g)) break;
      hasContent = true;
      break;
    }
    if (!hasContent) drop.add(i);
  }

  // Section Break: rỗng nếu tới Section/Tab Break kế tiếp không còn field dữ liệu nào.
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i]!;
    if (f.fieldtype !== "Section Break" && f.fieldtype !== "Fold") continue;
    let hasContent = false;
    for (let j = i + 1; j < fields.length; j++) {
      if (drop.has(j)) continue;
      const g = fields[j]!;
      if (g.fieldtype === "Section Break" || g.fieldtype === "Tab Break" || g.fieldtype === "Fold") break;
      if (g.fieldtype === "Column Break") continue;
      hasContent = true;
      break;
    }
    if (!hasContent) drop.add(i);
  }

  // Tab Break: rỗng nếu tới Tab Break kế tiếp không còn field dữ liệu nào.
  for (let i = fields.length - 1; i >= 0; i--) {
    const f = fields[i]!;
    if (f.fieldtype !== "Tab Break") continue;
    let hasContent = false;
    for (let j = i + 1; j < fields.length; j++) {
      if (drop.has(j)) continue;
      const g = fields[j]!;
      if (g.fieldtype === "Tab Break") break;
      if (isLayout(g)) continue;
      hasContent = true;
      break;
    }
    if (!hasContent) drop.add(i);
  }

  return fields.filter((_, i) => !drop.has(i));
}

/** Bộ profile theo doctype cho cả app. */
export type FormProfileMap = Record<string, FormProfile>;
