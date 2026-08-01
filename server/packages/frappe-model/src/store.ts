import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocTypeMeta, PrintFormatMeta, WorkflowMeta } from "./types.js";
import { parseDocTypeMeta, validateWorkflow } from "./validate.js";
import { formatSeriesName, resolveAutoname } from "./autoname.js";
import { mergeCustomizations } from "./customization.js";
import { D1CustomizationStore, type CustomizationStore } from "./customization-store.js";

export interface MetadataStore {
  getDocType(tenantId: string, doctype: string): Promise<DocTypeMeta | null>;
  listDocTypes(tenantId: string): Promise<DocTypeMeta[]>;
  putDocType(tenantId: string, meta: DocTypeMeta, actor: string, now: string): Promise<DocTypeMeta>;
  getWorkflow(tenantId: string, doctype: string): Promise<WorkflowMeta | null>;
  listWorkflowDocTypes(tenantId: string): Promise<string[]>;
  putWorkflow(tenantId: string, workflow: WorkflowMeta, actor: string, now: string): Promise<WorkflowMeta>;
  getPrintFormat(tenantId: string, doctype: string, name?: string): Promise<PrintFormatMeta | null>;
  listPrintFormats(tenantId: string, doctype: string): Promise<PrintFormatMeta[]>;
  putPrintFormat(tenantId: string, format: PrintFormatMeta, actor: string, now: string): Promise<PrintFormatMeta>;
  /** `document` supplies values for field-, series- and format-based patterns. */
  nextName(tenantId: string, doctype: string, pattern: string, now: string, document?: JsonObject): Promise<string>;
  provisionStandardCatalog(tenantId: string, actor: string, now: string): Promise<{ doctypes: number; print_formats: number; roles: number }>;
}

interface MetaRow { metadata_json: string; revision: number; modified_at: string }
interface WorkflowRow { workflow_json: string; revision: number }
interface PrintRow { format_json: string; revision: number }

export class D1MetadataStore implements MetadataStore {
  private readonly db: D1Database | D1DatabaseSession;
  private readonly customizations: CustomizationStore;
  private readonly docTypeCache = new Map<string, Promise<DocTypeMeta | null>>();
  private docTypeCacheHits = 0;
  private docTypeCacheMisses = 0;

  constructor(db: D1Database, customizations?: CustomizationStore) {
    this.db = db.withSession?.("first-primary") ?? db;
    this.customizations = customizations ?? new D1CustomizationStore(db);
  }

