import type { CanonicalDocument, JsonObject, JsonValue, MutationAction, MutationCommandInput, MutationReceipt } from "../../contracts/src/index.js";
import { commandPayloadHash } from "../../core/src/index.js";

/** Typed error surfaced to the UI so it can branch on status/code instead of parsing strings. */
export class CloudForgeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean = false,
    readonly details?: unknown,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = "CloudForgeApiError";
  }
}

export interface WhoAmI {
  tenant_id: string;
  actor_id: string;
  roles: string[];
}

export interface CloudForgeAdapterOptions {
  /** Gateway origin for commands / documents / whoami. */
  baseUrl: string;
  tenantId: string;
  /** Origin serving reports (the query-worker); defaults to baseUrl. */
  reportBaseUrl?: string;
  /** Static token, or a (possibly async) getter — the browser never sees any secret. */
  accessToken?: string;
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  fetchImpl?: typeof fetch;
}

export interface RunReportInput {
  report: string;
  filters?: JsonObject[];
  order_by?: JsonObject[];
  limit?: number;
  offset?: number;
}

export interface DocumentListQuery {
  doctype: string;
  fields?: string[];
  filters?: JsonObject[];
  search?: string;
  sort?: JsonObject[];
  limit?: number;
  cursor?: string | null;
}

