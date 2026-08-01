import type { Actor, CanonicalDocument, JsonObject, JsonValue, MutationAction } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { PermissionRequest } from "../../policy/src/index.js";
import { PermissionService, hasStaticPermissionDefinition } from "../../policy/src/index.js";
import type { MetadataStore } from "./store.js";
import type { DocFieldMeta, DocPermissionMeta, DocTypeMeta, ShareRecord, UserPermissionRecord } from "./types.js";

export type ExtendedPermissionAction = MutationAction | "read" | "print" | "email" | "report" | "import" | "export" | "share" | "amend";

export interface DocumentPermissionRequest extends PermissionRequest {
  tenantId?: string;
  name?: string;
  data?: JsonObject;
  existingData?: JsonObject;
  action: ExtendedPermissionAction;
}

export interface ShareGrant {
  read: boolean;
  write: boolean;
  share: boolean;
}

export interface UserPermissionConstraint {
  allow_doctype: string;
  fields: string[];
  allowed_values: string[];
}

/** Effective organization scope projected from submitted Organization Assignment docs. */
export interface OrganizationScopeGrant {
  assignment_name: string;
  user_id: string;
  allow_doctype: "Company" | "Branch" | "Department";
  allow_name: string;
  effective_from: string;
  effective_to: string | null;
}

/** Published, versioned policy. Static DocPerm remains the grant ceiling. */
export interface EffectiveRolePolicy {
  name: string;
  role: string;
  resource: string;
  actions: string[];
  row_rule: JsonObject;
  field_rule: JsonObject;
}

export interface ReadAccessScope {
  mode: "all" | "owner" | "shared" | "owner_or_shared";
  actor_user_id: string;
  user_permissions: UserPermissionConstraint[];
}

export interface DocumentAccessStore {
  getShare(tenantId: string, doctype: string, name: string, user: string): Promise<ShareGrant | null>;
  hasAnyShare(tenantId: string, doctype: string, user: string): Promise<boolean>;
  listUserPermissions(tenantId: string, user: string, applicableForDoctype?: string): Promise<UserPermissionRecord[]>;
  putUserPermission?(tenantId: string, record: UserPermissionRecord): Promise<UserPermissionRecord>;
  deleteUserPermission?(tenantId: string, user: string, allowDoctype: string, allowName: string, applicableForDoctype: string): Promise<void>;
  listOrganizationScopes?(tenantId: string, user: string): Promise<OrganizationScopeGrant[]>;
  listRolePolicies?(tenantId: string, roles: string[], resource: string): Promise<EffectiveRolePolicy[]>;
}

export class D1DocumentAccessStore implements DocumentAccessStore {
  private readonly db: D1Database | D1DatabaseSession;
  private readonly shareCache = new Map<string, Promise<ShareGrant | null>>();
  private readonly anyShareCache = new Map<string, Promise<boolean>>();
  private readonly userPermissionCache = new Map<string, Promise<UserPermissionRecord[]>>();
  private readonly organizationScopeCache = new Map<string, Promise<OrganizationScopeGrant[]>>();
  private readonly rolePolicyCache = new Map<string, Promise<EffectiveRolePolicy[]>>();
  constructor(db: D1Database) { this.db = db.withSession?.("first-primary") ?? db; }

  async getShare(tenantId: string, doctype: string, name: string, user: string): Promise<ShareGrant | null> {
    const key = [tenantId, doctype, name, user].join("\u0000");
    return this.memo(this.shareCache, key, async () => {
      const row = await this.db.prepare(
        `SELECT can_read,can_write,can_share FROM document_shares WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND user=?4`,
      ).bind(tenantId, doctype, name, user).first<{ can_read: number; can_write: number; can_share: number }>();
      return row ? { read: row.can_read === 1, write: row.can_write === 1, share: row.can_share === 1 } : null;
    });
  }

  async hasAnyShare(tenantId: string, doctype: string, user: string): Promise<boolean> {
    const key = [tenantId, doctype, user].join("\u0000");
    return this.memo(this.anyShareCache, key, async () => {
      const row = await this.db.prepare(
        `SELECT 1 AS found FROM document_shares WHERE tenant_id=?1 AND doctype=?2 AND user=?3 AND can_read=1 LIMIT 1`,
      ).bind(tenantId, doctype, user).first<{ found: number }>();
      return row?.found === 1;
    });
  }

