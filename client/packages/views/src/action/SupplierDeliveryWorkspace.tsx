/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppActionField, DocField, Fieldtype } from "@metaforge/core";
import { Button, Input, Label } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import type { ActionScreenProps } from "./ActionScreen.js";
import {
  DeliveryMaterialTable,
  DeliveryOrderLineTable,
  DeliveryOrderTable,
  DeliveryReceiptTable,
  DeliveryPriceTable,
  type SupplierDashboard,
} from "./SupplierDeliveryWorkspaceTables.js";

const DASHBOARD_METHOD = "alumdoor.purchase.supplier_delivery_dashboard";
const BULK_PREVIEW_METHOD = "alumdoor.purchase.preview_bulk_fifo_receipt";
const BULK_COMMIT_METHOD = "alumdoor.purchase.bulk_fifo_receipt";

type Values = Record<string, unknown>;
type Tab = "overview" | "receive" | "history" | "commercial";
type ReceiptLine = Values & { _key: string };

const HEADER_FIELDS = ["supplier_invoice_no", "driver", "warehouse"];
const ITEM_FIELDS = ["item_code", "length_m", "qty_bar", "actual_weight_kg", "rate", "color", "is_stamped"];
const FIELD_COPY: Record<string, { label: string; description?: string }> = {
  supplier: { label: "Nhà cung cấp" },
  supplier_invoice_no: { label: "Số phiếu giao", description: "Bắt buộc để chống tạo trùng chuyến hàng." },
  driver: { label: "Người giao / lái xe" },
  warehouse: { label: "Kho nhận" },
  item_code: { label: "Mã nhôm" },
  length_m: { label: "Chiều dài mỗi cây (m)", description: "Ví dụ 7,2 m/cây." },
  qty_bar: { label: "Số cây", description: "Số cây đếm thực tế." },
  actual_weight_kg: { label: "Kg cân thực tế" },
  rate: { label: "Đơn giá / kg" },
  color: { label: "Màu" },
  is_stamped: { label: "Dập chữ" },
};

function text(value: unknown): string { return String(value ?? "").trim(); }
function num(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function empty(value: unknown): boolean { return value == null || (typeof value === "string" && !value.trim()); }
function localDateTime(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function postingIso(value: string): string { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new Error("Ngày/giờ nhận hàng không hợp lệ."); return parsed.toISOString(); }

function fieldCopy(field: AppActionField): AppActionField { return FIELD_COPY[field.fieldname] ? { ...field, ...FIELD_COPY[field.fieldname] } : field; }
function docField(field: AppActionField): DocField {
  return { fieldname: field.fieldname, label: field.label, fieldtype: field.fieldtype as Fieldtype, ...(field.options ? { options: field.options } : {}), ...(field.required ? { reqd: 1 as const } : {}), ...(field.default == null ? {} : { default: field.default }) };
}
function defaults(fields: AppActionField[]): Values { const values: Values = {}; for (const field of fields) if (field.default != null) values[field.fieldname] = field.default; return values; }

function Field({ field, values, onChange, prefix }: { field: AppActionField; values: Values; onChange: (name: string, value: unknown) => void; prefix: string }) {
  const { registry, services } = useMetaForge();
  const meta = docField(field); const Control = registry.resolve(meta.fieldtype); const id = `${prefix}-${field.fieldname}`;
  return <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={id} className="text-xs font-semibold">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</Label>{Control ? <Control field={meta} value={values[field.fieldname] ?? ""} onChange={(value: unknown) => onChange(field.fieldname, value)} id={id} required={field.required} services={services} {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})} docValues={values} /> : <Input id={id} value={String(values[field.fieldname] ?? "")} onChange={(event) => onChange(field.fieldname, event.target.value)} />}{field.description ? <p className="text-[11px] text-muted-foreground">{field.description}</p> : null}</div>;
}

function Stat({ label, value, hint, hot }: { label: string; value: ReactNode; hint?: string; hot?: boolean }) {
  return <div className={`rounded-lg border px-3 py-2.5 ${hot ? "bg-primary/5" : "bg-background"}`}><div className="text-[11px] font-medium text-muted-foreground">{label}</div><div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>{hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div> : null}</div>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>; }

