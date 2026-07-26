// CloudForge browser client. The payload-hash logic (stableStringify + sha256Hex
// + commandPayloadHash) is vendored VERBATIM from packages/core so the hash the
// backend recomputes always matches — keep these three in sync with the backend.

export type MutationAction = "create" | "save" | "submit" | "cancel";

export interface WhoAmI {
  tenant_id: string;
  actor_id: string;
  roles: string[];
}

export interface CanonicalDocument<T = Record<string, unknown>> {
  tenant_id: string;
  doctype: string;
  name: string;
  owner: string;
  docstatus: 0 | 1 | 2;
  status: string;
  version: number;
  created_at: string;
  modified_at: string;
  data: T;
  children: Array<{ fieldname: string; row_id: string; data: Record<string, unknown> }>;
}

export interface MutationReceipt {
  command_id: string;
  aggregate: { doctype: string; name: string };
  aggregate_version: number;
  result: Record<string, unknown>;
}

/** Typed error so the UI can branch on status/code instead of parsing strings. */
export class CloudForgeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details?: unknown,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = "CloudForgeApiError";
  }
}

// ---- vendored from packages/core (json.ts + hash.ts) ----
function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
function sortValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = sortValue(child);
    }
    return result;
  }
  return String(value);
}
async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function commandPayloadHash(command: Record<string, unknown>): Promise<string> {
  const clone = { ...command };
  delete clone.payload_hash;
  delete clone.actor;
  return sha256Hex(clone);
}
// ---------------------------------------------------------

export interface CloudForgeClientOptions {
  baseUrl: string;
  reportBaseUrl?: string;
  tenantId: string;
  getToken: () => string | null;
  fetchImpl?: typeof fetch;
}

export interface RunReportInput {
  report: string;
  filters?: Record<string, unknown>[];
  order_by?: Record<string, unknown>[];
  limit?: number;
  offset?: number;
}

export interface DocumentListFilter { field: string; operator: string; value?: unknown }
export interface DocumentListSort { field: string; direction: "asc" | "desc" }
export interface DocumentListQuery {
  doctype: string;
  fields?: string[];
  filters?: DocumentListFilter[];
  search?: string;
  sort?: DocumentListSort[];
  limit?: number;
  cursor?: string | null;
}
export interface DocumentListResult {
  rows: Array<Record<string, unknown>>;
  next_cursor: string | null;
  has_more: boolean;
}

export interface DocFieldMeta {
  fieldname: string; label: string; fieldtype: string; options?: string; required?: boolean; read_only?: boolean; hidden?: boolean; allow_on_submit?: boolean; default?: unknown; in_list_view?: boolean;
}
export interface DocTypeMeta {
  name: string; module: string; custom?: boolean; is_child?: boolean; is_submittable?: boolean; autoname?: string; title_field?: string; revision: number; fields: DocFieldMeta[];
}
export interface DocTypeSummary { name: string; module: string; custom: boolean; is_submittable: boolean; revision: number; title_field: string | null }

export interface WorkflowAction { action: string; next_state: string }
export interface WorkflowActionsResult { state: string; actions: WorkflowAction[] }
export interface VersionSummary { version: number; command_id: string; actor: string; action: string; created_at: string }
export interface TimelineResult {
  comments: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
  versions: VersionSummary[];
}
export interface ImportPreview { headers: string[]; rows: Array<Record<string, unknown>>; errors: Array<{ row: number; message: string }> }