  async listUserPermissions(tenantId: string, user: string, applicableForDoctype?: string): Promise<UserPermissionRecord[]> {
    const key = [tenantId, user, applicableForDoctype ?? "*"].join("\u0000");
    return this.memo(this.userPermissionCache, key, async () => {
      const result = applicableForDoctype
        ? await this.db.prepare(
          `SELECT user,allow_doctype,allow_name,applicable_for_doctype,is_default,hide_descendants,created_by,created_at
           FROM user_permissions WHERE tenant_id=?1 AND user=?2 AND (applicable_for_doctype='' OR applicable_for_doctype=?3)
           ORDER BY allow_doctype,allow_name`,
        ).bind(tenantId, user, applicableForDoctype).all<UserPermissionRecord>()
        : await this.db.prepare(
          `SELECT user,allow_doctype,allow_name,applicable_for_doctype,is_default,hide_descendants,created_by,created_at
           FROM user_permissions WHERE tenant_id=?1 AND user=?2 ORDER BY applicable_for_doctype,allow_doctype,allow_name`,
        ).bind(tenantId, user).all<UserPermissionRecord>();
      return (result.results ?? []).map((row) => ({ ...row, is_default: Boolean(row.is_default), hide_descendants: Boolean(row.hide_descendants) }));
    });
  }

  async putUserPermission(tenantId: string, record: UserPermissionRecord): Promise<UserPermissionRecord> {
    await this.db.prepare(
      `INSERT INTO user_permissions(tenant_id,user,allow_doctype,allow_name,applicable_for_doctype,is_default,hide_descendants,created_by,created_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(tenant_id,user,allow_doctype,allow_name,applicable_for_doctype)
       DO UPDATE SET is_default=excluded.is_default,hide_descendants=excluded.hide_descendants,created_by=excluded.created_by,created_at=excluded.created_at`,
    ).bind(tenantId, record.user, record.allow_doctype, record.allow_name, record.applicable_for_doctype,
      record.is_default ? 1 : 0, record.hide_descendants ? 1 : 0, record.created_by, record.created_at).run();
    this.invalidateUserPermissions(tenantId, record.user);
    return record;
  }

  async deleteUserPermission(tenantId: string, user: string, allowDoctype: string, allowName: string, applicableForDoctype: string): Promise<void> {
    await this.db.prepare(
      `DELETE FROM user_permissions WHERE tenant_id=?1 AND user=?2 AND allow_doctype=?3 AND allow_name=?4 AND applicable_for_doctype=?5`,
    ).bind(tenantId, user, allowDoctype, allowName, applicableForDoctype).run();
    this.invalidateUserPermissions(tenantId, user);
  }

  async listOrganizationScopes(tenantId: string, user: string): Promise<OrganizationScopeGrant[]> {
    const key = [tenantId, user].join("\u0000");
    return this.memo(this.organizationScopeCache, key, async () => {
      const result = await this.db.prepare(
        `SELECT assignment_name,user_id,allow_doctype,allow_name,effective_from,effective_to
         FROM erp_organization_scope_grants
         WHERE tenant_id=?1 AND user_id=?2
           AND date(effective_from)<=date('now')
           AND (effective_to IS NULL OR date(effective_to)>=date('now'))
         ORDER BY allow_doctype,allow_name,assignment_name`,
      ).bind(tenantId, user).all<OrganizationScopeGrant>();
      return result.results ?? [];
    });
  }

  async listRolePolicies(tenantId: string, roles: string[], resource: string): Promise<EffectiveRolePolicy[]> {
    if (!roles.length) return [];
    const normalizedRoles = [...new Set(roles)].sort();
    const key = [tenantId, normalizedRoles.join(","), resource].join("\u0000");
    return this.memo(this.rolePolicyCache, key, async () => {
      const placeholders = normalizedRoles.map((_role, index) => `?${index + 3}`).join(",");
      const result = await this.db.prepare(
        `SELECT name,payload_json
         FROM documents
         WHERE tenant_id=?1 AND doctype='Role Policy' AND docstatus=1
           AND json_extract(payload_json,'$.workflow_state')='Published'
           AND json_extract(payload_json,'$.resource')=?2
           AND json_extract(payload_json,'$.role') IN (${placeholders})
         ORDER BY CAST(json_extract(payload_json,'$.version_no') AS INTEGER) DESC,name`,
      ).bind(tenantId, resource, ...normalizedRoles).all<{ name: string; payload_json: string }>();
      const policies: EffectiveRolePolicy[] = [];
      for (const row of result.results ?? []) {
        const data = JSON.parse(row.payload_json) as JsonObject;
        const actions = Array.isArray(data.actions_json)
          ? data.actions_json.filter((value): value is string => typeof value === "string")
          : [];
        policies.push({
          name: row.name,
          role: typeof data.role === "string" ? data.role : "",
          resource: typeof data.resource === "string" ? data.resource : resource,
          actions,
          row_rule: isJsonObject(data.row_rule_json) ? data.row_rule_json : {},
          field_rule: isJsonObject(data.field_rule_json) ? data.field_rule_json : {},
        });
      }
      return policies;
    });
  }