  /**
   * Returns the EFFECTIVE DocType: the standard definition with the tenant's
   * Custom Fields and Property Setters merged in.
   *
   * Merging here rather than at each call site is what makes customisation
   * transparent — controllers, permission checks and list projections all read
   * one schema and none of them has to know an overlay exists. A consumer that
   * bypassed this would silently ignore every customisation.
   */
  async getDocType(tenantId: string, doctype: string): Promise<DocTypeMeta | null> {
    const key = `${tenantId}\u0000${doctype}`;
    const cached = this.docTypeCache.get(key);
    if (cached) {
      this.docTypeCacheHits += 1;
      return cached;
    }
    this.docTypeCacheMisses += 1;
    const pending = this.loadDocType(tenantId, doctype);
    this.docTypeCache.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      this.docTypeCache.delete(key);
      throw error;
    }
  }

  private async loadDocType(tenantId: string, doctype: string): Promise<DocTypeMeta | null> {
    const row = await this.db.prepare(
      `SELECT metadata_json, revision, modified_at FROM doctype_definitions WHERE tenant_id=?1 AND doctype=?2 AND disabled=0`,
    ).bind(tenantId, doctype).first<MetaRow>();
    if (!row) return null;
    const parsed = parseDocTypeMeta(JSON.parse(row.metadata_json), doctype);
    const base = { ...parsed, revision: row.revision, modified_at: row.modified_at };

    const [customFields, propertySetters, customizationRevision] = await Promise.all([
      this.customizations.listCustomFields(tenantId, doctype),
      this.customizations.listPropertySetters(tenantId, doctype),
      this.customizations.revision(tenantId, doctype),
    ]);
    if (!customFields.length && !propertySetters.length) return base;
    return mergeCustomizations({ base, customFields, propertySetters, customizationRevision });
  }

  cacheStats(): { hits: number; misses: number } {
    return { hits: this.docTypeCacheHits, misses: this.docTypeCacheMisses };
  }

  /** The overlay store, for callers that manage customisations. */
  get customizationStore(): CustomizationStore {
    return this.customizations;
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
    const saved = { ...normalized, modified_at: now };
    this.docTypeCache.set(`${tenantId}\u0000${meta.name}`, Promise.resolve(saved));
    return saved;
  }

  async getWorkflow(tenantId: string, doctype: string): Promise<WorkflowMeta | null> {
    const row = await this.db.prepare(`SELECT workflow_json,revision FROM workflows WHERE tenant_id=?1 AND document_type=?2 AND is_active=1`).bind(tenantId, doctype).first<WorkflowRow>();
    return row ? { ...validateWorkflow(JSON.parse(row.workflow_json), doctype), revision: row.revision } : null;
  }

  async listWorkflowDocTypes(tenantId: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT document_type FROM workflows WHERE tenant_id=?1 AND is_active=1 ORDER BY document_type`,
    ).bind(tenantId).all<{ document_type: string }>();
    return (result.results ?? []).map((row) => row.document_type);
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

  async listPrintFormats(tenantId: string, doctype: string): Promise<PrintFormatMeta[]> {
    const result = await this.db.prepare(
      `SELECT format_json,revision FROM print_formats
       WHERE tenant_id=?1 AND doc_type=?2 AND disabled=0
       ORDER BY is_default DESC,name`,
    ).bind(tenantId, doctype).all<PrintRow>();
    return (result.results ?? []).map((row) => ({
      ...(JSON.parse(row.format_json) as PrintFormatMeta),
      revision: row.revision,
    }));
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

  async provisionStandardCatalog(tenantId: string, actor: string, now: string): Promise<{ doctypes: number; print_formats: number; roles: number }> {
    if (!tenantId || tenantId === "__standard__") throw errors.validation("A concrete tenant is required");
    const doctypes = await this.db.prepare(
      `INSERT OR IGNORE INTO doctype_definitions(tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,modified_by,modified_at)
       SELECT ?1,doctype,module,is_custom,is_submittable,is_child,revision,metadata_json,disabled,?2,?3 FROM doctype_definitions WHERE tenant_id='__standard__'`,
    ).bind(tenantId, actor, now).run();
    const formats = await this.db.prepare(
      `INSERT OR IGNORE INTO print_formats(tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at)
       SELECT ?1,name,doc_type,is_default,disabled,revision,format_json,?2,?3 FROM print_formats WHERE tenant_id='__standard__'`,
    ).bind(tenantId, actor, now).run();
    const roles = await this.provisionStandardRoles(tenantId, now);
    return { doctypes: doctypes.meta?.changes ?? 0, print_formats: formats.meta?.changes ?? 0, roles };
  }

  /**
   * Creates every role the standard DocPerms name.
   *
   * Copying the catalogue alone produces a tenant whose Item says "Stock Manager may
   * write" while `roles` holds no such row — and `user_roles_require_role` refuses the
   * grant, so nobody but the System Manager can be given the access the metadata
   * describes. The tenant looks provisioned, the permissions look configured, and the
   * first attempt to staff the warehouse fails on a foreign key.
   *
   * Derived from the metadata rather than from a list kept here, because a list would
   * have to be edited every time a standard doctype names a role it did not name
   * before — and the only symptom of forgetting is, again, a grant that cannot be made.
   */
  private async provisionStandardRoles(tenantId: string, now: string): Promise<number> {
    const rows = await this.db.prepare(
      `SELECT metadata_json FROM doctype_definitions WHERE tenant_id=?1`,
    ).bind(tenantId).all<{ metadata_json: string }>();

    const named = new Set<string>();
    for (const row of rows.results ?? []) {
      let meta: { permissions?: Array<{ role?: unknown }> };
      // A definition that does not parse is not this method's problem to report: it was
      // written by whatever put it there, and failing provisioning over it would leave
      // the tenant with no roles at all rather than with the ones that are readable.
      try { meta = JSON.parse(row.metadata_json) as typeof meta; } catch { continue; }
      for (const permission of meta.permissions ?? []) {
        if (typeof permission.role === "string" && permission.role.trim()) named.add(permission.role.trim());
      }
    }
    if (named.size === 0) return 0;

    const statements = [...named].sort().map((role) => this.db.prepare(
      `INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at) VALUES(?1,?2,1,1,?3)
       ON CONFLICT(tenant_id,role) DO NOTHING`,
    ).bind(tenantId, role, now));
    const results = await this.db.batch(statements);
    return results.reduce((total, result) => total + (result.meta?.changes ?? 0), 0);
  }

  async nextName(tenantId: string, doctype: string, pattern: string, now: string, document: JsonObject = {}): Promise<string> {
    const plan = resolveAutoname({ doctype, pattern, document, now });
    if (plan.kind === "literal") return plan.name;
    if (plan.kind === "prompt") throw errors.validation(`${doctype} requires the caller to supply a name`);
    const value = await this.allocate(tenantId, plan.seriesKey, now);
    return plan.kind === "autoincrement" ? String(value) : formatSeriesName(plan.prefix, plan.digits, value);
  }

  /**
   * Allocates the next value for a series.
   *
   * A single upsert with RETURNING: read-then-write would let two concurrent
   * creates observe the same value and mint the same name, which the unique index
   * on (tenant, doctype, name) would then reject as a spurious duplicate.
   */
  private async allocate(tenantId: string, seriesKey: string, now: string): Promise<number> {
    const row = await this.db.prepare(
      `INSERT INTO naming_series(tenant_id,series_key,current_value,modified_at) VALUES(?1,?2,1,?3)
       ON CONFLICT(tenant_id,series_key) DO UPDATE SET current_value=current_value+1,modified_at=excluded.modified_at
       RETURNING current_value`,
    ).bind(tenantId, seriesKey, now).first<{ current_value: number }>();
    if (!row) throw new Error("Unable to allocate naming series");
    return row.current_value;
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
  async listWorkflowDocTypes(tenantId: string): Promise<string[]> {
    return [...this.workflows.entries()]
      .filter(([key, workflow]) => key.startsWith(`${tenantId}:`) && workflow.is_active)
      .map(([, workflow]) => workflow.document_type)
      .sort();
  }
  async putWorkflow(tenantId: string, workflow: WorkflowMeta): Promise<WorkflowMeta> { this.workflows.set(this.key(tenantId, workflow.document_type), structuredClone(workflow)); return structuredClone(workflow); }
  async getPrintFormat(tenantId: string, doctype: string, name?: string): Promise<PrintFormatMeta | null> {
    const formats = await this.listPrintFormats(tenantId, doctype);
    return structuredClone(name
      ? formats.find((format) => format.name === name) ?? null
      : formats.find((format) => format.is_default) ?? formats[0] ?? null);
  }
  async listPrintFormats(tenantId: string, doctype: string): Promise<PrintFormatMeta[]> {
    return [...this.formats.entries()]
      .filter(([key, format]) => key.startsWith(`${tenantId}:`) && format.doc_type === doctype && !format.disabled)
      .map(([, format]) => structuredClone(format))
      .sort((left, right) => Number(Boolean(right.is_default)) - Number(Boolean(left.is_default)) || left.name.localeCompare(right.name));
  }
  async putPrintFormat(tenantId: string, format: PrintFormatMeta): Promise<PrintFormatMeta> { this.formats.set(this.key(tenantId, format.name), structuredClone(format)); return structuredClone(format); }
  async provisionStandardCatalog(_tenantId: string, _actor: string, _now: string): Promise<{ doctypes: number; print_formats: number; roles: number }> { return { doctypes: 0, print_formats: 0, roles: 0 }; }
  
  // Resolution is shared with the D1 store so both allocate identical names; only
  // the counter storage differs.
  async nextName(tenantId: string, doctype: string, pattern: string, now: string, document: JsonObject = {}): Promise<string> {
    const plan = resolveAutoname({ doctype, pattern, document, now });
    if (plan.kind === "literal") return plan.name;
    if (plan.kind === "prompt") throw errors.validation(`${doctype} requires the caller to supply a name`);
    const key = this.key(tenantId, plan.seriesKey);
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return plan.kind === "autoincrement" ? String(next) : formatSeriesName(plan.prefix, plan.digits, next);
  }
}

export function metadataSummary(meta: DocTypeMeta): JsonObject {
  return { name: meta.name, module: meta.module, custom: Boolean(meta.custom), is_submittable: Boolean(meta.is_submittable), revision: meta.revision, title_field: meta.title_field ?? null };
}
