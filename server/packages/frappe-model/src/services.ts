import type { Actor, CanonicalDocument, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors, randomId } from "../../core/src/index.js";
import type { MetadataStore } from "./store.js";
import type { AssignmentRecord, CommentRecord, FileRecord, PrintFormatMeta, ShareRecord } from "./types.js";

export interface VersionSummary extends JsonObject {
  version: number;
  command_id: string;
  actor: string;
  action: string;
  created_at: string;
}

export class D1CollaborationService {
  private readonly db: D1Database | D1DatabaseSession;
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  async listTimeline(tenantId: string, doctype: string, name: string): Promise<JsonObject> {
    const comments = await this.db.prepare(`SELECT comment_id,comment_type,content,owner,created_at FROM document_comments WHERE tenant_id=?1 AND doctype=?2 AND name=?3 ORDER BY created_at`).bind(tenantId, doctype, name).all<CommentRecord>();
    const assignments = await this.db.prepare(`SELECT assignment_id,assigned_to,description,status,priority,due_date,owner,created_at,modified_at FROM assignments WHERE tenant_id=?1 AND doctype=?2 AND name=?3 ORDER BY created_at`).bind(tenantId, doctype, name).all<AssignmentRecord>();
    const files = await this.db.prepare(`SELECT file_id,file_name,content_type,size_bytes,is_private,owner,created_at FROM files WHERE tenant_id=?1 AND attached_to_doctype=?2 AND attached_to_name=?3 ORDER BY created_at`).bind(tenantId, doctype, name).all<FileRecord>();
    const versions = await this.db.prepare(`SELECT version,command_id,actor,action,created_at FROM versions WHERE tenant_id=?1 AND doc_key=?2 ORDER BY version DESC LIMIT 100`).bind(tenantId, `${doctype}:${name}`).all<VersionSummary>();
    return { comments: comments.results ?? [], assignments: assignments.results ?? [], files: files.results ?? [], versions: versions.results ?? [] };
  }

  async addComment(tenantId: string, actor: Actor, doctype: string, name: string, content: string, now: string): Promise<CommentRecord> {
    if (!content.trim() || content.length > 20_000) throw errors.validation("Comment must contain 1–20000 characters");
    const record: CommentRecord = { comment_id: randomId("comment"), doctype, name, comment_type: "Comment", content: content.trim(), owner: actor.user_id, created_at: now };
    await this.db.prepare(`INSERT INTO document_comments(tenant_id,comment_id,doctype,name,comment_type,content,owner,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`).bind(tenantId, record.comment_id, doctype, name, record.comment_type, record.content, record.owner, now).run();
    return record;
  }

  async assign(tenantId: string, actor: Actor, doctype: string, name: string, input: JsonObject, now: string): Promise<AssignmentRecord> {
    const assignedTo = typeof input.assigned_to === "string" && input.assigned_to.trim() ? input.assigned_to.trim() : (() => { throw errors.validation("assigned_to is required"); })();
    const status = input.status === "Closed" || input.status === "Cancelled" ? input.status : "Open";
    const record: AssignmentRecord = { assignment_id: randomId("assign"), doctype, name, assigned_to: assignedTo, status, owner: actor.user_id, created_at: now, modified_at: now,
      ...(typeof input.description === "string" ? { description: input.description.slice(0, 4000) } : {}),
      ...(input.priority === "Low" || input.priority === "Medium" || input.priority === "High" ? { priority: input.priority } : {}),
      ...(typeof input.due_date === "string" ? { due_date: input.due_date } : {}) };
    await this.db.prepare(`INSERT INTO assignments(tenant_id,assignment_id,doctype,name,assigned_to,description,status,priority,due_date,owner,created_at,modified_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`).bind(tenantId, record.assignment_id, doctype, name, assignedTo, record.description ?? null, status, record.priority ?? null, record.due_date ?? null, actor.user_id, now, now).run();
    return record;
  }

  async getVersion(tenantId: string, doctype: string, name: string, version: number): Promise<CanonicalDocument<JsonObject> | null> {
    const row = await this.db.prepare(`SELECT snapshot_json FROM versions WHERE tenant_id=?1 AND doc_key=?2 AND version=?3`).bind(tenantId, `${doctype}:${name}`, version).first<{ snapshot_json: string }>();
    return row ? JSON.parse(row.snapshot_json) as CanonicalDocument<JsonObject> : null;
  }

  async getAssignment(tenantId: string, assignmentId: string): Promise<AssignmentRecord | null> {
    return this.db.prepare(`SELECT assignment_id,doctype,name,assigned_to,description,status,priority,due_date,owner,created_at,modified_at FROM assignments WHERE tenant_id=?1 AND assignment_id=?2`).bind(tenantId, assignmentId).first<AssignmentRecord>();
  }