  private async memo<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>): Promise<T> {
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = loader();
    cache.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }

  private invalidateUserPermissions(tenantId: string, user: string): void {
    const prefix = `${tenantId}\u0000${user}\u0000`;
    for (const key of this.userPermissionCache.keys()) {
      if (key.startsWith(prefix)) this.userPermissionCache.delete(key);
    }
    this.organizationScopeCache.delete([tenantId, user].join("\u0000"));
  }
}

export class MetadataPermissionService {
  private readonly readScopeCache = new Map<string, Promise<ReadAccessScope>>();
  private readScopeCacheHits = 0;
  private readScopeCacheMisses = 0;

  constructor(
    private readonly metadata: MetadataStore,
    private readonly base = new PermissionService(),
    private readonly access?: DocumentAccessStore,
  ) {}

  async assert(request: DocumentPermissionRequest): Promise<void> {
    if (isAdmin(request.actor)) return;
    const tenantId = request.tenantId;
    if (!tenantId) throw errors.permission();
    const meta = await this.metadata.getDocType(tenantId, request.doctype);

    if (this.hasDirectPermission(meta, request)) {
      const policies = await this.assertRolePolicy(request);
      await this.assertScopedPermissions(request, meta);
      this.assertFieldPermissions(request, meta, false);
      this.assertPolicyFieldPermissions(request, policies);
      return;
    }

    if (request.name && this.access) {
      const share = await this.access.getShare(tenantId, request.doctype, request.name, request.actor.user_id);
      if (shareSupports(share, request.action)) {
        const policies = await this.assertRolePolicy(request);
        await this.assertScopedPermissions(request, meta);
        this.assertFieldPermissions(request, meta, Boolean(share?.write));
        this.assertPolicyFieldPermissions(request, policies);
        return;
      }
    }
    throw errors.permission(`Role is not allowed to ${request.action} ${request.doctype}`);
  }

  async getReadScope(actor: Actor, tenantId: string, doctype: string): Promise<ReadAccessScope> {
    const key = [tenantId, actor.user_id, [...actor.roles].sort().join(","), doctype].join("\u0000");
    const cached = this.readScopeCache.get(key);
    if (cached) {
      this.readScopeCacheHits += 1;
      return cached;
    }
    this.readScopeCacheMisses += 1;
    const pending = this.resolveReadScope(actor, tenantId, doctype);
    this.readScopeCache.set(key, pending);
    try {
      return await pending;
    } finally {
      // Deduplicate concurrent list/count work only. A share can be granted or
      // revoked by another service instance during this request, so retaining a
      // resolved scope would make authorization stale after the mutation.
      if (this.readScopeCache.get(key) === pending) this.readScopeCache.delete(key);
    }
  }

  private async resolveReadScope(actor: Actor, tenantId: string, doctype: string): Promise<ReadAccessScope> {
    if (isAdmin(actor)) return { mode: "all", actor_user_id: actor.user_id, user_permissions: [] };
    const meta = await this.metadata.getDocType(tenantId, doctype);
    let direct = this.directReadMode(meta, actor, doctype);
    const policies = await this.rolePolicies(tenantId, actor, doctype);
    if (policies.length && !policies.some((policy) => policyAllows(policy, "read", doctype))) direct = null;
    const shared = this.access ? await this.access.hasAnyShare(tenantId, doctype, actor.user_id) : false;
    if (!direct && !shared) throw errors.permission(`Role is not allowed to read ${doctype}`);
    const mode = direct === "all" ? "all" : direct === "owner" && shared ? "owner_or_shared" : direct === "owner" ? "owner" : "shared";
    return { mode, actor_user_id: actor.user_id, user_permissions: await this.scopedPermissionConstraints(tenantId, actor, doctype, meta, policies) };
  }

