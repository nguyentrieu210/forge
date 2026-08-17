/**
 * Container hooks — TanStack Query bọc adapter.
 * P1-03: MỌI queryKey prefix bằng `scopeKey` (site|user|lang|version) từ provider ⇒ cache
 * meta/doc/perm/translation KHÔNG rò giữa user/site/ngôn ngữ; đổi user/lang tự tách cache.
 */
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { applyFormProfile, type DocTypeMeta, type Doc, type DocInfo, type ListOpts, type Filters } from "@metaforge/core";
import { type Capabilities, type ListViewSnapshot, type WorkflowTransitionsResult, NO_CAPS } from "@metaforge/adapter-frappe";
import { useMetaForge } from "./meta-context.js";

function queryAbortError(): Error {
  const error = new Error("Query cancelled");
  error.name = "AbortError";
  return error;
}

/**
 * Adapter CRUD calls predate AbortSignal in their public contract. Until transport methods accept
 * it, honour TanStack cancellation at the query boundary: an aborted request can finish on the
 * wire, but its result can no longer resolve into the cancelled query. Link search already passes
 * a real AbortSignal to the adapter and therefore has transport-level cancellation too.
 */
function abortable<T>(signal: AbortSignal, task: Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(queryAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(queryAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) reject(queryAbortError());
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function useMeta(doctype: string): UseQueryResult<DocTypeMeta> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "meta", doctype],
    queryFn: ({ signal }) => abortable(signal, adapter.getMeta(doctype)),
    staleTime: Infinity,
  });
}

/** Meta filtered by the app Form Profile while the canonical cache keeps the raw metadata. */
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
    queryFn: ({ signal }) => abortable(signal, adapter.getDoc(doctype, name)),
    enabled: Boolean(name),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
  });
}

export function useList(doctype: string, opts: ListOpts = {}, enabled = true): UseQueryResult<Doc[]> {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const contextKey = JSON.stringify(businessContext);
  return useQuery({
    queryKey: [scopeKey, "list", doctype, JSON.stringify(opts), contextKey],
    queryFn: ({ signal }) => abortable(signal, Object.keys(businessContext).length
      ? adapter.getContextualList(doctype, opts, businessContext)
      : adapter.getList(doctype, opts)),
    enabled,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useListView(doctype: string, opts: ListOpts = {}, enabled = true): UseQueryResult<ListViewSnapshot> {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const contextKey = JSON.stringify(businessContext);
  return useQuery({
    queryKey: [scopeKey, "list-view", doctype, JSON.stringify(opts), contextKey],
    queryFn: ({ signal }) => abortable(signal, adapter.getListView(doctype, opts, businessContext)),
    enabled,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useCount(doctype: string, filters?: Filters, orFilters?: Filters, enabled = true): UseQueryResult<number> {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const contextKey = JSON.stringify(businessContext);
  return useQuery({
    queryKey: [scopeKey, "count", doctype, JSON.stringify(filters ?? null), JSON.stringify(orFilters ?? null), contextKey],
    queryFn: ({ signal }) => abortable(signal, Object.keys(businessContext).length
      ? adapter.getContextualCount(doctype, filters, orFilters, businessContext)
      : adapter.getCount(doctype, filters, orFilters)),
    enabled,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** transitions + has_workflow from the server remain the only workflow action authority. */
export function useTransitions(doctype: string, name: string, doc?: Doc): UseQueryResult<WorkflowTransitionsResult> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "transitions", doctype, name, doc?.modified ?? null, doc?.docstatus ?? null],
    queryFn: ({ signal }) => abortable(signal, adapter.getTransitions(doc!)),
    enabled: Boolean(doc),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Effective capabilities are fail-closed: callers default missing/error data to NO_CAPS. */
export function useCapabilities(doctype: string, name?: string): UseQueryResult<Capabilities> {
  const { adapter, scopeKey } = useMetaForge();
  return useQuery({
    queryKey: [scopeKey, "caps", doctype, name ?? "__new__"],
    queryFn: ({ signal }) => abortable(signal, adapter.getCapabilities(doctype, name)),
    enabled: Boolean(doctype),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60_000,
  });
}

export { NO_CAPS };
