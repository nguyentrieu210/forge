/** @jsxImportSource react */
/** Canonical server-backed List runtime. Business presentation/query quirks live in list policies. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { displayValueKey, type Doc, type DocTypeMeta, type ListOpts } from "@metaforge/core";
import { ConfirmDialog, Skeleton, toast, useT } from "@metaforge/ui";
import { ListView } from "../list/ListView.js";
import { formatValue } from "../list/cells.js";
import { buildCsv, downloadCsv, downloadXlsx, printTablePdf, stampedName, type ExportFormat } from "../report/export.js";
import { deriveColumns, imageField, type ListColumn } from "../list/columns.js";
import { buildServerQuery } from "../list/filters.js";
import { useListUrlState, type UrlStateBridge } from "../list/useListState.js";
import { stableColumnPreferenceScope } from "../list/column-preferences.js";
import { builtinListPolicy, type ListPolicySearchResolution } from "../list/policies/index.js";
import { useMetaForge } from "./provider.js";
import { useMeta, useListView, NO_CAPS } from "./hooks.js";

const EMPTY_META: DocTypeMeta = { name: "", fields: [], permissions: [] };

export interface ListContainerProps {
  doctype: string;
  bridge: UrlStateBridge;
  onRowClick?: (row: Doc) => void;
  onCreate?: () => void;
  activeRow?: string;
  onSingle?: () => void;
}

export function ListContainer(props: ListContainerProps) {
  const t = useT();
  const { doctype, bridge } = props;
  const { adapter, scopeKey, fmt, roles, businessContext } = useMetaForge();
  const queryClient = useQueryClient();
  const metaQ = useMeta(doctype);
  const meta = metaQ.data ?? EMPTY_META;
  const policy = useMemo(() => builtinListPolicy(doctype), [doctype]);
  const imgField = useMemo(() => (metaQ.data ? imageField(metaQ.data, { roles }) : undefined), [metaQ.data, roles]);
  const isSingle = Boolean(metaQ.data?.issingle);

  useEffect(() => { if (isSingle) props.onSingle?.(); }, [isSingle, props.onSingle]);

  const [state, patch] = useListUrlState(bridge, meta, policy?.extraFilterFields ?? []);
  const [policySearch, setPolicySearch] = useState<ListPolicySearchResolution | null>(null);

  useEffect(() => {
    const resolver = policy?.resolveSearch;
    const term = state.q.trim();
    if (!resolver || !term) { setPolicySearch(null); return; }
    let active = true;
    setPolicySearch(null);
    void resolver(adapter, doctype, term)
      .then((result) => { if (active) setPolicySearch(result); })
      .catch(() => { if (active) setPolicySearch({ values: [] }); });
    return () => { active = false; };
  }, [adapter, doctype, policy, state.q]);

  const derivedColumns = useMemo(() => deriveColumns(meta, { roles }), [meta, roles]);
  const columns = useMemo<ListColumn[]>(
    () => policy?.columns ? policy.columns(meta, derivedColumns) : derivedColumns,
    [derivedColumns, meta, policy],
  );
  const queryColumns = useMemo(() => columns.filter((column) => !column.fieldname.startsWith("_")), [columns]);
  const filterValueFields = useMemo(
    () => [...new Set(queryColumns.map((column) => column.fieldname))],
    [queryColumns],
  );
  const [allFilterValues, setAllFilterValues] = useState<Record<string, string[]>>({});

  // Header facets describe the whole permission/context-scoped dataset, not only the current page.
  useEffect(() => {
    if (!filterValueFields.length) { setAllFilterValues({}); return; }
    let active = true;
    setAllFilterValues({});
    const fields = [...filterValueFields];
    const load = async () => {
      const values = new Map<string, Set<string>>(fields.map((field) => [field, new Set<string>()]));
      let offset = 0;
      let total = 0;
      while (active) {
        const snapshot = await adapter.getListView(doctype, { fields, orderBy: "name asc", limitStart: offset, pageLength: 100 }, businessContext);
        const page = snapshot.rows ?? [];
        total = Number(snapshot.count ?? page.length);
        for (const row of page) for (const field of fields) {
          const value = String(row[field] ?? "").trim();
          if (value) values.get(field)?.add(value);
        }
        offset += page.length;
        if (!page.length || offset >= total) break;
      }
      if (!active) return;
      setAllFilterValues(Object.fromEntries(fields.map((field) => [field, [...(values.get(field) ?? new Set<string>())].sort((a, b) => a.localeCompare(b, "vi"))])));
    };
    void load().catch(() => { if (active) setAllFilterValues({}); });
    return () => { active = false; };
  }, [adapter, businessContext, doctype, filterValueFields]);

  const listOpts = useMemo<ListOpts>(
    () => policy?.buildQuery
      ? policy.buildQuery(meta, state, queryColumns, policySearch)
      : buildServerQuery(meta, state, queryColumns),
    [meta, policy, policySearch, queryColumns, state],
  );
  const ready = Boolean(metaQ.data) && !isSingle;
  const viewQ = useListView(doctype, listOpts, ready);
  const rows = useMemo(() => policy?.rows ? policy.rows(viewQ.data?.rows ?? []) : (viewQ.data?.rows ?? []), [policy, viewQ.data?.rows]);
  const caps = viewQ.data?.capabilities ?? NO_CAPS;
  const displayValues = useMemo(
    () => Object.fromEntries((viewQ.data?.display_values ?? []).map((row) => [displayValueKey(row.doctype, row.name), row.label])),
    [viewQ.data?.display_values],
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype] });
  }, [queryClient, scopeKey, doctype]);

  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [approvingName, setApprovingName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const confirmBulkDelete = useCallback((names: string[]) => setPendingDelete(names), []);
  const doBulkDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      const results = await adapter.bulkDelete(doctype, pendingDelete);
      const deleted = results.filter((result) => result.ok).length;
      const failed = results.length - deleted;
      if (deleted) toast.success(`Đã xoá ${deleted} bản ghi`);
      if (failed) toast.error(`Không thể xoá ${failed} bản ghi`);
      if (deleted) { patch({ selected: [] }); refresh(); }
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setPendingDelete(null);
    }
  }, [adapter, doctype, pendingDelete, patch, refresh]);

  const approveDocument = useCallback(async (name: string) => {
    if (approvingName || !policy?.approve) return;
    setApprovingName(name);
    try {
      await policy.approve(adapter, doctype, name);
      toast.success("Đã duyệt");
      await viewQ.refetch();
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setApprovingName(null);
    }
  }, [adapter, approvingName, doctype, policy, viewQ]);

  const exportSelected = useCallback(async (names: string[], visibleFields: string[], format: ExportFormat = "xlsx") => {
    if (exporting) return;
    setExporting(true);
    try {
      const chosen = new Set(names);
      let exportRows = (viewQ.data?.rows ?? []).filter((row) => chosen.has(String(row.name)));
      if (!chosen.size) {
        exportRows = [];
        const pageLength = 100;
        const expected = viewQ.data?.count ?? Number.POSITIVE_INFINITY;
        for (let limitStart = 0; limitStart < expected; limitStart += pageLength) {
          const opts = { ...listOpts, limitStart, pageLength };
          const batch = Object.keys(businessContext).length
            ? await adapter.getContextualList(doctype, opts, businessContext)
            : await adapter.getList(doctype, opts);
          exportRows.push(...batch);
          if (batch.length < pageLength) break;
        }
      }
      if (!exportRows.length) return;

      const visibleSet = new Set(visibleFields);
      const visible = columns.filter((column) => visibleSet.has(column.fieldname));
      const cols = visible.map((column) => ({ label: column.label, fieldname: column.fieldname, fieldtype: column.fieldtype }));
      const requests: Array<{ doctype: string; name: string }> = [];
      const seen = new Set<string>();
      for (const row of exportRows) for (const column of visible) {
        if (column.fieldtype !== "Link" || !column.options) continue;
        const name = row[column.fieldname];
        if (!name) continue;
        const key = displayValueKey(column.options, String(name));
        if (seen.has(key)) continue;
        seen.add(key);
        requests.push({ doctype: column.options, name: String(name) });
      }
      const labels = { ...displayValues };
      for (let start = 0; start < requests.length; start += 200) {
        const resolved = await adapter.resolveDisplayValues(requests.slice(start, start + 200));
        for (const entry of resolved) labels[displayValueKey(entry.doctype, entry.name)] = entry.label;
      }
      const raw = (row: Record<string, unknown> | unknown[], col: { fieldname?: string }) => Array.isArray(row) ? "" : row[col.fieldname ?? ""];
      const text = (row: Record<string, unknown> | unknown[], col: { fieldname?: string }, index: number) => {
        const column = visible[index];
        const value = raw(row, col);
        if (value === null || value === undefined) return "";
        if (column?.fieldtype === "Link" && column.options) return labels[displayValueKey(column.options, String(value))] ?? String(value);
        return column ? formatValue(value, column, fmt) : String(value);
      };
      const filename = stampedName(meta.label || meta.name || doctype);
      if (format === "pdf") {
        printTablePdf(filename, cols, exportRows as Array<Record<string, unknown>>, text);
        toast.success(`Đã mở bản PDF (${exportRows.length})`);
        return;
      }
      try {
        await downloadXlsx(filename, cols, exportRows as Array<Record<string, unknown>>, raw, text);
        toast.success(`${t("list.export_done")} (${exportRows.length})`);
      } catch {
        downloadCsv(filename, buildCsv(cols, exportRows as Array<Record<string, unknown>>, text));
        toast.success(`${t("list.export_done_csv")} (${exportRows.length})`);
      }
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setExporting(false);
    }
  }, [adapter, businessContext, columns, displayValues, doctype, exporting, fmt, listOpts, meta, t, viewQ.data]);

  if (metaQ.isLoading) return <ListSkeleton />;
  if (metaQ.error) return <ListView meta={EMPTY_META} rows={[]} state={state} onStateChange={patch} error={adapter.mapError(metaQ.error).message} />;
  if (isSingle) return <ListSkeleton />;

  const preferenceScope = policy?.preferenceScopeSuffix
    ? `${stableColumnPreferenceScope(scopeKey)}|${policy.preferenceScopeSuffix}`
    : stableColumnPreferenceScope(scopeKey);

  return (
    <>
      <ListView
        meta={meta}
        columns={columns}
        centerContent={policy?.centerContent}
        rows={rows}
        total={viewQ.data?.count}
        loading={viewQ.isLoading}
        error={viewQ.error ? adapter.mapError(viewQ.error).message : null}
        state={state}
        onStateChange={patch}
        preferenceScope={preferenceScope}
        onRowClick={props.onRowClick}
        onCreate={caps.create ? props.onCreate : undefined}
        onRefresh={refresh}
        onBulkDelete={caps.delete ? confirmBulkDelete : undefined}
        onDelete={caps.delete ? (name) => setPendingDelete([name]) : undefined}
        onApprove={policy?.approve && caps.submit ? (name) => { void approveDocument(name); } : undefined}
        canApprove={policy?.canApprove}
        isWarningRow={policy?.warningRow}
        approvingName={approvingName}
        onExport={exportSelected}
        exporting={exporting}
        title={meta.label || meta.name || doctype}
        activeRow={props.activeRow}
        fmt={fmt}
        roles={roles}
        displayValues={displayValues}
        filterValues={allFilterValues}
        searchLink={(target, text, opts) => adapter.searchLink(target, text, { referenceDoctype: doctype, pageLength: 20, filters: opts?.filters })}
        onInlineUpdate={caps.write ? async (name, update) => {
          try {
            const row = rows.find((candidate) => String(candidate.name) === name);
            await adapter.updateDoc(doctype, name, update as Partial<Doc>, String(row?.modified ?? ""));
            await viewQ.refetch();
          } catch (error) { toast.error(adapter.mapError(error).message); }
        } : undefined}
        onUploadImage={caps.write ? async (name, file) => {
          try {
            const uploaded = await adapter.uploadFile(file, { isPrivate: 0, doctype, docname: name, fieldname: imgField });
            if (!uploaded?.file_url) throw new Error("Máy chủ không trả về đường dẫn tệp");
            const row = rows.find((candidate) => String(candidate.name) === name);
            await adapter.updateDoc(doctype, name, { [imgField ?? "image"]: uploaded.file_url } as Partial<Doc>, String(row?.modified ?? ""));
            await viewQ.refetch();
            toast.success("Đã cập nhật ảnh");
          } catch (error) { toast.error(adapter.mapError(error).message); }
        } : undefined}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={`${t("list.delete_confirm_prefix")} ${pendingDelete?.length ?? 0} ${t("list.delete_confirm_suffix")}`}
        description={t("form.delete_confirm_desc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={doBulkDelete}
      />
    </>
  );
}

function ListSkeleton() {
  return <div className="flex h-full flex-col gap-3 rounded-lg border bg-card p-3"><Skeleton className="h-9 w-full" />{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}</div>;
}