  cacheStats(): { hits: number; misses: number } {
    return { hits: this.readScopeCacheHits, misses: this.readScopeCacheMisses };
  }

  async canReadDocument(actor: Actor, tenantId: string, document: CanonicalDocument<JsonObject>): Promise<boolean> {
    try {
      await this.assert({ actor, tenantId, doctype: document.doctype, name: document.name, owner: document.owner, data: document.data, action: "read" });
      return true;
    } catch { return false; }
  }

  readablePermlevels(meta: DocTypeMeta, actor: Actor, owner?: string, shared = false): Set<number> {
    if (isAdmin(actor)) return new Set(Array.from({ length: 10 }, (_, index) => index));
    const levels = new Set<number>();
    for (const permission of meta.permissions) {
      if (!permission.read || !actor.roles.includes(permission.role)) continue;
      if (permission.if_owner && owner !== actor.user_id) continue;
      levels.add(permission.permlevel ?? 0);
    }
    if (shared) levels.add(0);
    return levels;
  }

  writablePermlevels(meta: DocTypeMeta, actor: Actor, action: "create" | "save", owner?: string, sharedWrite = false): Set<number> {
    if (isAdmin(actor)) return new Set(Array.from({ length: 10 }, (_, index) => index));
    const levels = new Set<number>();
    for (const permission of meta.permissions) {
      if (!actor.roles.includes(permission.role)) continue;
      if (permission.if_owner && owner !== actor.user_id) continue;
      const allowed = action === "create" ? permission.create || permission.write : permission.write;
      if (allowed) levels.add(permission.permlevel ?? 0);
    }
    if (sharedWrite) levels.add(0);
    return levels;
  }

  filterMetaForActor(
    meta: DocTypeMeta,
    actor: Actor,
    owner?: string,
    sharedRead = false,
    writeContext?: { action: "create" | "save"; sharedWrite?: boolean },
  ): DocTypeMeta {
    const readable = this.readablePermlevels(meta, actor, owner, sharedRead);
    const writable = writeContext
      ? this.writablePermlevels(meta, actor, writeContext.action, owner, writeContext.sharedWrite === true)
      : new Set<number>();
    return {
      ...structuredClone(meta),
      fields: meta.fields
        .filter((field) => readable.has(field.permlevel ?? 0))
        .map((field) => ({ ...structuredClone(field), read_only: Boolean(field.read_only) || (writeContext ? !writable.has(field.permlevel ?? 0) : false) })),
      permissions: [],
    };
  }

  /** Applies published Role Policy field restrictions on top of static permlevels. */
  async filterMetaForActorWithPolicies(
    tenantId: string,
    meta: DocTypeMeta,
    actor: Actor,
    owner?: string,
    sharedRead = false,
    writeContext?: { action: "create" | "save"; sharedWrite?: boolean },
  ): Promise<DocTypeMeta> {
    const filtered = this.filterMetaForActor(meta, actor, owner, sharedRead, writeContext);
    if (isAdmin(actor)) return filtered;
    const restrictions = fieldRestrictions(await this.rolePolicies(tenantId, actor, meta.name));
    return {
      ...filtered,
      fields: filtered.fields
        .filter((field) => !restrictions.hidden.has(field.fieldname))
        .map((field) => ({ ...field, read_only: Boolean(field.read_only) || restrictions.readOnly.has(field.fieldname) })),
    };
  }

