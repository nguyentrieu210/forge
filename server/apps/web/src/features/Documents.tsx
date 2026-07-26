import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { api } from "../lib/api";
import { CloudForgeApiError, type DocumentListFilter, type DocumentListSort } from "../lib/cloudforge";
import { seedToken, type Seed } from "../lib/handoff";
import { useRecentDocs } from "../lib/recentDocs";
import { DOCSTATUS } from "./parts";

const DOCTYPES = ["Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"] as const;
type Doctype = (typeof DOCTYPES)[number];

type Col = { field: string; label: string; kind?: "name" | "status" | "money" | "date" };
const COLUMNS: Record<Doctype, Col[]> = {
  "Sales Order": [
    { field: "name", label: "Name", kind: "name" },
    { field: "customer", label: "Customer" },
    { field: "grand_total", label: "Total", kind: "money" },
    { field: "docstatus", label: "Status", kind: "status" },
    { field: "version", label: "Ver" },
    { field: "modified_at", label: "Modified", kind: "date" },
  ],
  "Delivery Note": [
    { field: "name", label: "Name", kind: "name" },
    { field: "customer", label: "Customer" },
    { field: "against_sales_order", label: "Sales Order" },
    { field: "docstatus", label: "Status", kind: "status" },
    { field: "version", label: "Ver" },
    { field: "modified_at", label: "Modified", kind: "date" },
  ],
  "Sales Invoice": [
    { field: "name", label: "Name", kind: "name" },
    { field: "customer", label: "Customer" },
    { field: "against_sales_order", label: "Sales Order" },
    { field: "grand_total", label: "Total", kind: "money" },
    { field: "docstatus", label: "Status", kind: "status" },
    { field: "version", label: "Ver" },
    { field: "modified_at", label: "Modified", kind: "date" },
  ],
  "Payment Entry": [
    { field: "name", label: "Name", kind: "name" },
    { field: "party", label: "Customer" },
    { field: "payment_type", label: "Type" },
    { field: "paid_amount", label: "Amount", kind: "money" },
    { field: "docstatus", label: "Status", kind: "status" },
    { field: "version", label: "Ver" },
    { field: "modified_at", label: "Modified", kind: "date" },
  ],
};

const SORTS: Record<string, { label: string; sort: DocumentListSort[] }> = {
  modified_desc: { label: "Newest", sort: [{ field: "modified_at", direction: "desc" }] },
  modified_asc: { label: "Oldest", sort: [{ field: "modified_at", direction: "asc" }] },
  name_asc: { label: "Name A→Z", sort: [{ field: "name", direction: "asc" }] },
  name_desc: { label: "Name Z→A", sort: [{ field: "name", direction: "desc" }] },
};

const PAGE_SIZE = 10;

