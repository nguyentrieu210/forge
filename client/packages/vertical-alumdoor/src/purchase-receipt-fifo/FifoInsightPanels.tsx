/** @jsxImportSource react */
/**
 * Các khối TRÌNH BÀY của màn nhập FIFO. Không gọi server, không tính tiền — chỉ in ra
 * những con số mà `alumdoor.purchase.*fifo*` và `alumdoor.purchase.supplier_delivery_dashboard`
 * đã trả về, kèm câu giải thích để người nhập giải trình được giá vốn ngay tại chỗ.
 */
import { AlertTriangle, CheckCircle2, Info, Layers, Scale, Wallet } from "lucide-react";
import { Badge, Table } from "@metaforge/ui";
import { moneyOrDash, percent, quantity, text } from "./model.js";
import type { FifoInsight, SupplierPayableView } from "./model.js";
import { fifoLayers } from "./fifo-insight.js";
import type { UomConversionGap, UomLawfulOmission } from "./uom-gap.js";
import type { WeightVarianceReading } from "./weight-variance.js";
import type { DeliveryToleranceReading } from "./weight-variance.js";

const CARD = "rounded-lg border bg-card";
const CARD_HEAD = "flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs font-semibold";
const TH = "whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "whitespace-nowrap px-2 py-1.5 text-[11px] tabular-nums";

