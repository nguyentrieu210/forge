import { errors, randomId } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";

export interface ApiCredentialAuditContext {
  actorUserId: string;
  traceId: string;
  source: string;
  reason?: string;
}

export interface ApiCredentialRecord extends JsonObject {
  credential_id: string;
  user_id: string;
  api_key: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ApiCredentialRow {
  credential_id: string;
  user_id: string;
  api_key: string;
  secret_salt: string;
  secret_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export class D1ApiCredentialStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async authenticate(
    tenantId: string,
    apiKey: string,
    apiSecret: string,
    now: string,
  ): Promise<{ userId: string; credentialId: string } | null> {
    const key = apiKey.trim();
    if (!key || !apiSecret) return null;
    assertIso(now, "now");

    const row = await this.db.prepare(
      `SELECT c.credential_id,c.user_id,c.api_key,c.secret_salt,c.secret_hash,
              c.created_at,c.last_used_at,c.revoked_at
         FROM user_api_credentials c
         JOIN users u ON u.tenant_id=c.tenant_id AND u.user_id=c.user_id
        WHERE c.tenant_id=?1 AND c.api_key=?2 AND c.revoked_at IS NULL AND u.enabled=1
        LIMIT 1`,
    ).bind(tenantId, key).first<ApiCredentialRow>();
    if (!row) return null;

    const actual = await secretDigest(row.secret_salt, apiSecret);
    if (!timingSafeTextEqual(actual, row.secret_hash)) return null;

    await this.db.prepare(
      `UPDATE user_api_credentials
          SET last_used_at=?3
        WHERE tenant_id=?1 AND credential_id=?2 AND revoked_at IS NULL`,
    ).bind(tenantId, row.credential_id, now).run();

    return { userId: row.user_id, credentialId: row.credential_id };
  }

  /**
   * Frappe User has one current api_key/api_secret pair. Issuing again rotates the
   * old pair rather than leaving multiple invisible credentials alive.
   */
  async issue(
    tenantId: string,
    userId: string,
    audit: ApiCredentialAuditContext,
    now: string,
  ): Promise<{ credential_id: string; api_key: string; api_secret: string }> {
    assertIso(now, "now");
    const user = await this.db.prepare(
      `SELECT user_id FROM users WHERE tenant_id=?1 AND user_id=?2 AND enabled=1`,
    ).bind(tenantId, userId).first<{ user_id: string }>();
    if (!user) throw errors.notFound("Enabled user not found");

    const credentialId = randomId("api-credential");
    const previous = await this.db.prepare(
      `SELECT api_key
         FROM user_api_credentials
        WHERE tenant_id=?1 AND user_id=?2 AND revoked_at IS NULL
        LIMIT 1`,
    ).bind(tenantId, userId).first<{ api_key: string }>();
    // Frappe generate_keys keeps User.api_key stable and rotates only api_secret.
    const apiKey = previous?.api_key ?? randomToken(15);
    const apiSecret = randomToken(32);
    const salt = randomToken(18);
    const hash = await secretDigest(salt, apiSecret);
    const eventId = randomId("rbac");
    const reason = audit.reason?.trim() || "API credential generated";

    await this.db.batch([
      this.db.prepare(
        `UPDATE user_api_credentials
            SET revoked_at=?3,revoked_by=?4,revoke_reason='rotated'
          WHERE tenant_id=?1 AND user_id=?2 AND revoked_at IS NULL`,
      ).bind(tenantId, userId, now, audit.actorUserId),
      this.db.prepare(
        `INSERT INTO user_api_credentials(
           tenant_id,credential_id,user_id,api_key,secret_salt,secret_hash,created_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7)`,
      ).bind(tenantId, credentialId, userId, apiKey, salt, hash, now),
      this.db.prepare(
        `INSERT INTO rbac_audit_events(
           tenant_id,event_id,event_type,actor_user_id,target_user_id,
           before_json,after_json,reason,source,trace_id,created_at
         ) VALUES(
           ?1,?2,'api_credential.issue',?3,?4,'null',
           json_object('credential_id',?5,'rotated_previous',?10),
           ?6,?7,?8,?9
         )`,
      ).bind(
        tenantId, eventId, audit.actorUserId, userId, credentialId,
        reason, audit.source, audit.traceId, now, previous ? 1 : 0,
      ),
    ]);

    return { credential_id: credentialId, api_key: apiKey, api_secret: apiSecret };
  }

  async list(tenantId: string, userId: string): Promise<ApiCredentialRecord[]> {
    const result = await this.db.prepare(
      `SELECT credential_id,user_id,api_key,created_at,last_used_at,revoked_at
         FROM user_api_credentials
        WHERE tenant_id=?1 AND user_id=?2
        ORDER BY revoked_at IS NULL DESC,created_at DESC
        LIMIT 50`,
    ).bind(tenantId, userId).all<Omit<ApiCredentialRow, "secret_salt" | "secret_hash">>();
    return (result.results ?? []).map((row) => ({ ...row }));
  }

  async revoke(
    tenantId: string,
    userId: string,
    credentialId: string,
    audit: ApiCredentialAuditContext,
    now: string,
  ): Promise<boolean> {
    assertIso(now, "now");
    const eventId = randomId("rbac");
    const reason = audit.reason?.trim() || "API credential revoked";
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE user_api_credentials
            SET revoked_at=?4,revoked_by=?5,revoke_reason=?6
          WHERE tenant_id=?1 AND user_id=?2 AND credential_id=?3 AND revoked_at IS NULL`,
      ).bind(tenantId, userId, credentialId, now, audit.actorUserId, reason),
      this.db.prepare(
        `INSERT INTO rbac_audit_events(
           tenant_id,event_id,event_type,actor_user_id,target_user_id,
           before_json,after_json,reason,source,trace_id,created_at
         )
         SELECT ?1,?2,'api_credential.revoke',?3,?4,
                json_object('credential_id',credential_id),
                json_object('revoked',1),?5,?6,?7,?8
           FROM user_api_credentials
          WHERE tenant_id=?1 AND user_id=?4 AND credential_id=?9 AND revoked_at=?8`,
      ).bind(
        tenantId, eventId, audit.actorUserId, userId,
        reason, audit.source, audit.traceId, now, credentialId,
      ),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }
}

async function secretDigest(salt: string, secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`forge-api-secret:v1:${salt}:${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function randomToken(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeTextEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function assertIso(value: string, field: string): void {
  if (!value || !Number.isFinite(Date.parse(value))) throw errors.validation(`${field} must be an ISO timestamp`);
}
