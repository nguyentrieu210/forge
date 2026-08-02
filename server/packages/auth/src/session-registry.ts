import { errors, randomId } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";

export interface RegisteredUserSession extends JsonObject {
  session_id: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  current?: boolean;
}

export interface SessionAuditContext {
  actorUserId: string;
  traceId: string;
  source: string;
  reason?: string;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export class D1SessionRegistry {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async register(
    tenantId: string,
    userId: string,
    sessionId: string,
    issuedAt: string,
    expiresAt: string,
  ): Promise<void> {
    assertSessionId(sessionId);
    assertIso(issuedAt, "issued_at");
    assertIso(expiresAt, "expires_at");
    if (expiresAt <= issuedAt) throw errors.validation("Session expiry must be after issuance");
    await this.db.prepare(
      `INSERT INTO user_sessions(
         tenant_id,session_id,user_id,issued_at,expires_at,last_seen_at
       ) VALUES(?1,?2,?3,?4,?5,?4)`,
    ).bind(tenantId, sessionId, userId, issuedAt, expiresAt).run();
  }

  async assertActive(
    tenantId: string,
    userId: string,
    sessionId: string,
    now: string,
  ): Promise<void> {
    assertSessionId(sessionId);
    assertIso(now, "now");
    const row = await this.db.prepare(
      `SELECT session_id,user_id,issued_at,expires_at,last_seen_at,revoked_at
         FROM user_sessions
        WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3`,
    ).bind(tenantId, sessionId, userId).first<SessionRow>();
    if (!row) throw errors.authentication("Session is no longer registered");
    if (row.revoked_at) throw errors.authentication("Session has been revoked");
    if (row.expires_at <= now) throw errors.authentication("Session has expired");
  }

  async extend(
    tenantId: string,
    userId: string,
    sessionId: string,
    expiresAt: string,
    now: string,
  ): Promise<void> {
    assertSessionId(sessionId);
    assertIso(expiresAt, "expires_at");
    assertIso(now, "now");
    const row = await this.db.prepare(
      `UPDATE user_sessions
          SET expires_at=?4,last_seen_at=?5
        WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3
          AND revoked_at IS NULL AND expires_at>?5
        RETURNING session_id`,
    ).bind(tenantId, sessionId, userId, expiresAt, now).first<{ session_id: string }>();
    if (!row) throw errors.authentication("Session has been revoked or expired");
  }

  async list(
    tenantId: string,
    userId: string,
    now: string,
    currentSessionId?: string,
    limit = 100,
  ): Promise<RegisteredUserSession[]> {
    assertIso(now, "now");
    const bounded = Math.min(Math.max(limit, 1), 250);
    const result = await this.db.prepare(
      `SELECT session_id,user_id,issued_at,expires_at,last_seen_at,revoked_at
         FROM user_sessions
        WHERE tenant_id=?1 AND user_id=?2 AND expires_at>?3
        ORDER BY revoked_at IS NULL DESC,last_seen_at DESC,session_id ASC
        LIMIT ?4`,
    ).bind(tenantId, userId, now, bounded).all<SessionRow>();
    return (result.results ?? []).map((row) => ({
      session_id: row.session_id,
      user_id: row.user_id,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      last_seen_at: row.last_seen_at,
      revoked_at: row.revoked_at,
      ...(currentSessionId && row.session_id === currentSessionId ? { current: true } : {}),
    }));
  }

  /** Normal logout: revoke the exact current session without creating privileged audit noise. */
  async revokeCurrent(
    tenantId: string,
    userId: string,
    sessionId: string,
    now: string,
  ): Promise<void> {
    assertSessionId(sessionId);
    assertIso(now, "now");
    await this.db.prepare(
      `UPDATE user_sessions
          SET revoked_at=COALESCE(revoked_at,?4),revoked_by=COALESCE(revoked_by,?3),
              revoke_reason=COALESCE(revoke_reason,'logout')
        WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3`,
    ).bind(tenantId, sessionId, userId, now).run();
  }

  async revokeOne(
    tenantId: string,
    userId: string,
    sessionId: string,
    audit: SessionAuditContext,
    now: string,
  ): Promise<boolean> {
    assertSessionId(sessionId);
    assertIso(now, "now");
    const target = await this.db.prepare(
      `SELECT session_id,user_id,issued_at,expires_at,last_seen_at,revoked_at
         FROM user_sessions
        WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3`,
    ).bind(tenantId, sessionId, userId).first<SessionRow>();
    if (!target || target.revoked_at) return false;
    await this.db.batch([
      this.db.prepare(
        `UPDATE user_sessions
            SET revoked_at=?4,revoked_by=?5,revoke_reason=?6
          WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3 AND revoked_at IS NULL`,
      ).bind(tenantId, sessionId, userId, now, audit.actorUserId, audit.reason ?? "session manager revoke"),
      this.auditStatement(
        tenantId,
        "session.revoke_one",
        userId,
        { session_id: sessionId, issued_at: target.issued_at, expires_at: target.expires_at },
        { revoked: true },
        audit,
        now,
      ),
    ]);
    return true;
  }

  async revokeOthers(
    tenantId: string,
    userId: string,
    keepSessionId: string | undefined,
    audit: SessionAuditContext,
    now: string,
  ): Promise<number> {
    assertIso(now, "now");
    if (keepSessionId) assertSessionId(keepSessionId);
    const result = keepSessionId
      ? await this.db.prepare(
        `UPDATE user_sessions
            SET revoked_at=?4,revoked_by=?5,revoke_reason=?6
          WHERE tenant_id=?1 AND user_id=?2 AND session_id<>?3
            AND revoked_at IS NULL AND expires_at>?4`,
      ).bind(tenantId, userId, keepSessionId, now, audit.actorUserId, audit.reason ?? "logout other sessions").run()
      : await this.db.prepare(
        `UPDATE user_sessions
            SET revoked_at=?3,revoked_by=?4,revoke_reason=?5
          WHERE tenant_id=?1 AND user_id=?2 AND revoked_at IS NULL AND expires_at>?3`,
      ).bind(tenantId, userId, now, audit.actorUserId, audit.reason ?? "logout other sessions").run();
    const revoked = Number(result.meta?.changes ?? 0);
    if (revoked > 0) {
      await this.db.prepare(
        `INSERT INTO rbac_audit_events(
           tenant_id,event_id,event_type,actor_user_id,target_user_id,
           before_json,after_json,reason,source,trace_id,created_at
         ) VALUES(?1,?2,'session.revoke_others',?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(
        tenantId,
        randomId("rbac"),
        audit.actorUserId,
        userId,
        JSON.stringify({ keep_session_id: keepSessionId ?? null }),
        JSON.stringify({ revoked_sessions: revoked }),
        audit.reason ?? null,
        audit.source,
        audit.traceId,
        now,
      ).run();
    }
    return revoked;
  }

  async purgeExpired(tenantId: string, now: string): Promise<number> {
    assertIso(now, "now");
    const cutoff = new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.db.prepare(
      `DELETE FROM user_sessions WHERE tenant_id=?1 AND expires_at<?2`,
    ).bind(tenantId, cutoff).run();
    return Number(result.meta?.changes ?? 0);
  }

  private auditStatement(
    tenantId: string,
    eventType: string,
    targetUserId: string,
    before: JsonObject | null,
    after: JsonObject | null,
    audit: SessionAuditContext,
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

function assertSessionId(value: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw errors.validation("Session id is invalid");
}

function assertIso(value: string, field: string): void {
  if (!value || !Number.isFinite(Date.parse(value))) throw errors.validation(`${field} must be an ISO timestamp`);
}