  redactDocument(meta: DocTypeMeta, document: CanonicalDocument<JsonObject>, actor: Actor, shared = false): CanonicalDocument<JsonObject> {
    const levels = this.readablePermlevels(meta, actor, document.owner, shared);
    const allowed = new Set(meta.fields
      // A Password is never readable, by anyone, at any permlevel. Frappe keeps these
      // out of the document entirely, and a field declared `Password` that came back on
      // a read would be a secret handed to every client that can see the record —
      // including its own owner's browser, its print format, and its CSV export.
      .filter((field) => field.fieldtype !== "Password")
      .filter((field) => levels.has(field.permlevel ?? 0))
      .map((field) => field.fieldname));
    const data: JsonObject = {};
    for (const [key, value] of Object.entries(document.data)) {
      if (allowed.has(key) || key === "_metadata_revision" || key === "workflow_state") data[key] = structuredClone(value as JsonValue);
    }
    const tableFields = new Set(meta.fields.filter((field) => levels.has(field.permlevel ?? 0) && (field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect")).map((field) => field.fieldname));
    return { ...structuredClone(document), data, children: document.children.filter((row) => tableFields.has(row.fieldname)).map((row) => structuredClone(row)) };
  }

  /** Redacts both static permlevels and dynamic hidden/mask rules before any response leaves the server. */
  async redactDocumentWithPolicies(
    tenantId: string,
    meta: DocTypeMeta,
    document: CanonicalDocument<JsonObject>,
    actor: Actor,
    shared = false,
  ): Promise<CanonicalDocument<JsonObject>> {
    const redacted = this.redactDocument(meta, document, actor, shared);
    if (isAdmin(actor)) return redacted;
    const restrictions = fieldRestrictions(await this.rolePolicies(tenantId, actor, meta.name));
    if (!restrictions.hidden.size) return redacted;
    const data = { ...redacted.data };
    for (const fieldname of restrictions.hidden) delete data[fieldname];
    const children = redacted.children.filter((row) => !restrictions.hidden.has(row.fieldname));
    return { ...redacted, data, children };
  }

  private hasDirectPermission(meta: DocTypeMeta | null, request: DocumentPermissionRequest): boolean {
    if (hasStaticPermissionDefinition(request.doctype) && ["read", "create", "save", "submit", "cancel"].includes(request.action)) {
      try { this.base.assert(request as PermissionRequest); return true; } catch { /* metadata/share fallback */ }
    }
    if (!meta) return false;
    return meta.permissions.some((permission) => permissionAllows(permission, request.actor, request.action, request.owner));
  }

  private directReadMode(meta: DocTypeMeta | null, actor: Actor, doctype: string): "all" | "owner" | null {
    if (hasStaticPermissionDefinition(doctype)) {
      try { this.base.assert({ actor, doctype, action: "read" }); return "all"; } catch { /* metadata may still grant */ }
    }
    if (!meta) return null;
    let owner = false;
    for (const permission of meta.permissions) {
      if (!permission.read || !actor.roles.includes(permission.role)) continue;
      if (!permission.if_owner) return "all";
      owner = true;
    }
    return owner ? "owner" : null;
  }

  private assertFieldPermissions(request: DocumentPermissionRequest, meta: DocTypeMeta | null, sharedWrite: boolean): void {
    if (!meta || !request.data || (request.action !== "create" && request.action !== "save") || isAdmin(request.actor)) return;
    const levels = this.writablePermlevels(meta, request.actor, request.action, request.owner, sharedWrite);
    const fields = new Map(meta.fields.map((field) => [field.fieldname, field]));
    for (const [fieldname, value] of Object.entries(request.data)) {
      if (fieldname.startsWith("_") || fieldname === "workflow_state") continue;
      const field = fields.get(fieldname);
      if (!field) continue;
      const before = request.existingData?.[fieldname];
      if (!sameJsonValue(before, value) && !levels.has(field.permlevel ?? 0)) {
        throw errors.permission(`Field permission denied: ${fieldname}`);
      }
    }
  }

  private async assertScopedPermissions(request: DocumentPermissionRequest, meta: DocTypeMeta | null): Promise<void> {
    if (!request.data || !this.access || isAdmin(request.actor)) return;
    const constraints = await this.scopedPermissionConstraints(request.tenantId!, request.actor, request.doctype, meta);
    if (!matchesUserPermissionConstraints(request.data, constraints)) throw errors.permission("Document is outside the user's permitted values");
  }

  private async assertRolePolicy(request: DocumentPermissionRequest): Promise<EffectiveRolePolicy[]> {
    if (!this.access || isAdmin(request.actor)) return [];
    const policies = await this.rolePolicies(request.tenantId!, request.actor, request.doctype);
    if (policies.length && !policies.some((policy) => policyAllows(policy, request.action, request.doctype))) {
      throw errors.permission(`Published role policy does not allow ${request.action} ${request.doctype}`);
    }
    return policies;
  }

  private assertPolicyFieldPermissions(request: DocumentPermissionRequest, policies: EffectiveRolePolicy[]): void {
    if (!request.data || (request.action !== "create" && request.action !== "save") || !policies.length) return;
    const restrictions = fieldRestrictions(policies);
    for (const [fieldname, value] of Object.entries(request.data)) {
      if (!restrictions.hidden.has(fieldname) && !restrictions.readOnly.has(fieldname)) continue;
      const before = request.existingData?.[fieldname];
      if (!sameJsonValue(before, value)) throw errors.permission(`Role policy field permission denied: ${fieldname}`);
    }
  }

  private async rolePolicies(tenantId: string, actor: Actor, doctype: string): Promise<EffectiveRolePolicy[]> {
    return this.access?.listRolePolicies ? this.access.listRolePolicies(tenantId, actor.roles, doctype) : [];
  }

  private async scopedPermissionConstraints(
    tenantId: string,
    actor: Actor,
    doctype: string,
    meta: DocTypeMeta | null,
    knownPolicies?: EffectiveRolePolicy[],
  ): Promise<UserPermissionConstraint[]> {
    const explicit = await this.userPermissionConstraints(tenantId, actor, doctype, meta);
    if (!meta || !this.access || isAdmin(actor)) return explicit;
    const organization = await this.organizationScopeConstraints(tenantId, actor, meta);
    const policy = rolePolicyConstraints(meta, knownPolicies ?? await this.rolePolicies(tenantId, actor, doctype));
    // Every security layer narrows the preceding one. Keep the three sources as
    // separate AND-ed constraint groups so an organization grant or role policy
    // can never widen an explicit User Permission on the same field.
    return [
      ...mergePermissionConstraints(explicit),
      ...mergePermissionConstraints(organization),
      ...mergePermissionConstraints(policy),
    ];
  }

  private async organizationScopeConstraints(tenantId: string, actor: Actor, meta: DocTypeMeta): Promise<UserPermissionConstraint[]> {
    if (!this.access?.listOrganizationScopes) return [];
    const grants = await this.access.listOrganizationScopes(tenantId, actor.user_id);
    const grouped = new Map<string, Set<string>>();
    for (const grant of grants) {
      const values = grouped.get(grant.allow_doctype) ?? new Set<string>();
      values.add(grant.allow_name);
      grouped.set(grant.allow_doctype, values);
    }
    const constraints: UserPermissionConstraint[] = [];
    for (const [allowDoctype, values] of grouped) {
      const fields = meta.fields.filter((field) => field.fieldtype === "Link" && field.options === allowDoctype).map((field) => field.fieldname);
      // Organization Assignment is a platform scope: a document without this dimension
      // is not accidentally made unreadable. Explicit User Permission keeps its stricter
      // fail-closed behavior in userPermissionConstraints above.
      if (fields.length) constraints.push({ allow_doctype: allowDoctype, fields, allowed_values: [...values] });
    }
    return constraints;
  }

  private async userPermissionConstraints(tenantId: string, actor: Actor, doctype: string, meta: DocTypeMeta | null): Promise<UserPermissionConstraint[]> {
    if (!this.access || isAdmin(actor)) return [];
    const rows = await this.access.listUserPermissions(tenantId, actor.user_id, doctype);
    if (!rows.length) return [];
    if (!meta) throw errors.permission("User permissions require DocType metadata");
    const grouped = new Map<string, Set<string>>();
    for (const row of rows) {
      const values = grouped.get(row.allow_doctype) ?? new Set<string>(); values.add(row.allow_name); grouped.set(row.allow_doctype, values);
    }
    const constraints: UserPermissionConstraint[] = [];
    for (const [allowDoctype, values] of grouped) {
      const fields = meta.fields.filter((field) => field.fieldtype === "Link" && field.options === allowDoctype).map((field) => field.fieldname);
      if (!fields.length) throw errors.permission(`User permission ${allowDoctype} cannot be applied to ${doctype}`);
      constraints.push({ allow_doctype: allowDoctype, fields, allowed_values: [...values] });
    }
    return constraints;
  }
}

function rolePolicyConstraints(meta: DocTypeMeta, policies: EffectiveRolePolicy[]): UserPermissionConstraint[] {
  const constraints: UserPermissionConstraint[] = [];
  for (const policy of policies) {
    const rule = policy.row_rule;
    if (typeof rule.field === "string" && Array.isArray(rule.values)) {
      const field = meta.fields.find((candidate) => candidate.fieldname === rule.field);
      const values = rule.values.filter((value): value is string => typeof value === "string");
      if (field?.fieldtype === "Link" && field.options && values.length) {
        constraints.push({ allow_doctype: field.options, fields: [field.fieldname], allowed_values: values });
      }
    }
    for (const [fieldname, raw] of Object.entries(rule)) {
      if (["field", "operator", "values"].includes(fieldname) || !Array.isArray(raw)) continue;
      const field = meta.fields.find((candidate) => candidate.fieldname === fieldname);
      const values = raw.filter((value): value is string => typeof value === "string");
      if (field?.fieldtype === "Link" && field.options && values.length) {
        constraints.push({ allow_doctype: field.options, fields: [field.fieldname], allowed_values: values });
      }
    }
  }
  return constraints;
}

function mergePermissionConstraints(constraints: UserPermissionConstraint[]): UserPermissionConstraint[] {
  const merged = new Map<string, { allow_doctype: string; fields: Set<string>; values: Set<string> }>();
  for (const constraint of constraints) {
    const key = `${constraint.allow_doctype}\u0000${[...constraint.fields].sort().join(",")}`;
    const current = merged.get(key) ?? { allow_doctype: constraint.allow_doctype, fields: new Set<string>(), values: new Set<string>() };
    constraint.fields.forEach((field) => current.fields.add(field));
    constraint.allowed_values.forEach((value) => current.values.add(value));
    merged.set(key, current);
  }
  return [...merged.values()].map((item) => ({ allow_doctype: item.allow_doctype, fields: [...item.fields], allowed_values: [...item.values] }));
}

function policyAllows(policy: EffectiveRolePolicy, action: ExtendedPermissionAction, doctype: string): boolean {
  const actions = new Set(policy.actions.map((value) => value.trim().toLowerCase()));
  const candidates = new Set<string>([action.toLowerCase()]);
  if (action === "save") candidates.add("write");
  if (action === "submit") {
    candidates.add("approve");
    if (doctype === "Journal Entry") candidates.add("post");
  }
  return [...candidates].some((candidate) => actions.has(candidate));
}

function fieldRestrictions(policies: EffectiveRolePolicy[]): { hidden: Set<string>; readOnly: Set<string> } {
  const hidden = new Set<string>();
  const readOnly = new Set<string>();
  const collect = (target: Set<string>, value: JsonValue | undefined) => {
    if (!Array.isArray(value)) return;
    for (const item of value) if (typeof item === "string" && item.trim()) target.add(item.trim());
  };
  for (const policy of policies) {
    const rule = policy.field_rule;
    collect(hidden, rule.hidden);
    collect(hidden, rule.mask);
    collect(readOnly, rule.read_only);
    collect(readOnly, rule.deny_write);
    for (const [fieldname, mode] of Object.entries(rule)) {
      if (["hidden", "mask", "read_only", "deny_write"].includes(fieldname) || typeof mode !== "string") continue;
      const normalized = mode.trim().toLowerCase().replaceAll("-", "_");
      if (normalized === "hidden" || normalized === "mask") hidden.add(fieldname);
      if (normalized === "read_only" || normalized === "deny_write") readOnly.add(fieldname);
    }
  }
  return { hidden, readOnly };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function permissionAllows(permission: DocPermissionMeta, actor: Actor, action: ExtendedPermissionAction, owner?: string): boolean {
  if (!actor.roles.includes(permission.role)) return false;
  if (permission.if_owner && owner !== actor.user_id) return false;
  const key = action === "save" ? "write" : action;
  return Boolean(permission[key as keyof DocPermissionMeta]);
}

export function canWriteField(meta: DocTypeMeta, field: DocFieldMeta, actor: Actor, action: "create" | "save", owner?: string): boolean {
  if (isAdmin(actor)) return true;
  const level = field.permlevel ?? 0;
  return meta.permissions.some((permission) => {
    if ((permission.permlevel ?? 0) !== level || !actor.roles.includes(permission.role)) return false;
    if (permission.if_owner && owner !== actor.user_id) return false;
    return action === "create" ? Boolean(permission.create || permission.write) : Boolean(permission.write);
  });
}

export function matchesUserPermissionConstraints(data: JsonObject, constraints: UserPermissionConstraint[]): boolean {
  for (const constraint of constraints) {
    const allowed = new Set(constraint.allowed_values);
    if (!constraint.fields.some((field) => {
      const value = data[field];
      return typeof value === "string" && allowed.has(value);
    })) return false;
  }
  return true;
}

function sameJsonValue(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function shareSupports(share: ShareGrant | null, action: ExtendedPermissionAction): boolean {
  if (!share) return false;
  if (action === "read") return share.read;
  if (action === "save") return share.write;
  if (action === "share") return share.share;
  return false;
}

function isAdmin(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("Administrator") || actor.roles.includes("System Manager");
}
