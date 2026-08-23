/** @jsxImportSource react */
/**
 * Dòng nhận hàng dùng cùng `field_overrides` với Purchase Order. Measurement Profile quyết các
 * dữ kiện vật lý chung; Receipt chỉ thêm lớp actual (kg thực, kg/m thực, chênh lệch, kho nhận).
 */
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { Button, Table } from "@metaforge/ui";
import { AlumdoorSalesOrderField, fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";
import {
  lineFieldLabel,
  lineFieldRequired,
  lineFieldVisible,
  moneyOrDash,
  quantity,
  receiptLineKey,
  text,
  type ReceiptLine,
} from "./model.js";
import { WeightVarianceBadge } from "./FifoInsightPanels.js";
import type { WeightVarianceReading } from "./weight-variance.js";

const TH = "whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "px-1.5 py-1 align-top text-[11px]";
const NUM = `${TD} whitespace-nowrap tabular-nums`;

export interface ReceiptLinesTableProps {
  lines: ReceiptLine[];
  childMeta: DocTypeMeta;
  registry: ControlRegistry;
  services: FieldServices;
  roles: string[];
  readOnly: boolean;
  variances: Map<string, WeightVarianceReading>;
  onPatch: (key: string, patch: Partial<ReceiptLine>) => void;
  onCommit: (key: string, fieldname: string, value: unknown) => void;
  onDelete: (key: string) => void;
  onAdd: () => void;
}

function fieldReadonly(line: ReceiptLine, fieldname: string): boolean {
  const value = line._overrides?.[fieldname]?.read_only;
  return value === true || value === 1;
}

export function ReceiptLinesTable(props: ReceiptLinesTableProps) {
  const metaField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string): DocField =>
    props.childMeta.fields?.find((field) => field.fieldname === fieldname) ?? fallbackField(fieldname, label, fieldtype, options);

  const active = props.lines.filter((line) => text(line.item_code));
  const show = (fieldname: string, fallback = false) => active.some((line) => lineFieldVisible(line, fieldname, fallback));
  const showQtyBar = show("qty_bar");
  const showQtyBundle = show("qty_bundle");
  const showQty = show("qty", true);
  const showActualWeight = show("actual_weight_kg");
  const showTheory = show("theoretical_kg");
  const showLength = show("length_m");
  const showWidth = show("width_m");
  const showColor = show("color");
  const showCondition = show("condition");
  const showStamped = show("is_stamped");
  const showSoNo = show("so_no");
  const showActualKgPerM = show("actual_kg_per_m");

  const control = (
    line: ReceiptLine,
    key: string,
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
    extra?: { field?: DocField; width?: string; required?: boolean },
  ) => {
    const base = extra?.field ?? metaField(fieldname, label, fieldtype, options);
    const overrideLabel = lineFieldLabel(line, fieldname, text(base.label) || label);
    const field = { ...base, label: overrideLabel, read_only: fieldReadonly(line, fieldname) ? 1 : base.read_only } as DocField;
    return <AlumdoorSalesOrderField
      id={`purchase-receipt-${key}-${fieldname}`}
      field={field}
      value={line[fieldname]}
      onChange={(value) => props.onPatch(key, { [fieldname]: value } as Partial<ReceiptLine>)}
      onCommit={() => props.onCommit(key, fieldname, line[fieldname])}
      registry={props.registry}
      services={props.services}
      parentDoctype="Purchase Receipt"
      docValues={line}
      roles={props.roles}
      label={overrideLabel}
      hideLabel
      compact
      required={extra?.required ?? lineFieldRequired(line, fieldname, false)}
      readOnly={props.readOnly || Boolean(line._loading) || fieldReadonly(line, fieldname)}
      className={`${extra?.width ?? "min-w-[110px]"} [&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_button]:!h-7`}
    />;
  };

  const variableColumns = [showQtyBar, showQty, showActualWeight, showTheory, showActualKgPerM, showLength, showWidth, showColor, showStamped, showCondition, showSoNo].filter(Boolean).length;
  // 6 cột đầu + 7 cột giao dịch cuối. Khi có cân thực, một cờ `showActualWeight` sinh thêm
  // HAI cột đối chiếu (Lệch cân + Nguyên nhân) ngoài chính cột Kg thực cân.
  const colSpan = 13 + variableColumns + (showActualWeight ? 2 : 0);

  return <section className="rounded-lg border bg-card" data-section="purchase-receipt-lines" aria-label="Dòng hàng nhận">
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs font-semibold"><span>Dòng hàng nhận</span><span className="text-[10px] font-normal text-muted-foreground">Cột vật lý đến từ Purchase Runtime; xóa giá trị không làm cột tự biến mất.</span><Button type="button" size="sm" variant="outline" className="ml-auto h-7" disabled={props.readOnly} onClick={props.onAdd}><Plus className="size-3.5" /> Thêm dòng</Button></div>
    <div className="overflow-x-auto"><Table unwrapped className="w-full border-collapse"><thead className="bg-muted/40"><tr>
      <th className={TH}>#</th><th className={TH}>Mã hàng</th><th className={TH}>Đơn mua</th><th className={TH}>Đã đặt</th><th className={TH}>Đã nhận</th><th className={TH}>Còn lại</th>
      {showQtyBar ? <th className={`${TH} bg-primary/5`}>SL cây/lá/tấm</th> : null}
      {showQty ? <th className={TH}>Số lượng</th> : null}
      {showActualWeight ? <th className={`${TH} bg-primary/5`}>Kg thực cân</th> : null}
      {showTheory ? <th className={TH}>Kg barem</th> : null}
      {showActualKgPerM ? <th className={TH}>Kg/m thực</th> : null}
      {showActualWeight ? <><th className={TH}>Lệch cân</th><th className={TH}>Nguyên nhân chênh lệch</th></> : null}
      {showLength ? <th className={TH}>Dài (m)</th> : null}{showWidth ? <th className={TH}>Rộng (m)</th> : null}{showColor ? <th className={TH}>Màu</th> : null}{showStamped ? <th className={TH}>Dập</th> : null}{showCondition ? <th className={TH}>Tình trạng</th> : null}
      <th className={TH}>ĐVT</th><th className={TH}>Đơn giá</th><th className={TH}>Thành tiền</th><th className={TH}>Kho nhập</th>{showSoNo ? <th className={TH}>Số SO NCC</th> : null}<th className={TH}>Ghi chú</th><th className={TH} />
    </tr></thead><tbody className="divide-y">
      {props.lines.length ? props.lines.map((line, index) => {
        const key = receiptLineKey(line, index); const variance = props.variances.get(key); const reasonRequired = Boolean(variance?.reasonRequired);
        return <tr key={key} className="align-top hover:bg-muted/20">
          <td className={NUM}>{index + 1}{line._loading ? <Loader2 className="ml-1 inline size-3 animate-spin" /> : null}</td>
          <td className={`${TD} min-w-[190px]`}>{control(line, key, "item_code", "Mã hàng", "Link", "Item", { width: "min-w-[180px]", required: true })}{text(line._itemName) ? <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{text(line._itemName)}</div> : null}{text(line._error) ? <div className="mt-0.5 text-[10px] text-destructive">{text(line._error)}</div> : null}</td>
          <td className={`${TD} min-w-[150px]`}>{control(line, key, "purchase_order", "Đơn mua của dòng này", "Link", "Purchase Order", { width: "min-w-[140px]" })}</td>
          <td className={NUM}>{quantity(line._orderedQty)}</td><td className={NUM}>{quantity(line._receivedQty)}</td><td className={`${NUM} font-semibold`}>{quantity(line._outstandingQty)}</td>
          {showQtyBar ? <td className={`${TD} bg-primary/5`}>{lineFieldVisible(line, "qty_bar", false) ? control(line, key, "qty_bar", lineFieldLabel(line, "qty_bar", "SL cây/lá/tấm"), "Float", undefined, { width: "min-w-[95px]" }) : <span className="text-muted-foreground">—</span>}{showQtyBundle && lineFieldVisible(line, "qty_bundle", false) ? <div className="mt-0.5">{control(line, key, "qty_bundle", "Số bó", "Float", undefined, { width: "min-w-[95px]" })}</div> : null}</td> : null}
          {showQty ? <td className={TD}>{lineFieldVisible(line, "qty", true) ? control(line, key, "qty", lineFieldLabel(line, "qty", "Số lượng"), "Float", undefined, { width: "min-w-[95px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          {showActualWeight ? <td className={`${TD} bg-primary/5`}>{lineFieldVisible(line, "actual_weight_kg", false) ? control(line, key, "actual_weight_kg", "Kg thực cân", "Float", undefined, { width: "min-w-[105px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          {showTheory ? <td className={NUM}>{lineFieldVisible(line, "theoretical_kg", false) ? quantity(line.theoretical_kg) : "—"}</td> : null}
          {showActualKgPerM ? <td className={NUM}>{lineFieldVisible(line, "actual_kg_per_m", false) ? quantity(line.actual_kg_per_m) : "—"}</td> : null}
          {showActualWeight ? <><td className={NUM}>{variance ? <WeightVarianceBadge reading={variance} /> : "—"}</td><td className={`${TD} min-w-[170px]`}>{reasonRequired ? control(line, key, "_varianceReason", "Nguyên nhân", "Link", "Nguyên nhân chênh lệch", { field: fallbackField("_varianceReason", "Nguyên nhân", "Link", "Nguyên nhân chênh lệch"), width: "min-w-[160px]", required: true }) : <span className="text-[10px] text-muted-foreground">không bắt buộc</span>}{reasonRequired && !text(line._varianceReason) ? <div className="mt-0.5 text-[10px] text-destructive">Lệch cân vượt ngưỡng — phải chọn nguyên nhân.</div> : null}</td></> : null}
          {showLength ? <td className={TD}>{lineFieldVisible(line, "length_m", false) ? control(line, key, "length_m", lineFieldLabel(line, "length_m", "Dài (m)"), "Float", undefined, { width: "min-w-[85px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          {showWidth ? <td className={TD}>{lineFieldVisible(line, "width_m", false) ? control(line, key, "width_m", lineFieldLabel(line, "width_m", "Rộng (m)"), "Float", undefined, { width: "min-w-[85px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          {showColor ? <td className={TD}>{lineFieldVisible(line, "color", false) ? control(line, key, "color", "Màu", "Link", "Item Color", { width: "min-w-[120px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          {showStamped ? <td className={TD}>{lineFieldVisible(line, "is_stamped", false) ? control(line, key, "is_stamped", "Dập", "Select", metaField("is_stamped", "Dập", "Select").options, { width: "min-w-[90px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          {showCondition ? <td className={TD}>{lineFieldVisible(line, "condition", false) ? control(line, key, "condition", "Tình trạng", "Select", metaField("condition", "Tình trạng", "Select").options, { width: "min-w-[100px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          <td className={TD}>{control(line, key, "uom", "ĐVT", "Link", "UOM", { width: "min-w-[85px]" })}</td><td className={TD}>{control(line, key, "rate", "Đơn giá", "Currency", undefined, { width: "min-w-[110px]", required: true })}</td><td className={`${NUM} font-semibold`}>{moneyOrDash(line.amount)}</td><td className={TD}>{control(line, key, "warehouse", "Kho nhập", "Link", "Warehouse", { width: "min-w-[140px]", required: true })}</td>
          {showSoNo ? <td className={TD}>{lineFieldVisible(line, "so_no", false) ? control(line, key, "so_no", "Số SO NCC", "Data", undefined, { width: "min-w-[110px]" }) : <span className="text-muted-foreground">—</span>}</td> : null}
          <td className={TD}>{control(line, key, "note", "Ghi chú", "Data", undefined, { width: "min-w-[130px]" })}</td><td className={TD}><Button type="button" size="sm" variant="ghost" className="h-7 px-1.5" disabled={props.readOnly} onClick={() => props.onDelete(key)} aria-label={`Xóa dòng ${index + 1}`}><Trash2 className="size-3.5" /></Button></td>
        </tr>;
      }) : <tr><td colSpan={colSpan} className="px-3 py-6 text-center text-[11px] text-muted-foreground">Chưa có dòng nào. Nạp một đơn mua hoặc thêm dòng thủ công.</td></tr>}
    </tbody></Table></div>
    <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">Đã đặt / Đã nhận / Còn lại vẫn đọc từ server theo dòng đơn mua. Measurement Profile chỉ quyết dữ kiện vật lý cần nhập; số tiền và tồn không được tính lại trong bảng này.</p>
  </section>;
}
