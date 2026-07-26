import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocTypeMeta, PrintFormatMeta, WorkflowMeta } from "./types.js";
import { parseDocTypeMeta, validateWorkflow } from "./validate.js";

export interface MetadataStore {
  getDocType(tenantId: string, doctype: string): Promise<DocTypeMeta | null>;
  listDocTypes(tenantId: string): Promise<DocTypeMeta[]>;
  putDocType(tenantId: string, meta: DocTypeMeta, actor: string, now: string): Promise<DocTypeMeta>;
  getWorkflow(tenantId: string, doctype: string): Promise<WorkflowMeta | null>;
  putWorkflow(tenantId: string, workflow: WorkflowMeta, actor: string, now: string): Promise<WorkflowMeta>;
  getPrintFormat(tenantId: string, doctype: string, name?: string): Promise<PrintFormatMeta | null>;
  putPrintFormat(tenantId: string, format: PrintFormatMeta, actor: string, now: string): Promise<PrintFormatMeta>;
  nextName(tenantId: string, doctype: string, pattern: string, now: string): Promise<string>;
  provisionStandardCatalog(tenantId: string, actor: string, now: string): Promise<{ doctypes: number; print_formats: number }>;
}

interface MetaRow { metadata_json: string; revision: number; modified_at: string }
interface WorkflowRow { workflow_json: string; revision: number }
interface PrintRow { format_json: string; revision: number }

export class D1MetadataStore implements MetadataStore {
  private readonly db: D1Database | D1DatabaseSession;
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  async getDocType(tenantId: string, doctype: string): Promise<DocTypeMeta | null> {
    const row = await this.db.prepare(
      `SELECT metadata_json, revision, modified_at FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2 AND disabled=0`,
    ).bind(tenantId, doctype).first<MetaRow>();
    if (!row) return null;
    const parsed = parseDocTypeMeta(JSON.parse(row.metadata_json), doctype);
    return { ...parsed, revision: row.revision, modified_at: row.modified_at };
  }

  async listDocTypes(tenantId: string): Promise<DocTypeMeta[]> {
    const result = await this.db.prepare(
      `SELECT metadata_json, revision, modified_at FROM doctype_definitions WHERE tenant_id=?1 AND disabled=0 ORDER BY module, doctype`,
    ).bind(tenantId).all<MetaRow>();
    return (result.results ?? []).map((row) => ({ ...parseDocTypeMeta(JSON.parse(row.metadata_json)), revision: row.revision, modified_at: row.modified_at }));
  }