export interface DocumentListResult {
  rows: JsonObject[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface DocFieldMeta extends JsonObject {
  fieldname: string; label: string; fieldtype: string; options?: string; required?: boolean; read_only?: boolean; hidden?: boolean; allow_on_submit?: boolean; default?: JsonValue; in_list_view?: boolean;
}
export interface DocTypeMeta extends JsonObject {
  name: string; module: string; custom?: boolean; is_child?: boolean; is_submittable?: boolean; autoname?: string; title_field?: string; revision: number; fields: DocFieldMeta[];
}
export interface DocTypeSummary extends JsonObject { name: string; module: string; custom: boolean; is_submittable: boolean; revision: number; title_field: string | null }
export interface WorkflowAction extends JsonObject { action: string; next_state: string }
export interface TimelineResult extends JsonObject { comments: JsonObject[]; assignments: JsonObject[]; files: JsonObject[]; versions: JsonObject[] }
export interface ImportResult extends JsonObject { imported: number; failed: number; results: JsonObject[] }

export class CloudForgeAdapter {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: CloudForgeAdapterOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getWhoAmI(): Promise<WhoAmI> {
    return this.request<WhoAmI>("GET", this.options.baseUrl, "/api/v1/whoami");
  }

  async getDocument<T extends JsonObject>(doctype: string, name: string): Promise<CanonicalDocument<T>> {
    return this.request<CanonicalDocument<T>>("GET", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  }

  /** Narrow server-side document list/search. Filters/fields/sort are whitelisted
   *  server-side per doctype; pagination is cursor-based (opaque). */
  async getList(query: DocumentListQuery): Promise<DocumentListResult> {
    return this.request<DocumentListResult>("POST", this.options.baseUrl, "/api/v1/documents/list", query as unknown as JsonObject);
  }

  async getCount(query: DocumentListQuery): Promise<{ count: number }> {
    return this.request<{ count: number }>("POST", this.options.baseUrl, "/api/v1/documents/count", query as unknown as JsonObject);
  }

  async listMeta(): Promise<{ doctypes: DocTypeSummary[] }> {
    return this.request("GET", this.options.baseUrl, "/api/v1/meta");
  }

  async getMeta(doctype: string, name?: string): Promise<{ meta: DocTypeMeta; workflow?: JsonObject }> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return this.request("GET", this.options.baseUrl, `/api/v1/meta/${encodeURIComponent(doctype)}${query}`);
  }

  async getTimeline(doctype: string, name: string): Promise<TimelineResult> {
    return this.request("GET", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/timeline`);
  }

  async getVersion<T extends JsonObject>(doctype: string, name: string, version: number): Promise<CanonicalDocument<T>> {
    return this.request("GET", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/versions/${version}`);
  }

  async getWorkflowActions(doctype: string, name: string): Promise<{ state: string; actions: WorkflowAction[] }> {
    return this.request("GET", this.options.baseUrl, `/api/v1/workflows/${encodeURIComponent(doctype)}/actions?name=${encodeURIComponent(name)}`);
  }

  async applyWorkflow(doctype: string, input: { name: string; action: string; expected_version: number; command_id: string }): Promise<MutationReceipt> {
    return this.request("POST", this.options.baseUrl, `/api/v1/workflows/${encodeURIComponent(doctype)}/apply`, input as unknown as JsonObject);
  }

  async addComment(doctype: string, name: string, content: string): Promise<JsonObject> {
    return this.request("POST", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/comments`, { content });
  }

  async assignDocument(doctype: string, name: string, assignedTo: string, description?: string): Promise<JsonObject> {
    return this.request("POST", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/assign`, { assigned_to: assignedTo, ...(description ? { description } : {}) });
  }

  async shareDocument(doctype: string, name: string, user: string, grants: { read?: boolean; write?: boolean; share?: boolean } = {}): Promise<JsonObject> {
    return this.request("POST", this.options.baseUrl, `/api/v1/documents/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}/share`, { user, read: grants.read !== false, write: grants.write === true, share: grants.share === true });
  }

  async previewImport(doctype: string, csv: string): Promise<JsonObject> {
    return this.requestRaw("POST", this.options.baseUrl, `/api/v1/import/preview?doctype=${encodeURIComponent(doctype)}`, csv, "text/csv");
  }

  async applyImport(doctype: string, csv: string): Promise<ImportResult> {
    return this.requestRaw("POST", this.options.baseUrl, `/api/v1/import/apply?doctype=${encodeURIComponent(doctype)}`, csv, "text/csv");
  }

  async exportCsv(input: JsonObject): Promise<string> {
    return this.requestText("POST", this.options.baseUrl, "/api/v1/export/csv", input);
  }

  /**
   * The caller supplies command_id and name. Keep the SAME command_id across
   * retries of one action so a lost response replays to the same receipt; only a
   * new action gets a new command_id.
   */
  async mutate<T extends JsonObject>(input: {
    doctype: string;
    name: string;
    action: MutationAction;
    expectedVersion: number | null;
    document: T;
    commandId: string;
  }): Promise<MutationReceipt> {
    const command: MutationCommandInput<T> = {
      schema_version: 1,
      command_id: input.commandId,
      tenant_id: this.options.tenantId,
      aggregate: { doctype: input.doctype, name: input.name },
      action: input.action,
      expected_version: input.expectedVersion,
      payload_hash: "",
      document: input.document,
    };
    command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
    return this.request<MutationReceipt>("POST", this.options.baseUrl, "/api/v1/commands", command);
  }

  async runReport(input: RunReportInput): Promise<JsonObject> {
    return this.request<JsonObject>("POST", this.reportBase(), "/api/v1/reports/run", input as unknown as JsonObject);
  }

  async getPreparedReport(jobId: string): Promise<JsonObject> {
    return this.request<JsonObject>("GET", this.reportBase(), `/api/v1/reports/prepared/${encodeURIComponent(jobId)}`);
  }

  private reportBase(): string {
    return this.options.reportBaseUrl ?? this.options.baseUrl;
  }

  private async request<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", base: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers();
    const token = this.options.getToken ? await this.options.getToken() : this.options.accessToken;
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.fetchImpl(`${base}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return this.read<T>(response);
  }

  private async requestRaw<T>(method: "POST" | "PUT", base: string, path: string, body: BodyInit, contentType: string): Promise<T> {
    const headers = new Headers({ "content-type": contentType });
    const token = this.options.getToken ? await this.options.getToken() : this.options.accessToken;
    if (token) headers.set("authorization", `Bearer ${token}`);
    return this.read<T>(await this.fetchImpl(`${base}${path}`, { method, headers, body }));
  }

  private async requestText(method: "POST", base: string, path: string, body: JsonObject): Promise<string> {
    const headers = new Headers({ "content-type": "application/json" });
    const token = this.options.getToken ? await this.options.getToken() : this.options.accessToken;
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await this.fetchImpl(`${base}${path}`, { method, headers, body: JSON.stringify(body) });
    if (!response.ok) await this.read(response);
    return response.text();
  }

  private async read<T>(response: Response): Promise<T> {
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (!response.ok) {
      const envelope = (parsed && typeof parsed === "object" ? parsed : {}) as { error?: JsonObject; trace_id?: string };
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
}
