/** @jsxImportSource react */
/**
 * ListContainer — nối ListView vào backend (server-side filter/sort/paginate).
 * State sống ở URL (AC#4/#7) qua `bridge` injectable → package KHÔNG cứng react-router.
 * Sở thích cột do ListView lưu theo site + user + doctype. Dữ liệu, tổng số, quyền và
 * nhãn Link đi chung một snapshot để màn hình không tạo waterfall HTTP.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { displayValueKey, type Doc, type DocTypeMeta, type ListOpts } from "@metaforge/core";
import { ConfirmDialog, Skeleton, toast, useT } from "@metaforge/ui";
import { ListView } from "../list/ListView.js";
import { formatValue } from "../list/cells.js";
import { buildCsv, downloadCsv, downloadXlsx, printTablePdf, stampedName, type ExportFormat } from "../report/export.js";
import { deriveColumns, imageField } from "../list/columns.js";
import { buildServerQuery } from "../list/filters.js";
import { useListUrlState, type UrlStateBridge } from "../list/useListState.js";
import { stableColumnPreferenceScope } from "../list/column-preferences.js";
import { useMetaForge } from "./provider.js";
import { useMeta, useListView, NO_CAPS } from "./hooks.js";

const EMPTY_META: DocTypeMeta = { name: "", fields: [], permissions: [] };

export interface ListContainerProps {
  doctype: string;
  bridge: UrlStateBridge;
  onRowClick?: (row: Doc) => void;
  onCreate?: () => void;
  activeRow?: string;
  /** DocType "Single" (issingle=1, vd Stock Settings) chỉ có ĐÚNG 1 document — tên document THẬT
   * chính là tên doctype (quy ước Frappe, xác nhận LIVE qua getdoc). List không có ý nghĩa cho case
   * này (server list/count trên Single doctype không phải luồng Desk dùng) → gọi onSingle thay vì
   * render danh sách rỗng/lỗi "Không tải được dữ liệu". */
  onSingle?: () => void;
}