  async putDocType(tenantId: string, meta: DocTypeMeta, actor: string, now: string): Promise<DocTypeMeta> {
    const existing = await this.db.prepare(`SELECT revision FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2`).bind(tenantId, meta.name).first<{ revision: number }>();
    if (existing && meta.revision !== existing.revision) throw errors.version(existing.revision);
    const revision = (existing?.revision ?? 0) + 1;
    const normalized = { ...meta, revision };
    await this.db.prepare(
      `INSERT INTO doctype_definitions(tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?10)
       ON CONFLICT(tenant_id,doctype) DO UPDATE SET module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
       is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    ).bind(tenantId, meta.name, meta.module, meta.custom ? 1 : 0, meta.is_submittable ? 1 : 0, meta.is_child ? 1 : 0, revision, JSON.stringify(normalized), actor, now).run();
    return { ...normalized, modified_at: now };
  }

  async getWorkflow(tenantId: string, doctype: string): Promise<WorkflowMeta | null> {
    const row = await this.db.prepare(`SELECT workflow_json,revision FROM workflows WHERE tenant_id=?1 AND document_type=?2 AND is_active=1`).bind(tenantId, doctype).first<WorkflowRow>();
    return row ? { ...validateWorkflow(JSON.parse(row.workflow_json), doctype), revision: row.revision } : null;
  }

  async putWorkflow(tenantId: string, workflow: WorkflowMeta, actor: string, now: string): Promise<WorkflowMeta> {
    const existing = await this.db.prepare(`SELECT revision FROM workflows WHERE tenant_id=?1 AND name=?2`).bind(tenantId, workflow.name).first<{ revision: number }>();
    if (existing && workflow.revision !== existing.revision) throw errors.version(existing.revision);
    const revision = (existing?.revision ?? 0) + 1;
    const normalized = { ...workflow, revision };
    await this.db.prepare(
      `INSERT INTO workflows(tenant_id,name,document_type,is_active,revision,workflow_json,modified_by,modified_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
       ON CONFLICT(tenant_id,name) DO UPDATE SET document_type=excluded.document_type,is_active=excluded.is_active,revision=excluded.revision,
       workflow_json=excluded.workflow_json,modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    ).bind(tenantId, workflow.name, workflow.document_type, workflow.is_active ? 1 : 0, revision, JSON.stringify(normalized), actor, now).run();
    return normalized;
  }

  async getPrintFormat(tenantId: string, doctype: string, name?: string): Promise<PrintFormatMeta | null> {
    const row = name
      ? await this.db.prepare(`SELECT format_json,revision FROM print_formats WHERE tenant_id=?1 AND name=?2 AND doc_type=?3 AND disabled=0`).bind(tenantId, name, doctype).first<PrintRow>()
      : await this.db.prepare(`SELECT format_json,revision FROM print_formats WHERE tenant_id=?1 AND doc_type=?2 AND disabled=0 ORDER BY is_default DESC,name LIMIT 1`).bind(tenantId, doctype).first<PrintRow>();
    return row ? { ...(JSON.parse(row.format_json) as PrintFormatMeta), revision: row.revision } : null;
  }

  async putPrintFormat(tenantId: string, format: PrintFormatMeta, actor: string, now: string): Promise<PrintFormatMeta> {
    if (!format.name || !format.doc_type || typeof format.html !== "string") throw errors.validation("Print format name, doc_type and html are required");
    const existing = await this.db.prepare(`SELECT revision FROM print_formats WHERE tenant_id=?1 AND name=?2`).bind(tenantId, format.name).first<{ revision: number }>();
    if (existing && format.revision !== existing.revision) throw errors.version(existing.revision);
    const revision = (existing?.revision ?? 0) + 1;
    const normalized = { ...format, revision };
    await this.db.prepare(
      `INSERT INTO print_formats(tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(tenant_id,name) DO UPDATE SET doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
       revision=excluded.revision,format_json=excluded.format_json,modified_by=excluded.modified_by,modified_at=excluded.modified_at`,
    ).bind(tenantId, format.name, format.doc_type, format.is_default ? 1 : 0, format.disabled ? 1 : 0, revision, JSON.stringify(normalized), actor, now).run();
    return normalized;
  }

  async provisionStandardCatalog(tenantId: string, actor: string, now: string): Promise<{ doctypes: number; print_formats: number }> {
    if (!tenantId || tenantId === "__standard__") throw errors.validation("A concrete tenant is required");
    const doctypes = await this.db.prepare(
      `INSERT OR IGNORE INTO doctype_definitions(tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)
       SELECT ?1,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,?2,?3 FROM doctype_definitions WHERE tenant_id='__standard__'`,
    ).bind(tenantId, actor, now).run();
    const formats = await this.db.prepare(
      `INSERT OR IGNORE INTO print_formats(tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at)
       SELECT ?1,name,doc_type,is_default,disabled,revision,format_json,?2,?3 FROM print_formats WHERE tenant_id='__standard__'`,
    ).bind(tenantId, actor, now).run();
    return { doctypes: doctypes.meta?.changes ?? 0, print_formats: formats.meta?.changes ?? 0 };
  }

  async nextName(tenantId: string, doctype: string, pattern: string, now: string): Promise<string> {
    if (pattern === "hash") return `${doctype.replace(/\s+/g, "-").toUpperCase()}-${crypto.randomUUID()}`;
    if (pattern === "field:name") throw errors.validation("field:name autoname requires the client to supply the name field");
    const match = pattern.match(/^([A-Za-z0-9 _./-]*?)(#+)$/);
    if (!match) throw errors.validation(`Unsupported autoname pattern: ${pattern}`);
    const prefix = match[1]!.replace(/YYYY/g, now.slice(0, 4)).replace(/MM/g, now.slice(5, 7)).replace(/DD/g, now.slice(8, 10));
    const digits = match[2]!.length;
    const key = `${doctype}:${prefix}:${digits}`;
    const row = await this.db.prepare(
      `INSERT INTO naming_series(tenant_id,series_key,current_value,modified_at) VALUES(?1,?2,1,?3)
       ON CONFLICT(tenant_id,series_key) DO UPDATE SET current_value=current_value+1,modified_at=excluded.modified_at
       RETURNING current_value`,
    ).bind(tenantId, key, now).first<{ current_value: number }>();
    if (!row) throw new Error("Unable to allocate naming series");
    return `${prefix}${String(row.current_value).padStart(digits, "0")}`;
  }
}

export class InMemoryMetadataStore implements MetadataStore {
  private doctypes = new Map<string, DocTypeMeta>();
  private workflows = new Map<string, WorkflowMeta>();
  private formats = new Map<string, PrintFormatMeta>();
  private counters = new Map<string, number>();
  private key(tenant: string, name: string): string { return `${tenant}:${name}`; }
  async getDocType(tenantId: string, doctype: string): Promise<DocTypeMeta | null> { return structuredClone(this.doctypes.get(this.key(tenantId, doctype)) ?? null); }
  async listDocTypes(tenantId: string): Promise<DocTypeMeta[]> { return [...this.doctypes.entries()].filter(([key]) => key.startsWith(`${tenantId}:`)).map(([, value]) => structuredClone(value)); }
  async putDocType(tenantId: string, meta: DocTypeMeta, _actor: string, now: string): Promise<DocTypeMeta> {
    const previous = this.doctypes.get(this.key(tenantId, meta.name));
    if (previous && previous.revision !== meta.revision) throw errors.version(previous.revision);
    const next = { ...structuredClone(meta), revision: (previous?.revision ?? 0) + 1, modified_at: now };
    this.doctypes.set(this.key(tenantId, meta.name), next); return structuredClone(next);
  }
  async getWorkflow(tenantId: string, doctype: string): Promise<WorkflowMeta | null> { return structuredClone(this.workflows.get(this.key(tenantId, doctype)) ?? null); }
  async putWorkflow(tenantId: string, workflow: WorkflowMeta): Promise<WorkflowMeta> { this.workflows.set(this.key(tenantId, workflow.document_type), structuredClone(workflow)); return structuredClone(workflow); }
  async getPrintFormat(tenantId: string, doctype: string, name?: string): Promise<PrintFormatMeta | null> { return structuredClone(this.formats.get(this.key(tenantId, name ?? doctype)) ?? null); }
  async putPrintFormat(tenantId: string, format: PrintFormatMeta): Promise<PrintFormatMeta> { this.formats.set(this.key(tenantId, format.name), structuredClone(format)); return structuredClone(format); }
  async provisionStandardCatalog(_tenantId: string, _actor: string, _now: string): Promise<{ doctypes: number; print_formats: number }> { return { doctypes: 0, print_formats: 0 }; }
  
  async nextName(tenantId: string, doctype: string, pattern: string, now: string): Promise<string> {
    if (pattern === "hash") return `${doctype}-${crypto.randomUUID()}`;
    const match = pattern.match(/^([A-Za-z0-9 _./-]*?)(#+)$/); if (!match) throw errors.validation("Unsupported autoname pattern");
    const prefix = match[1]!.replace(/YYYY/g, now.slice(0, 4)).replace(/MM/g, now.slice(5, 7)).replace(/DD/g, now.slice(8, 10));
    const key = this.key(tenantId, `${doctype}:${prefix}`); const next = (this.counters.get(key) ?? 0) + 1; this.counters.set(key, next);
    return `${prefix}${String(next).padStart(match[2]!.length, "0")}`;
  }
}

export function metadataSummary(meta: DocTypeMeta): JsonObject {
  return { name: meta.name, module: meta.module, custom: Boolean(meta.custom), is_submittable: Boolean(meta.is_submittable), revision: meta.revision, title_field: meta.title_field ?? null };
}
