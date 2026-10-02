import type { ConnectedAppIdentity, ConnectedAppStore, OAuthConnection, OAuthState } from './connected-app.js';
export interface ConnectedAppDatabase {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> } };
  batch(statements: unknown[]): Promise<unknown>;
}
const key = (id: ConnectedAppIdentity): string[] => [id.tenantId, id.userId, id.appId];
const connectionColumns = 'tenant_id AS tenantId, user_id AS userId, app_id AS appId, token_ciphertext AS tokenCiphertext, expires_at AS expiresAt, version';
/** D1 operations claim state/refresh leases atomically, rather than read-then-write. */
export class D1ConnectedAppStore implements ConnectedAppStore {
  private readonly db: ConnectedAppDatabase;
  constructor(db: ConnectedAppDatabase) { this.db = db; }
  async ensureConnection(id: ConnectedAppIdentity): Promise<number> {
    await this.db.prepare('INSERT INTO connected_app_connections (tenant_id,user_id,app_id) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(...key(id)).run();
    return (await this.getConnection(id))!.version;
  }
  async putState(state: OAuthState): Promise<void> {
    await this.db.prepare('DELETE FROM connected_app_states WHERE expires_at<=?').bind(state.expiresAt - 600_000).run();
    await this.db.prepare('INSERT INTO connected_app_states (state_hash,tenant_id,user_id,app_id,verifier_ciphertext,expires_at,connection_version) VALUES (?,?,?,?,?,?,?)')
      .bind(state.stateHash, ...key(state), state.verifierCiphertext, state.expiresAt, state.connectionVersion).run();
  }
  consumeState(id: ConnectedAppIdentity, stateHash: string, now: number): Promise<OAuthState | null> {
    return this.db.prepare('DELETE FROM connected_app_states WHERE state_hash=? AND tenant_id=? AND user_id=? AND app_id=? AND expires_at>? RETURNING state_hash AS stateHash,tenant_id AS tenantId,user_id AS userId,app_id AS appId,verifier_ciphertext AS verifierCiphertext,expires_at AS expiresAt,connection_version AS connectionVersion')
      .bind(stateHash, ...key(id), now).first<OAuthState>();
  }
  getConnection(id: ConnectedAppIdentity): Promise<OAuthConnection | null> {
    return this.db.prepare(`SELECT ${connectionColumns} FROM connected_app_connections WHERE tenant_id=? AND user_id=? AND app_id=?`).bind(...key(id)).first<OAuthConnection>();
  }
  async saveConnection(row: OAuthConnection, expectedVersion: number | null): Promise<boolean> {
    if (expectedVersion === null) throw new Error('Connected app must be initialized before authorization');
    const saved = await this.db.prepare('UPDATE connected_app_connections SET token_ciphertext=?,expires_at=?,version=? WHERE tenant_id=? AND user_id=? AND app_id=? AND version=? RETURNING version')
      .bind(row.tokenCiphertext, row.expiresAt, row.version, ...key(row), expectedVersion).first<{ version: number }>();
    return saved !== null;
  }
  async acquireRefresh(id: ConnectedAppIdentity, version: number, lease: string, now: number): Promise<boolean> {
    const claimed = await this.db.prepare('UPDATE connected_app_connections SET refresh_lease=?,refresh_lease_until=? WHERE tenant_id=? AND user_id=? AND app_id=? AND version=? AND (refresh_lease IS NULL OR refresh_lease_until<=?) RETURNING version')
      .bind(lease, now + 60_000, ...key(id), version, now).first<{ version: number }>();
    return claimed !== null;
  }
  async releaseRefresh(id: ConnectedAppIdentity, lease: string): Promise<void> {
    await this.db.prepare('UPDATE connected_app_connections SET refresh_lease=NULL,refresh_lease_until=NULL WHERE tenant_id=? AND user_id=? AND app_id=? AND refresh_lease=?').bind(...key(id), lease).run();
  }
  async disconnect(id: ConnectedAppIdentity): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM connected_app_states WHERE tenant_id=? AND user_id=? AND app_id=?').bind(...key(id)),
      this.db.prepare('INSERT INTO connected_app_connections (tenant_id,user_id,app_id,version) VALUES (?,?,?,1) ON CONFLICT (tenant_id,user_id,app_id) DO UPDATE SET token_ciphertext=NULL,expires_at=0,version=version+1,refresh_lease=NULL,refresh_lease_until=NULL').bind(...key(id)),
    ]);
  }
}
