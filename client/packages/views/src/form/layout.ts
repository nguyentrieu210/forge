/**
 * groupLayout — dựng cấu trúc Tab → Section → Column từ danh sách field phẳng.
 * Mirror Frappe form: Tab Break / Section Break / Column Break là ranh giới bố cục.
 *  - KHÔNG sinh tab/section rỗng ở đầu (chỉ tạo default khi field hiển thị đầu KHÔNG phải Tab Break).
 *  - Tôn trọng depends_on của Tab Break & Section Break (break ẩn ⇒ tab/section ẩn).
 */
import type { DocField, ResolvedField } from "@metaforge/core";

export interface FormColumn {
  fields: ResolvedField[];
}
export interface FormSection {
  label?: string;
  columns: FormColumn[];
  /** ẩn nếu Section Break bị depends_on ẩn, hoặc không field con nào hiển thị. */
  hidden: boolean;
}
export interface FormTab {
  label: string;
  sections: FormSection[];
}

const LAYOUT_HOLD = new Set(["Heading", "HTML"]); // layout mang nội dung, vẫn hiện

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

export type FormFieldWidth = "full" | "half" | "third";

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
export function resolveFormFieldWidth(field: DocField, titleField?: string): FormFieldWidth {
  if (field.form_width === "full" || field.form_width === "half" || field.form_width === "third") return field.form_width;
  if (isFullWidthField(field.fieldtype) || field.fieldname === titleField || field.fieldname === "title" || field.fieldname === "subject") return "full";
  if (THIRD_WIDTH_TYPES.has(field.fieldtype) || THIRD_WIDTH_NAMES.test(field.fieldname)) return "third";
  return "half";
}

interface RawTab {
  label: string;
  visible: boolean;
  items: ResolvedField[];
}

export function groupLayout(resolved: ResolvedField[]): FormTab[] {
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

  const startSection = (label: string | undefined, breakHidden: boolean) => {
    const col: FormColumn = { fields: [] };
    const section: FormSection = { label, columns: [col], hidden: true };
    acc.push({ section, breakHidden });
    currentCol = col;
    started = true;
  };

  for (const rf of items) {
    const ft = rf.field.fieldtype;
    if (ft === "Section Break") {
      startSection(rf.field.label, !rf.visible); // Section Break ẩn ⇒ section ẩn
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
 * Chuẩn hoá số cột của 1 section về tối đa `MAX_COLUMNS`.
 *
 * Hai việc:
 *  a) Gộp cột thừa: doctype khai 3–4 cột ⇒ dồn về 2, giữ nguyên thứ tự field.
 *  b) TỰ TÁCH 2 cột khi section chỉ có 1 cột mà nhiều field. Đây là trường hợp hay gặp nhất sau khi
 *     lọc field bằng Form Profile: Column Break nằm giữa các field bị ẩn sẽ bị dọn đi, section sụp
 *     còn 1 cột và form biến thành một dải dọc dài lê thê toàn ô kéo hết bề ngang.
 *
 * Field full-width (bảng con, ô soạn thảo) KHÔNG tính vào việc chia cột — chúng được render tràn
 * hàng ở FormView, nên nếu section chỉ toàn loại này thì giữ nguyên 1 cột.
 */
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
