/** @jsxImportSource react */
/**
 * Bảng dòng NHẬN HÀNG — chỗ duy nhất trên màn có HAI TRỤC SỐ LƯỢNG SONG SONG.
 *
 * Với hàng cân thực tế (nhôm cây/lá, nhóm `RT_`: mua Kg · tồn CÂY · bán Mét) một dòng có
 * hai con số ĐỘC LẬP, không suy ra được từ nhau:
 *   - SỐ CÂY/LÁ đếm được  → `qty_bar`, chính là số vào thẻ kho (`stock_qty = qty_bar`);
 *   - KG THỰC CÂN         → `actual_weight_kg`, chính là số tính tiền (`qty` trên phiếu nhập).
 * Màn KHÔNG ép hai trục về một, và KHÔNG nhân bất kỳ hệ số nào khi hệ số đang trống.
 *
 * Mọi ô chọn đều là control của nền tảng trỏ vào danh mục thật (Item, Item Color, Warehouse,
 * UOM, Purchase Order, Nguyên nhân chênh lệch); không có mảng chuỗi cứng nào trong file này —
 * kể cả Dập/Tình trạng, hai ô đó đọc `options` từ metadata `Purchase Receipt Item`.
 */
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { DocField, DocTypeMeta } from "@metaforge/core";
import type { ControlRegistry, FieldServices } from "@metaforge/controls";
import { Button, Table } from "@metaforge/ui";
import { AlumdoorSalesOrderField, fallbackField } from "../sales-order-v2/AlumdoorSalesOrderField.js";
import {
  isCatchWeightReceiptLine,
  lineFieldLabel,
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
  /** Kết quả đối chiếu lệch cân theo khoá dòng — do màn cha tính từ số server trả. */
  variances: Map<string, WeightVarianceReading>;
  onPatch: (key: string, patch: Partial<ReceiptLine>) => void;
  onCommit: (key: string, fieldname: string, value: unknown) => void;
  onDelete: (key: string) => void;
  onAdd: () => void;
}