function EmptyRow(props: { colSpan: number; children: string }) {
  return (
    <tr>
      <td colSpan={props.colSpan} className="px-3 py-4 text-center text-[11px] text-muted-foreground">{props.children}</td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Bảng LỚP FIFO                                                           */
/* -------------------------------------------------------------------------- */

export function FifoLayersPanel(props: { insight: FifoInsight }) {
  const layers = fifoLayers(props.insight);
  return (
    <section className={CARD} data-section="purchase-receipt-fifo-layers" aria-label="Lớp giá FIFO">
      <div className={CARD_HEAD}>
        <Layers className="size-3.5" />
        <span>Lớp giá FIFO — đơn cũ nhất bị trừ trước</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-normal">
          {props.insight.route === "bulk" ? "route hàng loạt" : "route một dòng"} · {layers.length} lớp
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <Table unwrapped className="w-full border-collapse">
          <thead className="bg-muted/40">
            <tr>
              <th className={TH}>#</th>
              {props.insight.route === "bulk" ? <th className={TH}>Dòng nhập</th> : null}
              <th className={TH}>Đơn mua</th>
              <th className={TH}>Ngày đơn</th>
              <th className={TH}>Mã hàng</th>
              <th className={TH}>Kiểu phân bổ</th>
              <th className={TH}>Cây/lá phân bổ</th>
              <th className={TH}>Mét</th>
              <th className={TH}>Kg barem</th>
              <th className={TH}>Kg thực</th>
              <th className={TH}>Đơn giá</th>
              <th className={TH}>Thành tiền</th>
              <th className={TH}>Còn lại sau lần này</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {layers.length ? layers.map((layer) => (
              <tr key={`${layer.index}-${layer.purchase_order}-${layer.item_code}`} className="hover:bg-muted/30">
                <td className={TD}>{layer.index}</td>
                {props.insight.route === "bulk" ? <td className={TD}>{layer.inputRow ?? "—"}</td> : null}
                <td className={`${TD} font-medium`}>{layer.purchase_order || "—"}</td>
                <td className={TD}>{layer.order_date || "—"}</td>
                <td className={TD}>{layer.item_code || "—"}</td>
                <td className={TD}>{layer.kind || "—"}</td>
                <td className={TD}>{quantity(layer.allocated_bars, 0)}</td>
                <td className={TD}>{quantity(layer.allocated_meters)}</td>
                <td className={TD}>{quantity(layer.barem_weight_kg)}</td>
                <td className={TD}>{quantity(layer.actual_weight_kg)}</td>
                <td className={TD}>{moneyOrDash(layer.rate)} ₫/{layer.rate_uom}</td>
                <td className={`${TD} font-semibold`}>{moneyOrDash(layer.amount)} ₫</td>
                <td className={TD}>
                  {quantity(layer.remaining_bars_after, 0)} cây
                  {layer.remaining_meters_after !== undefined ? ` (${quantity(layer.remaining_meters_after)} m)` : ""}
                </td>
              </tr>
            )) : <EmptyRow colSpan={13}>Chưa có lớp phân bổ nào. Bấm "Xem phân bổ FIFO" để server chia số cây nhận vào các đơn mua theo thứ tự cũ nhất trước.</EmptyRow>}
          </tbody>
        </Table>
      </div>
      <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Đơn giá và thành tiền của từng lớp là số server ghi vào dòng phiếu nhập tương ứng
        (<code>allocations[i]</code> ↔ <code>items[i]</code>), không phải số màn nhân lại. Đây là bảng để giải trình giá vốn.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Cân đối theo từng đơn mua                                               */
/* -------------------------------------------------------------------------- */

export function FifoOrderBalancePanel(props: { insight: FifoInsight }) {
  const rows = props.insight.orderBalances;
  return (
    <section className={CARD} data-section="purchase-receipt-fifo-order-balances" aria-label="Cân đối theo đơn mua">
      <div className={CARD_HEAD}>
        <Info className="size-3.5" />
        <span>Kết quả theo từng đơn mua</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-normal">{rows.length} đơn</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table unwrapped className="w-full border-collapse">
          <thead className="bg-muted/40">
            <tr>
              <th className={TH}>Đơn mua</th>
              <th className={TH}>Ngày đơn</th>
              {props.insight.route === "bulk" ? <th className={TH}>Mã hàng</th> : null}
              <th className={TH}>Đã đặt</th>
              <th className={TH}>Đã nhận trước</th>
              <th className={TH}>Nhận lần này</th>
              <th className={TH}>Đã nhận sau</th>
              <th className={TH}>Còn lại</th>
              <th className={TH}>Dải dung sai (cây)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length ? rows.map((row, index) => (
              <tr key={`${text(row.purchase_order)}-${text(row.item_code)}-${index}`} className="hover:bg-muted/30">
                <td className={`${TD} font-medium`}>{text(row.purchase_order) || "—"}</td>
                <td className={TD}>{text(row.order_date) || "—"}</td>
                {props.insight.route === "bulk" ? <td className={TD}>{text(row.item_code) || "—"}</td> : null}
                <td className={TD}>{quantity(row.ordered_bars, 0)}</td>
                <td className={TD}>{quantity(row.received_bars_before, 0)}</td>
                <td className={`${TD} font-semibold text-primary`}>{quantity(row.allocated_bars_now, 0)}</td>
                <td className={TD}>{quantity(row.received_bars_after, 0)}</td>
                <td className={TD}>{quantity(row.nominal_remaining_bars, 0)} cây · {quantity(row.nominal_remaining_meters)} m</td>
                <td className={TD}>{quantity(row.tolerance_min_total_bars, 2)} – {quantity(row.tolerance_max_total_bars, 2)}</td>
              </tr>
            )) : <EmptyRow colSpan={9}>Chưa có kết quả theo đơn.</EmptyRow>}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Tóm tắt công nợ NCC — hiện vật (buildFifoDebtSummary) + tiền (dashboard) */
/* -------------------------------------------------------------------------- */

function DebtCell(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{props.label}</div>
      <div className={`mt-0.5 tabular-nums ${props.strong ? "text-base font-bold text-primary" : "font-semibold"}`}>{props.value}</div>
    </div>
  );
}

export function FifoDebtPanel(props: { insight: FifoInsight; payable: SupplierPayableView }) {
  const debt = props.insight.debt;
  const summaries = props.insight.lineSummaries;
  const payable = props.payable.payable;
  return (
    <section className={CARD} data-section="purchase-receipt-supplier-debt" aria-label="Tóm tắt công nợ nhà cung cấp">
      <div className={CARD_HEAD}>
        <Wallet className="size-3.5" />
        <span>Tóm tắt công nợ nhà cung cấp — hiện ngay tại đây, không phải mở màn khác</span>
        {props.insight.tolerancePct !== undefined ? (
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            Dung sai giao nhận {props.insight.tolerancePct}% ({text(props.insight.toleranceSource) || "server"})
          </Badge>
        ) : null}
      </div>

      {debt ? (
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
          <DebtCell label="Đã đặt (cây)" value={quantity(debt.ordered_bars, 0)} />
          <DebtCell label="Đã nhận trước" value={quantity(debt.received_bars_before, 0)} />
          <DebtCell label="Nhận lần này" value={quantity(debt.delivered_bars_now, 0)} />
          <DebtCell label="Nợ danh nghĩa còn" value={`${quantity(debt.nominal_remaining_bars, 0)} cây`} strong />
          <DebtCell label="Quy ra mét" value={`${quantity(debt.nominal_remaining_meters)} m`} />
          <DebtCell
            label="Khoảng giao thêm hợp lệ"
            value={`${quantity(debt.minimum_additional_bars_to_settle, 2)} – ${quantity(debt.maximum_additional_bars_allowed, 2)} cây`}
          />
        </div>
      ) : null}

      {summaries.length ? (
        <div className="overflow-x-auto border-t">
          <Table unwrapped className="w-full border-collapse">
            <thead className="bg-muted/40">
              <tr>
                <th className={TH}>Dòng nhập</th>
                <th className={TH}>Mã hàng</th>
                <th className={TH}>Dài cây (m)</th>
                <th className={TH}>Cây nhận</th>
                <th className={TH}>Kg thực</th>
                <th className={TH}>Kg barem</th>
                <th className={TH}>Nợ còn (cây)</th>
                <th className={TH}>Nợ còn (m)</th>
                <th className={TH}>Giao thêm hợp lệ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summaries.map((row, index) => (
                <tr key={`${row.input_row ?? index}-${text(row.item_code)}`} className="hover:bg-muted/30">
                  <td className={TD}>{row.input_row ?? index + 1}</td>
                  <td className={`${TD} font-medium`}>{text(row.item_code) || "—"}</td>
                  <td className={TD}>{quantity(row.length_m)}</td>
                  <td className={TD}>{quantity(row.qty_bar, 0)}</td>
                  <td className={TD}>{quantity(row.actual_weight_kg)}</td>
                  <td className={TD}>{quantity(row.barem_weight_kg)}</td>
                  <td className={`${TD} font-semibold`}>{quantity(row.nominal_remaining_bars, 0)}</td>
                  <td className={TD}>{quantity(row.nominal_remaining_meters)}</td>
                  <td className={TD}>
                    {quantity(row.minimum_additional_bars_to_settle, 2)} – {quantity(row.maximum_additional_bars_allowed, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      <div className="border-t px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Công nợ phải trả (tiền)</div>
        {props.payable.loading ? <div className="text-[11px] text-muted-foreground">Đang đọc công nợ nhà cung cấp…</div>
          : props.payable.error ? <div className="text-[11px] text-destructive">{props.payable.error}</div>
            : payable ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
                <span>Phải trả: <strong className="tabular-nums">{moneyOrDash(payable.total_outstanding)} ₫</strong></span>
                <span>Quá hạn: <strong className="tabular-nums">{moneyOrDash(payable.overdue_amount)} ₫</strong></span>
                <span>Trả trước: <strong className="tabular-nums">{moneyOrDash(payable.advance_balance)} ₫</strong></span>
                <span>Hàng nhận chưa có HĐ: <strong className="tabular-nums">{moneyOrDash(payable.received_not_invoiced_hint)} ₫</strong></span>
                <span className="text-muted-foreground">Nguồn: {text(payable.source) || (payable.authoritative ? "Payment Ledger" : "Purchase Invoice fallback")}</span>
              </div>
            ) : <div className="text-[11px] text-muted-foreground">Chưa đọc công nợ — chọn nhà cung cấp rồi bấm "Đọc công nợ NCC".</div>}
        {payable?.note ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{payable.note}</p> : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Lịch sử nhập đã ghi sổ (thứ tự nhập)                                    */
/* -------------------------------------------------------------------------- */

export function FifoHistoryPanel(props: { insight: FifoInsight }) {
  const rows = props.insight.history;
  return (
    <section className={CARD} data-section="purchase-receipt-fifo-history" aria-label="Lịch sử nhập đã ghi sổ">
      <div className={CARD_HEAD}>
        <Info className="size-3.5" />
        <span>Lịch sử nhập đã ghi sổ của cùng quy cách</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-normal">{rows.length} lần</Badge>
      </div>
      <div className="max-h-64 overflow-auto">
        <Table unwrapped className="w-full border-collapse">
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className={TH}>Thời điểm</th>
              <th className={TH}>Phiếu nhập</th>
              <th className={TH}>Số phiếu giao NCC</th>
              <th className={TH}>Đơn mua</th>
              <th className={TH}>Mã hàng</th>
              <th className={TH}>Dài (m)</th>
              <th className={TH}>Cây</th>
              <th className={TH}>Kg barem</th>
              <th className={TH}>Kg thực</th>
              <th className={TH}>Màu</th>
              <th className={TH}>Dập</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length ? rows.map((row, index) => (
              <tr key={`${text(row.purchase_receipt)}-${index}`} className="hover:bg-muted/30">
                <td className={TD}>{text(row.posting_at) || "—"}</td>
                <td className={`${TD} font-medium`}>{text(row.purchase_receipt) || "—"}</td>
                <td className={TD}>{text(row.supplier_invoice_no) || "—"}</td>
                <td className={TD}>{text(row.purchase_order) || "—"}</td>
                <td className={TD}>{text(row.item_code) || "—"}</td>
                <td className={TD}>{quantity(row.length_m)}</td>
                <td className={TD}>{quantity(row.qty_bar, 0)}</td>
                <td className={TD}>{quantity(row.barem_weight_kg)}</td>
                <td className={TD}>{quantity(row.actual_weight_kg)}</td>
                <td className={TD}>{text(row.color) || "—"}</td>
                <td className={TD}>{text(row.is_stamped) || "—"}</td>
              </tr>
            )) : <EmptyRow colSpan={11}>Chưa có lần nhập nào cùng quy cách này.</EmptyRow>}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Khoảng trống quy đổi ĐVT — báo cái phải báo, KHÔNG báo cái đúng luật     */
/* -------------------------------------------------------------------------- */

export function UomGapPanel(props: { gaps: UomConversionGap[]; lawful: UomLawfulOmission[] }) {
  if (!props.gaps.length && !props.lawful.length) return null;
  return (
    <section className={CARD} data-section="purchase-receipt-uom-gaps" aria-label="Khoảng trống quy đổi đơn vị">
      {props.gaps.length ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <AlertTriangle className="size-3.5" /> Thiếu hệ số quy đổi — hệ thống KHÔNG đoán hộ
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {props.gaps.map((gap) => (
              <li key={`${gap.item_code}-${gap.from_uom}`} className="text-[11px] leading-relaxed">
                <div className="text-destructive">{gap.message}</div>
                <div className="text-muted-foreground">Sửa tại: {gap.fix_at}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.lawful.length ? (
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className="size-3.5" /> Trống ĐÚNG LUẬT — không phải lỗi dữ liệu
          </div>
          <ul className="mt-1.5 space-y-1">
            {props.lawful.map((entry) => (
              <li key={`${entry.item_code}-${entry.uom}`} className="text-[11px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{entry.item_code}</strong> · {entry.explanation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Chỉ báo lệch cân của một dòng                                           */
/* -------------------------------------------------------------------------- */

export function WeightVarianceBadge(props: { reading: WeightVarianceReading }) {
  const reading = props.reading;
  if (!reading.measurable) {
    return <span className="text-[10px] text-muted-foreground" title={reading.headline}>—</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${reading.overTolerance ? "font-semibold text-destructive" : "text-foreground"}`}
      title={`${reading.headline} · ngưỡng lấy từ ${reading.toleranceSource === "measurement_profile" ? "Bộ theo dõi vật tư" : "mặc định nền tảng"}`}
    >
      <Scale className="size-3" />
      {percent(reading.variancePct)}
      <span className="text-[10px] font-normal text-muted-foreground">/ {reading.tolerancePct}%</span>
    </span>
  );
}

export function DeliveryToleranceNote(props: { reading: DeliveryToleranceReading }) {
  return (
    <span className={`text-[10px] ${props.reading.source === "unknown" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
      {props.reading.note}
    </span>
  );
}