function Preview({ value, committed, onOpen }: { value: unknown; committed: boolean; onOpen?: ActionScreenProps["onOpen"] }) {
  const { fmt } = useMetaForge(); const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; if (!data) return null;
  const allocations = Array.isArray(data.allocations) ? data.allocations as Array<Record<string, unknown>> : []; const receipt = text(data.purchase_receipt ?? data.name);
  return <section className="rounded-xl border bg-card"><div className="flex items-center gap-2 border-b px-4 py-3"><h2 className="text-sm font-semibold">{committed ? "Đã tạo phiếu nhập nháp" : "FIFO dự kiến"}</h2>{receipt && onOpen ? <Button size="sm" className="ml-auto" onClick={() => onOpen("Purchase Receipt", receipt)}>Mở {receipt}</Button> : null}</div><div className="grid gap-2 p-4 sm:grid-cols-4"><Stat label="Dòng" value={fmt.number(num(data.line_count))} /><Stat label="Cây" value={fmt.number(num(data.total_qty_bar))} /><Stat label="Kg barem" value={fmt.number(num(data.total_barem_weight_kg))} /><Stat label="Kg thực" value={fmt.number(num(data.total_actual_weight_kg))} /></div>{allocations.length ? <div className="border-t p-4"><div className="mb-2 text-xs font-semibold text-muted-foreground">Dự kiến trừ đơn cũ nhất</div><div className="space-y-1">{allocations.map((row, index) => <div key={`${text(row.purchase_order)}-${index}`} className="flex gap-3 rounded border px-3 py-2 text-sm"><span>{text(row.item_code)}</span><span className="font-semibold">{text(row.purchase_order)}</span><span className="ml-auto">{fmt.number(num(row.allocated_bars))} cây</span></div>)}</div><p className="mt-2 text-[11px] text-muted-foreground">Khi ghi sổ, canonical Purchase Allocation tính lại FIFO trong transaction; preview không ghi đè allocation ledger.</p></div> : null}</section>;
}

