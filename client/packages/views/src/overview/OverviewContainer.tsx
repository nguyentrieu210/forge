/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { useMetaForge } from "../container/provider.js";
import { OverviewView } from "./OverviewView.js";
export function OverviewContainer({ domain, onNavigate }: { domain: string; onNavigate: (route: string) => void }) {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const q = useQuery({ queryKey: [scopeKey, "overview", domain, JSON.stringify(businessContext)], queryFn: () => adapter.getOverview(domain, businessContext) });
  return <OverviewView data={q.data} loading={q.isLoading} error={q.error ? adapter.mapError(q.error).message : undefined} onNavigate={onNavigate} onRefresh={() => q.refetch()} />;
}
