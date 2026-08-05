/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import type { AppAction, AppActionField, DocField, Fieldtype } from "@metaforge/core";
import { Button, Checkbox, Input, Label } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import type { ActionScreenProps } from "./ActionScreen.js";

const PREFIX = "SelectionBatch:";
type Json = Record<string, unknown>;

interface ColumnConfig { field: string; label: string; align?: "left" | "right"; }
interface SelectionBatchConfig {
  rowsKey: string;
  rowKey: string;
  selectedArg: string;
  statusField?: string;
  selectableValue?: string;
  columns: ColumnConfig[];
  emptyText?: string;
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function toDocField(field: AppActionField): DocField {
  return {
    fieldname: field.fieldname, label: field.label, fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}), ...(field.required ? { reqd: 1 as const } : {}),
    ...(field.default == null ? {} : { default: field.default }),
  };
}
function configField(action: AppAction): AppActionField | undefined {
  return action.fields.find((field) => field.fieldtype === "Text" && field.options?.startsWith(PREFIX));
}
export function selectionBatchConfig(action: AppAction): SelectionBatchConfig | undefined {
  const raw = configField(action)?.options?.slice(PREFIX.length);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as SelectionBatchConfig;
    if (!parsed.rowsKey || !parsed.rowKey || !parsed.selectedArg || !Array.isArray(parsed.columns) || !parsed.columns.length) return undefined;
    if (!parsed.columns.every((column) => column?.field && column?.label)) return undefined;
    return parsed;
  } catch { return undefined; }
}

