/** @jsxImportSource react */
import { useMemo, useState, type ReactNode } from "react";
import type { AppActionField, DocField, Fieldtype } from "@metaforge/core";
import { Button, Input, Label } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import { ActionScreen as BaseActionScreen, type ActionScreenProps } from "./ActionScreen.js";

const RECEIPT_ACTION = "nhap-nhom-fifo";

type Values = Record<string, unknown>;
type ResultRecord = Record<string, unknown>;

const FIELD_COPY: Record<string, Pick<AppActionField, "label" | "description">> = {
  supplier: { label: "Nhà cung cấp", description: "Chọn nơi vừa giao hàng." },
  supplier_invoice_no: { label: "Số phiếu giao", description: "Số ghi trên phiếu giao của nhà cung cấp." },
  driver: { label: "Người giao / lái xe", description: "Có thể bỏ trống." },
  warehouse: { label: "Kho nhận", description: "Kho thực tế đang nhận hàng." },
  item_code: { label: "Mã nhôm", description: "Ví dụ AL71." },
  length_m: { label: "Dài mỗi cây (m)", description: "Ví dụ 7,2. Không phải tổng số mét." },
  qty_bar: { label: "Số cây", description: "Số cây đếm thực tế khi xuống hàng." },
  actual_weight_kg: { label: "Kg cân thực tế", description: "Tổng kg cân của số cây vừa nhận." },
  rate: { label: "Đơn giá / kg", description: "Giá mua cho lô hàng này." },
  color: { label: "Màu", description: "Màu thực tế của nhôm nhận." },
  is_stamped: { label: "Dập chữ", description: "Chọn Có hoặc Không." },
};

const HEADER_FIELDS = ["supplier", "supplier_invoice_no", "driver", "warehouse"] as const;
const ITEM_FIELDS = ["item_code", "length_m", "qty_bar", "actual_weight_kg", "rate", "color", "is_stamped"] as const;

function friendly(field: AppActionField): AppActionField {
  const copy = FIELD_COPY[field.fieldname];
  return copy ? { ...field, ...copy } : field;
}

function toDocField(field: AppActionField): DocField {
  return {
    fieldname: field.fieldname,
    label: field.label,
    fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}),
    ...(field.required ? { reqd: 1 as const } : {}),
    ...(field.default == null ? {} : { default: field.default }),
  };
}

function initialValues(fields: AppActionField[]): Values {
  const values: Values = {};
  for (const field of fields) if (field.default != null) values[field.fieldname] = field.default;
  return values;
}

function empty(value: unknown): boolean {
  return value == null || (typeof value === "string" && !value.trim());
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(value: unknown): ResultRecord | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as ResultRecord : undefined;
}

function FieldEditor({ field, values, onChange }: {
  field: AppActionField;
  values: Values;
  onChange: (fieldname: string, value: unknown) => void;
}) {
  const { registry, services } = useMetaForge();
  const docField = toDocField(field);
  const Control = registry.resolve(docField.fieldtype);
  const id = `receive-aluminium-${field.fieldname}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {Control
        ? <Control
            field={docField}
            value={values[field.fieldname] ?? ""}
            onChange={(next: unknown) => onChange(field.fieldname, next)}
            id={id}
            required={field.required}
            services={services}
            {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})}
            docValues={values}
          />
        : <Input id={id} value={String(values[field.fieldname] ?? "")} onChange={(event) => onChange(field.fieldname, event.target.value)} />}
      {field.description ? <p className="text-[11px] leading-4 text-muted-foreground">{field.description}</p> : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function AllocationSummary({ value, committed, onOpen, format }: {
  value: unknown;
  committed: boolean;
  onOpen?: ActionScreenProps["onOpen"];
  format: (value: number) => string;
}) {
  const data = record(value);
  if (!data) return null;
  const debt = record(data.debt) ?? {};
  const allocations = Array.isArray(data.allocations) ? data.allocations.filter((row) => record(row)) as ResultRecord[] : [];
  const receipt = typeof data.purchase_receipt === "string" ? data.purchase_receipt : "";
  const remainingBars = number(debt.nominal_remaining_bars);
  const remainingMeters = number(debt.nominal_remaining_meters);
  const minMore = number(debt.minimum_additional_bars_to_settle);
  const maxMore = number(debt.maximum_additional_bars_allowed);

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-receipt-allocation-summary>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className={`size-2 rounded-full ${committed ? "bg-emerald-500" : "bg-amber-500"}`} />
        <h2 className="text-sm font-semibold">{committed ? "Đã tạo phiếu nhập" : "Kết quả đối chiếu"}</h2>
        {receipt && onOpen
          ? <Button size="sm" className="ml-auto" onClick={() => onOpen("Purchase Receipt", receipt)}>Mở {receipt}</Button>
          : null}
      </div>

      <div className="grid gap-2 p-4 sm:grid-cols-3">
        <Stat label="Nhận lần này" value={`${format(number(data.delivered_bars))} cây`} hint={`${format(number(data.delivered_meters))} m`} />
        <Stat label="Còn nhà cung cấp chưa giao" value={`${format(remainingBars)} cây`} hint={`${format(remainingMeters)} m`} />
        <Stat label="Lần tới có thể nhận" value={`${format(minMore)} – ${format(maxMore)} cây`} hint={`Đã tính dung sai ${format(number(data.tolerance_pct))}%`} />
      </div>

      <div className="border-t px-4 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Hệ thống trừ vào đơn mua</div>
        {allocations.length ? (
          <div className="space-y-2">
            {allocations.map((allocation, index) => {
              const order = String(allocation.purchase_order ?? "");
              return (
                <div key={`${order}-${index}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  <span className="min-w-24 text-muted-foreground">{String(allocation.order_date ?? "") || "Không có ngày"}</span>
                  {order && onOpen
                    ? <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={() => onOpen("Purchase Order", order)}>{order}</Button>
                    : <span className="font-semibold">{order || "Đơn mua"}</span>}
                  <span className="ml-auto font-semibold tabular-nums">{format(number(allocation.allocated_bars))} cây</span>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">Không có đơn mua phù hợp để trừ.</p>}
      </div>
    </section>
  );
}

