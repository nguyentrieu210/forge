/**
 * Atomic tenant access-administration mutations.
 *
 * This service owns writes that must update credentials, grants, session epochs
 * and the append-only RBAC audit ledger in one D1 batch. It deliberately never
 * serializes password hashes, tokens, cookies or trusted identity envelopes.
 */

import type { JsonObject } from "../../contracts/src/index.js";
import { errors, randomId } from "../../core/src/index.js";

export interface RbacAuditContext {
  actorUserId: string;
  traceId: string;
  source: string;
  reason?: string;
}

export interface CreateAccessUserInput {
  userId: string;
  fullName: string;
  email: string;
  enabled: boolean;
  userType: "System User" | "Website User";
  passwordHash: string;
  language?: string;
  timeZone?: string;
}

export interface UserPermissionMutationInput {
  user: string;
  allowDoctype: string;
  allowName: string;
  applicableForDoctype?: string;
  isDefault: boolean;
  hideDescendants: boolean;
  createdBy: string;
}

interface UserSnapshot {
  user_id: string;
  enabled: number;
  session_epoch: number;
}

interface UserPermissionSnapshot {
  user: string;
  allow_doctype: string;
  allow_name: string;
  applicable_for_doctype: string;
  is_default: number;
  hide_descendants: number;
}

const TENANT_ADMIN_ROLES = new Set(["Administrator", "System Manager"]);