export function DocumentsScreen({ onHandoff }: { onHandoff: (seed: Seed) => void }) {
  const [doctype, setDoctype] = useState<Doctype>("Sales Order");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [docstatus, setDocstatus] = useState<"" | "0" | "1" | "2">("");
  const [sortKey, setSortKey] = useState<string>("modified_desc");

  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [count, setCount] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; traceId?: string } | null>(null);

  // Cursor stack: cursors[i] is the opaque cursor that starts page i (page 0 = null).
  const cursors = useRef<(string | null)[]>([null]);
  // Monotonic request id so a slow/stale response can never overwrite a newer one.
  const seq = useRef(0);
  const recent = useRecentDocs();

  const buildQuery = useCallback(() => {
    const filters: DocumentListFilter[] = [];
    if (docstatus !== "") filters.push({ field: "docstatus", operator: "eq", value: Number(docstatus) });
    return {
      doctype,
      fields: COLUMNS[doctype].map((c) => c.field),
      filters,
      ...(search ? { search } : {}),
      sort: SORTS[sortKey]!.sort,
      limit: PAGE_SIZE,
    };
  }, [doctype, docstatus, search, sortKey]);

  const run = useCallback(async (cursor: string | null, targetIndex: number) => {
    const mySeq = seq.current + 1;
    seq.current = mySeq;
    const current = () => seq.current === mySeq;
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery();
      const page = await api.listDocuments({ ...query, cursor });
      if (!current()) return; // a newer request superseded this one
      setRows(page.rows);
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setPageIndex(targetIndex);
      if (targetIndex === 0) {
        const total = await api.countDocuments(query);
        if (!current()) return;
        setCount(total.count);
      }
    } catch (e) {
      if (!current()) return;
      setRows([]);
      setHasMore(false);
      setNextCursor(null);
      setError(e instanceof CloudForgeApiError ? { code: e.code, message: e.message, traceId: e.traceId } : { code: "NETWORK", message: String(e) });
    } finally {
      if (current()) setLoading(false);
    }
  }, [buildQuery]);

  // Any change to doctype/search/filter/sort resets pagination and reloads page 0.
  useEffect(() => {
    cursors.current = [null];
    void run(null, 0);
  }, [run]);

  // Debounce the search box into the query input.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function next() {
    if (!hasMore || !nextCursor) return;
    const stack = cursors.current.slice(0, pageIndex + 1);
    stack[pageIndex + 1] = nextCursor;
    cursors.current = stack;
    void run(nextCursor, pageIndex + 1);
  }
  function prev() {
    if (pageIndex === 0) return;
    void run(cursors.current[pageIndex - 1] ?? null, pageIndex - 1);
  }
  function refresh() {
    void run(cursors.current[pageIndex] ?? null, pageIndex);
  }

  const cols = COLUMNS[doctype];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Documents</h2>
        {count !== null && <Badge variant="secondary">{count} total</Badge>}
        <Button size="sm" variant="outline" className="ml-auto" onClick={refresh} disabled={loading}>Reload</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={doctype} onChange={(e) => setDoctype(e.target.value as Doctype)}>
          {DOCTYPES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <Input className="w-56" placeholder="Search name / customer…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={docstatus} onChange={(e) => setDocstatus(e.target.value as "" | "0" | "1" | "2")}>
          <option value="">All statuses</option>
          <option value="0">Draft</option>
          <option value="1">Submitted</option>
          <option value="2">Cancelled</option>
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          {Object.entries(SORTS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>Recently opened:</span>
          {recent.slice(0, 6).map((d) => (
            <button
              key={`${d.doctype}:${d.name}`}
              className="rounded border border-border px-1.5 py-0.5 font-mono hover:bg-accent"
              onClick={() => onHandoff({ kind: "open", token: seedToken(), doctype: d.doctype, name: d.name })}
            >
              {d.name.slice(0, 14)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <Badge variant="destructive">{error.code}</Badge> <span className="ml-1">{error.message}</span>
          {error.traceId && <p className="mt-1 font-mono text-xs text-muted-foreground">trace {error.traceId}</p>}
        </div>
      )}

      <Table className="rounded-md border border-border">
        <TableHeader>
          <TableRow>{cols.map((c) => <TableHead key={c.field} className={c.kind === "money" ? "text-right" : ""}>{c.label}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell className="text-muted-foreground">Loading…</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell className="text-muted-foreground">{error ? "—" : "No documents match."}</TableCell></TableRow>
          ) : rows.map((row, i) => (
            <TableRow key={String(row.name ?? i)}>
              {cols.map((c) => <TableCell key={c.field} className={c.kind === "money" ? "text-right tabular-nums" : ""}>{renderCell(c, row, onHandoff, doctype)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={prev} disabled={loading || pageIndex === 0}>← Prev</Button>
        <span className="text-sm text-muted-foreground">Page {pageIndex + 1}</span>
        <Button size="sm" variant="outline" onClick={next} disabled={loading || !hasMore}>Next →</Button>
      </div>
    </div>
  );
}

function renderCell(col: Col, row: Record<string, unknown>, onHandoff: (seed: Seed) => void, doctype: string): ReactNode {
  const value = row[col.field];
  if (col.kind === "status") {
    const meta = DOCSTATUS[Number(value)];
    return meta ? <Badge variant={meta.variant}>{meta.label}</Badge> : String(value ?? "");
  }
  if (col.kind === "name") {
    const name = String(value ?? "");
    return (
      <button className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => onHandoff({ kind: "open", token: seedToken(), doctype, name })}>
        {name}
      </button>
    );
  }
  if (col.kind === "money") return value == null ? "" : String(value);
  if (col.kind === "date") return value ? new Date(String(value)).toLocaleString() : "";
  return String(value ?? "");
}