export function ListContainer(props: ListContainerProps) {
  const t = useT();
  const { doctype, bridge } = props;
  const { adapter, scopeKey, fmt, roles, businessContext } = useMetaForge();
  const queryClient = useQueryClient();
  const metaQ = useMeta(doctype);
  const meta = metaQ.data ?? EMPTY_META;
  // P1-PERM-01: caps DOCTYPE-level (không name) fail-closed — đang tải/lỗi ⇒ NO_CAPS (ẩn Tạo mới/Xoá
  // hàng loạt cho tới khi server trả quyền thật, giống FormContainer/NewFormContainer).
  // Field ảnh của doctype — nơi ghi file_url sau khi tải ảnh lên từ avatar trên danh sách.
  const imgField = useMemo(() => (metaQ.data ? imageField(metaQ.data, { roles }) : undefined), [metaQ.data, roles]);

  const isSingle = Boolean(metaQ.data?.issingle);
  useEffect(() => {
    if (isSingle) props.onSingle?.();
  }, [isSingle, props.onSingle]);

  const [state, patch] = useListUrlState(bridge, meta);

  const columns = useMemo(() => deriveColumns(meta, { roles }), [meta, roles]);
  // Global context is enforced by adapter.getContextualList/getContextualCount on the server,
  // including warehouse fields in child tables. Do not duplicate it as a parent-only filter here.
  const listOpts = useMemo<ListOpts>(() => buildServerQuery(meta, state, columns), [meta, state, columns]);
  const ready = Boolean(metaQ.data) && !isSingle;
  const viewQ = useListView(doctype, listOpts, ready);
  const rows = viewQ.data?.rows ?? [];
  const caps = viewQ.data?.capabilities ?? NO_CAPS;
  const displayValues = useMemo(
    () => Object.fromEntries((viewQ.data?.display_values ?? []).map((r) => [displayValueKey(r.doctype, r.name), r.label])),
    [viewQ.data?.display_values],
  );

  const refresh = useCallback(() => {
    // Khoá query có prefix scopeKey (P1-03) ⇒ invalidate PHẢI gồm scopeKey, nếu không sẽ không khớp.
    queryClient.invalidateQueries({ queryKey: [scopeKey, "list-view", doctype] });
  }, [queryClient, scopeKey, doctype]);

  // Xoá hàng loạt không thể hoàn tác — hỏi xác nhận TRƯỚC (trước đây gọi API ngay, 0 xác nhận nào,
  // 1 cú click nhầm ở toolbar chọn nhiều dòng = mất dữ liệu vĩnh viễn hàng loạt).
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
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
      if (deleted) {
        patch({ selected: [] });
        refresh();
      }
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setPendingDelete(null);
    }
  }, [adapter, doctype, pendingDelete, patch, refresh]);

  /**
   * Xuất Excel từ danh sách.
   *
   * `ListView` đã có nút này từ lâu, nhưng nó chỉ hiện khi cha truyền `onExport` — và
   * KHÔNG cha nào truyền. Nút tồn tại trong mã, không tồn tại trên màn hình; đó là lý do
   * "xuất Excel" bị coi là chưa làm.
   *
   * Không chọn dòng nào ⇒ xuất TOÀN BỘ kết quả đang lọc/sắp xếp, đọc theo lô 100 (giới hạn
   * page của server). Có chọn dòng ⇒ chỉ xuất đúng các dòng đã chọn trên trang hiện tại.
   */
  const exportSelected = useCallback(async (names: string[], visibleFields: string[], format: ExportFormat = "xlsx") => {
    if (exporting) return;
    setExporting(true);
    try {
      const chosen = new Set(names);
      let rows = (viewQ.data?.rows ?? []).filter((row) => chosen.has(String(row.name)));
      if (!chosen.size) {
        rows = [];
        const pageLength = 100;
        const expected = viewQ.data?.count ?? Number.POSITIVE_INFINITY;
        for (let limitStart = 0; limitStart < expected; limitStart += pageLength) {
          const opts = { ...listOpts, limitStart, pageLength };
          const batch = Object.keys(businessContext).length
            ? await adapter.getContextualList(doctype, opts, businessContext)
            : await adapter.getList(doctype, opts);
          rows.push(...batch);
          if (batch.length < pageLength) break;
        }
      }
      if (!rows.length) return;

      const visibleSet = new Set(visibleFields);
      const visible = columns.filter((column) => visibleSet.has(column.fieldname));
      const cols = visible.map((column) => ({ label: column.label, fieldname: column.fieldname, fieldtype: column.fieldtype }));
      const linkRequests: Array<{ doctype: string; name: string }> = [];
      const seenLinks = new Set<string>();
      for (const row of rows) for (const column of visible) {
        if (column.fieldtype !== "Link" || !column.options) continue;
        const name = row[column.fieldname];
        if (!name) continue;
        const key = displayValueKey(column.options, String(name));
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);
        linkRequests.push({ doctype: column.options, name: String(name) });
      }
      const exportDisplayValues = { ...displayValues };
      for (let start = 0; start < linkRequests.length; start += 200) {
        const resolved = await adapter.resolveDisplayValues(linkRequests.slice(start, start + 200));
        for (const entry of resolved) exportDisplayValues[displayValueKey(entry.doctype, entry.name)] = entry.label;
      }

      const raw = (row: Record<string, unknown> | unknown[], col: { fieldname?: string }) => (Array.isArray(row) ? "" : row[col.fieldname ?? ""]);
      const text = (row: Record<string, unknown> | unknown[], col: { fieldname?: string }, index: number) => {
        const column = visible[index];
        const value = raw(row, col);
        if (value === null || value === undefined) return "";
        if (column?.fieldtype === "Link" && column.options) {
          return exportDisplayValues[displayValueKey(column.options, String(value))] ?? String(value);
        }
        return column ? formatValue(value, column, fmt) : String(value);
      };
      const filename = stampedName(meta.label || meta.name || doctype);
      if (format === "pdf") {
        printTablePdf(filename, cols, rows as Array<Record<string, unknown>>, text);
        toast.success(`Đã mở bản PDF (${rows.length})`);
        return;
      }
      try {
        await downloadXlsx(filename, cols, rows as Array<Record<string, unknown>>, raw, text);
        toast.success(`${t("list.export_done")} (${rows.length})`);
      } catch {
        downloadCsv(filename, buildCsv(cols, rows as Array<Record<string, unknown>>, text));
        toast.success(`${t("list.export_done_csv")} (${rows.length})`);
      }
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setExporting(false);
    }
  }, [adapter, businessContext, columns, displayValues, doctype, exporting, fmt, listOpts, meta, t, viewQ.data]);

  if (metaQ.isLoading) return <ListSkeleton />;
  if (metaQ.error) {
    return <ListView meta={EMPTY_META} rows={[]} state={state} onStateChange={patch} error={adapter.mapError(metaQ.error).message} />;
  }
  // Single doctype: onSingle (effect ở trên) đã điều hướng sang form — không render list (server
  // list/count trên Single doctype không phải luồng thật, gây "Không tải được dữ liệu" nếu cứ gọi).
  if (isSingle) return <ListSkeleton />;

  return (
    <>
      <ListView
        meta={meta}
        rows={rows}
        total={viewQ.data?.count}
        // Chỉ che bảng ở lần tải đầu. Refetch có dữ liệu cache (do người dùng chủ động làm mới hoặc
        // mutation invalidate) phải giữ nguyên bảng, tránh cảm giác cả màn hình "load lại".
        loading={viewQ.isLoading}
        error={viewQ.error ? adapter.mapError(viewQ.error).message : null}
        state={state}
        onStateChange={patch}
        preferenceScope={stableColumnPreferenceScope(scopeKey)}
        onRowClick={props.onRowClick}
        onCreate={caps.create ? props.onCreate : undefined}
        onRefresh={refresh}
        onBulkDelete={caps.delete ? confirmBulkDelete : undefined}
        onDelete={caps.delete ? (name) => setPendingDelete([name]) : undefined}
        onExport={exportSelected}
        exporting={exporting}
        title={meta.label || meta.name || doctype}
        activeRow={props.activeRow}
        fmt={fmt}
        roles={roles}
        displayValues={displayValues}
        searchLink={(target, text) => adapter.searchLink(target, text, { referenceDoctype: doctype, pageLength: 20 })}
        /* Sửa nhanh trên danh sách — chỉ mở khi user THỰC SỰ có quyền ghi. caps.write do server
           trả về (fail-closed), không suy đoán ở client. */
        onInlineUpdate={caps.write ? async (name, patch) => {
          try {
            // PHẢI gửi `modified` của đúng dòng đó: đây là chốt chống ghi đè khi hai người sửa
            // cùng một bản ghi. Bỏ qua cho tiện thì người sau âm thầm đè mất thay đổi của người
            // trước — loại lỗi không ai phát hiện cho tới lúc đối chiếu số liệu.
            // `modified` luôn có trong kết quả list (queryFields đưa vào nhóm base).
            const row = rows.find((r) => String(r.name) === name);
            await adapter.updateDoc(doctype, name, patch as Partial<Doc>, String(row?.modified ?? ""));
            await viewQ.refetch();
          } catch (e) {
            toast.error(adapter.mapError(e).message);
          }
        } : undefined}
        onUploadImage={caps.write ? async (name, file) => {
          try {
            const up = await adapter.uploadFile(file, { isPrivate: 0, doctype, docname: name, fieldname: imgField });
            if (!up?.file_url) throw new Error("Máy chủ không trả về đường dẫn tệp");
            const row = rows.find((r) => String(r.name) === name);
            await adapter.updateDoc(doctype, name, { [imgField ?? "image"]: up.file_url } as Partial<Doc>, String(row?.modified ?? ""));
            await viewQ.refetch();
            toast.success("Đã cập nhật ảnh");
          } catch (e) {
            toast.error(adapter.mapError(e).message);
          }
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
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border bg-card p-3">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