export class D1RbacAdministrationService {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async createUserWithRoles(
    tenantId: string,
    input: CreateAccessUserInput,
    roles: string[],
    audit: RbacAuditContext,
    now: string,
  ): Promise<string[]> {
    if (await this.getUser(tenantId, input.userId)) {
      throw errors.validation(`User already exists: ${input.userId}`);
    }
    const normalizedRoles = normalizeRoles(roles);
    await this.assertRolesExist(tenantId, normalizedRoles);

    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `INSERT INTO users(
           tenant_id,user_id,full_name,email,enabled,user_type,password_hash,
           language,time_zone,created_at,modified_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`,
      ).bind(
        tenantId,
        input.userId,
        input.fullName,
        input.email,
        input.enabled ? 1 : 0,
        input.userType,
        input.passwordHash,
        input.language ?? "",
        input.timeZone ?? "",
        now,
      ),
    ];
    for (const role of normalizedRoles) {
      statements.push(
        this.db.prepare(`INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?1,?2,?3)`)
          .bind(tenantId, input.userId, role),
      );
    }
    statements.push(this.auditStatement(
      tenantId,
      "user.create",
      input.userId,
      null,
      {
        user_id: input.userId,
        full_name: input.fullName,
        email: input.email,
        enabled: input.enabled,
        user_type: input.userType,
        roles: normalizedRoles,
      },
      audit,
      now,
    ));
    await this.db.batch(statements);
    return normalizedRoles;
  }

  async replaceRoles(
    tenantId: string,
    userId: string,
    roles: string[],
    audit: RbacAuditContext,
    now: string,
  ): Promise<string[]> {
    const user = await this.requireUser(tenantId, userId);
    const beforeRoles = await this.listRoles(tenantId, userId);
    const afterRoles = normalizeRoles(roles);
    await this.assertRolesExist(tenantId, afterRoles);

    if (
      Boolean(user.enabled)
      && isTenantSuperadmin(userId, beforeRoles)
      && !isTenantSuperadmin(userId, afterRoles)
      && await this.countEnabledTenantSuperadmins(tenantId) <= 1
    ) {
      throw errors.validation("Không thể tước quyền quản trị của quản trị viên tenant cuối cùng.");
    }

    const beforeSet = new Set(beforeRoles);
    const afterSet = new Set(afterRoles);
    const additions = afterRoles.filter((role) => !beforeSet.has(role));
    const removals = beforeRoles.filter((role) => !afterSet.has(role));
    const statements: D1PreparedStatement[] = [];

    // Add first so a last-admin database trigger permits an admin-role transition
    // such as System Manager -> Administrator in the same transaction.
    for (const role of additions) {
      statements.push(
        this.db.prepare(`INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?1,?2,?3)`)
          .bind(tenantId, userId, role),
      );
    }
    for (const role of removals) {
      statements.push(
        this.db.prepare(`DELETE FROM user_roles WHERE tenant_id=?1 AND user_id=?2 AND role=?3`)
          .bind(tenantId, userId, role),
      );
    }
    statements.push(
      this.db.prepare(`UPDATE users SET modified_at=?3 WHERE tenant_id=?1 AND user_id=?2`)
        .bind(tenantId, userId, now),
      this.auditStatement(
        tenantId,
        "roles.replace",
        userId,
        { roles: beforeRoles },
        { roles: afterRoles },
        audit,
        now,
      ),
    );
    await this.db.batch(statements);
    return afterRoles;
  }

  async setUserEnabled(
    tenantId: string,
    userId: string,
    enabled: boolean,
    audit: RbacAuditContext,
    now: string,
  ): Promise<void> {
    const user = await this.requireUser(tenantId, userId);
    if (!enabled && userId === audit.actorUserId) {
      throw errors.validation("Không tự khoá tài khoản của chính mình.");
    }
    const roles = await this.listRoles(tenantId, userId);
    if (
      !enabled
      && Boolean(user.enabled)
      && isTenantSuperadmin(userId, roles)
      && await this.countEnabledTenantSuperadmins(tenantId) <= 1
    ) {
      throw errors.validation("Không thể khoá quản trị viên tenant cuối cùng.");
    }

    await this.db.batch([
      this.db.prepare(
        `UPDATE users
            SET enabled=?3,session_epoch=session_epoch+1,modified_at=?4
          WHERE tenant_id=?1 AND user_id=?2`,
      ).bind(tenantId, userId, enabled ? 1 : 0, now),
      this.auditStatement(
        tenantId,
        enabled ? "user.enable" : "user.disable",
        userId,
        { enabled: Boolean(user.enabled), roles },
        { enabled, roles },
        audit,
        now,
      ),
    ]);
  }

  async updatePasswordAndRevoke(
    tenantId: string,
    userId: string,
    passwordHash: string,
    eventType: "password.change" | "password.reset",
    audit: RbacAuditContext,
    now: string,
  ): Promise<number> {
    const user = await this.requireUser(tenantId, userId);
    await this.db.batch([
      this.db.prepare(
        `UPDATE users
            SET password_hash=?3,session_epoch=session_epoch+1,modified_at=?4
          WHERE tenant_id=?1 AND user_id=?2`,
      ).bind(tenantId, userId, passwordHash, now),
      this.auditStatement(
        tenantId,
        eventType,
        userId,
        { session_epoch: user.session_epoch },
        { credential_changed: true, sessions_revoked: true },
        audit,
        now,
      ),
    ]);
    return user.session_epoch + 1;
  }

  async revokeSessions(
    tenantId: string,
    userId: string,
    audit: RbacAuditContext,
    now: string,
  ): Promise<number> {
    const user = await this.requireUser(tenantId, userId);
    await this.db.batch([
      this.db.prepare(
        `UPDATE users
            SET session_epoch=session_epoch+1,modified_at=?3
          WHERE tenant_id=?1 AND user_id=?2`,
      ).bind(tenantId, userId, now),
      this.auditStatement(
        tenantId,
        "session.revoke",
        userId,
        { session_epoch: user.session_epoch },
        { sessions_revoked: true },
        audit,
        now,
      ),
    ]);
    return user.session_epoch + 1;
  }

  async putUserPermission(
    tenantId: string,
    input: UserPermissionMutationInput,
    audit: RbacAuditContext,
    now: string,
  ): Promise<void> {
    const applicableFor = input.applicableForDoctype ?? "";
    const before = await this.db.prepare(
      `SELECT user,allow_doctype,allow_name,applicable_for_doctype,is_default,hide_descendants
         FROM user_permissions
        WHERE tenant_id=?1 AND user=?2 AND allow_doctype=?3 AND allow_name=?4
          AND applicable_for_doctype=?5`,
    ).bind(tenantId, input.user, input.allowDoctype, input.allowName, applicableFor)
      .first<UserPermissionSnapshot>();
    const after = permissionAuditShape({
      user: input.user,
      allow_doctype: input.allowDoctype,
      allow_name: input.allowName,
      applicable_for_doctype: applicableFor,
      is_default: input.isDefault ? 1 : 0,
      hide_descendants: input.hideDescendants ? 1 : 0,
    });
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO user_permissions(
           tenant_id,user,allow_doctype,allow_name,applicable_for_doctype,
           is_default,hide_descendants,created_by,created_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(tenant_id,user,allow_doctype,allow_name,applicable_for_doctype)
         DO UPDATE SET
           is_default=excluded.is_default,
           hide_descendants=excluded.hide_descendants,
           created_by=excluded.created_by,
           created_at=excluded.created_at`,
      ).bind(
        tenantId,
        input.user,
        input.allowDoctype,
        input.allowName,
        applicableFor,
        input.isDefault ? 1 : 0,
        input.hideDescendants ? 1 : 0,
        input.createdBy,
        now,
      ),
      this.auditStatement(
        tenantId,
        "user_permission.upsert",
        input.user,
        before ? permissionAuditShape(before) : null,
        after,
        audit,
        now,
      ),
    ]);
  }

  async removeUserPermission(
    tenantId: string,
    input: Pick<UserPermissionMutationInput, "user" | "allowDoctype" | "allowName" | "applicableForDoctype">,
    audit: RbacAuditContext,
    now: string,
  ): Promise<boolean> {
    const applicableFor = input.applicableForDoctype ?? "";
    const before = await this.db.prepare(
      `SELECT user,allow_doctype,allow_name,applicable_for_doctype,is_default,hide_descendants
         FROM user_permissions
        WHERE tenant_id=?1 AND user=?2 AND allow_doctype=?3 AND allow_name=?4
          AND applicable_for_doctype=?5`,
    ).bind(tenantId, input.user, input.allowDoctype, input.allowName, applicableFor)
      .first<UserPermissionSnapshot>();
    if (!before) return false;

    await this.db.batch([
      this.db.prepare(
        `DELETE FROM user_permissions
          WHERE tenant_id=?1 AND user=?2 AND allow_doctype=?3 AND allow_name=?4
            AND applicable_for_doctype=?5`,
      ).bind(tenantId, input.user, input.allowDoctype, input.allowName, applicableFor),
      this.auditStatement(
        tenantId,
        "user_permission.remove",
        input.user,
        permissionAuditShape(before),
        null,
        audit,
        now,
      ),
    ]);
    return true;
  }

  async listRoles(tenantId: string, userId: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT ur.role AS role
         FROM user_roles ur
         JOIN roles r ON r.tenant_id=ur.tenant_id AND r.role=ur.role
        WHERE ur.tenant_id=?1 AND ur.user_id=?2 AND r.disabled=0
        ORDER BY ur.role`,
    ).bind(tenantId, userId).all<{ role: string }>();
    return (result.results ?? []).map((row) => row.role);
  }

  async countEnabledTenantSuperadmins(tenantId: string): Promise<number> {
    const row = await this.db.prepare(
      `SELECT COUNT(*) AS count
         FROM users u
        WHERE u.tenant_id=?1 AND u.enabled=1
          AND (
            u.user_id='Administrator'
            OR EXISTS (
              SELECT 1
                FROM user_roles ur
                JOIN roles r ON r.tenant_id=ur.tenant_id AND r.role=ur.role
               WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id
                 AND ur.role IN ('Administrator','System Manager') AND r.disabled=0
            )
          )`,
    ).bind(tenantId).first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  private async getUser(tenantId: string, userId: string): Promise<UserSnapshot | null> {
    return this.db.prepare(
      `SELECT user_id,enabled,session_epoch FROM users WHERE tenant_id=?1 AND user_id=?2`,
    ).bind(tenantId, userId).first<UserSnapshot>();
  }

  private async requireUser(tenantId: string, userId: string): Promise<UserSnapshot> {
    const user = await this.getUser(tenantId, userId);
    if (!user) throw errors.notFound("User not found");
    return user;
  }

  private async assertRolesExist(tenantId: string, roles: string[]): Promise<void> {
    if (!roles.length) return;
    const placeholders = roles.map((_, index) => `?${index + 2}`).join(",");
    const result = await this.db.prepare(
      `SELECT role FROM roles
        WHERE tenant_id=?1 AND disabled=0 AND role IN (${placeholders})`,
    ).bind(tenantId, ...roles).all<{ role: string }>();
    const available = new Set((result.results ?? []).map((row) => row.role));
    const invalid = roles.filter((role) => !available.has(role));
    if (invalid.length) throw errors.validation(`Unknown or disabled role: ${invalid.join(", ")}`);
  }

  private auditStatement(
    tenantId: string,
    eventType: string,
    targetUserId: string | null,
    before: JsonObject | null,
    after: JsonObject | null,
    audit: RbacAuditContext,
    now: string,
  ): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO rbac_audit_events(
         tenant_id,event_id,event_type,actor_user_id,target_user_id,
         before_json,after_json,reason,source,trace_id,created_at
       ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
    ).bind(
      tenantId,
      randomId("rbac"),
      eventType,
      audit.actorUserId,
      targetUserId,
      JSON.stringify(before),
      JSON.stringify(after),
      audit.reason ?? null,
      audit.source,
      audit.traceId,
      now,
    );
  }
}

function normalizeRoles(roles: string[]): string[] {
  return [...new Set(roles.map((role) => role.trim()).filter(Boolean))].sort();
}

function isTenantSuperadmin(userId: string, roles: string[]): boolean {
  return userId === "Administrator" || roles.some((role) => TENANT_ADMIN_ROLES.has(role));
}

function permissionAuditShape(record: UserPermissionSnapshot): JsonObject {
  return {
    user: record.user,
    allow_doctype: record.allow_doctype,
    allow_name: record.allow_name,
    applicable_for_doctype: record.applicable_for_doctype,
    is_default: Boolean(record.is_default),
    hide_descendants: Boolean(record.hide_descendants),
  };
}
