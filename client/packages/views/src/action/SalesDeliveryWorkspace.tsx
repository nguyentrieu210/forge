/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppActionField, DocField, Fieldtype } from "@metaforge/core";
import { Button, Input, Label } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import type { ActionScreenProps } from "./ActionScreen.js";
import { InventoryAllocationPreview, SourceDocumentSelector, SourceLineAllocator, type InventoryAllocationRow } from "./source-allocation.js";

type Json = Record<string, unknown>;
const PREVIEW_METHOD = "alumdoor.sales.preview_bulk_delivery";
const COMMIT_METHOD = "alumdoor.sales.bulk_delivery";

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "—";
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString("vi-VN");
}

function toDocField(field: AppActionField): DocField {
  return { fieldname: field.fieldname, label: field.label, fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}), ...(field.link_filters ? { link_filters: field.link_filters } : {}),
    ...(field.required ? { reqd: 1 as const } : {}) };
}

function FieldEditor(props: { field: AppActionField; values: Json; onChange: (name: string, value: unknown) => void }) {
  const { registry, services } = useMetaForge();
  const docField = toDocField(props.field);
  const Control = registry.resolve(docField.fieldtype);
  const id = `multi-delivery-${props.field.fieldname}`;
  return <div className="space-y-1.5"><Label htmlFor={id} className="text-xs font-semibold">{props.field.label}{props.field.required ? <span className="text-destructive">*</span> : null}</Label>{Control
    ? <Control field={docField} value={props.values[props.field.fieldname] ?? ""} onChange={(value: unknown) => props.onChange(props.field.fieldname, value)} id={id} required={props.field.required} services={services} {...(props.field.fieldtype === "Link" && props.field.options ? { linkTarget: props.field.options } : {})} docValues={props.values} />
    : <Input id={id} value={String(props.values[props.field.fieldname] ?? "")} onChange={(event) => props.onChange(props.field.fieldname, event.target.value)} />}</div>;
}

function inventoryRows(preview: unknown): InventoryAllocationRow[] {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return [];
  const rows = (preview as Json).rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Json;
    return [{
      key: `${text(row.sales_order)}:${text(row.sales_order_row)}:${text(row.inventory_layer)}:${index}`,
      source: <span><span className="font-semibold">{text(row.sales_order) || "—"}</span><span className="ml-1 text-xs text-muted-foreground">{text(row.sales_order_row)}</span></span>,
      item: <span>{text(row.item_code)}<span className="ml-1 text-xs text-muted-foreground">{text(row.warehouse)}</span></span>,
      layer: <span>{text(row.inventory_layer) || "—"}<span className="ml-1 text-xs text-muted-foreground">{formatDate(row.received_at)}</span></span>,
      quantity: text(row.qty) || "0",
      cost: text(row.cost) || "—",
    }];
  });
}

