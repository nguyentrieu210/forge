/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import {
  bindActionField,
  buildActionTableRow,
  resolveFieldDefault,
  type AppAction,
  type AppActionField,
  type AppActionInputTable,
  type Doc,
  type DocField,
  type DocTypeMeta,
} from "@metaforge/core";
import { Button, Input, Label } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import { ActionChildGrid } from "./ActionChildGrid.js";
import type { ActionScreenProps } from "./ActionScreen.js";

type Values = Record<string, unknown>;
type ResultRecord = Record<string, unknown>;
type CommitResult = { doctype?: string; name?: string; message?: string; [key: string]: unknown };
type BusyPhase = "preview" | "commit" | "print";

function toDocField(field: AppActionField): DocField {
  return bindActionField(field);
}

function initialValues(action: AppAction, table: AppActionInputTable): Values {
  const values: Values = {};
  for (const field of action.fields) {
    if (field.fieldname === table.fieldname) continue;
    const value = resolveFieldDefault(toDocField(field));
    if (value != null) values[field.fieldname] = value;
  }
  values[table.fieldname] = [];
  return values;
}

function blankRows(table: AppActionInputTable, meta: DocTypeMeta): Doc[] {
  return Array.from({ length: table.min_rows }, (_, index) =>
    buildActionTableRow(meta, table, `new-${Date.now()}-${index}`));
}

function empty(value: unknown): boolean {
  return value == null || (typeof value === "string" && !value.trim());
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asResult(value: unknown): CommitResult {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CommitResult : {};
}

function record(value: unknown): ResultRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ResultRecord : undefined;
}

function scalar(value: unknown, format: (value: number) => string): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return format(value);
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return `${value.length} dòng`;
  if (typeof value === "object") return "—";
  return String(value);
}

