/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import { useMetaForge } from "../container/provider.js";
import { ProcessView } from "./ProcessView.js";
export function ProcessContainer({ domain, onNavigate }: { domain: string; onNavigate: (route: string) => void }) {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const q = useQuery({ queryKey: [scopeKey, "processes", domain, JSON.stringify(businessContext)], queryFn: () => adapter.getProcesses(domain, businessContext) });
  return <ProcessView data={q.data} loading={q.isLoading} error={q.error ? adapter.mapError(q.error).message : undefined} onNavigate={onNavigate} onRefresh={() => q.refetch()} />;
}
