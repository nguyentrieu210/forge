import {
  createSyncCursor,
  createSyncStatus,
  validateSyncCursor,
  validateSyncStatus,
  type ExternalSyncCursor,
  type ExternalSyncStatus,
} from "./sync.js";

interface MarketplaceSyncStateRow {
  connector_key: string;
  cursor: string | null;
  checkpoint: number;
  state: ExternalSyncStatus["state"];
  run_id: string | null;
  attempts: number;
  started_at: string | null;
  completed_at: string | null;
  next_attempt_at: string | null;
  last_error_code: string | null;
  updated_at: string;
}

export interface MarketplaceSyncLease {
  cursor: ExternalSyncCursor;
  status: ExternalSyncStatus;
}

/**
 * Operational checkpoint store for marketplace polling.
 *
 * This table is deliberately not a business authority: it records only provider cursor,
 * lease/run state and retry timing. Orders, stock, finance and customer identity remain
 * canonical documents/ledgers. Every mutation is compare-and-swap so concurrent cron or
 * manual runs cannot advance one another's cursor.
 */
export class D1MarketplaceSyncStateStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async ensure(input: {
    tenant_id: string;
    connector_key: string;
    connection_id: string;
    stream: string;
    now: Date;
  }): Promise<MarketplaceSyncLease> {
    const cursor = createSyncCursor({
      connector_key: input.connector_key,
      connection_id: input.connection_id,
      stream: input.stream,
      now: input.now,
    });
    const status = createSyncStatus({
      connector_key: input.connector_key,
      connection_id: input.connection_id,
      stream: input.stream,
    });
    await this.db.prepare(`
      INSERT INTO marketplace_sync_state(
        tenant_id,connection_id,stream,connector_key,cursor,checkpoint,state,run_id,
        attempts,started_at,completed_at,next_attempt_at,last_error_code,updated_at
      ) VALUES(?1,?2,?3,?4,NULL,0,'idle',NULL,0,NULL,NULL,NULL,NULL,?5)
      ON CONFLICT(tenant_id,connection_id,stream) DO NOTHING
    `).bind(
      input.tenant_id,
      input.connection_id,
      input.stream,
      input.connector_key,
      input.now.toISOString(),
    ).run();
    const observed = await this.get(input.tenant_id, input.connection_id, input.stream);
    if (!observed) throw new Error("Marketplace sync state was not persisted");
    if (observed.cursor.connector_key !== cursor.connector_key || observed.status.connector_key !== status.connector_key) {
      throw new Error("Marketplace sync state connector identity does not match connection");
    }
    return observed;
  }

  async get(tenantId: string, connectionId: string, stream: string): Promise<MarketplaceSyncLease | null> {
    const row = await this.db.prepare(`
      SELECT connector_key,cursor,checkpoint,state,run_id,attempts,started_at,completed_at,
             next_attempt_at,last_error_code,updated_at
      FROM marketplace_sync_state
      WHERE tenant_id=?1 AND connection_id=?2 AND stream=?3
      LIMIT 1
    `).bind(tenantId, connectionId, stream).first<MarketplaceSyncStateRow>();
    return row ? leaseFromRow(connectionId, stream, row) : null;
  }

  async claim(input: {
    tenant_id: string;
    connector_key: string;
    connection_id: string;
    stream: string;
    run_id: string;
    now: Date;
  }): Promise<MarketplaceSyncLease | null> {
    const current = await this.ensure(input);
    if (current.cursor.connector_key !== input.connector_key) throw new Error("Marketplace sync connector identity changed");
    const now = input.now.toISOString();
    const result = await this.db.prepare(`
      UPDATE marketplace_sync_state
      SET state='running',run_id=?1,attempts=attempts+1,started_at=?2,completed_at=NULL,
          next_attempt_at=NULL,last_error_code=NULL,updated_at=?2
      WHERE tenant_id=?3 AND connection_id=?4 AND stream=?5 AND connector_key=?6
        AND state NOT IN ('running','disabled')
        AND (state<>'retry_scheduled' OR next_attempt_at IS NULL OR next_attempt_at<=?2)
    `).bind(
      input.run_id,
      now,
      input.tenant_id,
      input.connection_id,
      input.stream,
      input.connector_key,
    ).run();
    if ((result.meta?.changes ?? 0) !== 1) return null;
    const claimed = await this.get(input.tenant_id, input.connection_id, input.stream);
    if (!claimed || claimed.status.state !== "running" || claimed.status.run_id !== input.run_id) {
      throw new Error("Marketplace sync lease claim was not observed");
    }
    return claimed;
  }

  async advance(input: {
    tenant_id: string;
    connection_id: string;
    stream: string;
    run_id: string;
    expected_checkpoint: number;
    next_cursor: string | null;
    now: Date;
  }): Promise<ExternalSyncCursor> {
    if (input.next_cursor !== null && (!input.next_cursor || input.next_cursor.length > 4_096 || /[\r\n\0]/.test(input.next_cursor))) {
      throw new Error("Invalid marketplace sync cursor value");
    }
    const result = await this.db.prepare(`
      UPDATE marketplace_sync_state
      SET cursor=?1,checkpoint=checkpoint+1,updated_at=?2
      WHERE tenant_id=?3 AND connection_id=?4 AND stream=?5
        AND state='running' AND run_id=?6 AND checkpoint=?7
    `).bind(
      input.next_cursor,
      input.now.toISOString(),
      input.tenant_id,
      input.connection_id,
      input.stream,
      input.run_id,
      input.expected_checkpoint,
    ).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new Error("Marketplace sync cursor changed concurrently");
    const observed = await this.get(input.tenant_id, input.connection_id, input.stream);
    if (!observed) throw new Error("Marketplace sync state disappeared after cursor advance");
    return observed.cursor;
  }

  async complete(input: {
    tenant_id: string;
    connection_id: string;
    stream: string;
    run_id: string;
    now: Date;
  }): Promise<ExternalSyncStatus> {
    const now = input.now.toISOString();
    const result = await this.db.prepare(`
      UPDATE marketplace_sync_state
      SET state='succeeded',run_id=NULL,completed_at=?1,next_attempt_at=NULL,
          last_error_code=NULL,updated_at=?1
      WHERE tenant_id=?2 AND connection_id=?3 AND stream=?4
        AND state='running' AND run_id=?5
    `).bind(now, input.tenant_id, input.connection_id, input.stream, input.run_id).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new Error("Marketplace sync completion lost its lease");
    const observed = await this.get(input.tenant_id, input.connection_id, input.stream);
    if (!observed) throw new Error("Marketplace sync state disappeared after completion");
    return observed.status;
  }

  async fail(input: {
    tenant_id: string;
    connection_id: string;
    stream: string;
    run_id: string;
    error_code: string;
    retry_after_seconds?: number;
    now: Date;
  }): Promise<ExternalSyncStatus> {
    const errorCode = token(input.error_code, "error_code");
    const retry = input.retry_after_seconds;
    if (retry !== undefined && (!Number.isSafeInteger(retry) || retry <= 0 || retry > 86_400)) {
      throw new Error("Invalid marketplace sync retry delay");
    }
    const now = input.now.toISOString();
    const next = retry === undefined ? null : new Date(input.now.getTime() + retry * 1_000).toISOString();
    const state: ExternalSyncStatus["state"] = retry === undefined ? "error" : "retry_scheduled";
    const result = await this.db.prepare(`
      UPDATE marketplace_sync_state
      SET state=?1,run_id=NULL,completed_at=?2,next_attempt_at=?3,last_error_code=?4,updated_at=?2
      WHERE tenant_id=?5 AND connection_id=?6 AND stream=?7
        AND state='running' AND run_id=?8
    `).bind(
      state,
      now,
      next,
      errorCode,
      input.tenant_id,
      input.connection_id,
      input.stream,
      input.run_id,
    ).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new Error("Marketplace sync failure lost its lease");
    const observed = await this.get(input.tenant_id, input.connection_id, input.stream);
    if (!observed) throw new Error("Marketplace sync state disappeared after failure");
    return observed.status;
  }
}

function leaseFromRow(connectionId: string, stream: string, row: MarketplaceSyncStateRow): MarketplaceSyncLease {
  const cursor = validateSyncCursor({
    schema_version: 1,
    connector_key: row.connector_key,
    connection_id: connectionId,
    stream,
    cursor: row.cursor,
    checkpoint: Number(row.checkpoint),
    updated_at: row.updated_at,
  });
  const status = validateSyncStatus({
    connector_key: row.connector_key,
    connection_id: connectionId,
    stream,
    state: row.state,
    run_id: row.run_id,
    attempts: Number(row.attempts),
    ...(row.started_at ? { started_at: row.started_at } : {}),
    ...(row.completed_at ? { completed_at: row.completed_at } : {}),
    ...(row.next_attempt_at ? { next_attempt_at: row.next_attempt_at } : {}),
    ...(row.last_error_code ? { last_error_code: row.last_error_code } : {}),
  });
  return { cursor, status };
}

function token(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value)) throw new Error(`Invalid ${field}`);
  return value;
}
