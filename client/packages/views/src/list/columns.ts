/**
 * deriveColumns — cột List = field in_list_view=1 (fallback title_field/name), giàu metadata
 * để data-table render đúng kiểu: status→badge, số→canh phải, Date/Datetime→format, ảnh→avatar.
 * Mirror Frappe list view. Pure logic (không JSX — render ở cells.tsx).
 */
import { resolveField, type DocTypeMeta, type DocField, type Fieldtype } from "@metaforge/core";

export type CellAlign = "left" | "right" | "center";

export interface ListColumn {
  fieldname: string;
  label: string;
  fieldtype: Fieldtype | "Data";
  options?: string;
  /** Select: giá_trị_gốc → nhãn đã dịch (chỉ để HIỂN THỊ, không dùng làm giá trị). */
  optionLabels?: Record<string, string>;
  /**
   * Sửa được ngay trên danh sách.
   *
   * CHỈ Select không read-only. Cố tình KHÔNG mở cho `status` của chứng từ kho: field đó do
   * ERPNext tự tính từ docstatus và tiến độ nhận/giao hàng — ghi đè tay sẽ làm trạng thái nói
   * một đằng còn sổ kho một nẻo. Đổi trạng thái chứng từ phải đi qua Ghi sổ/Huỷ hoặc workflow.
   */
  inlineEditable?: boolean;
  align: CellAlign;
  /** Select/workflow_state → render badge trạng thái. */
  isStatus: boolean;
  /** cột tiêu đề (title_field/name) — mở record khi click, kèm avatar nếu có image_field. */
  isTitle: boolean;
  /** field ảnh (Attach Image) đứng riêng như avatar. */
  isImage: boolean;
  /** field ảnh được ghép vào cột tiêu đề; không tạo thêm một cột URL ảnh trùng lặp. */
  imageFieldname?: string;
  /** Kích thước khởi đầu theo kiểu dữ liệu; người dùng vẫn có thể kéo đổi. */
  defaultWidth: number;
  /** Ngưỡng riêng theo kiểu dữ liệu để không bóp nát nội dung. */
  minWidth: number;
  precision?: string;
}

const LAYOUT: Fieldtype[] = ["Section Break", "Column Break", "Tab Break", "Fold", "Heading", "HTML", "Button"];
const NUMERIC: Fieldtype[] = ["Currency", "Float", "Int", "Percent"];
const STATUS_NAMES = new Set(["status", "workflow_state", "state"]);

function isLayout(ft: Fieldtype): boolean {
  return LAYOUT.includes(ft);
}
function isNumeric(ft: Fieldtype): boolean {
  return NUMERIC.includes(ft);
}
export function isStatusField(f: { fieldname: string; fieldtype: Fieldtype }): boolean {
  return (f.fieldtype === "Select" && STATUS_NAMES.has(f.fieldname)) || f.fieldname === "workflow_state";
}

function alignFor(ft: Fieldtype): CellAlign {
  if (isNumeric(ft)) return "right";
  if (ft === "Check") return "center";
  return "left";
}

export interface DeriveColumnsCtx {
  /** role user hiện tại — có → lọc cột theo permlevel/masked_fields (P1-PERM-01), giống Form.
   * KHÔNG truyền = giữ hành vi cũ (mọi field in_list_view đều thành cột — dùng cho test/mock). */
  roles?: string[];
}

/** Cột dữ liệu (KHÔNG gồm checkbox/STT — hai cột đó do ListView tự thêm). `ctx.roles` → loại field
 * KHÔNG đọc được (permlevel thiếu quyền / server masked_fields) khỏi cột, dùng CHUNG logic với Form
 * (resolveField) — tránh cột hiện field mà user không có quyền xem giá trị. */
