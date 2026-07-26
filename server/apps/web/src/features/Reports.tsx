import { useEffect, useState } from "react";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { api } from "../lib/api";
import { CloudForgeApiError } from "../lib/cloudforge";

type Job = { id: string; status: string };
interface Column { field: string; label: string }
interface Payload { columns?: Column[]; result?: Record<string, unknown>[]; row_count?: number }

const REPORTS = ["Accounts Receivable", "Accounts Payable", "General Ledger", "Trial Balance", "Stock Balance", "Stock Ledger", "Batch Stock Balance", "Serial Number Status", "Work Order Progress", "Asset Depreciation Ledger"] as const;

const STATUS_VARIANT: Record<string, "secondary" | "success" | "destructive" | "warning"> = {
  queued: "secondary", running: "warning", completed: "success", failed: "destructive",
};

export function ReportsScreen() {
  const [report, setReport] = useState<string>(REPORTS[0]);
  const [job, setJob] = useState<Job | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function runPrepared() {
    setBusy(true); setJob(null); setPayload(null); setError(null);
    try {
      // limit > 1000 forces prepared (async queue) mode.
      const res = await api.runReport({ report, limit: 2000 }) as Record<string, unknown>;
      if (res.prepared && typeof res.job_id === "string") {
        setJob({ id: res.job_id, status: String(res.status ?? "queued") });
      } else {
        setPayload(res as Payload); // synchronous fallback
      }
    } catch (e) {
      setError(e instanceof CloudForgeApiError ? { code: e.code, message: e.message } : { code: "NETWORK", message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  // Poll a queued/running job until it reaches a terminal state.
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = setTimeout(async () => {
      try {
        const row = await api.getPreparedReport(job.id) as Record<string, unknown>;
        const status = String(row.status ?? "queued");
        setJob({ id: job.id, status });
        if (status === "completed") setPayload((row.result ?? {}) as Payload);
        if (status === "failed") {
          const e = (row.error ?? {}) as { code?: string; message?: string };
          setError({ code: e.code ?? "REPORT_FAILED", message: e.message ?? "Prepared report failed" });
        }
      } catch (e) {
        setError(e instanceof CloudForgeApiError ? { code: e.code, message: e.message } : { code: "NETWORK", message: String(e) });
        setJob((j) => (j ? { ...j, status: "failed" } : j));
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [job]);

  const columns = payload?.columns ?? [];
  const rows = payload?.result ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Reports (prepared pipeline)</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={report}
          onChange={(e) => setReport(e.target.value)}
        >
          {REPORTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <Button disabled={busy} onClick={runPrepared}>Run (prepared)</Button>
        {job && <Badge variant={STATUS_VARIANT[job.status] ?? "secondary"}>{job.status}</Badge>}
        {job && <span className="font-mono text-xs text-muted-foreground">job {job.id.slice(0, 8)}…</span>}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <Badge variant="destructive">{error.code}</Badge> <span className="ml-1">{error.message}</span>
        </div>
      )}

      {payload && (
        <div>
          <p className="mb-1 text-sm text-muted-foreground">{rows.length} row(s)</p>
          <Table className="rounded-md border border-border">
            <TableHeader>
              <TableRow>{columns.map((c) => <TableHead key={c.field}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell className="text-muted-foreground">No rows (report ran successfully).</TableCell></TableRow>
              ) : rows.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => <TableCell key={c.field}>{String(row[c.field] ?? "")}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
