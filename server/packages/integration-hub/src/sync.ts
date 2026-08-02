export type ExternalSyncState = "idle" | "running" | "retry_scheduled" | "succeeded" | "error" | "disabled";

export interface ExternalSyncCursor {
  schema_version: 1;
  connector_key: string;
  connection_id: string;
  stream: string;
  cursor: string | null;
  checkpoint: number;
  updated_at: string;
}

export interface ExternalSyncStatus {
  connector_key: string;
  connection_id: string;
  stream: string;
  state: ExternalSyncState;
  run_id: string | null;
  attempts: number;
  started_at?: string;
  completed_at?: string;
  next_attempt_at?: string;
  last_error_code?: string;
}

export interface ExternalSyncPage<T> {
  records: readonly T[];
  next_cursor: string | null;
  has_more: boolean;
}

const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function createSyncCursor(input: {
  connector_key: string;
  connection_id: string;
  stream: string;
  now: Date;
}): ExternalSyncCursor {
  return {
    schema_version: 1,
    connector_key: requireToken(input.connector_key, "connector_key"),
    connection_id: requireToken(input.connection_id, "connection_id"),
    stream: requireToken(input.stream, "stream"),
    cursor: null,
    checkpoint: 0,
    updated_at: input.now.toISOString(),
  };
}

export function advanceSyncCursor(
  current: ExternalSyncCursor,
  nextCursor: string | null,
  expectedCheckpoint: number,
  now: Date,
): ExternalSyncCursor {
  validateSyncCursor(current);
  if (current.checkpoint !== expectedCheckpoint) throw new Error("External sync cursor changed concurrently");
  if (nextCursor !== null && (!nextCursor || nextCursor.length > 4_096 || /[\r\n\0]/.test(nextCursor))) throw new Error("Invalid external sync cursor value");
  return {
    ...current,
    cursor: nextCursor,
    checkpoint: current.checkpoint + 1,
    updated_at: now.toISOString(),
  };
}

export function validateSyncPage<T>(page: ExternalSyncPage<T>, maxRecords = 1_000): ExternalSyncPage<T> {
  if (!Number.isSafeInteger(maxRecords) || maxRecords <= 0 || maxRecords > 100_000) throw new Error("Invalid external sync page limit");
  if (!Array.isArray(page.records) || page.records.length > maxRecords) throw new Error("Invalid external sync page records");
  if (page.next_cursor !== null && (typeof page.next_cursor !== "string" || !page.next_cursor || page.next_cursor.length > 4_096)) {
    throw new Error("Invalid external sync next_cursor");
  }
  if (typeof page.has_more !== "boolean") throw new Error("Invalid external sync has_more");
  if (page.has_more && page.next_cursor === null) throw new Error("External sync page with has_more requires next_cursor");
  return page;
}

export function beginSyncRun(current: ExternalSyncStatus, runId: string, now: Date): ExternalSyncStatus {
  validateSyncStatus(current);
  if (current.state === "disabled") throw new Error("Disabled external sync cannot run");
  if (current.state === "running") throw new Error("External sync is already running");
  const next: ExternalSyncStatus = {
    ...current,
    state: "running",
    run_id: requireToken(runId, "run_id"),
    attempts: current.attempts + 1,
    started_at: now.toISOString(),
  };
  delete next.completed_at;
  delete next.next_attempt_at;
  delete next.last_error_code;
  return next;
}

export function completeSyncRun(current: ExternalSyncStatus, now: Date): ExternalSyncStatus {
  validateSyncStatus(current);
  if (current.state !== "running" || !current.run_id) throw new Error("External sync is not running");
  const next: ExternalSyncStatus = {
    ...current,
    state: "succeeded",
    run_id: null,
    completed_at: now.toISOString(),
  };
  delete next.next_attempt_at;
  delete next.last_error_code;
  return next;
}

export function failSyncRun(
  current: ExternalSyncStatus,
  errorCode: string,
  now: Date,
  retryAfterSeconds?: number,
): ExternalSyncStatus {
  validateSyncStatus(current);
  if (current.state !== "running" || !current.run_id) throw new Error("External sync is not running");
  const code = requireToken(errorCode, "error_code");
  if (retryAfterSeconds === undefined) {
    const failed: ExternalSyncStatus = {
      ...current,
      state: "error",
      run_id: null,
      completed_at: now.toISOString(),
      last_error_code: code,
    };
    delete failed.next_attempt_at;
    return failed;
  }
  if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds <= 0 || retryAfterSeconds > 86_400) throw new Error("Invalid sync retry delay");
  return {
    ...current,
    state: "retry_scheduled",
    run_id: null,
    completed_at: now.toISOString(),
    next_attempt_at: new Date(now.getTime() + retryAfterSeconds * 1_000).toISOString(),
    last_error_code: code,
  };
}

export function createSyncStatus(input: {
  connector_key: string;
  connection_id: string;
  stream: string;
}): ExternalSyncStatus {
  return {
    connector_key: requireToken(input.connector_key, "connector_key"),
    connection_id: requireToken(input.connection_id, "connection_id"),
    stream: requireToken(input.stream, "stream"),
    state: "idle",
    run_id: null,
    attempts: 0,
  };
}

export function validateSyncCursor(cursor: ExternalSyncCursor): ExternalSyncCursor {
  if (cursor.schema_version !== 1) throw new Error("Unsupported external sync cursor schema_version");
  requireToken(cursor.connector_key, "connector_key");
  requireToken(cursor.connection_id, "connection_id");
  requireToken(cursor.stream, "stream");
  if (cursor.cursor !== null && (!cursor.cursor || cursor.cursor.length > 4_096 || /[\r\n\0]/.test(cursor.cursor))) throw new Error("Invalid external sync cursor value");
  if (!Number.isSafeInteger(cursor.checkpoint) || cursor.checkpoint < 0) throw new Error("Invalid external sync checkpoint");
  if (!Number.isFinite(Date.parse(cursor.updated_at))) throw new Error("Invalid external sync updated_at");
  return cursor;
}

export function validateSyncStatus(status: ExternalSyncStatus): ExternalSyncStatus {
  requireToken(status.connector_key, "connector_key");
  requireToken(status.connection_id, "connection_id");
  requireToken(status.stream, "stream");
  if (!["idle", "running", "retry_scheduled", "succeeded", "error", "disabled"].includes(status.state)) throw new Error("Invalid external sync state");
  if (!Number.isSafeInteger(status.attempts) || status.attempts < 0) throw new Error("Invalid external sync attempts");
  if (status.run_id !== null) requireToken(status.run_id, "run_id");
  return status;
}

function requireToken(value: string, field: string): string {
  if (!TOKEN_RE.test(value)) throw new Error(`Invalid ${field}`);
  return value;
}