export function SelectionBatchActionScreen({ action, onOpen }: ActionScreenProps) {
  const config = selectionBatchConfig(action)!;
  const { adapter, registry, services, roles, businessContext } = useMetaForge();
  const visibleFields = action.fields.filter((field) => field !== configField(action));
  const initial = useMemo(() => Object.fromEntries(visibleFields.flatMap((field) => field.default == null ? [] : [[field.fieldname, field.default]])), [action.name]);
  const [values, setValues] = useState<Json>(initial);
  const [preview, setPreview] = useState<Json>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"preview" | "commit">();
  const [error, setError] = useState("");
  const effective = useMemo(() => ({ ...businessContext, ...values }), [businessContext, values]);
  const rows = Array.isArray(preview?.[config.rowsKey]) ? preview![config.rowsKey] as Json[] : [];
  const selectable = rows.filter((row) => !config.statusField || !config.selectableValue || text(row[config.statusField]) === config.selectableValue);

  const missing = visibleFields.filter((field) => field.required && !text(values[field.fieldname])).map((field) => field.label);
  const contextMissing = [
    ...(Object.hasOwn(businessContext, "company") && !text(businessContext.company) ? ["Công ty"] : []),
    ...(Object.hasOwn(businessContext, "warehouse") && !text(businessContext.warehouse) ? ["Kho"] : []),
  ];

  const runPreview = async () => {
    if (!action.preview || missing.length) return;
    setBusy("preview"); setError("");
    try {
      const result = await adapter.callPost<Json>(action.preview.method, effective);
      setPreview(result);
      // Batch actions must require an explicit operator choice after every refresh.
      // Showing eligible rows is not consent to process all of them.
      setSelected([]);
    } catch (caught) { setPreview(undefined); setSelected([]); setError(adapter.mapError(caught).message); }
    finally { setBusy(undefined); }
  };

  useEffect(() => {
    if (!action.preview || missing.length) { setPreview(undefined); setSelected([]); return; }
    const timer = window.setTimeout(() => void runPreview(), 350);
    return () => window.clearTimeout(timer);
    // Effective context is intentionally serialized: changing Company/Warehouse/date invalidates the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(effective), action.preview?.method]);

  const commit = async () => {
    if (!selected.length) { setError("Chưa chọn chứng từ nào để xử lý."); return; }
    setBusy("commit"); setError("");
    try {
      const result = await adapter.callPost<Json>(action.commit.method, { ...effective, [config.selectedArg]: selected });
      setPreview(result);
      setSelected([]);
    } catch (caught) { setError(adapter.mapError(caught).message); }
    finally { setBusy(undefined); }
  };

  return <div className="w-full max-w-none space-y-3" data-selection-batch={action.name}>
    {action.description ? <p className="text-sm text-muted-foreground">{action.description}</p> : null}
    <section className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 xl:grid-cols-4">
      {visibleFields.map((field) => {
        const docField = toDocField(field); const Control = registry.resolve(docField.fieldtype); const id = `batch-${action.name}-${field.fieldname}`;
        return <div key={field.fieldname} className="grid min-w-0 gap-1.5">
          <Label htmlFor={id}>{field.label}{field.required ? <span className="text-destructive">*</span> : null}</Label>
          {Control ? <Control field={docField} value={values[field.fieldname] ?? ""} onChange={(value: unknown) => { setValues((current) => ({ ...current, [field.fieldname]: value })); setPreview(undefined); setSelected([]); }} id={id} required={field.required} services={services} roles={roles} docValues={values} {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})} compact /> : <Input id={id} value={text(values[field.fieldname])} onChange={(event) => setValues((current) => ({ ...current, [field.fieldname]: event.target.value }))} />}
        </div>;
      })}
      <div className="flex items-end"><Button type="button" variant="outline" onClick={() => void runPreview()} disabled={Boolean(busy) || missing.length > 0}><RefreshCw /> Làm mới</Button></div>
    </section>

    {contextMissing.length ? <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert className="size-4 shrink-0" />Cần chọn {contextMissing.join(" và ")} trên thanh ngữ cảnh.</div> : null}
    {error ? <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <strong className="text-sm">Danh sách sẵn sàng xử lý</strong>
        {busy === "preview" ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> đang đọc…</span> : <span className="text-xs text-muted-foreground">{selectable.length} sẵn sàng · {selected.length} đã chọn</span>}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={!selectable.length} onClick={() => setSelected(selected.length === selectable.length ? [] : selectable.map((row) => text(row[config.rowKey])).filter(Boolean))}>{selected.length === selectable.length && selectable.length ? "Bỏ chọn tất cả" : "Chọn tất cả sẵn sàng"}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full text-sm"><thead className="bg-muted/40"><tr><th className="w-12 px-3 py-2"><Checkbox checked={selected.length > 0 && selected.length === selectable.length} onCheckedChange={() => setSelected(selected.length === selectable.length ? [] : selectable.map((row) => text(row[config.rowKey])).filter(Boolean))} /></th>{config.columns.map((column) => <th key={column.field} className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold ${column.align === "right" ? "text-right" : ""}`}>{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => {
            const key = text(row[config.rowKey]);
            const canSelect = !config.statusField || !config.selectableValue || text(row[config.statusField]) === config.selectableValue;
            return <tr key={`${key}:${index}`} className="border-t"><td className="px-3 py-2"><Checkbox disabled={!canSelect} checked={selected.includes(key)} onCheckedChange={() => canSelect && setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} /></td>{config.columns.map((column) => {
              const value = row[column.field];
              const clickable = column.field === config.rowKey && onOpen && key;
              return <td key={column.field} className={`whitespace-nowrap px-3 py-2 ${column.align === "right" ? "text-right tabular-nums" : ""}`}>{clickable ? <Button variant="link" className="h-auto p-0" onClick={() => onOpen("Sales Order", key)}>{text(value) || key}</Button> : text(value) || "—"}</td>;
            })}</tr>;
          })}{!rows.length && busy !== "preview" ? <tr><td colSpan={config.columns.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">{config.emptyText ?? "Không có chứng từ phù hợp."}</td></tr> : null}</tbody></table>
      </div>
    </section>

    <div className="sticky bottom-2 z-10 flex items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
      <span className="mr-auto text-sm text-muted-foreground">Chỉ các dòng được chọn mới được gửi sang lệnh xử lý.</span>
      <Button type="button" disabled={Boolean(busy) || !selected.length || contextMissing.length > 0} onClick={() => void commit()}>{busy === "commit" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {action.commit.label}</Button>
    </div>
  </div>;
}
