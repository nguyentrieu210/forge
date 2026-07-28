/** @jsxImportSource react */
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OverviewAction } from "@metaforge/core";
import { useMetaForge } from "../container/provider.js";
import { OverviewView } from "./OverviewView.js";

/**
 * Action tạo mới của Overview do server khai báo bằng route `/app/<DocType>?new=1`.
 * Chỉ bắt đúng shape này; action tùy biến khác vẫn đi qua router như trước.
 */
export function overviewQuickCreateTarget(action: OverviewAction): string | undefined {
  if (!action.key.startsWith("new:")) return undefined;
  const match = /^\/app\/([^/?#]+)\/?(?:\?([^#]*))?$/.exec(action.route);
  if (!match) return undefined;
  if (new URLSearchParams(match[2] ?? "").get("new") !== "1") return undefined;
  try {
    const doctype = decodeURIComponent(match[1] ?? "").trim();
    return doctype || undefined;
  } catch {
    return undefined;
  }
}

export function OverviewContainer({ domain, onNavigate }: { domain: string; onNavigate: (route: string) => void }) {
  const { adapter, scopeKey, businessContext, services } = useMetaForge();
  const queryClient = useQueryClient();
  const [busyActionKey, setBusyActionKey] = useState<string>();
  const q = useQuery({ queryKey: [scopeKey, "overview", domain, JSON.stringify(businessContext)], queryFn: () => adapter.getOverview(domain, businessContext) });

  const runAction = useCallback(async (action: OverviewAction) => {
    const doctype = overviewQuickCreateTarget(action);
    if (!doctype || !services.quickCreate) {
      onNavigate(action.route);
      return;
    }

    setBusyActionKey(action.key);
    try {
      const name = await services.quickCreate(doctype);
      if (!name) return;
      // Đánh dấu số liệu cũ nhưng không bắt người dùng chờ Overview tải lại trước khi mở bản ghi vừa tạo.
      void queryClient.invalidateQueries({ queryKey: [scopeKey, "overview", domain], refetchType: "none" });
      onNavigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
    } finally {
      setBusyActionKey(undefined);
    }
  }, [domain, onNavigate, queryClient, scopeKey, services.quickCreate]);

  return (
    <OverviewView
      data={q.data}
      loading={q.isLoading}
      error={q.error ? adapter.mapError(q.error).message : undefined}
      onNavigate={onNavigate}
      onAction={(action) => { void runAction(action); }}
      busyActionKey={busyActionKey}
      onRefresh={() => q.refetch()}
    />
  );
}