  async updateAssignment(tenantId: string, actor: Actor, assignmentId: string, input: JsonObject, now: string): Promise<AssignmentRecord> {
    const current = await this.getAssignment(tenantId, assignmentId);
    if (!current) throw errors.notFound("Assignment not found");
    const privileged = actor.user_id === current.owner || actor.user_id === current.assigned_to || actor.roles.includes("System Manager") || actor.roles.includes("Administrator");
    if (!privileged) throw errors.permission("Only the assignment owner, assignee or manager may update it");
    const status = input.status === "Open" || input.status === "Closed" || input.status === "Cancelled" ? input.status : current.status;
    const priority = input.priority === "Low" || input.priority === "Medium" || input.priority === "High" ? input.priority : current.priority;
    const dueDate = typeof input.due_date === "string" ? input.due_date : current.due_date;
    const description = typeof input.description === "string" ? input.description.slice(0, 4000) : current.description;
    await this.db.prepare(`UPDATE assignments SET description=?3,status=?4,priority=?5,due_date=?6,modified_at=?7 WHERE tenant_id=?1 AND assignment_id=?2`).bind(tenantId, assignmentId, description ?? null, status, priority ?? null, dueDate ?? null, now).run();
    return { ...current, ...(description === undefined ? {} : { description }), status, ...(priority === undefined ? {} : { priority }), ...(dueDate === undefined ? {} : { due_date: dueDate }), modified_at: now };
  }

  async share(tenantId: string, actor: Actor, doctype: string, name: string, input: JsonObject, now: string): Promise<ShareRecord> {
    const user = typeof input.user === "string" && input.user.trim() ? input.user.trim() : (() => { throw errors.validation("user is required"); })();
    const record: ShareRecord = { doctype, name, user, read: input.read !== false, write: input.write === true, share: input.share === true, submitted_by: actor.user_id, created_at: now };
    await this.db.prepare(`INSERT INTO document_shares(tenant_id,doctype,name,user,can_read,can_write,can_share,submitted_by,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(tenant_id,doctype,name,user) DO UPDATE SET can_read=excluded.can_read,can_write=excluded.can_write,can_share=excluded.can_share,submitted_by=excluded.submitted_by,created_at=excluded.created_at`).bind(tenantId, doctype, name, user, record.read ? 1 : 0, record.write ? 1 : 0, record.share ? 1 : 0, actor.user_id, now).run();
    return record;
  }

  async listShares(tenantId: string, doctype: string, name: string): Promise<ShareRecord[]> {
    const result = await this.db.prepare(
      `SELECT user,can_read,can_write,can_share,submitted_by,created_at FROM document_shares
       WHERE tenant_id=?1 AND doctype=?2 AND name=?3 ORDER BY user`,
    ).bind(tenantId, doctype, name).all<{ user: string; can_read: number; can_write: number; can_share: number; submitted_by: string; created_at: string }>();
    return (result.results ?? []).map((row) => ({
      doctype, name, user: row.user,
      read: row.can_read === 1, write: row.can_write === 1, share: row.can_share === 1,
      submitted_by: row.submitted_by, created_at: row.created_at,
    }));
  }

  async removeShare(tenantId: string, doctype: string, name: string, user: string): Promise<boolean> {
    const result = await this.db.prepare(
      `DELETE FROM document_shares WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND user=?4`,
    ).bind(tenantId, doctype, name, user).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  /**
   * Closes an assignment rather than deleting it.
   *
   * The record is the history of who was asked to act on a document; deleting it
   * would erase that, so removal is a status change.
   */
  async removeAssignment(tenantId: string, doctype: string, name: string, assignedTo: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE assignments SET status='Cancelled', modified_at=?5
       WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND assigned_to=?4 AND status='Open'`,
    ).bind(tenantId, doctype, name, assignedTo, now).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async addTag(tenantId: string, actor: Actor, doctype: string, name: string, tag: string, now: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO document_tags(tenant_id,doctype,name,tag,owner,created_at) VALUES(?1,?2,?3,?4,?5,?6)
       ON CONFLICT(tenant_id,doctype,name,tag) DO NOTHING`,
    ).bind(tenantId, doctype, name, tag, actor.user_id, now).run();
  }

