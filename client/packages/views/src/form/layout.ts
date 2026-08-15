/**
 * groupLayout — dựng cấu trúc Tab → Section → Column từ danh sách field phẳng.
 * Mirror Frappe form: Tab Break / Section Break / Column Break là ranh giới bố cục.
 *
 * Khi DocType KHÔNG khai Tab Break, runtime tự tổ chức form lớn thành 2 tầng dễ đọc:
 *  - Thông tin chính: field bắt buộc, field có thể trở thành bắt buộc, `surface=quick`,
 *    dependency cần để điều khiển các field chính, hoặc metadata ép `form_tab=primary`.
 *  - Nâng cao: phần còn lại, trừ metadata ép `form_tab=advanced`.
 *
 * DocType đã khai Tab Break thì metadata thắng tuyệt đối — không tự xáo lại bố cục tác giả đã thiết kế.
 *  - KHÔNG sinh tab/section rỗng ở đầu (chỉ tạo default khi field hiển thị đầu KHÔNG phải Tab Break).
 *  - Tôn trọng depends_on của Tab Break & Section Break (break ẩn ⇒ tab/section ẩn).
 */
import type { DocField, ResolvedField } from "@metaforge/core";

export interface FormColumn {
  fields: ResolvedField[];
}
export interface FormSection {
  label?: string;
  style?: "summary";
  columns: FormColumn[];
  /** ẩn nếu Section Break bị depends_on ẩn, hoặc không field con nào hiển thị. */
  hidden: boolean;
}
export interface FormTab {
  label: string;
  sections: FormSection[];
}

const LAYOUT_HOLD = new Set(["Heading", "HTML"]); // layout mang nội dung, vẫn hiện
const AUTO_PRIMARY_LABEL = "Thông tin chính";
const AUTO_ADVANCED_LABEL = "Nâng cao";

/** Tối đa 2 cột. Frappe cho tới 4 cột/section, nhưng trên màn ERP thực tế (sidebar + cột ngữ cảnh
 * bên phải) 3–4 cột làm mỗi ô hẹp lại còn ~150px — vừa khó đọc vừa cắt cụt giá trị. 2 cột là mức
 * đọc thoải mái mà vẫn gấp đôi mật độ so với 1 cột. Cột thứ 3, 4 (nếu doctype có) được GỘP vào
 * 2 cột đầu theo thứ tự, không mất field nào. */
export const MAX_COLUMNS = 2;

/** Field cần TRỌN chiều ngang: bảng con và ô soạn thảo dài nhét vào nửa form thì không dùng được. */
const FULL_WIDTH_TYPES = new Set(["Table", "Table MultiSelect", "Text Editor", "Code", "HTML", "Markdown Editor", "Long Text"]);

export function isFullWidthField(fieldtype: string): boolean {
  return FULL_WIDTH_TYPES.has(fieldtype);
}

export type FormFieldWidth = "full" | "two_thirds" | "half" | "third";

const THIRD_WIDTH_TYPES = new Set([
  "Check", "Int", "Float", "Currency", "Percent", "Duration", "Rating",
  "Date", "Datetime", "Time", "Select", "Color",
]);
const THIRD_WIDTH_NAMES = /(^|_)(status|state|uom|unit|currency|priority)(_|$)/i;

/**
 * Quy tắc độ rộng form dùng chung toàn hệ thống.
 *
 * Metadata khai `form_width` luôn thắng. Nếu DocType cũ chưa khai thì tiêu đề và
 * nội dung dài chiếm trọn hàng, field nhận diện ngắn chiếm 1/3, còn lại chiếm 1/2.
 */
export function resolveFormFieldWidth(field: DocField, _titleField?: string): FormFieldWidth {
  if (field.form_width === "full" || field.form_width === "two_thirds" || field.form_width === "half" || field.form_width === "third") return field.form_width;
  if (isFullWidthField(field.fieldtype)) return "full";
  if (THIRD_WIDTH_TYPES.has(field.fieldtype) || THIRD_WIDTH_NAMES.test(field.fieldname)) return "third";
  return "half";
}

interface RawTab {
  label: string;
  visible: boolean;
  items: ResolvedField[];
}

