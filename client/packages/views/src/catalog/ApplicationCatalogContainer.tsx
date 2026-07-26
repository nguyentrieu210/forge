/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { useMetaForge } from "../container/provider.js";
import { ApplicationCatalogView } from "./ApplicationCatalogView.js";

export function ApplicationCatalogContainer({ appId, activeWorkspace, onNavigate }: { appId?: string; activeWorkspace?: string; onNavigate: (route: string) => void }) {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const q = useQuery({
    queryKey: [scopeKey, "application-catalog", appId ?? "all", JSON.stringify(businessContext)],
    queryFn: () => adapter.getApplicationCatalog(appId),
    staleTime: 60_000,
  });
  return <ApplicationCatalogView catalog={q.data} loading={q.isLoading} error={q.error ? adapter.mapError(q.error).message : undefined} activeWorkspace={activeWorkspace} onNavigate={onNavigate} onRefresh={() => q.refetch()} />;
}
