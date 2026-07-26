/** @jsxImportSource react */
/**
 * ListContainer — nối ListView vào backend (server-side filter/sort/paginate).
 * State sống ở URL (AC#4/#7) qua `bridge` injectable → package KHÔNG cứng react-router.
 * Cột ẩn ở localStorage per-doctype. getList + getCount chạy song song (TanStack Query).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { displayValueKey, type Doc, type DocTypeMeta, type ListOpts } from "@metaforge/core";
import { ConfirmDialog, Skeleton, toast, useT } from "@metaforge/ui";
import { ListView } from "../list/ListView.js";
import { deriveColumns, imageField } from "../list/columns.js";
import { buildServerQuery, countQuery } from "../list/filters.js";
import { useListUrlState, loadHiddenCols, saveHiddenCols, type UrlStateBridge } from "../list/useListState.js";
import { useMetaForge } from "./provider.js";
import { useMeta, useList, useCount, useCapabilities, NO_CAPS } from "./hooks.js";

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
  const { adapter, scopeKey, fmt, roles } = useMetaForge();
  const queryClient = useQueryClient();
  const metaQ = useMeta(doctype);
  const meta = metaQ.data ?? EMPTY_META;
  // P1-PERM-01: caps DOCTYPE-level (không name) fail-closed — đang tải/lỗi ⇒ NO_CAPS (ẩn Tạo mới/Xoá
  // hàng loạt cho tới khi server trả quyền thật, giống FormContainer/NewFormContainer).
  const capsQ = useCapabilities(doctype);
  // Field ảnh của doctype — nơi ghi file_url sau khi tải ảnh lên từ avatar trên danh sách.
  const imgField = useMemo(() => (metaQ.data ? imageField(metaQ.data) : undefined), [metaQ.data]);
  const caps = capsQ.data ?? NO_CAPS;

  const isSingle = Boolean(metaQ.data?.issingle);
  useEffect(() => {
    if (isSingle) props.onSingle?.();
  }, [isSingle, props.onSingle]);

  const [state, patch] = useListUrlState(bridge, meta);

  const [hidden, setHidden] = useState<string[]>(() => loadHiddenCols(doctype));
  const onToggleColumn = useCallback(
    (field: string) => {
      setHidden((prev) => {
        const next = prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field];
        saveHiddenCols(doctype, next);
        return next;
      });
    },
    [doctype],
  );

  const columns = useMemo(() => deriveColumns(meta, { roles }), [meta, roles]);
  // Global context is enforced by adapter.getContextualList/getContextualCount on the server,
  // including warehouse fields in child tables. Do not duplicate it as a parent-only filter here.
  const listOpts = useMemo<ListOpts>(() => buildServerQuery(meta, state, columns), [meta, state, columns]);
  const cQuery = useMemo(() => countQuery(meta, state), [meta, state]);

  const ready = Boolean(metaQ.data) && !isSingle;
  const listQ = useList(doctype, listOpts, ready);
  const countQ = useCount(doctype, cQuery.filters, cQuery.orFilters, ready);

  const displayRequests = useMemo(() => {
    const linkCols = columns.filter((c) => c.fieldtype === "Link" && c.options);
    const seen = new Set<string>();
    const out: Array<{ doctype: string; name: string }> = [];
    for (const row of listQ.data ?? []) for (const col of linkCols) {
      const name = row[col.fieldname];
      if (!name) continue;
      const key = displayValueKey(col.options!, String(name));
      if (!seen.has(key)) { seen.add(key); out.push({ doctype: col.options!, name: String(name) }); }
    }
    return out;
  }, [columns, listQ.data]);
  const displayQ = useQuery({
    queryKey: [scopeKey, "display-values", JSON.stringify(displayRequests)],
    queryFn: () => adapter.resolveDisplayValues(displayRequests),
    enabled: displayRequests.length > 0,
    staleTime: 5 * 60_000,
  });
  const displayValues = useMemo(() => Object.fromEntries((displayQ.data ?? []).map((r) => [displayValueKey(r.doctype, r.name), r.label])), [displayQ.data]);

  const refresh = useCallback(() => {
    // Khoá query có prefix scopeKey (P1-03) ⇒ invalidate PHẢI gồm scopeKey, nếu không sẽ không khớp.
    queryClient.invalidateQueries({ queryKey: [scopeKey, "list", doctype] });
    queryClient.invalidateQueries({ queryKey: [scopeKey, "count", doctype] });
  }, [queryClient, scopeKey, doctype]);

  // Xoá hàng loạt không thể hoàn tác — hỏi xác nhận TRƯỚC (trước đây gọi API ngay, 0 xác nhận nào,
  // 1 cú click nhầm ở toolbar chọn nhiều dòng = mất dữ liệu vĩnh viễn hàng loạt).
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const confirmBulkDelete = useCallback((names: string[]) => setPendingDelete(names), []);
  const doBulkDelete = useCallback(async () => {
    if (!pendingDelete) return;
    await adapter.bulkDelete(doctype, pendingDelete);
    setPendingDelete(null);
    patch({ selected: [] });
    refresh();
  }, [adapter, doctype, pendingDelete, patch, refresh]);

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
        rows={listQ.data ?? []}
        total={countQ.data}
        loading={listQ.isLoading || listQ.isFetching}
        error={listQ.error ? adapter.mapError(listQ.error).message : null}
        state={state}
        onStateChange={patch}
        hidden={hidden}
        onToggleColumn={onToggleColumn}
        onRowClick={props.onRowClick}
        onCreate={caps.create ? props.onCreate : undefined}
        onRefresh={refresh}
        onBulkDelete={caps.delete ? confirmBulkDelete : undefined}
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
            const row = (listQ.data ?? []).find((r) => String(r.name) === name);
            await adapter.updateDoc(doctype, name, patch as Partial<Doc>, String(row?.modified ?? ""));
            await listQ.refetch();
          } catch (e) {
            toast.error(adapter.mapError(e).message);
          }
        } : undefined}
        onUploadImage={caps.write ? async (name, file) => {
          try {
            const up = await adapter.uploadFile(file, { isPrivate: 0, doctype, docname: name, fieldname: imgField });
            if (!up?.file_url) throw new Error("Máy chủ không trả về đường dẫn tệp");
            const row = (listQ.data ?? []).find((r) => String(r.name) === name);
            await adapter.updateDoc(doctype, name, { [imgField ?? "image"]: up.file_url } as Partial<Doc>, String(row?.modified ?? ""));
            await listQ.refetch();
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