export class CloudForgeClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: CloudForgeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  getWhoAmI(): Promise<WhoAmI> {
    return this.request<WhoAmI>("GET", this.options.baseUrl, "/api/v1/whoami");
  }

  getDocument<T = Record<string, unknown>>(doctype: string, name: string): Promise<CanonicalDocument<T>> {
    return this.request<CanonicalDocument<T>>("GET", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  }

  /** Narrow server-side document list/search (whitelisted per doctype, cursor-paged). */
  listDocuments(query: DocumentListQuery): Promise<DocumentListResult> {
    return this.request<DocumentListResult>("POST", this.options.baseUrl, "/api/v1/documents/list", query);
  }

  countDocuments(query: DocumentListQuery): Promise<{ count: number }> {
    return this.request<{ count: number }>("POST", this.options.baseUrl, "/api/v1/documents/count", query);
  }

  listMeta(): Promise<{ doctypes: DocTypeSummary[] }> {
    return this.request("GET", this.options.baseUrl, "/api/v1/meta");
  }

  getMeta(doctype: string, name?: string): Promise<{ meta: DocTypeMeta; workflow?: unknown }> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return this.request("GET", this.options.baseUrl, `/api/v1/meta/${encodeURIComponent(doctype)}${query}`);
  }

  nextName(doctype: string, pattern: string): Promise<{ name: string }> {
    return this.request("POST", this.options.baseUrl, "/api/v1/naming/next", { doctype, pattern });
  }

  getTimeline(doctype: string, name: string): Promise<TimelineResult> {
    return this.request("GET", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/timeline`);
  }

  getVersion<T = Record<string, unknown>>(doctype: string, name: string, version: number): Promise<CanonicalDocument<T>> {
    return this.request("GET", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/versions/${version}`);
  }

  getWorkflowActions(doctype: string, name: string): Promise<WorkflowActionsResult> {
    return this.request("GET", this.options.baseUrl, `/api/v1/workflows/${encodeURIComponent(doctype)}/actions?name=${encodeURIComponent(name)}`);
  }

  applyWorkflow(doctype: string, name: string, action: string, expectedVersion: number, commandId: string): Promise<MutationReceipt> {
    return this.request("POST", this.options.baseUrl, `/api/v1/workflows/${encodeURIComponent(doctype)}/apply`, { name, action, expected_version: expectedVersion, command_id: commandId });
  }

  addComment(doctype: string, name: string, content: string): Promise<Record<string, unknown>> {
    return this.request("POST", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/comments`, { content });
  }

  assignDocument(doctype: string, name: string, assignedTo: string, description?: string): Promise<Record<string, unknown>> {
    return this.request("POST", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/assign`, { assigned_to: assignedTo, ...(description ? { description } : {}) });
  }

  updateAssignment(assignmentId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("PATCH", this.options.baseUrl, `/api/v1/assignments/${encodeURIComponent(assignmentId)}`, input);
  }

  shareDocument(doctype: string, name: string, user: string, grants: { read?: boolean; write?: boolean; share?: boolean } = {}): Promise<Record<string, unknown>> {
    return this.request("POST", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/share`, { user, read: grants.read !== false, write: grants.write === true, share: grants.share === true });
  }

  previewImport(doctype: string, csv: string): Promise<ImportPreview> {
    return this.requestRaw("POST", this.options.baseUrl, `/api/v1/import/preview?doctype=${encodeURIComponent(doctype)}`, csv, "text/csv");
  }

  applyImport(doctype: string, csv: string): Promise<{ imported: number; failed: number; results: Array<Record<string, unknown>> }> {
    return this.requestRaw("POST", this.options.baseUrl, `/api/v1/import/apply?doctype=${encodeURIComponent(doctype)}`, csv, "text/csv");
  }

  exportCsv(input: { doctype: string; fields?: string[]; filters?: DocumentListFilter[]; search?: string; sort?: DocumentListSort[]; max_rows?: number }): Promise<string> {
    return this.requestTextBody("POST", this.options.baseUrl, "/api/v1/export/csv", input);
  }

  uploadFile(input: { file: File; doctype?: string; name?: string; isPrivate?: boolean }): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({ filename: input.file.name, private: input.isPrivate === false ? "false" : "true" });
    if (input.doctype && input.name) { params.set("doctype", input.doctype); params.set("name", input.name); }
    return this.requestRaw("PUT", this.options.baseUrl, `/api/v1/files?${params.toString()}`, input.file, input.file.type || "application/octet-stream");
  }

  async downloadFile(fileId: string): Promise<Blob> {
    return this.requestBlob("GET", this.options.baseUrl, `/api/v1/files/${encodeURIComponent(fileId)}`);
  }

  deleteFile(fileId: string): Promise<{ deleted: boolean; file_id: string }> {
    return this.request("DELETE", this.options.baseUrl, `/api/v1/files/${encodeURIComponent(fileId)}`);
  }

  async renderPrint(doctype: string, name: string, format?: string): Promise<string> {
    const query = format ? `?format=${encodeURIComponent(format)}` : "";
    return this.requestText("GET", this.options.baseUrl, `/api/v1/print/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}${query}`);
  }

  /** command_id is caller-owned: keep it identical across retries of one action. */
  async mutate<T extends Record<string, unknown>>(input: {
    doctype: string;
    name: string;
    action: MutationAction;
    expectedVersion: number | null;
    document: T;
    commandId: string;
  }): Promise<MutationReceipt> {
    const command: Record<string, unknown> = {
      schema_version: 1,
      command_id: input.commandId,
      tenant_id: this.options.tenantId,
      aggregate: { doctype: input.doctype, name: input.name },
      action: input.action,
      expected_version: input.expectedVersion,
      payload_hash: "",
      document: input.document,
    };
    command.payload_hash = await commandPayloadHash(command);
    return this.request<MutationReceipt>("POST", this.options.baseUrl, "/api/v1/commands", command);
  }

  runReport(input: RunReportInput): Promise<Record<string, unknown>> {
    return this.request("POST", this.reportBase(), "/api/v1/reports/run", input);
  }

  getPreparedReport(jobId: string): Promise<Record<string, unknown>> {
    return this.request("GET", this.reportBase(), `/api/v1/reports/prepared/${encodeURIComponent(jobId)}`);
  }

  private reportBase(): string {
    return this.options.reportBaseUrl ?? this.options.baseUrl;
  }

  private async request<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", base: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const token = this.options.getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await this.fetchImpl(`${base}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (!response.ok) {
      const envelope = (parsed && typeof parsed === "object" ? parsed : {}) as { error?: Record<string, unknown>; trace_id?: string };
      const error = envelope.error ?? {};
      throw new CloudForgeApiError(
        response.status,
        typeof error.code === "string" ? error.code : "UNKNOWN_ERROR",
        typeof error.message === "string" ? error.message : response.statusText || "Request failed",
        error.retryable === true,
        error.details,
        typeof envelope.trace_id === "string" ? envelope.trace_id : undefined,
      );
    }
    return parsed as T;
  }

  private async requestRaw<T>(method: "POST" | "PUT", base: string, path: string, body: BodyInit, contentType: string): Promise<T> {
    const headers: Record<string, string> = { "content-type": contentType };
    const token = this.options.getToken(); if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${base}${path}`, { method, headers, body });
    const text = await response.text(); let parsed: unknown = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (!response.ok) throw this.toApiError(response, parsed);
    return parsed as T;
  }

  private async requestTextBody(method: "POST", base: string, path: string, body: unknown): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" }; const token = this.options.getToken(); if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${base}${path}`, { method, headers, body: JSON.stringify(body) }); const text = await response.text();
    if (!response.ok) { let parsed: unknown = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; } throw this.toApiError(response, parsed); }
    return text;
  }

  private async requestBlob(method: "GET", base: string, path: string): Promise<Blob> {
    const headers: Record<string, string> = {}; const token = this.options.getToken(); if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${base}${path}`, { method, headers });
    if (!response.ok) { const text = await response.text(); let parsed: unknown = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; } throw this.toApiError(response, parsed); }
    return response.blob();
  }

  private async requestText(method: "GET", base: string, path: string): Promise<string> {
    const headers: Record<string, string> = {}; const token = this.options.getToken(); if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${base}${path}`, { method, headers }); const text = await response.text();
    if (!response.ok) { let parsed: unknown = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; } throw this.toApiError(response, parsed); }
    return text;
  }

  private toApiError(response: Response, parsed: unknown): CloudForgeApiError {
    const envelope = (parsed && typeof parsed === "object" ? parsed : {}) as { error?: Record<string, unknown>; trace_id?: string };
    const error = envelope.error ?? {};
    return new CloudForgeApiError(response.status, typeof error.code === "string" ? error.code : "UNKNOWN_ERROR", typeof error.message === "string" ? error.message : response.statusText || "Request failed", error.retryable === true, error.details, typeof envelope.trace_id === "string" ? envelope.trace_id : undefined);
  }
}
