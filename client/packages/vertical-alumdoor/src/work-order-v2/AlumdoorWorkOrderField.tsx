/** @jsxImportSource react */
/**
 * Ô nhập của workbench Phiếu sản xuất.
 *
 * Chỉ là một lớp mỏng bọc `AlumdoorSalesOrderField` (làn bán hàng, CHỈ ĐỌC — không sửa file đó).
 * Toàn bộ cơ chế "dùng lại danh mục nền tảng" nằm ở đó: `registry.resolve(fieldtype)` trả về
 * `LinkControl` thật, và `LinkControl` đi qua `FieldServices.searchLink` để tra ĐÚNG DocType
 * danh mục.
 *
 * LUẬT CỨNG của màn này: **không có mảng string cứng nào làm nguồn cho một ô chọn.** Mọi ô chọn
 * đều là `Link` trỏ vào một DocType danh mục thật (`Item`, `Warehouse`, `UOM`, `Item Color`,
 * `Cutting Policy`, `Bill of Materials`, `Production Standard`, `Lý do huỷ`, …). Chỉ `Select`
 * do CHÍNH metadata của DocType khai (đọc qua `optionList`) mới được phép có danh sách cố định,
 * vì lúc đó danh sách là metadata chứ không phải hằng số trong TSX.
 */
import type { DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { AlumdoorSalesOrderField, fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";
import { text, type Json } from "./model.js";

export { fallbackField };

/** DocType danh mục mà từng ô chọn của màn này trỏ tới. Không mã nào được hardcode ngoài đây. */
export const WORK_ORDER_LINK_TARGETS = {
  production_item: "Item",
  motor_model: "Item",
  bom_no: "Bill of Materials",
  company: "Company",
  color: "Item Color",
  source_warehouse: "Warehouse",
  target_warehouse: "Warehouse",
  wip_warehouse: "Warehouse",
  offcut_warehouse: "Warehouse",
  against_sales_order: "Sales Order",
  production_request: "Production Request",
  formula_policy: "Cutting Policy",
  production_standard: "Production Standard",
  cut_reason: "Lý do huỷ",
  uom: "UOM",
  measurement_profile: "Measurement Profile",
} as const;

export type WorkOrderLinkField = keyof typeof WORK_ORDER_LINK_TARGETS;

/**
 * Lấy `DocField` thật từ metadata; không có thì dựng một field tối thiểu.
 *
 * Ưu tiên metadata là điều bắt buộc: nhãn, `reqd`, `link_filters` (vd `{"is_group":0,"disabled":0}`
 * trên hai ô kho) đều nằm ở đó. Tự dựng field là ĐƯỜNG LÙI, không phải mặc định.
 */
export function metaFieldOr(
  meta: DocTypeMeta | null,
  fieldname: string,
  label: string,
  fieldtype: DocField["fieldtype"] = "Data",
  options?: string,
): DocField {
  const found = meta?.fields.find((field) => field.fieldname === fieldname);
  if (found) return found;
  return fallbackField(fieldname, label, fieldtype, options);
}

export function metaFieldRequired(meta: DocTypeMeta | null, fieldname: string): boolean {
  return Boolean(meta?.fields.find((field) => field.fieldname === fieldname)?.reqd);
}

export interface AlumdoorWorkOrderFieldProps {
  id: string;
  field: DocField;
  value: unknown;
  onChange: (value: unknown) => void;
  registry: ControlRegistry;
  services: FieldServices;
  /** DocType chủ của ô — quyết định ngữ cảnh lọc của `LinkControl`. */
  parentDoctype: string;
  docValues: Json;
  roles: string[];
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  className?: string;
  hideLabel?: boolean;
  onCommit?: () => void;
}

export function AlumdoorWorkOrderField(props: AlumdoorWorkOrderFieldProps) {
  return (
    <AlumdoorSalesOrderField
      id={props.id}
      field={props.field}
      label={props.label || text(props.field.label) || props.field.fieldname}
      value={props.value}
      onChange={props.onChange}
      registry={props.registry}
      services={props.services}
      parentDoctype={props.parentDoctype}
      docValues={props.docValues}
      roles={props.roles}
      required={props.required ?? false}
      readOnly={props.readOnly ?? false}
      compact
      hideLabel={props.hideLabel ?? false}
      {...(props.onCommit ? { onCommit: props.onCommit } : {})}
      className={`[&_.mf-control]:!min-h-8 [&_input]:!h-8 [&_button]:!h-8 ${props.className ?? ""}`}
    />
  );
}

/**
 * Ô chỉ để ĐỌC trên đầu phiếu.
 *
 * Lệnh đã ghi sổ thì `LinkControl` không còn giá trị gì hơn một dòng chữ, mà lại tốn một lượt tra
 * danh mục cho mỗi ô. Dùng khối này thay cho việc render control ở chế độ read-only.
 */
export function WorkOrderReadonlyField(props: {
  label: string;
  value: unknown;
  hint?: string;
  mono?: boolean;
  tone?: "default" | "muted" | "danger";
}) {
  const shown = text(props.value);
  const tone = props.tone === "danger"
    ? "text-destructive"
    : props.tone === "muted" || !shown
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium leading-tight text-muted-foreground">{props.label}</div>
      <div className={`truncate text-sm ${props.mono ? "font-mono text-xs" : ""} ${tone}`} title={shown || undefined}>
        {shown || "—"}
      </div>
      {props.hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}