export function ReceiptLinesTable(props: ReceiptLinesTableProps) {
  const metaField = (fieldname: string, label: string, fieldtype: DocField["fieldtype"] = "Data", options?: string): DocField =>
    props.childMeta.fields?.find((field) => field.fieldname === fieldname) ?? fallbackField(fieldname, label, fieldtype, options);

  const control = (
    line: ReceiptLine,
    key: string,
    fieldname: string,
    label: string,
    fieldtype: DocField["fieldtype"] = "Data",
    options?: string,
    extra?: { field?: DocField; width?: string; required?: boolean },
  ) => {
    const field = extra?.field ?? metaField(fieldname, label, fieldtype, options);
    return (
      <AlumdoorSalesOrderField
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
        label={label}
        hideLabel
        compact
        required={Boolean(extra?.required)}
        readOnly={props.readOnly || Boolean(line._loading)}
        className={`${extra?.width ?? "min-w-[110px]"} [&_.mf-control]:!min-h-7 [&_input]:!h-7 [&_button]:!h-7`}
      />
    );
  };

  return (
    <section className="rounded-lg border bg-card" data-section="purchase-receipt-lines" aria-label="Dòng hàng nhận">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
        <span>Dòng hàng nhận</span>
        <span className="text-[10px] font-normal text-muted-foreground">
          Hàng cân thực tế có HAI trục: số cây/lá đếm được và kg thực cân — nhập cả hai, máy không suy ra hộ.
        </span>
        <Button type="button" size="sm" variant="outline" className="ml-auto h-7" disabled={props.readOnly} onClick={props.onAdd}>
          <Plus className="size-3.5" /> Thêm dòng
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table unwrapped className="w-full border-collapse">
          <thead className="bg-muted/40">
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>Mã hàng</th>
              <th className={TH}>Đơn mua</th>
              <th className={TH}>Đã đặt</th>
              <th className={TH}>Đã nhận</th>
              <th className={TH}>Còn lại</th>
              <th className={`${TH} bg-primary/5`}>SL cây/lá thực đếm</th>
              <th className={`${TH} bg-primary/5`}>Kg thực cân</th>
              <th className={TH}>Kg barem</th>
              <th className={TH}>Lệch cân</th>
              <th className={TH}>Nguyên nhân chênh lệch</th>
              <th className={TH}>Dài cây (m)</th>
              <th className={TH}>Màu</th>
              <th className={TH}>Dập</th>
              <th className={TH}>Tình trạng</th>
              <th className={TH}>ĐVT</th>
              <th className={TH}>Đơn giá</th>
              <th className={TH}>Thành tiền</th>
              <th className={TH}>Kho nhập</th>
              <th className={TH}>Ghi chú</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.lines.length ? props.lines.map((line, index) => {
              const key = receiptLineKey(line, index);
              const catchWeight = isCatchWeightReceiptLine(line);
              const variance = props.variances.get(key);
              const reasonRequired = Boolean(variance?.reasonRequired);
              return (
                <tr key={key} className="align-top hover:bg-muted/20">
                  <td className={NUM}>
                    {index + 1}
                    {line._loading ? <Loader2 className="ml-1 inline size-3 animate-spin" /> : null}
                  </td>
                  <td className={`${TD} min-w-[190px]`}>
                    {control(line, key, "item_code", "Mã hàng", "Link", "Item", { width: "min-w-[180px]", required: true })}
                    {text(line._itemName) ? <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{text(line._itemName)}</div> : null}
                    {text(line._error) ? <div className="mt-0.5 text-[10px] text-destructive">{text(line._error)}</div> : null}
                  </td>
                  <td className={`${TD} min-w-[150px]`}>
                    {control(line, key, "purchase_order", "Đơn mua của dòng này", "Link", "Purchase Order", { width: "min-w-[140px]" })}
                  </td>
                  <td className={NUM}>{quantity(line._orderedQty)}</td>
                  <td className={NUM}>{quantity(line._receivedQty)}</td>
                  <td className={`${NUM} font-semibold`}>{quantity(line._outstandingQty)}</td>

                  {/* TRỤC 1 — đếm được. Hàng thường không có trục này, dùng ô Số lượng của chính nó. */}
                  <td className={`${TD} bg-primary/5`}>
                    {catchWeight && lineFieldVisible(line, "qty_bar", true)
                      ? control(line, key, "qty_bar", lineFieldLabel(line, "qty_bar", "SL cây/lá"), "Float", undefined, { width: "min-w-[95px]", required: true })
                      : control(line, key, "qty", lineFieldLabel(line, "qty", "Số lượng"), "Float", undefined, { width: "min-w-[95px]", required: true })}
                    {catchWeight && lineFieldVisible(line, "qty_bundle", false)
                      ? <div className="mt-0.5">{control(line, key, "qty_bundle", "Số bó", "Float", undefined, { width: "min-w-[95px]" })}</div>
                      : null}
                  </td>

                  {/* TRỤC 2 — cân được. Độc lập hoàn toàn với trục 1. */}
                  <td className={`${TD} bg-primary/5`}>
                    {catchWeight
                      ? control(line, key, "actual_weight_kg", "Kg thực cân", "Float", undefined, { width: "min-w-[105px]", required: true })
                      : <span className="text-[10px] text-muted-foreground">—</span>}
                  </td>

                  <td className={NUM}>{quantity(line.theoretical_kg)}</td>
                  <td className={NUM}>{variance ? <WeightVarianceBadge reading={variance} /> : "—"}</td>
                  <td className={`${TD} min-w-[170px]`}>
                    {reasonRequired
                      ? control(line, key, "_varianceReason", "Nguyên nhân", "Link", "Nguyên nhân chênh lệch", {
                        field: fallbackField("_varianceReason", "Nguyên nhân", "Link", "Nguyên nhân chênh lệch"),
                        width: "min-w-[160px]",
                        required: true,
                      })
                      : <span className="text-[10px] text-muted-foreground">không bắt buộc</span>}
                    {reasonRequired && !text(line._varianceReason)
                      ? <div className="mt-0.5 text-[10px] text-destructive">Lệch cân vượt ngưỡng — phải chọn nguyên nhân.</div>
                      : null}
                  </td>
                  <td className={TD}>{catchWeight ? control(line, key, "length_m", "Dài cây (m)", "Float", undefined, { width: "min-w-[85px]", required: true }) : <span className="text-[10px] text-muted-foreground">—</span>}</td>
                  <td className={TD}>{lineFieldVisible(line, "color", catchWeight) ? control(line, key, "color", "Màu", "Link", "Item Color", { width: "min-w-[120px]" }) : <span className="text-[10px] text-muted-foreground">—</span>}</td>
                  <td className={TD}>{catchWeight ? control(line, key, "is_stamped", "Dập", "Select", metaField("is_stamped", "Dập", "Select").options, { width: "min-w-[90px]", required: true }) : <span className="text-[10px] text-muted-foreground">—</span>}</td>
                  <td className={TD}>{catchWeight ? control(line, key, "condition", "Tình trạng", "Select", metaField("condition", "Tình trạng", "Select").options, { width: "min-w-[100px]" }) : <span className="text-[10px] text-muted-foreground">—</span>}</td>
                  <td className={TD}>{control(line, key, "uom", "ĐVT", "Link", "UOM", { width: "min-w-[85px]" })}</td>
                  <td className={TD}>{control(line, key, "rate", "Đơn giá", "Currency", undefined, { width: "min-w-[110px]", required: true })}</td>
                  <td className={`${NUM} font-semibold`}>{moneyOrDash(line.amount)}</td>
                  <td className={TD}>{control(line, key, "warehouse", "Kho nhập", "Link", "Warehouse", { width: "min-w-[140px]", required: true })}</td>
                  <td className={TD}>{control(line, key, "note", "Ghi chú", "Data", undefined, { width: "min-w-[130px]" })}</td>
                  <td className={TD}>
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5" disabled={props.readOnly} onClick={() => props.onDelete(key)} aria-label={`Xóa dòng ${index + 1}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={21} className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                  Chưa có dòng nào. Nạp một đơn mua để kéo về phần còn phải nhận, hoặc thêm dòng thủ công.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
      <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        "Đã đặt / Đã nhận / Còn lại" đọc theo ĐVT mua của chính dòng đơn mua: <strong>Còn lại</strong> là số
        <code> alumdoor.purchase.preview_receipt </code> trả về, <strong>Đã đặt</strong> lấy từ dòng đơn mua tương ứng,
        <strong> Đã nhận</strong> = Đã đặt − Còn lại. Không có phép tính nghiệp vụ nào khác chạy ở màn này.
      </p>
    </section>
  );
}
