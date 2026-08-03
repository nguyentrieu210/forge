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
    const issuedMs = assertIso(issuedAt, "issued_at");
    const expiresMs = assertIso(expiresAt, "expires_at");
    if (expiresMs <= issuedMs) throw errors.validation("Session expiry must be after issuance");
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
    const nowMs = assertIso(now, "now");
    const row = await this.db.prepare(
      `SELECT session_id,user_id,issued_at,expires_at,last_seen_at,revoked_at
         FROM user_sessions
        WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3`,
    ).bind(tenantId, sessionId, userId).first<SessionRow>();
    if (!row) throw errors.authentication("Session is no longer registered");
    if (row.revoked_at) throw errors.authentication("Session has been revoked");
    if (Date.parse(row.expires_at) <= nowMs) throw errors.authentication("Session has expired");
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

  /** Normal logout revokes the exact current session without privileged-audit noise. */
  async revokeCurrent(
    tenantId: string,
    userId: string,
    sessionId: string,
    now: string,
  ): Promise<void> {
    assertSessionId(sessionId);
    assertIso(now, "now");
    const eventId = randomId("session");
    await this.db.prepare(
      `UPDATE user_sessions
          SET revoked_at=?4,revoked_by=?3,revoke_reason='logout',revocation_event_id=?5
        WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3 AND revoked_at IS NULL`,
    ).bind(tenantId, sessionId, userId, now, eventId).run();
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
    const eventId = randomId("rbac");
    const reason = audit.reason ?? "session manager revoke";
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE user_sessions
            SET revoked_at=?4,revoked_by=?5,revoke_reason=?6,revocation_event_id=?7
          WHERE tenant_id=?1 AND session_id=?2 AND user_id=?3 AND revoked_at IS NULL`,
      ).bind(tenantId, sessionId, userId, now, audit.actorUserId, reason, eventId),
      this.db.prepare(
        `INSERT INTO rbac_audit_events(
           tenant_id,event_id,event_type,actor_user_id,target_user_id,
           before_json,after_json,reason,source,trace_id,created_at
         )
         SELECT ?1,?2,'session.revoke_one',?3,?4,
                json_object('session_id',session_id,'issued_at',issued_at,'expires_at',expires_at),
                json_object('revoked',1),?5,?6,?7,?8
           FROM user_sessions
          WHERE tenant_id=?1 AND session_id=?9 AND user_id=?4 AND revocation_event_id=?2`,
      ).bind(
        tenantId,
        eventId,
        audit.actorUserId,
        userId,
        reason,
        audit.source,
        audit.traceId,
        now,
        sessionId,
      ),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
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
    const eventId = randomId("rbac");
    const reason = audit.reason ?? "logout other sessions";
    const update = keepSessionId
      ? this.db.prepare(
        `UPDATE user_sessions
            SET revoked_at=?4,revoked_by=?5,revoke_reason=?6,revocation_event_id=?7
          WHERE tenant_id=?1 AND user_id=?2 AND session_id<>?3
            AND revoked_at IS NULL AND expires_at>?4`,
      ).bind(tenantId, userId, keepSessionId, now, audit.actorUserId, reason, eventId)
      : this.db.prepare(
        `UPDATE user_sessions
            SET revoked_at=?3,revoked_by=?4,revoke_reason=?5,revocation_event_id=?6
          WHERE tenant_id=?1 AND user_id=?2 AND revoked_at IS NULL AND expires_at>?3`,
      ).bind(tenantId, userId, now, audit.actorUserId, reason, eventId);
    const auditInsert = this.db.prepare(
      `INSERT INTO rbac_audit_events(
         tenant_id,event_id,event_type,actor_user_id,target_user_id,
         before_json,after_json,reason,source,trace_id,created_at
       )
       SELECT ?1,?2,'session.revoke_others',?3,?4,
              json_object('keep_session_id',?5),
              json_object('revoked_sessions',total),?6,?7,?8,?9
         FROM (
           SELECT COUNT(*) AS total
             FROM user_sessions
            WHERE tenant_id=?1 AND user_id=?4 AND revocation_event_id=?2
         )
        WHERE total>0`,
    ).bind(
      tenantId,
      eventId,
      audit.actorUserId,
      userId,
      keepSessionId ?? null,
      reason,
      audit.source,
      audit.traceId,
      now,
    );
    const results = await this.db.batch([update, auditInsert]);
    return Number(results[0]?.meta?.changes ?? 0);
  }

  async purgeExpired(tenantId: string, now: string): Promise<number> {
    assertIso(now, "now");
    const cutoff = new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.db.prepare(
      `DELETE FROM user_sessions WHERE tenant_id=?1 AND expires_at<?2`,
    ).bind(tenantId, cutoff).run();
    return Number(result.meta?.changes ?? 0);
  }
}

function assertSessionId(value: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw errors.validation("Session id is invalid");
}

function assertIso(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw errors.validation(`${field} must be an ISO timestamp`);
  return parsed;
}