export function deriveColumns(meta: DocTypeMeta, ctx: DeriveColumnsCtx = {}): ListColumn[] {
  const fields = meta.fields ?? [];
  const readable = (f: DocField): boolean =>
    !ctx.roles || !resolveField(f, meta, { roles: ctx.roles, maskedFields: meta.masked_fields }).masked;
  const configuredTitle = meta.title_field ? fields.find((f) => f.fieldname === meta.title_field) : undefined;
  // Field bị ẩn tĩnh hoặc bị mask không được dùng làm title: nếu cố dùng, List vẫn nạp/hiện một
  // cột mà chính metadata/quyền nói rằng user không được thấy.
  const titleField = configuredTitle && configuredTitle.hidden !== 1 && readable(configuredTitle) ? configuredTitle : undefined;
  const titleName = titleField?.fieldname ?? "name";
  const titleLabel = titleName === "name" ? "ID" : titleField?.label ?? titleName;
  const imgField = imageField(meta, ctx);

  const cols: ListColumn[] = [];
  // "name" (không có DocField riêng, không permlevel) luôn đọc được.
  cols.push({
    fieldname: titleName,
    label: titleLabel,
    fieldtype: (titleField?.fieldtype as Fieldtype) ?? "Data",
    options: titleField?.options,
    align: "left",
    isStatus: false,
    isTitle: true,
    isImage: false,
    imageFieldname: imgField,
    defaultWidth: 240,
    minWidth: 180,
  });

  /**
   * `hidden` vẫn bị loại ở đây — giấu nghĩa là giấu, ở MỌI màn.
   *
   * Thứ KHÔNG bị loại là `list_only`: field chỉ hiện ở BẢNG, không hiện trên form. Hai cờ
   * trả lời hai câu khác nhau và không được nhập làm một — `hidden` là "đừng cho ai thấy",
   * `list_only` là "cột này đáng xem trong bảng, nhưng đừng bắt người ta nhìn nó lúc đang
   * gõ". `đã nhận %` là loại thứ hai; một field tên `secret_note` là loại thứ nhất.
   */
  const inList = fields.filter(
    (f: DocField) =>
      f.in_list_view === 1 &&
      f.hidden !== 1 &&
      !isLayout(f.fieldtype) &&
      f.fieldname !== titleName &&
      f.fieldname !== imgField &&
      readable(f),
  );
  const chosen = inList.length > 0 ? inList : titleFallback(meta, titleName).filter(readable);
  for (const f of chosen) {
    // Attach Image đã nằm trong title cell. Nếu fallback chạm đúng field ảnh thì cũng không sinh
    // thêm cột chứa URL thô.
    if (f.hidden === 1 || f.fieldname === imgField) continue;
    const size = sizeFor(f);
    cols.push({
      fieldname: f.fieldname,
      label: f.label ?? f.fieldname,
      fieldtype: f.fieldtype,
      options: f.options,
      optionLabels: f.optionLabels,
      inlineEditable: f.fieldtype === "Select" && !f.read_only && f.fieldname !== "status" && f.fieldname !== "workflow_state",
      align: alignFor(f.fieldtype),
      isStatus: isStatusField(f),
      isTitle: false,
      isImage: f.fieldtype === "Attach Image" || f.fieldname === meta.image_field,
      defaultWidth: size.defaultWidth,
      minWidth: size.minWidth,
      precision: typeof f.precision === "string" ? f.precision : undefined,
    });
  }
  return cols;
}

function titleFallback(meta: DocTypeMeta, titleName: string): DocField[] {
  // không có in_list_view → thêm vài field Data/Select đầu tiên cho có nội dung
  const fields = meta.fields ?? [];
  return fields
    .filter((f) => f.hidden !== 1 && !isLayout(f.fieldtype) && f.fieldname !== titleName && ["Data", "Select", "Link", "Date", "Datetime"].includes(f.fieldtype))
    .slice(0, 4);
}

/** Field ảnh của doctype (avatar cột tiêu đề), đã lọc hidden + field permission như các cột khác. */
export function imageField(meta: DocTypeMeta, ctx: DeriveColumnsCtx = {}): string | undefined {
  const fields = meta.fields ?? [];
  const candidate = meta.image_field
    ? fields.find((field) => field.fieldname === meta.image_field)
    : fields.find((field) => field.fieldtype === "Attach Image");
  if (!candidate || candidate.hidden === 1) return undefined;
  if (ctx.roles && resolveField(candidate, meta, { roles: ctx.roles, maskedFields: meta.masked_fields }).masked) return undefined;
  return candidate.fieldname;
}

function sizeFor(field: DocField): { defaultWidth: number; minWidth: number } {
  if (field.fieldtype === "Check") return { defaultWidth: 80, minWidth: 72 };
  if (field.fieldtype === "Date") return { defaultWidth: 112, minWidth: 104 };
  if (field.fieldtype === "Datetime") return { defaultWidth: 144, minWidth: 128 };
  if (isNumeric(field.fieldtype)) return { defaultWidth: 112, minWidth: 96 };
  if (isStatusField(field)) return { defaultWidth: 128, minWidth: 112 };
  if (field.fieldtype === "Link") return { defaultWidth: 144, minWidth: 120 };
  if (field.fieldtype === "Select") return { defaultWidth: 128, minWidth: 112 };
  if (field.fieldtype === "Small Text" || field.fieldtype === "Text" || field.fieldtype === "Long Text") {
    return { defaultWidth: 200, minWidth: 136 };
  }
  return { defaultWidth: 144, minWidth: 104 };
}
