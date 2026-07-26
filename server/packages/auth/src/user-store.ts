/**
 * Tenant user directory: credentials, role grants and the session epoch.
 *
 * Kept out of the generic `documents` store on purpose. A document row is served
 * to clients by the read APIs, so a credential held there would eventually be
 * handed to a browser; this table is never exposed through a document endpoint.
 */

import { errors } from "../../core/src/index.js";

export interface UserRecord {
  user_id: string;
  full_name: string;
  email: string;
  enabled: boolean;
  user_type: "System User" | "Website User";
  session_epoch: number;
  language: string;
  time_zone: string;
}

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  enabled: number;
  user_type: string;
  password_hash: string;
  session_epoch: number;
  language: string;
  time_zone: string;
}

export interface AuthenticatedUser extends UserRecord {
  roles: string[];
}

export class D1UserStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    // Authentication must never read a stale replica: a just-revoked session or a
    // just-changed password has to take effect immediately.
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async findByLogin(tenantId: string, login: string): Promise<{ user: UserRecord; passwordHash: string } | null> {
    const normalized = login.trim().toLowerCase();
    const row = await this.db.prepare(
      `SELECT user_id, full_name, email, enabled, user_type, password_hash, session_epoch, language, time_zone
       FROM users
       WHERE tenant_id=?1 AND (LOWER(user_id)=?2 OR LOWER(email)=?2)
       LIMIT 1`,
    ).bind(tenantId, normalized).first<UserRow>();
    if (!row) return null;
    return { user: toRecord(row), passwordHash: row.password_hash };
  }

  async get(tenantId: string, userId: string): Promise<UserRecord | null> {
    const row = await this.db.prepare(
      `SELECT user_id, full_name, email, enabled, user_type, password_hash, session_epoch, language, time_zone
       FROM users WHERE tenant_id=?1 AND user_id=?2`,
    ).bind(tenantId, userId).first<UserRow>();
    return row ? toRecord(row) : null;
  }

  async listRoles(tenantId: string, userId: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT ur.role AS role FROM user_roles ur
       JOIN roles r ON r.tenant_id=ur.tenant_id AND r.role=ur.role
       WHERE ur.tenant_id=?1 AND ur.user_id=?2 AND r.disabled=0
       ORDER BY ur.role`,
    ).bind(tenantId, userId).all<{ role: string }>();
    return (result.results ?? []).map((row) => row.role);
  }

  /**
   * Confirms a session is still valid for its user.
   *
   * A signed token proves only that WE issued it. Between issuing and use the
   * account may have been disabled, or the epoch bumped by a password change or
   * a "log out everywhere" — so every request re-checks, and any mismatch is
   * treated as no session at all.
   */
  async assertSessionStillValid(tenantId: string, userId: string, epoch: number): Promise<AuthenticatedUser> {
    const user = await this.get(tenantId, userId);
    if (!user) throw errors.authentication("Session user no longer exists");
    if (!user.enabled) throw errors.authentication("Account is disabled");
    if (user.session_epoch !== epoch) throw errors.authentication("Session has been revoked");
    return { ...user, roles: await this.listRoles(tenantId, userId) };
  }

  async recordLogin(tenantId: string, userId: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE users SET last_login_at=?3 WHERE tenant_id=?1 AND user_id=?2`)
      .bind(tenantId, userId, now).run();
  }

  /** Invalidates every outstanding session for the user by bumping the epoch. */
  async bumpSessionEpoch(tenantId: string, userId: string, now: string): Promise<number> {
    const row = await this.db.prepare(
      `UPDATE users SET session_epoch=session_epoch+1, modified_at=?3
       WHERE tenant_id=?1 AND user_id=?2 RETURNING session_epoch`,
    ).bind(tenantId, userId, now).first<{ session_epoch: number }>();
    if (!row) throw errors.notFound("User not found");
    return row.session_epoch;
  }

  async upsert(tenantId: string, input: {
    userId: string;
    fullName?: string;
    email?: string;
    enabled?: boolean;
    userType?: "System User" | "Website User";
    passwordHash?: string;
    language?: string;
    timeZone?: string;
  }, now: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO users(tenant_id,user_id,full_name,email,enabled,user_type,password_hash,language,time_zone,created_at,modified_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
       ON CONFLICT(tenant_id,user_id) DO UPDATE SET
         full_name=excluded.full_name,
         email=excluded.email,
         enabled=excluded.enabled,
         user_type=excluded.user_type,
         -- An empty hash means "leave the credential alone", so a profile update
         -- can never silently clear someone's password.
         password_hash=CASE WHEN excluded.password_hash='' THEN users.password_hash ELSE excluded.password_hash END,
         language=excluded.language,
         time_zone=excluded.time_zone,
         modified_at=excluded.modified_at`,
    ).bind(
      tenantId, input.userId, input.fullName ?? "", input.email ?? input.userId,
      input.enabled === false ? 0 : 1, input.userType ?? "System User",
      input.passwordHash ?? "", input.language ?? "", input.timeZone ?? "", now,
    ).run();
  }

  /**
   * Replaces a user's role grants.
   *
   * A password change is not required for this to take effect immediately: the
   * roles are read fresh on every request, so a revoked role stops applying at
   * once rather than when the session expires.
   */
  async setRoles(tenantId: string, userId: string, roles: string[], now: string): Promise<string[]> {
    const unique = [...new Set(roles.map((role) => role.trim()).filter(Boolean))];
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`DELETE FROM user_roles WHERE tenant_id=?1 AND user_id=?2`).bind(tenantId, userId),
    ];
    for (const role of unique) {
      // The role must already exist; the storage trigger enforces this so a typo
      // cannot create a grant that matches no DocPerm.
      statements.push(this.db.prepare(
        `INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?1,?2,?3)`,
      ).bind(tenantId, userId, role));
    }
    statements.push(this.db.prepare(`UPDATE users SET modified_at=?3 WHERE tenant_id=?1 AND user_id=?2`).bind(tenantId, userId, now));
    await this.db.batch(statements);
    return unique;
  }

  async ensureRole(tenantId: string, role: string, now: string, options?: { deskAccess?: boolean; isStandard?: boolean }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at) VALUES(?1,?2,?3,?4,?5)
       ON CONFLICT(tenant_id,role) DO NOTHING`,
    ).bind(tenantId, role, options?.deskAccess === false ? 0 : 1, options?.isStandard ? 1 : 0, now).run();
  }

  async listAllRoles(tenantId: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT role FROM roles WHERE tenant_id=?1 AND disabled=0 ORDER BY role`,
    ).bind(tenantId).all<{ role: string }>();
    return (result.results ?? []).map((row) => row.role);
  }
}

function toRecord(row: UserRow): UserRecord {
  return {
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    enabled: row.enabled === 1,
    user_type: row.user_type === "Website User" ? "Website User" : "System User",
    session_epoch: row.session_epoch,
    language: row.language,
    time_zone: row.time_zone,
  };
}