/** Lấy field được tham chiếu trong expression kiểu `eval:doc.company` hoặc shorthand `company`. */
function fieldsInExpression(expr: string | undefined): string[] {
  if (!expr) return [];
  if (expr.startsWith("eval:")) {
    return [...expr.matchAll(/\bdoc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((match) => match[1]!);
  }
  const bare = expr.trim();
  return bare && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bare) ? [bare] : [];
}

/**
 * Quyết định field thuộc tầng chính dựa trên SCHEMA tĩnh, không dùng `rf.required` động.
 * Dùng required động sẽ làm field nhảy qua lại giữa hai tab khi mandatory_depends_on đổi giá trị.
 */
function isPrimaryField(field: DocField): boolean {
  if (field.reqd === 1 || Boolean(field.mandatory_depends_on)) return true;
  if (field.form_tab === "primary") return true;
  if (field.form_tab === "advanced") return false;
  return field.surface === "quick";
}

/**
 * Field điều khiển một field chính cũng phải ở tab chính. Nếu không người dùng phải vào Nâng cao
 * để bật một checkbox/select rồi quay lại tab đầu mới thấy field bắt buộc vừa xuất hiện.
 */
function collectPrimaryFieldNames(items: ResolvedField[]): Set<string> {
  const data = items.filter((item) => !item.layout);
  const byName = new Map(data.map((item) => [item.field.fieldname, item.field] as const));
  const primary = new Set(data.filter((item) => isPrimaryField(item.field)).map((item) => item.field.fieldname));

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const fieldname of [...primary]) {
      const field = byName.get(fieldname);
      if (!field) continue;
      const dependencies = [
        ...fieldsInExpression(field.depends_on),
        ...fieldsInExpression(field.mandatory_depends_on),
        ...fieldsInExpression(field.read_only_depends_on),
      ];
      if (field.fieldtype === "Dynamic Link" && typeof field.options === "string") dependencies.push(field.options);
      if (typeof field.link_filters === "string") dependencies.push(...fieldsInExpression(field.link_filters));
      for (const dependency of dependencies) {
        if (byName.has(dependency) && !primary.has(dependency)) {
          primary.add(dependency);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return primary;
}

/**
 * Heading/HTML không có value nên không tự biết thuộc tab nào. Gắn nó theo field dữ liệu kế tiếp
 * trong cùng section; nếu không có thì theo field trước. Nhờ vậy tiêu đề "Bảo hiểm" đi cùng nhóm
 * BHXH thay vì bị bỏ hoặc nằm sai tab.
 */
function splitSectionFields(fields: ResolvedField[], primaryNames: Set<string>): { primary: ResolvedField[]; advanced: ResolvedField[] } {
  const bucketOf = (index: number): "primary" | "advanced" => {
    const current = fields[index]!;
    if (!current.layout) return primaryNames.has(current.field.fieldname) ? "primary" : "advanced";
    for (let next = index + 1; next < fields.length; next++) {
      const candidate = fields[next]!;
      if (!candidate.layout) return primaryNames.has(candidate.field.fieldname) ? "primary" : "advanced";
    }
    for (let prev = index - 1; prev >= 0; prev--) {
      const candidate = fields[prev]!;
      if (!candidate.layout) return primaryNames.has(candidate.field.fieldname) ? "primary" : "advanced";
    }
    return "advanced";
  };

  const primary: ResolvedField[] = [];
  const advanced: ResolvedField[] = [];
  fields.forEach((field, index) => (bucketOf(index) === "primary" ? primary : advanced).push(field));
  return { primary, advanced };
}

function splitSections(sections: FormSection[], primaryNames: Set<string>): { primary: FormSection[]; advanced: FormSection[] } {
  const primary: FormSection[] = [];
  const advanced: FormSection[] = [];
  for (const section of sections) {
    if (section.hidden) continue;
    const fields = section.columns.flatMap((column) => column.fields);
    const split = splitSectionFields(fields, primaryNames);
    if (split.primary.length) primary.push({ ...section, hidden: false, columns: layoutColumns([{ fields: split.primary }]) });
    if (split.advanced.length) advanced.push({ ...section, hidden: false, columns: layoutColumns([{ fields: split.advanced }]) });
  }
  return { primary, advanced };
}

/**
 * Auto-layout chỉ chạy khi schema KHÔNG có Tab Break. Nếu cả hai nhóm đều có field hiển thị thì
 * sinh đúng hai tab. Nếu form quá nhỏ hoặc toàn optional/toàn required thì giữ nguyên một tab để
 * không tạo điều hướng vô ích.
 */
function autoOrganizeUntabbed(items: ResolvedField[]): FormTab[] | null {
  const sections = buildSections(items);
  const primaryNames = collectPrimaryFieldNames(items);
  if (!primaryNames.size) return null;

  const split = splitSections(sections, primaryNames);
  const primaryCount = split.primary.reduce((count, section) => count + section.columns.reduce((sum, column) => sum + column.fields.filter((item) => !item.layout).length, 0), 0);
  const advancedCount = split.advanced.reduce((count, section) => count + section.columns.reduce((sum, column) => sum + column.fields.filter((item) => !item.layout).length, 0), 0);
  if (!primaryCount || !advancedCount) return null;

  return [
    { label: AUTO_PRIMARY_LABEL, sections: split.primary },
    { label: AUTO_ADVANCED_LABEL, sections: split.advanced },
  ];
}

export function groupLayout(resolved: ResolvedField[]): FormTab[] {
  const hasExplicitTabs = resolved.some((rf) => rf.field.fieldtype === "Tab Break");
  if (!hasExplicitTabs) {
    const organized = autoOrganizeUntabbed(resolved);
    if (organized) return organized;
  }

  // 1) tách theo Tab Break — đoạn TRƯỚC Tab Break đầu = tab ngầm (chỉ giữ nếu có nội dung).
  const rawTabs: RawTab[] = [];
  let cur: RawTab = { label: "", visible: true, items: [] };
  for (const rf of resolved) {
    if (rf.field.fieldtype === "Tab Break") {
      rawTabs.push(cur);
      cur = { label: rf.field.label ?? rf.field.fieldname, visible: rf.visible, items: [] };
    } else {
      cur.items.push(rf);
    }
  }
  rawTabs.push(cur);

  // 2) dựng section cho từng tab; bỏ tab ẩn (Tab Break depends_on false) hoặc tab rỗng (kể cả tab ngầm đầu).
  const tabs: FormTab[] = [];
  for (const rt of rawTabs) {
    if (!rt.visible) continue;
    const sections = buildSections(rt.items);
    const hasContent = sections.some((s) => !s.hidden);
    if (!hasContent) continue; // loại tab rỗng (gồm tab ngầm đầu tiên)
    tabs.push({ label: rt.label, sections });
  }
  return tabs;
}

function buildSections(items: ResolvedField[]): FormSection[] {
  const acc: Array<{ section: FormSection; breakHidden: boolean }> = [];
  let currentCol: FormColumn | null = null;
  let started = false;

  const startSection = (label: string | undefined, breakHidden: boolean, style?: "summary") => {
    const col: FormColumn = { fields: [] };
    const section: FormSection = { label, ...(style ? { style } : {}), columns: [col], hidden: true };
    acc.push({ section, breakHidden });
    currentCol = col;
    started = true;
  };

  for (const rf of items) {
    const ft = rf.field.fieldtype;
    if (ft === "Section Break") {
      startSection(rf.field.label, !rf.visible, rf.field.form_section_style === "summary" ? "summary" : undefined); // Section Break ẩn ⇒ section ẩn
    } else if (ft === "Column Break") {
      if (!started) startSection(undefined, false);
      currentCol = { fields: [] };
      acc[acc.length - 1]!.section.columns.push(currentCol);
    } else {
      if (!started) startSection(undefined, false);
      if (rf.visible || (rf.layout && LAYOUT_HOLD.has(ft))) currentCol!.fields.push(rf);
    }
  }

  return acc.map(({ section, breakHidden }) => {
    const hasVisible = section.columns.some((c) => c.fields.length > 0);
    return { ...section, hidden: breakHidden || !hasVisible, columns: layoutColumns(section.columns) };
  });
}

/**
 * GỘP mọi cột của section thành MỘT danh sách phẳng.
 *
 * Không tự chia field vào 2 danh sách nữa. Chia tay đẻ ra hai lớp lỗi đã gặp:
 *  - Column Break của doctype + Form Profile lọc field ⇒ có cột RỖNG, nửa form trắng trơn.
 *  - Section ít field ⇒ dồn hết vào cột trái, nửa phải bỏ không.
 * Giờ FormView render một lưới CSS 2 cột và để field tự chảy trái→phải, lấp đầy tự nhiên;
 * field chiếm trọn hàng (bảng con, ô soạn thảo) tự span 2 cột.
 */
function layoutColumns(columns: FormColumn[]): FormColumn[] {
  const all = columns.flatMap((c) => c.fields);
  return all.length ? [{ fields: all }] : columns;
}