function label(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function ResultTable({ rows, format }: { rows: unknown[]; format: (value: number) => string }) {
  const records = rows.map(record).filter((value): value is ResultRecord => Boolean(value));
  if (!records.length) return <div className="px-3 py-4 text-sm text-muted-foreground">Không có dòng dữ liệu.</div>;
  const keys = [...new Set(records.flatMap((row) => Object.keys(row)))].filter((key) => !key.startsWith("_")).slice(0, 18);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead className="border-b bg-muted/35 text-left text-xs text-muted-foreground">
          <tr>{keys.map((key) => <th key={key} className="whitespace-nowrap px-3 py-2 font-medium">{label(key)}</th>)}</tr>
        </thead>
        <tbody>
          {records.map((row, index) => (
            <tr key={index} className="border-b last:border-b-0">
              {keys.map((key) => (
                <td key={key} className="whitespace-nowrap px-3 py-2 align-top tabular-nums">{scalar(row[key], format)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RichActionResult({ value, committed, format, onOpen }: {
  value: unknown;
  committed: boolean;
  format: (value: number) => string;
  onOpen?: ActionScreenProps["onOpen"];
}) {
  const data = record(value);
  if (!data) return <div className="border bg-card px-3 py-3 text-sm">{String(value ?? "")}</div>;
  const arrays = Object.entries(data).filter(([, entry]) => Array.isArray(entry)) as Array<[string, unknown[]]>;
  const scalars = Object.entries(data).filter(([key, entry]) => key !== "message" && !Array.isArray(entry) && !record(entry) && !["doctype", "name"].includes(key));
  const objects = Object.entries(data).filter(([, entry]) => Boolean(record(entry))) as Array<[string, ResultRecord]>;
  // Generic navigation is explicit: only a canonical worker result {doctype, name} can open a doc.
  const doctype = typeof data.doctype === "string" ? data.doctype : undefined;
  const name = typeof data.name === "string" ? data.name : undefined;
  return (
    <div className="flex flex-col gap-3" data-rich-action-result>
      <section className="border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <span className={`size-2 rounded-full ${committed ? "bg-emerald-500" : "bg-amber-500"}`} />
          <strong className="text-sm">{committed ? "Đã tạo chứng từ" : "Xem trước — chưa ghi gì"}</strong>
          {committed && doctype && name && onOpen ? <Button type="button" size="sm" className="ml-auto" onClick={() => onOpen(doctype, name)}>Mở {name}</Button> : null}
        </div>
        {typeof data.message === "string" && data.message ? <div className="border-b bg-muted/15 px-3 py-2 text-sm">{data.message}</div> : null}
        {scalars.length ? <dl className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">{scalars.map(([key, entry]) => <div key={key} className="border bg-background px-3 py-2"><dt className="text-xs text-muted-foreground">{label(key)}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{scalar(entry, format)}</dd></div>)}</dl> : null}
      </section>
      {objects.map(([key, entry]) => <section key={key} className="border bg-card"><div className="border-b px-3 py-2 text-sm font-semibold">{label(key)}</div><dl className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(entry).map(([field, fieldValue]) => <div key={field} className="border bg-background px-3 py-2"><dt className="text-xs text-muted-foreground">{label(field)}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{scalar(fieldValue, format)}</dd></div>)}</dl></section>)}
      {arrays.map(([key, resultRows]) => <section key={key} className="overflow-hidden border bg-card"><div className="flex items-center justify-between border-b px-3 py-2"><strong className="text-sm">{label(key)}</strong><span className="text-xs text-muted-foreground">{resultRows.length} dòng</span></div><ResultTable rows={resultRows} format={format} /></section>)}
    </div>
  );
}

export function isRichAction(action: AppAction): boolean {
  return (action.input_tables ?? []).some((table) => table.presentation?.mode === "child-grid-inline" && Boolean(table.presentation?.row_doctype));
}

/** Generic rich AppAction renderer. Business rules stay in metadata/worker/controller. */
export function RichActionScreen({ action, onOpen }: ActionScreenProps) {
  const { adapter, registry, services, fmt, roles, businessContext } = useMetaForge();
  const table = (action.input_tables ?? []).find((candidate) => candidate.presentation?.mode === "child-grid-inline" && candidate.presentation.row_doctype)!;
  const rowDoctype = table.presentation!.row_doctype!;
  const moneyPrecision = table.presentation?.money_precision;
  const money = (value: number) => fmt.number(value, moneyPrecision);
  const [meta, setMeta] = useState<DocTypeMeta>();
  const [metaError, setMetaError] = useState<string>();
  const [values, setValues] = useState<Values>(() => initialValues(action, table));
  const [busy, setBusy] = useState<BusyPhase>();
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<unknown>();
  const [result, setResult] = useState<unknown>();

  useEffect(() => {
    let active = true;
    setMeta(undefined); setMetaError(undefined);
    void adapter.getMeta(rowDoctype).then((loaded) => {
      if (!active) return;
      setMeta(loaded);
      setValues((current) => {
        const currentRows = Array.isArray(current[table.fieldname]) ? current[table.fieldname] as Doc[] : [];
        return currentRows.length ? current : { ...current, [table.fieldname]: blankRows(table, loaded) };
      });
    }).catch((caught) => {
      if (active) setMetaError(adapter.mapError(caught).message);
    });
    return () => { active = false; };
  }, [adapter, rowDoctype, table]);

  const tableNames = useMemo(() => new Set((action.input_tables ?? []).map((entry) => entry.fieldname)), [action.input_tables]);
  const summaryFields = useMemo(() => new Set([
    table.summary?.discount_percentage_field,
    table.summary?.vat_percentage_field,
  ].filter((value): value is string => Boolean(value))), [table.summary]);
  const headerFields = action.fields.filter((field) => !tableNames.has(field.fieldname) && !summaryFields.has(field.fieldname));
  const rows = Array.isArray(values[table.fieldname]) ? values[table.fieldname] as Doc[] : [];

  const missing = useMemo(() => {
    const list: string[] = [];
    for (const field of headerFields) if (field.required && empty(values[field.fieldname])) list.push(field.label);
    if (rows.length < table.min_rows) list.push(`${table.label}: cần ít nhất ${table.min_rows} dòng`);
    rows.forEach((row, rowIndex) => table.columns.forEach((column) => {
      const canonical = meta?.fields.find((field) => field.fieldname === column.fieldname);
      const required = canonical?.reqd === 1 || (!canonical && column.required);
      if (required && empty(row[column.fieldname])) list.push(`Dòng ${rowIndex + 1} · ${canonical?.label ?? column.label}`);
    }));
    for (const fieldname of summaryFields) {
      const value = number(values[fieldname]);
      if (value < 0 || value > 100) list.push(`${fieldname}: phải từ 0 đến 100`);
    }
    return list;
  }, [headerFields, rows, summaryFields, table, values, meta]);

  // Summary arithmetic is explicitly declared by AppActionInputTable.summary; this is generic
  // presentation math, not inferred DocType business behavior.
  const subtotal = table.summary
    ? rows.reduce((sum, row) => sum + number(row[table.summary!.subtotal_field]), 0)
    : 0;
  const discountPct = table.summary?.discount_percentage_field ? number(values[table.summary.discount_percentage_field]) : 0;
  const discountAmount = subtotal * discountPct / 100;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatPct = table.summary?.vat_percentage_field ? number(values[table.summary.vat_percentage_field]) : 0;
  const vatAmount = afterDiscount * vatPct / 100;
  const grandTotal = afterDiscount + vatAmount;

  const changeValue = (fieldname: string, value: unknown) => {
    setValues((current) => ({ ...current, [fieldname]: value }));
    setError(undefined); setPreview(undefined); setResult(undefined);
  };

  const run = async (phase: "preview" | "commit", printAfter = false) => {
    const call = phase === "preview" ? action.preview : action.commit;
    if (!call) return;
    if (missing.length) {
      setError(`Còn thiếu hoặc chưa hợp lệ: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ` và ${missing.length - 8} mục khác` : ""}.`);
      return;
    }
    if (phase === "commit" && call.confirm && !window.confirm(call.confirm)) return;
    const printWindow = printAfter ? window.open("about:blank", "_blank") : null;
    setBusy(printAfter ? "print" : phase); setError(undefined);
    try {
      const args = { ...businessContext, ...values } as Record<string, unknown>;
      const answer = await adapter.callPost<unknown>(call.method, args);
      if (phase === "preview") {
        setPreview(answer); setResult(undefined);
      } else {
        setResult(answer); setPreview(undefined);
      }
      if (printAfter) {
        const committed = asResult(answer);
        const doctype = String(committed.doctype ?? "").trim();
        const name = String(committed.name ?? "").trim();
        if (!doctype || !name) throw new Error("Đã lưu nhưng kết quả không trả về chứng từ để in.");
        const blob = await adapter.downloadPdf(doctype, name, table.presentation?.print_format);
        const url = URL.createObjectURL(blob);
        if (printWindow) printWindow.location.replace(url);
        else window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (caught) {
      printWindow?.close();
      setError(adapter.mapError(caught).message);
      if (phase === "preview") setPreview(undefined); else setResult(undefined);
    } finally {
      setBusy(undefined);
    }
  };

  if (metaError) return <div className="w-full border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{metaError}</div>;
  if (!meta) return <div className="w-full p-4 text-sm text-muted-foreground">Đang tải metadata dòng hàng…</div>;

  const shown = result ?? preview;
  return (
    <div className="flex w-full max-w-none flex-col gap-3" data-rich-action={action.name}>
      {action.description ? <p className="text-xs text-muted-foreground">{action.description}</p> : null}

      <div className="grid w-full gap-2 border-b pb-3 sm:grid-cols-2 lg:grid-cols-3">
        {headerFields.map((field) => {
          const docField = toDocField(field); const Control = registry.resolve(docField.fieldtype); const id = `rich-${action.name}-${field.fieldname}`;
          return <div key={field.fieldname} className="grid min-w-0 gap-1">
            <Label htmlFor={id} className="text-xs font-semibold">{field.label}{field.required ? <span className="text-destructive">*</span> : null}</Label>
            {Control ? <Control field={docField} value={values[field.fieldname] ?? ""} onChange={(value: unknown) => changeValue(field.fieldname, value)} id={id} required={field.required} services={services} {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})} docValues={values} roles={roles} compact /> : <Input id={id} value={String(values[field.fieldname] ?? "")} onChange={(event) => changeValue(field.fieldname, event.target.value)} />}
          </div>;
        })}
      </div>

      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between"><div><h2 className="text-sm font-bold">{table.label}</h2>{table.description ? <p className="text-xs text-muted-foreground">{table.description}</p> : null}</div></div>
        <ActionChildGrid actionName={action.name} table={table} childMeta={meta} rows={rows} onChange={(next) => changeValue(table.fieldname, next)} registry={registry} services={services} roles={roles} parentDoc={{ ...businessContext, ...values }} />
      </section>

      {table.summary ? <div className="ml-auto grid w-full max-w-[430px] grid-cols-[minmax(0,1fr)_150px] items-center gap-x-3 gap-y-1.5 border-t pt-3 text-sm tabular-nums">
        <span className="text-muted-foreground">Tạm tính</span><strong className="text-right">{money(subtotal)}</strong>
        {table.summary.discount_percentage_field ? <><Label htmlFor={`summary-${table.summary.discount_percentage_field}`}>Chiết khấu (%)</Label><Input id={`summary-${table.summary.discount_percentage_field}`} className="h-8 text-right font-semibold" inputMode="decimal" value={String(values[table.summary.discount_percentage_field] ?? "")} onChange={(event) => changeValue(table.summary!.discount_percentage_field!, event.target.value)} /></> : null}
        {table.summary.discount_percentage_field ? <><span className="text-muted-foreground">Tổng chiết khấu</span><strong className="text-right">-{money(discountAmount)}</strong></> : null}
        {table.summary.vat_percentage_field ? <><Label htmlFor={`summary-${table.summary.vat_percentage_field}`}>VAT (%)</Label><Input id={`summary-${table.summary.vat_percentage_field}`} className="h-8 text-right font-semibold" inputMode="decimal" value={String(values[table.summary.vat_percentage_field] ?? "")} onChange={(event) => changeValue(table.summary!.vat_percentage_field!, event.target.value)} /></> : null}
        {table.summary.vat_percentage_field ? <><span className="text-muted-foreground">Tiền VAT</span><strong className="text-right">{money(vatAmount)}</strong></> : null}
        <span className="border-t pt-2 text-base font-extrabold">TỔNG</span><strong className="border-t pt-2 text-right text-base font-extrabold">{money(grandTotal)}</strong>
      </div> : null}

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-end gap-2 border bg-card/95 p-3 shadow-lg backdrop-blur">
        {missing.length ? <span className="mr-auto text-xs text-muted-foreground">Còn {missing.length} mục bắt buộc/chưa hợp lệ</span> : <span className="mr-auto text-xs text-muted-foreground">{action.preview ? "Xem trước chưa ghi dữ liệu." : "Sẵn sàng lưu chứng từ."}</span>}
        {action.preview ? <>
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run("preview")}>{busy === "preview" ? "Đang kiểm tra…" : action.preview.label}</Button>
          {preview !== undefined ? <Button type="button" disabled={Boolean(busy)} onClick={() => void run("commit")}>{busy === "commit" ? "Đang tạo…" : action.commit.label}</Button> : null}
        </> : <>
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run("commit")}>{busy === "commit" ? "Đang lưu…" : "Lưu"}</Button>
          <Button type="button" disabled={Boolean(busy)} onClick={() => void run("commit", true)}>{busy === "print" ? "Đang lưu…" : "Lưu & In PDF"}</Button>
        </>}
      </div>

      {error ? <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</div> : null}
      {shown !== undefined ? <RichActionResult value={shown} committed={result !== undefined} format={(value) => fmt.number(value, moneyPrecision)} onOpen={onOpen} /> : null}
    </div>
  );
}
