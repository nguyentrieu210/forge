/** @jsxImportSource react */
/**
 * WorkspaceContainer — nối WorkspaceView vào backend: getWorkspaces (danh sách) + getWorkspace(active)
 * (shortcuts/cards). onOpenLink → điều hướng DocType/Report (app quyết bằng onNavigate).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceView, type WsItem, type WsPage, type WsShortcut, type WsCard, type WsArtifact } from "../workspace/WorkspaceView.js";
import { useMetaForge } from "./provider.js";

export interface WorkspaceContainerProps {
  /** điều hướng khi click shortcut/link (vd DocType → /app/<name>). */
  onOpenLink: (link: { type?: string; link_to?: string }) => void;
  defaultWorkspace?: string;
}

export function WorkspaceContainer(props: WorkspaceContainerProps) {
  const { adapter, scopeKey } = useMetaForge();
  // P1-03 (M1): prefix scopeKey ⇒ workspace KHÔNG rò cache giữa user/site/lang.
  const wsQ = useQuery({ queryKey: [scopeKey, "workspaces"], queryFn: () => adapter.getWorkspaces(), staleTime: 60_000 });
  const workspaces = (wsQ.data ?? []) as WsItem[];

  const [active, setActive] = useState<string | undefined>(props.defaultWorkspace);
  const current = active ?? workspaces[0]?.name;

  const pageQ = useQuery({
    queryKey: [scopeKey, "workspace", current],
    queryFn: () => adapter.getWorkspace(current!),
    enabled: Boolean(current),
    staleTime: 60_000,
  });
  // Frappe v16 get_desktop_page trả shortcuts/cards dạng {items:[...]} (KHÔNG phải mảng trần) →
  // gỡ .items về mảng đúng contract WsPage. Chấp cả hai (mảng trần hoặc {items}) cho tương thích.
  const page = useMemo<WsPage | undefined>(() => {
    const raw = pageQ.data as unknown as (Partial<WsPage> & { shortcuts?: unknown; cards?: unknown }) | undefined;
    if (!raw) return undefined;
    const items = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : ((v as { items?: T[] } | null | undefined)?.items ?? []));
    return {
      ...raw,
      shortcuts: items<WsShortcut>(raw.shortcuts),
      cards: items<WsCard>(raw.cards),
      number_cards: items<WsArtifact>((raw as Record<string, unknown>).number_cards),
      charts: items<WsArtifact>((raw as Record<string, unknown>).charts),
      onboardings: items<WsArtifact>((raw as Record<string, unknown>).onboardings),
      quick_lists: items<WsArtifact>((raw as Record<string, unknown>).quick_lists),
      custom_blocks: items<WsArtifact>((raw as Record<string, unknown>).custom_blocks),
    };
  }, [pageQ.data]);

  if (wsQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(wsQ.error).message}</div>;

  return (
    <WorkspaceView
      workspaces={workspaces}
      active={current}
      page={page}
      loading={wsQ.isLoading || pageQ.isLoading}
      onSelect={setActive}
      onOpenLink={props.onOpenLink}
    />
  );
}