export function SalesDeliveryWorkspace({ action, onOpen }: ActionScreenProps) {
  const { adapter, fmt } = useMetaForge();
  const [values, setValues] = useState<Json>(() => ({
    ...Object.fromEntries(action.fields.filter((field) => field.default != null).map((field) => [field.fieldname, field.default])),
    posting_at: action.fields.find((field) => field.fieldname === "posting_at")?.default ?? new Date().toISOString(),
  }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Json>();
  const [result, setResult] = useState<Json>();
  const [busy, setBusy] = useState<"preview" | "create">();
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);
  const customer = text(values.customer);
  const selectionKey = [...selected].sort().join("\u001f");

  useEffect(() => {
    if (!customer) { setPlan(undefined); setSelected(new Set()); return; }
    let active = true;
    const requestId = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setBusy("preview"); setError(undefined);
      adapter.callPost<Json>(PREVIEW_METHOD, { ...values, customer, sales_orders: [...selected] })
        .then((answer) => { if (active && requestId === requestSequence.current) setPlan(answer); })
        .catch((caught) => { if (active && requestId === requestSequence.current) { setPlan(undefined); setError(adapter.mapError(caught).message); } })
        .finally(() => { if (active && requestId === requestSequence.current) setBusy(undefined); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [adapter, customer, selectionKey, values.warehouse, values.posting_at, values.install_address]);

  const fields = useMemo(() => action.fields.filter((field) => ["customer", "warehouse", "posting_at", "install_address"].includes(field.fieldname)), [action.fields]);
  const documents = Array.isArray(plan?.source_documents) ? plan.source_documents.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
  const lines = Array.isArray(plan?.source_lines) ? plan.source_lines.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row) && selected.has(text((row as Json).sales_order))) : [];
  const preview = plan?.inventory_preview;

  const change = (name: string, value: unknown) => {
    requestSequence.current += 1;
    setValues((current) => ({ ...current, [name]: value }));
    if (name === "customer") setSelected(new Set());
    setResult(undefined);
  };
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const create = async () => {
    if (!selected.size) { setError("Chọn ít nhất một Đơn bán còn hàng."); return; }
    if (!window.confirm(`Tạo một Phiếu giao nháp từ ${selected.size} Đơn bán đã chọn?`)) return;
    setBusy("create"); setError(undefined);
    const requestId = ++requestSequence.current;
    try {
      const answer = await adapter.callPost<Json>(COMMIT_METHOD, { ...values, customer, sales_orders: [...selected] });
      if (requestId === requestSequence.current) setResult(answer);
    } catch (caught) { if (requestId === requestSequence.current) setError(adapter.mapError(caught).message); }
    finally { if (requestId === requestSequence.current) setBusy(undefined); }
  };

  return <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3" data-action-screen={action.name} data-multi-sales-delivery>
    <header className="rounded-xl border bg-card px-4 py-4 sm:px-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Kho giao hàng</p><h1 className="mt-0.5 text-xl font-semibold">Một phiếu giao · nhiều Đơn bán</h1><p className="mt-1 text-sm text-muted-foreground">Chọn đơn còn phải giao, soát dòng nguồn và lớp FIFO. Giá bán theo đơn; giá vốn theo sổ kho.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <FieldEditor key={field.fieldname} field={field} values={values} onChange={change} />)}</div></header>
    {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
    {!customer ? <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Chọn Khách hàng để tải các Đơn bán đã ghi sổ còn số lượng phải giao.</div> : <>
      <SourceDocumentSelector documents={documents.map((row) => ({ id: text(row.sales_order), label: text(row.sales_order), secondary: `${formatDate(row.transaction_date)} · hẹn ${formatDate(row.delivery_date)}`, meta: text(row.disabled_reason) || `${fmt.number(number(row.outstanding_lines))} dòng còn giao`, disabled: Boolean(text(row.disabled_reason)) }))} selected={selected} onToggle={toggle} onSelectAll={(ids) => setSelected(new Set(ids))} empty={busy === "preview" ? "Đang tải Đơn bán…" : "Không có Đơn bán còn phải giao."} />
      <SourceLineAllocator rows={lines} rowKey={(row, index) => `${text(row.sales_order)}:${text(row.sales_order_row_id)}:${index}`} title="Dòng Đơn bán được đưa vào Phiếu giao" description="Dòng được giữ riêng theo khóa nguồn; chỉ gom cách trình bày khi quy cách kho thật sự giống nhau." columns={[
        { key: "source", label: "Đơn / dòng", render: (row) => <span><b>{text(row.sales_order)}</b><span className="ml-1 text-xs text-muted-foreground">{text(row.sales_order_row_id)}</span></span> },
        { key: "item", label: "Mặt hàng", render: (row) => <span>{text(row.item_code)}<span className="ml-1 text-xs text-muted-foreground">{text(row.color)} {text(row.material_specification)}</span></span> },
        { key: "warehouse", label: "Kho / ĐVT tồn", render: (row) => `${text(row.warehouse) || "—"} · ${text(row.stock_uom) || text(row.uom)}` },
        { key: "ordered", label: "Đã đặt", align: "right", render: (row) => fmt.number(number(row.ordered_qty)) },
        { key: "delivered", label: "Đã giao", align: "right", render: (row) => fmt.number(number(row.delivered_qty)) },
        { key: "outstanding", label: "Giao lần này", align: "right", render: (row) => <b>{fmt.number(number(row.outstanding_qty))}</b> },
        { key: "rate", label: "Giá bán theo SO", align: "right", render: (row) => fmt.currency ? fmt.currency(number(row.rate)) : fmt.number(number(row.rate)) },
      ]} />
      <InventoryAllocationPreview rows={inventoryRows(preview)} />
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"><div className="text-sm"><b>{selected.size}</b> đơn · <b>{lines.length}</b> dòng{busy === "preview" ? <span className="ml-2 text-muted-foreground">Đang tính lại…</span> : null}</div><Button type="button" disabled={!selected.size || Boolean(busy)} onClick={create}>{busy === "create" ? "Đang tạo…" : "Tạo một Phiếu giao nháp"}</Button></div>
    </>}
    {result ? <section className="rounded-xl border bg-card px-4 py-4"><div className="flex flex-wrap items-center gap-3"><div><h2 className="font-semibold">Đã tạo {text(result.name)}</h2><p className="text-sm text-muted-foreground">Phiếu vẫn là nháp; mở phiếu để kiểm tra rồi submit qua bản xem trước FIFO lần cuối.</p></div>{text(result.name) && onOpen ? <Button className="ml-auto" onClick={() => onOpen("Delivery Note", text(result.name))}>Mở Phiếu giao</Button> : null}</div></section> : null}
  </div>;
}