  async removeTag(tenantId: string, doctype: string, name: string, tag: string): Promise<boolean> {
    const result = await this.db.prepare(
      `DELETE FROM document_tags WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND tag=?4`,
    ).bind(tenantId, doctype, name, tag).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async listTags(tenantId: string, doctype: string, name: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT tag FROM document_tags WHERE tenant_id=?1 AND doctype=?2 AND name=?3 ORDER BY tag`,
    ).bind(tenantId, doctype, name).all<{ tag: string }>();
    return (result.results ?? []).map((row) => row.tag);
  }
}

/**
 * The global-search candidate index.
 *
 * A shortlist, never an authorisation decision: callers MUST re-check every hit
 * against the permission layer, because a title alone can disclose the existence
 * and subject of a document the actor may not see.
 */
export class D1SearchStore {
  private readonly db: D1Database | D1DatabaseSession;
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  async candidates(tenantId: string, term: string, doctype: string | null, limit: number): Promise<Array<{ doctype: string; name: string; title: string; snippet: string }>> {
    // Wildcards in the caller's term are escaped: a search for "50%" must look for
    // that text, not match everything.
    const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const bounded = Math.min(Math.max(limit, 1), 200);
    const result = doctype
      ? await this.db.prepare(
        `SELECT doctype, name, title, content FROM document_search
         WHERE tenant_id=?1 AND doctype=?2 AND (title LIKE ?3 ESCAPE '\\' OR content LIKE ?3 ESCAPE '\\')
         ORDER BY modified_at DESC LIMIT ?4`,
      ).bind(tenantId, doctype, pattern, bounded).all<{ doctype: string; name: string; title: string; content: string }>()
      : await this.db.prepare(
        `SELECT doctype, name, title, content FROM document_search
         WHERE tenant_id=?1 AND (title LIKE ?2 ESCAPE '\\' OR content LIKE ?2 ESCAPE '\\')
         ORDER BY modified_at DESC LIMIT ?3`,
      ).bind(tenantId, pattern, bounded).all<{ doctype: string; name: string; title: string; content: string }>();

    return (result.results ?? []).map((row) => ({
      doctype: row.doctype,
      name: row.name,
      title: row.title,
      snippet: snippetAround(row.content, term),
    }));
  }

  /**
   * Refreshes a document's index row.
   *
   * Content is capped: an unbounded concatenation of every field would make the
   * index larger than the documents it points at, and LIKE over it slower than
   * scanning them.
   */
  async index(tenantId: string, doctype: string, name: string, title: string, content: string, modifiedAt: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at) VALUES(?1,?2,?3,?4,?5,?6)
       ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
         title=excluded.title, content=excluded.content, modified_at=excluded.modified_at`,
    ).bind(tenantId, doctype, name, title.slice(0, 320), content.slice(0, 4000), modifiedAt).run();
  }
}

function snippetAround(content: string, term: string, radius = 60): string {
  const position = content.toLowerCase().indexOf(term.toLowerCase());
  if (position < 0) return content.slice(0, radius * 2);
  const start = Math.max(0, position - radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, position + term.length + radius)}`;
}

export function renderPrintFormat(format: PrintFormatMeta, document: CanonicalDocument, locale = "en"): string {
  const context: Record<string, JsonValue> = { ...document.data, name: document.name, doctype: document.doctype, owner: document.owner, docstatus: document.docstatus, status: document.status, version: document.version, locale };
  const interpolate = (template: string): string => template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, path: string) => escapeHtml(resolvePath(context, path)));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${format.css ?? ""}</style></head><body>${interpolate(format.html)}</body></html>`;
}

function resolvePath(root: Record<string, JsonValue>, path: string): string {
  let value: unknown = root;
  for (const segment of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    value = (value as Record<string, unknown>)[segment];
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }

export interface CsvImportPreview { headers: string[]; rows: JsonObject[]; errors: Array<{ row: number; message: string }>; }
export function parseCsvImport(text: string, maxRows = 1000): CsvImportPreview {
  if (text.length > 5_000_000) throw errors.validation("CSV exceeds 5MB");
  const lines = parseCsv(text); if (!lines.length) throw errors.validation("CSV is empty");
  const headers = lines[0]!.map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) throw errors.validation("CSV headers cannot be empty");
  if (new Set(headers).size !== headers.length) throw errors.validation("CSV headers must be unique");
  const rows: JsonObject[] = []; const errorsOut: Array<{ row: number; message: string }> = [];
  for (let i = 1; i < lines.length && rows.length < maxRows; i += 1) {
    const columns = lines[i]!; if (columns.every((value) => value === "")) continue;
    if (columns.length !== headers.length) { errorsOut.push({ row: i + 1, message: `Expected ${headers.length} columns, got ${columns.length}` }); continue; }
    const row: JsonObject = {}; headers.forEach((header, index) => { row[header] = columns[index] ?? ""; }); rows.push(row);
  }
  if (lines.length - 1 > maxRows) errorsOut.push({ row: maxRows + 2, message: `Import preview limited to ${maxRows} rows` });
  return { headers, rows, errors: errorsOut };
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) { if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char; continue; }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw errors.validation("CSV contains an unterminated quoted field");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
