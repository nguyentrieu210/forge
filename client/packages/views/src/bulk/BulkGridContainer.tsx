/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { resolveBulkRenderPolicy, type Doc, type ListOpts } from "@metaforge/core";
import { mapError } from "@metaforge/adapter-frappe";
import { Button, Input, Skeleton, toast } from "@metaforge/ui";
import { deriveColumns } from "../list/columns.js";
import { buildServerQuery } from "../list/filters.js";
import { useListUrlState, type UrlStateBridge } from "../list/useListState.js";
import { useMetaForge } from "../container/provider.js";
import { useListView, useMeta } from "../container/hooks.js";
import { BulkGridView } from "./BulkGridView.js";
import { ItemPriceMatrixPanel } from "./ItemPriceMatrixPanel.js";

export interface BulkGridContainerProps {
  doctype: string;
  bridge: UrlStateBridge;
  title?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export function BulkGridContainer(props: BulkGridContainerProps) {
  const { adapter, roles } = useMetaForge();
  const metaQ = useMeta(props.doctype);
  const meta = metaQ.data;
  const policy = useMemo(() => meta ? resolveBulkRenderPolicy(meta) : undefined, [meta]);
  const listColumns = useMemo(() => meta ? deriveColumns(meta, { roles }) : [], [meta, roles]);
  const [state, patchState] = useListUrlState(props.bridge, meta ?? { name: props.doctype, fields: [], permissions: [] });
  const effectiveState = useMemo(() => ({ ...state, pageSize: policy?.pageSize ?? state.pageSize }), [state, policy?.pageSize]);
  const listOpts = useMemo<ListOpts>(() => {
    if (!meta || !policy?.enabled) return { pageLength: 1 };
    const base = buildServerQuery(meta, effectiveState, listColumns);
    const fields = new Set(["name", "modified", ...(base.fields ?? []), ...policy.columns.map((field) => field.fieldname)]);
    return { ...base, fields: [...fields], pageLength: policy.pageSize };
  }, [effectiveState, listColumns, meta, policy]);
  const viewQ = useListView(props.doctype, listOpts, Boolean(meta && policy?.enabled));
  const rows = viewQ.data?.rows ?? [];
  const writable = Boolean(viewQ.data?.capabilities?.write);
  const total = viewQ.data?.count ?? rows.length;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Record<string, Record<string, unknown>>>({});
  const [originalModified, setOriginalModified] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirtyCount = Object.keys(dirty).length;

  const rowByName = useMemo(() => new Map(rows.map((row) => [String(row.name), row])), [rows]);
  const rowSignature = useMemo(() => rows.map((row) => String(row.name)).join("\u001f"), [rows]);
  useEffect(() => setSelected(new Set()), [rowSignature]);
  useEffect(() => { props.onDirtyChange?.(dirtyCount > 0); }, [dirtyCount, props.onDirtyChange]);
  useEffect(() => () => { props.onDirtyChange?.(false); }, [props.onDirtyChange]);
  useEffect(() => {
    if (!dirtyCount) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirtyCount]);

  const changeCell = useCallback((name: string, fieldname: string, value: unknown) => {
    if (!policy?.editable.has(fieldname)) return;
    const row = rowByName.get(name);
    if (!row) return;
    setOriginalModified((current) => current[name] ? current : { ...current, [name]: String(row.modified ?? "") });
    setDirty((current) => ({ ...current, [name]: { ...(current[name] ?? {}), [fieldname]: value } }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, [policy, rowByName]);

  const pasteMatrix = useCallback((rowIndex: number, columnIndex: number, matrix: string[][]) => {
    if (!policy) return;
    matrix.forEach((cells, rowOffset) => {
      const row = rows[rowIndex + rowOffset];
      if (!row) return;
      cells.forEach((raw, columnOffset) => {
        const field = policy.columns[columnIndex + columnOffset];
        if (!field || !policy.editable.has(field.fieldname)) return;
        let value: unknown = raw;
        if (["Int", "Float", "Currency", "Percent", "Duration", "Rating"].includes(field.fieldtype)) {
          value = raw.trim() === "" ? null : Number(raw.replace(/\s/g, "").replace(/,/g, "."));
          if (typeof value === "number" && !Number.isFinite(value)) value = raw;
        } else if (field.fieldtype === "Check") {
          value = /^(1|true|yes|có|x)$/i.test(raw.trim()) ? 1 : 0;
        }
        changeCell(String(row.name), field.fieldname, value);
      });
    });
  }, [changeCell, policy, rows]);

  const fillDown = useCallback((fieldname: string) => {
    if (!policy?.editable.has(fieldname) || selected.size < 2) return;
    const selectedRows = rows.filter((row) => selected.has(String(row.name)));
    const source = selectedRows[0];
    if (!source) return;
    const sourcePatch = dirty[String(source.name)];
    const value = sourcePatch && Object.prototype.hasOwnProperty.call(sourcePatch, fieldname)
      ? sourcePatch[fieldname]
      : source[fieldname];
    for (const row of selectedRows.slice(1)) changeCell(String(row.name), fieldname, value);
  }, [changeCell, dirty, policy, rows, selected]);

  const discard = useCallback(() => {
    setDirty({});
    setOriginalModified({});
    setErrors({});
  }, []);

  const save = useCallback(async () => {
    if (!writable || saving || !dirtyCount) return;
    setSaving(true);
    const failed: Record<string, string> = {};
    let saved = 0;
    try {
      for (const [name, values] of Object.entries(dirty)) {
        try {
          await adapter.updateDoc(props.doctype, name, values as Partial<Doc>, originalModified[name] ?? "");
          saved += 1;
        } catch (error) {
          failed[name] = mapError(error).message;
        }
      }
      setErrors(failed);
      if (saved) toast.success(`Đã lưu ${saved} bản ghi`);
      const failedCount = Object.keys(failed).length;
      if (failedCount) toast.error(`${failedCount} bản ghi chưa lưu; xem lỗi trên từng dòng`);
      if (!failedCount) {
        setDirty({});
        setOriginalModified({});
        setSelected(new Set());
      } else {
        setDirty((current) => Object.fromEntries(Object.entries(current).filter(([name]) => failed[name])));
        setOriginalModified((current) => Object.fromEntries(Object.entries(current).filter(([name]) => failed[name])));
      }
      await viewQ.refetch();
    } finally {
      setSaving(false);
    }
  }, [adapter, dirty, dirtyCount, originalModified, props.doctype, saving, viewQ, writable]);

  if (metaQ.isLoading) return <div className="grid h-full gap-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-96" /></div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive">{mapError(metaQ.error).message}</div>;
  if (props.doctype === "Item Price") {
    return <div className="h-full min-h-0 p-2"><ItemPriceMatrixPanel adapter={adapter} onChanged={viewQ.refetch} /></div>;
  }
  if (!meta || !policy?.enabled) return <div className="grid h-40 place-items-center p-4 text-sm text-muted-foreground">DocType này chưa bật Bulk View an toàn.</div>;
  if (viewQ.error) return <div className="p-4 text-sm text-destructive">{mapError(viewQ.error).message}</div>;

  const maxPage = Math.max(1, Math.ceil(total / policy.pageSize));
  const canNavigate = dirtyCount === 0 && !saving;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative min-w-52 flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" value={state.q} placeholder="Tìm trong danh sách…" disabled={!canNavigate} onChange={(event) => patchState({ q: event.target.value })} />
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => viewQ.refetch()} disabled={saving} aria-label="Làm mới"><RefreshCw /></Button>
        <span className="text-xs tabular-nums text-muted-foreground">{total} bản ghi · trang {state.page}/{maxPage}</span>
        <Button variant="outline" size="icon" className="size-8" disabled={!canNavigate || state.page <= 1} onClick={() => patchState({ page: state.page - 1 })} aria-label="Trang trước"><ChevronLeft /></Button>
        <Button variant="outline" size="icon" className="size-8" disabled={!canNavigate || state.page >= maxPage} onClick={() => patchState({ page: state.page + 1 })} aria-label="Trang sau"><ChevronRight /></Button>
      </div>
      <div className="min-h-0 flex-1">
        <BulkGridView
          title={props.title ?? meta.label ?? meta.name}
          rows={rows}
          policy={policy}
          selected={selected}
          dirty={dirty}
          errors={errors}
          saving={saving}
          writable={writable}
          onSelect={(name, checked) => setSelected((current) => { const next = new Set(current); checked ? next.add(name) : next.delete(name); return next; })}
          onSelectAll={(checked) => setSelected(checked ? new Set(rows.map((row) => String(row.name))) : new Set())}
          onCellChange={changeCell}
          onPasteMatrix={pasteMatrix}
          onFillDown={fillDown}
          onSave={save}
          onDiscard={discard}
        />
      </div>
      </>
    </div>
  );
}
