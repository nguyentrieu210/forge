import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { api, newId } from "../lib/api";
import {
  CloudForgeApiError,
  type CanonicalDocument,
  type DocFieldMeta,
  type DocTypeMeta,
  type DocTypeSummary,
  type ImportPreview,
  type TimelineResult,
  type WorkflowAction,
} from "../lib/cloudforge";

type FormState = Record<string, unknown>;
const SYSTEM_FIELDS = new Set(["name", "owner", "creation", "modified", "docstatus", "status", "version"]);
const EMPTY_TIMELINE: TimelineResult = { comments: [], assignments: [], files: [], versions: [] };

export function DeskScreen() {
  const [catalog, setCatalog] = useState<DocTypeSummary[]>([]);
  const [doctype, setDoctype] = useState("");
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");
  const [document, setDocument] = useState<CanonicalDocument<FormState> | null>(null);
  const [name, setName] = useState("");
  const [form, setForm] = useState<FormState>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [timeline, setTimeline] = useState<TimelineResult>(EMPTY_TIMELINE);
  const [workflowActions, setWorkflowActions] = useState<WorkflowAction[]>([]);
  const [assignee, setAssignee] = useState("");
  const [shareUser, setShareUser] = useState("");
  const [csv, setCsv] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [historicalVersion, setHistoricalVersion] = useState<number | null>(null);

  const loadCatalog = useCallback(async () => {
    const result = await api.listMeta();
    setCatalog(result.doctypes);
    if (!doctype && result.doctypes[0]) setDoctype(result.doctypes[0].name);
  }, [doctype]);
  useEffect(() => { void loadCatalog().catch((error) => setMessage(errorMessage(error))); }, [loadCatalog]);

  const loadList = useCallback(async (selected: string, selectedMeta?: DocTypeMeta | null) => {
    const fields = ["name", "status", "docstatus", "version", ...(selectedMeta?.fields.filter((field) => field.in_list_view).map((field) => field.fieldname) ?? [])];
    const result = await api.listDocuments({ doctype: selected, fields: [...new Set(fields)], ...(search ? { search } : {}), limit: 50 });
    setRows(result.rows);
  }, [search]);

  useEffect(() => {
    if (!doctype) return;
    setMessage(null); setDocument(null); setName(""); setForm({}); setTimeline(EMPTY_TIMELINE); setWorkflowActions([]);
    void api.getMeta(doctype).then(async ({ meta: loaded }) => { setMeta(loaded); await loadList(doctype, loaded); }).catch((error) => setMessage(errorMessage(error)));
  }, [doctype, loadList]);

  const visibleFields = useMemo(() => meta?.fields.filter((field) => !field.hidden && !SYSTEM_FIELDS.has(field.fieldname)) ?? [], [meta]);

  async function refreshDocumentContext(loaded: CanonicalDocument<FormState>) {
    setDocument(loaded); setName(loaded.name); setForm(loaded.data); setHistoricalVersion(null);
    const [nextTimeline, workflow, documentMeta] = await Promise.all([
      api.getTimeline(loaded.doctype, loaded.name),
      api.getWorkflowActions(loaded.doctype, loaded.name).catch(() => ({ state: "", actions: [] })),
      api.getMeta(loaded.doctype, loaded.name),
    ]);
    setTimeline(nextTimeline); setWorkflowActions(workflow.actions); setMeta(documentMeta.meta);
  }

  async function startNew() {
    if (!meta) return;
    setMessage(null); setTimeline(EMPTY_TIMELINE); setWorkflowActions([]); setHistoricalVersion(null);
    const createMeta = (await api.getMeta(meta.name)).meta; setMeta(createMeta);
    let next = "";
    if (createMeta.autoname && createMeta.autoname !== "field:name") next = (await api.nextName(createMeta.name, createMeta.autoname)).name;
    const createFields = createMeta.fields.filter((field) => !field.hidden && !SYSTEM_FIELDS.has(field.fieldname));
    setName(next); setDocument(null);
    setForm(Object.fromEntries(createFields.filter((field) => field.default !== undefined).map((field) => [field.fieldname, field.default])));
  }

  async function open(rowName: string) {
    if (!meta) return;
    setBusy(true); setMessage(null);
    try { await refreshDocumentContext(await api.getDocument<FormState>(meta.name, rowName)); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function mutate(action: "create" | "save" | "submit" | "cancel") {
    if (!meta || !name.trim()) { setMessage("Document name is required"); return; }
    setBusy(true); setMessage(null);
    try {
      const receipt = await api.mutate({ doctype: meta.name, name: name.trim(), action, expectedVersion: action === "create" ? null : document?.version ?? null, document: form, commandId: newId(`${meta.name}-${action}`) });
      await refreshDocumentContext(await api.getDocument<FormState>(meta.name, name.trim()));
      setMessage(`${action} committed at version ${receipt.aggregate_version}`);
      await loadList(meta.name, meta);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function applyWorkflow(action: string) {
    if (!meta || !document) return;
    setBusy(true); setMessage(null);
    try {
      const receipt = await api.applyWorkflow(meta.name, document.name, action, document.version, newId(`${meta.name}-workflow`));
      await refreshDocumentContext(await api.getDocument<FormState>(meta.name, document.name));
      setMessage(`${action} committed at version ${receipt.aggregate_version}`);
      await loadList(meta.name, meta);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function printDocument() {
    if (!meta || !document) return;
    const html = await api.renderPrint(meta.name, document.name);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function addComment() {
    if (!meta || !document || !comment.trim()) return;
    try { await api.addComment(meta.name, document.name, comment); setComment(""); setTimeline(await api.getTimeline(meta.name, document.name)); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function assignDocument() {
    if (!meta || !document || !assignee.trim()) return;
    try { await api.assignDocument(meta.name, document.name, assignee.trim()); setAssignee(""); setTimeline(await api.getTimeline(meta.name, document.name)); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function shareDocument() {
    if (!meta || !document || !shareUser.trim()) return;
    try { await api.shareDocument(meta.name, document.name, shareUser.trim(), { read: true }); setShareUser(""); setMessage("Read access shared"); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function openVersion(version: number) {
    if (!meta || !document) return;
    try {
      const snapshot = await api.getVersion<FormState>(meta.name, document.name, version);
      setForm(snapshot.data); setHistoricalVersion(version); setMessage(`Showing historical version ${version}. Reload current before mutating.`);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function uploadFile(file: File) {
    if (!meta || !document) return;
    try { await api.uploadFile({ file, doctype: meta.name, name: document.name }); setTimeline(await api.getTimeline(meta.name, document.name)); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function downloadFile(fileId: string, fileName: string) {
    try {
      const blob = await api.downloadFile(fileId); const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function previewCsv() {
    if (!meta || !csv.trim()) return;
    try { setImportPreview(await api.previewImport(meta.name, csv)); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function applyCsv() {
    if (!meta || !csv.trim() || !importPreview || importPreview.errors.length) return;
    setBusy(true);
    try { const result = await api.applyImport(meta.name, csv); setMessage(`Imported ${result.imported} rows${result.failed ? `; ${result.failed} failed` : ""}`); setCsv(""); setImportPreview(null); await loadList(meta.name, meta); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function exportCsv() {
    if (!meta) return;
    try {
      const fields = ["name", "status", "docstatus", "version", ...visibleFields.filter((field) => field.in_list_view).map((field) => field.fieldname)];
      const content = await api.exportCsv({ doctype: meta.name, fields: [...new Set(fields)], ...(search ? { search } : {}), max_rows: 1000 });
      const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
      const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${meta.name}.csv`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-64"><Label>DocType</Label><select className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={doctype} onChange={(event) => setDoctype(event.target.value)}>{catalog.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></div>
      <div className="min-w-64"><Label>Search</Label><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && meta) void loadList(meta.name, meta); }} /></div>
      <Button variant="outline" onClick={() => meta && void loadList(meta.name, meta)}>Refresh</Button>
      <Button variant="outline" onClick={() => void exportCsv()}>Export CSV</Button>
      <Button onClick={() => void startNew()}>New</Button>
      {meta && <Badge variant="outline">rev {meta.revision} · {meta.module}</Badge>}
    </div>
    {message && <div className="rounded-md border bg-muted/40 p-3 text-sm">{message}</div>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-4">
        <div className="rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={String(row.name)} className="cursor-pointer" onClick={() => void open(String(row.name))}><TableCell className="font-mono">{String(row.name)}</TableCell><TableCell>{String(row.status ?? "")}</TableCell><TableCell>{String(row.version ?? "")}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <Label>CSV Import</Label>
          <textarea className="min-h-28 w-full rounded-md border bg-background p-2 font-mono text-xs" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="name,field_a,field_b" />
          <div className="flex gap-2"><Button variant="outline" onClick={() => void previewCsv()}>Preview</Button><Button disabled={!importPreview || Boolean(importPreview.errors.length) || busy} onClick={() => void applyCsv()}>Apply</Button></div>
          {importPreview && <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(importPreview, null, 2)}</pre>}
        </div>
      </div>
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2"><div className="grow"><Label>Name</Label><Input value={name} disabled={Boolean(document)} onChange={(event) => setName(event.target.value)} /></div>{document && <Badge>{document.status}</Badge>}</div>
        <div className="grid gap-3 sm:grid-cols-2">{visibleFields.map((field) => <FieldEditor key={field.fieldname} field={field} value={form[field.fieldname]} disabled={Boolean(field.read_only) || (document?.docstatus === 1 && !field.allow_on_submit)} onChange={(value) => setForm((current) => ({ ...current, [field.fieldname]: value }))} />)}</div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || Boolean(document)} onClick={() => void mutate("create")}>Create</Button>
          <Button variant="outline" disabled={busy || !document || document.docstatus !== 0 || historicalVersion !== null} onClick={() => void mutate("save")}>Save</Button>
          {meta?.is_submittable && <Button disabled={busy || !document || document.docstatus !== 0 || historicalVersion !== null} onClick={() => void mutate("submit")}>Submit</Button>}
          {meta?.is_submittable && <Button variant="outline" disabled={busy || !document || document.docstatus !== 1 || historicalVersion !== null} onClick={() => void mutate("cancel")}>Cancel</Button>}
          <Button variant="outline" disabled={!document} onClick={() => void printDocument()}>Print</Button>
          {historicalVersion !== null && document && <Button variant="outline" onClick={() => void open(document.name)}>Reload current</Button>}
          {workflowActions.map((entry) => <Button key={`${entry.action}-${entry.next_state}`} variant="outline" disabled={busy || historicalVersion !== null} onClick={() => void applyWorkflow(entry.action)}>{entry.action} → {entry.next_state}</Button>)}
        </div>
        {document && <>
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
            <div><Label>Assign to</Label><div className="flex gap-2"><Input value={assignee} onChange={(event) => setAssignee(event.target.value)} /><Button variant="outline" onClick={() => void assignDocument()}>Assign</Button></div></div>
            <div><Label>Share read access</Label><div className="flex gap-2"><Input value={shareUser} onChange={(event) => setShareUser(event.target.value)} /><Button variant="outline" onClick={() => void shareDocument()}>Share</Button></div></div>
          </div>
          <div className="space-y-2 border-t pt-3"><Label>Comment</Label><div className="flex gap-2"><Input value={comment} onChange={(event) => setComment(event.target.value)} /><Button variant="outline" onClick={() => void addComment()}>Add</Button></div></div>
          <div className="space-y-2 border-t pt-3"><Label>Files</Label><Input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = ""; }} />
            <div className="space-y-1">{timeline.files.map((entry) => <Button key={String(entry.file_id)} variant="outline" onClick={() => void downloadFile(String(entry.file_id), String(entry.file_name))}>{String(entry.file_name)} · {String(entry.size_bytes)} bytes</Button>)}</div>
          </div>
          <div className="space-y-2 border-t pt-3"><Label>Versions</Label><div className="flex flex-wrap gap-2">{timeline.versions.map((entry) => <Button key={entry.version} variant="outline" onClick={() => void openVersion(entry.version)}>v{entry.version} · {entry.action}</Button>)}</div></div>
          <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify({ comments: timeline.comments, assignments: timeline.assignments }, null, 2)}</pre>
        </>}
      </div>
    </div>
  </div>;
}

function FieldEditor({ field, value, disabled, onChange }: { field: DocFieldMeta; value: unknown; disabled: boolean; onChange: (value: unknown) => void }) {
  const id = `desk-${field.fieldname}`; const table = field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect" || field.fieldtype === "JSON";
  return <div className={table ? "sm:col-span-2" : ""}><Label htmlFor={id}>{field.label}{field.required ? " *" : ""}</Label>{table ? <textarea id={id} disabled={disabled} className="mt-1 min-h-28 w-full rounded-md border bg-background p-2 font-mono text-xs" value={typeof value === "string" ? value : JSON.stringify(value ?? (field.fieldtype === "JSON" ? {} : []), null, 2)} onChange={(event) => { try { onChange(JSON.parse(event.target.value)); } catch { onChange(event.target.value); } }} /> : field.fieldtype === "Check" ? <input id={id} type="checkbox" disabled={disabled} className="ml-2 mt-2" checked={value === true || value === 1} onChange={(event) => onChange(event.target.checked)} /> : field.fieldtype === "Select" ? <select id={id} disabled={disabled} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="" />{(field.options ?? "").split("\n").filter(Boolean).map((option) => <option key={option}>{option}</option>)}</select> : <Input id={id} disabled={disabled} type={field.fieldtype === "Date" ? "date" : field.fieldtype === "Datetime" ? "datetime-local" : "text"} value={String(value ?? "")} onChange={(event) => onChange(field.fieldtype === "Int" ? Number(event.target.value) : event.target.value)} />}</div>;
}
function errorMessage(error: unknown): string { return error instanceof CloudForgeApiError ? `${error.code}: ${error.message}${error.traceId ? ` (${error.traceId})` : ""}` : error instanceof Error ? error.message : "Unknown error"; }
