/**
 * Container hooks — TanStack Query bọc adapter.
 * P1-03: MỌI queryKey prefix bằng `scopeKey` (site|user|lang|version) từ provider ⇒ cache
 * meta/doc/perm/translation KHÔNG rò giữa user/site/ngôn ngữ; đổi user/lang tự tách cache.
 */
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { applyFormProfile, type DocTypeMeta, type Doc, type DocInfo, type ListOpts, type Filters } from "@metaforge/core";
import { type Capabilities, type WorkflowTransitionsResult, NO_CAPS } from "@metaforge/adapter-frappe";
import { useMetaForge } from "./provider.js";

export function useMeta(doctype: string): UseQueryResult<DocTypeMeta> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "meta", doctype],
    queryFn: () => adapter.getMeta(doctype),
    staleTime: Infinity, // meta ít đổi; invalidate khi save Customize/Property Setter
  });
}

/**
 * Meta ĐÃ LỌC theo Form Profile của app — dùng cho màn Form. `useMeta` thô vẫn giữ nguyên cho
 * Builder/Report/nơi cần đầy đủ field. Lọc ở tầng hook (không phải trong `useMeta`) để cache
 * react-query vẫn là MỘT bản meta gốc dùng chung; profile chỉ là phép biến đổi thuần trên đó.
 */
export function useFormMeta(doctype: string): UseQueryResult<DocTypeMeta> {
  const { formProfiles } = useMetaForge();
  const q = useMeta(doctype);
  const profile = formProfiles?.[doctype];
  const data = useMemo(
    () => (q.data && profile ? applyFormProfile(q.data, profile) : q.data),
    [q.data, profile],
  );
  return { ...q, data } as UseQueryResult<DocTypeMeta>;
}

export function useDoc(doctype: string, name: string): UseQueryResult<{ doc: Doc; docinfo: DocInfo }> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "doc", doctype, name],
    queryFn: () => adapter.getDoc(doctype, name),
    enabled: Boolean(name),
  });
}

export function useList(doctype: string, opts: ListOpts = {}, enabled = true): UseQueryResult<Doc[]> {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const contextKey = JSON.stringify(businessContext);
  return useQuery({
    queryKey: [scopeKey, "list", doctype, JSON.stringify(opts), contextKey],
    queryFn: () => Object.keys(businessContext).length
      ? adapter.getContextualList(doctype, opts, businessContext)
      : adapter.getList(doctype, opts),
    enabled,
    // List và form là hai route anh em. Khi mở một bản ghi, route list bị unmount; quay lại không
    // được tự gọi API rồi phủ trạng thái loading lên bảng thêm một lần nữa. Dữ liệu list được làm
    // mới có chủ đích sau create/update/delete/workflow hoặc bằng nút "Làm mới".
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev, // giữ trang cũ khi đổi filter/page → không nháy
  });
}

export function useCount(doctype: string, filters?: Filters, orFilters?: Filters, enabled = true): UseQueryResult<number> {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const contextKey = JSON.stringify(businessContext);
  return useQuery({
    // P1-10: orFilters + global context là một phần cache key.
    queryKey: [scopeKey, "count", doctype, JSON.stringify(filters ?? null), JSON.stringify(orFilters ?? null), contextKey],
    queryFn: () => Object.keys(businessContext).length
      ? adapter.getContextualCount(doctype, filters, orFilters, businessContext)
      : adapter.getCount(doctype, filters, orFilters),
    enabled,
    // Đi cùng chính sách của useList: tổng số dòng phải dùng lại cùng snapshot khi đóng form.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** transitions + has_workflow từ server (nguồn sự thật nút workflow, P1-WF-01). has_workflow tách
 * bạch "doctype không có workflow" khỏi "có workflow nhưng hết transition cho state/user hiện tại". */
export function useTransitions(doctype: string, name: string, doc?: Doc): UseQueryResult<WorkflowTransitionsResult> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "transitions", doctype, name, doc?.modified ?? null, doc?.docstatus ?? null],
    queryFn: () => adapter.getTransitions(doc!),
    enabled: Boolean(doc),
  });
}

/**
 * §9 — Effective capabilities FAIL-CLOSED (P0-05). name bỏ ⇒ new-doc (doctype-level).
 * `.data` chỉ có khi server trả; container PHẢI default `NO_CAPS` khi đang tải/lỗi (không optimistic).
 */
export function useCapabilities(doctype: string, name?: string): UseQueryResult<Capabilities> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "caps", doctype, name ?? "__new__"],
    queryFn: () => adapter.getCapabilities(doctype, name),
    enabled: Boolean(doctype),
    staleTime: 60_000,
  });
}

export { NO_CAPS };
