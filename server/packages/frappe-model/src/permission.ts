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
}

export class D1DocumentAccessStore implements DocumentAccessStore {
  private readonly db: D1Database | D1DatabaseSession;
  private readonly shareCache = new Map<string, Promise<ShareGrant | null>>();
  private readonly anyShareCache = new Map<string, Promise<boolean>>();
  private readonly userPermissionCache = new Map<string, Promise<UserPermissionRecord[]>>();
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
      await this.assertUserPermissions(request, meta);
      this.assertFieldPermissions(request, meta, false);
      return;
    }

    if (request.name && this.access) {
      const share = await this.access.getShare(tenantId, request.doctype, request.name, request.actor.user_id);
      if (shareSupports(share, request.action)) {
        await this.assertUserPermissions(request, meta);
        this.assertFieldPermissions(request, meta, Boolean(share?.write));
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
    const direct = this.directReadMode(meta, actor, doctype);
    const shared = this.access ? await this.access.hasAnyShare(tenantId, doctype, actor.user_id) : false;
    if (!direct && !shared) throw errors.permission(`Role is not allowed to read ${doctype}`);
    const mode = direct === "all" ? "all" : direct === "owner" && shared ? "owner_or_shared" : direct === "owner" ? "owner" : "shared";
    return { mode, actor_user_id: actor.user_id, user_permissions: await this.userPermissionConstraints(tenantId, actor, doctype, meta) };
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

  private async assertUserPermissions(request: DocumentPermissionRequest, meta: DocTypeMeta | null): Promise<void> {
    if (!request.data || !this.access || isAdmin(request.actor)) return;
    const constraints = await this.userPermissionConstraints(request.tenantId!, request.actor, request.doctype, meta);
    if (!matchesUserPermissionConstraints(request.data, constraints)) throw errors.permission("Document is outside the user's permitted values");
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