export function SupplierDeliveryWorkspace({ action, onOpen }: ActionScreenProps) {
  const { adapter, fmt } = useMetaForge();
  const fields = useMemo(() => action.fields.map(fieldCopy), [action.fields]);
  const byName = useMemo(() => new Map(fields.map((field) => [field.fieldname, field])), [fields]);
  const supplierField = byName.get("supplier"); const headerFields = HEADER_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field)); const itemFields = ITEM_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field));
  const [values, setValues] = useState<Values>(() => defaults(fields)); const [rows, setRows] = useState<ReceiptLine[]>(() => [{ _key: "line-1", ...defaults(itemFields) }]); const [receivedAt, setReceivedAt] = useState(localDateTime); const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<SupplierDashboard>(); const [dashboardBusy, setDashboardBusy] = useState(false); const [dashboardError, setDashboardError] = useState<string>(); const [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<unknown>(); const [result, setResult] = useState<unknown>(); const [receiptError, setReceiptError] = useState<string>(); const [busy, setBusy] = useState<"check" | "create">(); const supplier = text(values.supplier);

  useEffect(() => { if (!supplier) { setDashboard(undefined); setDashboardError(undefined); return; } let active = true; setDashboardBusy(true); adapter.callPost<SupplierDashboard>(DASHBOARD_METHOD, { supplier }).then((answer) => { if (active) setDashboard(answer); }).catch((error) => { if (active) { setDashboard(undefined); setDashboardError(adapter.mapError(error).message); } }).finally(() => { if (active) setDashboardBusy(false); }); return () => { active = false; }; }, [adapter, supplier, refresh]);

  const clearResult = () => { setPreview(undefined); setResult(undefined); setReceiptError(undefined); };
  const changeHeader = (name: string, value: unknown) => { setValues((current) => ({ ...current, [name]: value })); clearResult(); };
  const changeLine = (key: string, name: string, value: unknown) => { setRows((current) => current.map((row) => row._key === key ? { ...row, [name]: value } : row)); clearResult(); };
  const required = useMemo(() => { const missing: string[] = []; if (!supplier) missing.push("Nhà cung cấp"); if (empty(values.warehouse)) missing.push("Kho"); if (empty(values.supplier_invoice_no)) missing.push("Số phiếu giao"); if (!receivedAt) missing.push("Ngày nhận"); rows.forEach((row, index) => ["item_code", "length_m", "qty_bar", "actual_weight_kg", "color", "is_stamped"].forEach((name) => { if (empty(row[name])) missing.push(`Dòng ${index + 1}: ${FIELD_COPY[name]?.label ?? name}`); })); return missing; }, [receivedAt, rows, supplier, values.supplier_invoice_no, values.warehouse]);
  const totals = useMemo(() => rows.reduce((sum, row) => ({ bars: sum.bars + num(row.qty_bar), meters: sum.meters + num(row.qty_bar) * num(row.length_m), kg: sum.kg + num(row.actual_weight_kg) }), { bars: 0, meters: 0, kg: 0 }), [rows]);

  const run = async (phase: "check" | "create") => { if (required.length) { setReceiptError(`Còn thiếu: ${required.slice(0, 6).join(", ")}${required.length > 6 ? "…" : ""}.`); return; } if (phase === "create" && !window.confirm(`Tạo một phiếu nhập nháp cho ${rows.length} dòng?`)) return; setBusy(phase); setReceiptError(undefined); try { const payload = { supplier, warehouse: values.warehouse, supplier_invoice_no: values.supplier_invoice_no, driver: values.driver, posting_at: postingIso(receivedAt), lines: rows.map(({ _key, ...line }) => line) }; const answer = await adapter.callPost(phase === "check" ? BULK_PREVIEW_METHOD : BULK_COMMIT_METHOD, payload); if (phase === "check") { setPreview(answer); setResult(undefined); } else { setResult(answer); setPreview(undefined); setRefresh((value) => value + 1); } } catch (error) { setReceiptError(adapter.mapError(error).message); } finally { setBusy(undefined); } };

  const money = (value: number) => fmt.currency ? fmt.currency(value) : fmt.number(value); const summary = dashboard?.summary; const payable = dashboard?.payable;
  const tabs: Array<[Tab, string, string]> = [["overview", "Tổng quan", "Cây · mét · kg"], ["receive", "Nhận hàng", "Một xe · nhiều dòng"], ["history", "Lịch sử & đối soát", "Receipt · cân"], ["commercial", "Giá & công nợ", "Payment Ledger"]];

  return <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3" data-action-screen={action.name} data-supplier-delivery-workspace>
    <header className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-primary">Mua hàng</p><h1 className="text-xl font-semibold">Tiến Đạt · giao hàng FIFO & công nợ</h1><p className="mt-1 text-sm text-muted-foreground">Nghĩa vụ giao theo cây, đối chiếu mét/kg, giá mua và phải trả trong cùng workspace.</p></div>{supplierField ? <div className="w-full sm:w-[340px]"><Field field={supplierField} values={values} onChange={changeHeader} prefix="supplier-workspace" /></div> : null}</div></header>
    <nav className="grid gap-1 rounded-xl border bg-card p-1 sm:grid-cols-4">{tabs.map(([key, label, hint]) => <button key={key} type="button" className={`rounded-lg px-3 py-2 text-left ${tab === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setTab(key)}><div className="text-sm font-semibold">{label}</div><div className={`text-[10px] ${tab === key ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{hint}</div></button>)}</nav>
    {dashboardError ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{dashboardError}</div> : null}
    {dashboardBusy && !dashboard ? <Empty>Đang tổng hợp Purchase Order, allocation, Receipt và Payment Ledger…</Empty> : null}

    {tab === "overview" && dashboard && summary ? <div className="space-y-4"><section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><Stat label="Đơn mua" value={fmt.number(summary.purchase_order_count)} hint={`${fmt.number(summary.open_purchase_order_count)} chưa xong`} /><Stat label="Quá hạn" value={fmt.number(summary.overdue_purchase_order_count)} hot={summary.overdue_purchase_order_count > 0} /><Stat label="Đã đặt" value={`${fmt.number(summary.ordered_bars)} cây`} hint={`${fmt.number(summary.ordered_meters)} m · ${fmt.number(summary.ordered_barem_weight_kg)} kg barem`} /><Stat label="Đã nhận" value={`${fmt.number(summary.received_bars)} cây`} hint={`${fmt.number(summary.received_meters)} m · ${fmt.number(summary.actual_received_weight_kg)} kg thực`} /><Stat label="Còn phải giao" value={`${fmt.number(summary.remaining_bars)} cây`} hint={`${fmt.number(summary.remaining_meters)} m · ${fmt.number(summary.remaining_barem_weight_kg)} kg barem`} hot /><Stat label="Giá trị PO" value={money(summary.purchase_value)} /></section><section className="space-y-2"><h2 className="text-sm font-semibold">Nợ giao theo quy cách</h2><p className="text-xs text-muted-foreground">Khóa mã + chiều dài + kg/m + màu + dập + profile + UOM. Window đã đối soát không quay lại thành nợ.</p><DeliveryMaterialTable rows={dashboard.materials} /></section><section className="space-y-2"><h2 className="text-sm font-semibold">Tiến độ từng PO</h2><DeliveryOrderTable rows={dashboard.purchase_orders} onOpen={onOpen} /></section><section className="space-y-2"><h2 className="text-sm font-semibold">Chi tiết từng dòng PO</h2><DeliveryOrderLineTable rows={dashboard.purchase_order_lines} onOpen={onOpen} /></section></div> : null}

    {tab === "receive" ? <div className="space-y-3"><section className="rounded-xl border bg-card p-4"><h2 className="mb-3 text-sm font-semibold">Thông tin chuyến hàng</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="flex flex-col gap-1.5"><Label htmlFor="receipt-posting-at" className="text-xs font-semibold">Ngày/giờ nhận *</Label><Input id="receipt-posting-at" type="datetime-local" value={receivedAt} onChange={(event) => { setReceivedAt(event.target.value); clearResult(); }} /></div>{headerFields.map((field) => <Field key={field.fieldname} field={field} values={values} onChange={changeHeader} prefix="receipt-header" />)}</div></section><section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b p-3"><div><h2 className="text-sm font-semibold">Hàng vừa nhận</h2><p className="text-xs text-muted-foreground">Tiền theo kg thực; FIFO theo số cây.</p></div><Button size="sm" variant="outline" onClick={() => { setRows((current) => [...current, { _key: `line-${Date.now()}`, ...defaults(itemFields) }]); clearResult(); }}>+ Thêm dòng</Button></div><div className="divide-y">{rows.map((row, index) => <div key={row._key} className="p-4"><div className="mb-2 flex justify-between"><span className="text-xs font-semibold text-muted-foreground">Dòng {index + 1}</span>{rows.length > 1 ? <Button size="sm" variant="outline" onClick={() => { setRows((current) => current.filter((candidate) => candidate._key !== row._key)); clearResult(); }}>Xóa</Button> : null}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{itemFields.map((field) => <Field key={field.fieldname} field={field} values={row} onChange={(name, value) => changeLine(row._key, name, value)} prefix={`receipt-${row._key}`} />)}</div><div className="mt-3 flex gap-5 rounded bg-muted/25 px-3 py-2 text-xs"><span>{fmt.number(num(row.qty_bar))} cây</span><span>{fmt.number(num(row.qty_bar) * num(row.length_m))} m</span><span>{fmt.number(num(row.actual_weight_kg))} kg thực</span></div></div>)}</div><div className="grid gap-2 border-t p-3 sm:grid-cols-3"><Stat label="Tổng cây" value={`${fmt.number(totals.bars)} cây`} /><Stat label="Tổng mét" value={`${fmt.number(totals.meters)} m`} /><Stat label="Kg thực" value={`${fmt.number(totals.kg)} kg`} /></div></section>{receiptError ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{receiptError}</div> : null}{preview != null || result != null ? <Preview value={result ?? preview} committed={result != null} onOpen={onOpen} /> : null}<div className="sticky bottom-2 flex items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur"><span className="mr-auto text-xs text-muted-foreground">{required.length ? `Còn thiếu ${required.length} ô` : "Submit phiếu sẽ tính lại FIFO authoritative."}</span><Button variant="outline" disabled={Boolean(busy)} onClick={() => run("check")}>{busy === "check" ? "Đang kiểm…" : "Kiểm tra cả chuyến"}</Button>{preview != null ? <Button disabled={Boolean(busy)} onClick={() => run("create")}>{busy === "create" ? "Đang tạo…" : "Tạo 1 phiếu nhập"}</Button> : null}</div></div> : null}

    {tab === "history" && dashboard ? <div className="space-y-4"><section className="space-y-2"><h2 className="text-sm font-semibold">Lịch sử hàng về</h2><DeliveryReceiptTable rows={dashboard.receipts} onOpen={onOpen} /></section><section className="space-y-2"><h2 className="text-sm font-semibold">Đối soát nghĩa vụ</h2><DeliveryMaterialTable rows={dashboard.materials} /></section></div> : null}
    {tab === "commercial" && dashboard && payable ? <div className="space-y-4"><section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><Stat label="Giá trị hàng đã nhận" value={money(num(payable.received_value))} /><Stat label="Tổng hóa đơn" value={money(num(payable.invoice_total))} /><Stat label="Chưa hóa đơn" value={money(num(payable.received_not_invoiced_hint))} hint="Chỉ báo vận hành" /><Stat label="Còn phải trả" value={money(num(payable.total_outstanding))} hot /><Stat label="Quá hạn" value={payable.overdue_amount == null ? "—" : money(num(payable.overdue_amount))} hot={num(payable.overdue_amount) > 0} /><Stat label="Ứng trước" value={payable.advance_balance == null ? "—" : money(num(payable.advance_balance))} /><Stat label="Phơi nhiễm ròng" value={money(num(payable.net_exposure))} /></section><div className={`rounded-xl border p-3 text-xs ${payable.authoritative ? "bg-emerald-500/5" : "bg-amber-500/5"}`}><div className="font-semibold">Nguồn: {payable.source}</div><div className="mt-1 text-muted-foreground">{payable.note}</div></div><section className="space-y-2"><h2 className="text-sm font-semibold">Lịch sử giá mua</h2><DeliveryPriceTable rows={dashboard.price_history} onOpen={onOpen} /></section></div> : null}
    {!supplier ? <Empty>Chọn nhà cung cấp để bắt đầu.</Empty> : null}
  </div>;
}