function SimpleAluminiumReceipt({ action, onOpen }: ActionScreenProps) {
  const { adapter, fmt } = useMetaForge();
  const fields = useMemo(() => action.fields.map(friendly), [action.fields]);
  const byName = useMemo(() => new Map(fields.map((field) => [field.fieldname, field])), [fields]);
  const [values, setValues] = useState<Values>(() => initialValues(fields));
  const [preview, setPreview] = useState<unknown>();
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"check" | "create">();

  const requiredMissing = fields.filter((field) => field.required && empty(values[field.fieldname]));
  const totalMeters = number(values.length_m) * number(values.qty_bar);
  const estimatedAmount = number(values.actual_weight_kg) * number(values.rate);

  const change = (fieldname: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [fieldname]: value }));
    setPreview(undefined);
    setResult(undefined);
    setError(undefined);
  };

  const run = async (phase: "check" | "create") => {
    if (requiredMissing.length) {
      setError(`Còn thiếu: ${requiredMissing.map((field) => field.label).join(", ")}.`);
      return;
    }
    const call = phase === "check" ? action.preview : action.commit;
    if (!call) return;
    if (phase === "create" && call.confirm && !window.confirm("Tạo phiếu nhập nháp cho số hàng này?")) return;
    setBusy(phase);
    setError(undefined);
    try {
      const answer = await adapter.callPost<unknown>(call.method, values);
      if (phase === "check") { setPreview(answer); setResult(undefined); }
      else { setResult(answer); setPreview(undefined); }
    } catch (caught) {
      setError(adapter.mapError(caught).message);
    } finally {
      setBusy(undefined);
    }
  };

  const headerFields = HEADER_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field));
  const itemFields = ITEM_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field));

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3" data-action-screen={action.name} data-simple-aluminium-receipt>
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card px-4 py-3 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Mua hàng</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Nhận nhôm</h1>
          <p className="mt-1 text-sm text-muted-foreground">Nhập đúng hàng đang có trước mặt. Hệ thống tự tìm đơn mua để trừ.</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">Không cần chọn đơn mua · Không cần biết FIFO</div>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">Thông tin giao hàng</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {headerFields.map((field) => <FieldEditor key={field.fieldname} field={field} values={values} onChange={change} />)}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Hàng vừa nhận</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Một dòng tương ứng một mã nhôm / quy cách đang nhận.</p>
          </div>
          <span className="rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">1 dòng</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {itemFields.map((field) => <FieldEditor key={field.fieldname} field={field} values={values} onChange={change} />)}
        </div>
        <div className="grid gap-2 border-t bg-muted/15 p-3 sm:grid-cols-3">
          <Stat label="Số cây" value={fmt.number(number(values.qty_bar))} />
          <Stat label="Tổng mét" value={`${fmt.number(totalMeters)} m`} />
          <Stat label="Giá trị theo kg thực" value={fmt.currency ? fmt.currency(estimatedAmount) : fmt.number(estimatedAmount)} />
        </div>
      </section>

      {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</div> : null}

      {preview != null || result != null
        ? <AllocationSummary value={result ?? preview} committed={result != null} onOpen={onOpen} format={(value) => fmt.number(value)} />
        : null}

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        {requiredMissing.length ? <span className="mr-auto text-xs text-muted-foreground">Còn thiếu {requiredMissing.length} ô bắt buộc</span> : null}
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => run("check")}>{busy === "check" ? "Đang kiểm tra…" : "Kiểm tra"}</Button>
        {preview != null
          ? <Button disabled={Boolean(busy)} onClick={() => run("create")}>{busy === "create" ? "Đang tạo…" : "Tạo phiếu nhập"}</Button>
          : null}
      </div>
    </div>
  );
}

export function ActionScreen(props: ActionScreenProps) {
  if (props.action.name !== RECEIPT_ACTION) return <BaseActionScreen {...props} />;
  return <SimpleAluminiumReceipt {...props} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
