import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceSyncCursor,
  beginSyncRun,
  completeSyncRun,
  createSyncCursor,
  createSyncStatus,
  failSyncRun,
  validateSyncCursor,
  validateSyncPage,
  validateSyncStatus,
} from "../dist/packages/integration-hub/src/sync.js";

test("external sync cursor uses optimistic checkpoint semantics", () => {
  const first = createSyncCursor({ connector_key: "bank-feed", connection_id: "bank-1", stream: "transactions", now: new Date("2026-08-03T00:00:00Z") });
  assert.equal(first.cursor, null);
  assert.equal(first.checkpoint, 0);
  const next = advanceSyncCursor(first, "cursor-001", 0, new Date("2026-08-03T00:01:00Z"));
  assert.equal(next.cursor, "cursor-001");
  assert.equal(next.checkpoint, 1);
  assert.throws(() => advanceSyncCursor(next, "cursor-002", 0, new Date()), /changed concurrently/);
  assert.equal(validateSyncCursor(next).connection_id, "bank-1");
});

test("external sync page must expose a continuation cursor when has_more", () => {
  assert.deepEqual(validateSyncPage({ records: [{ id: 1 }], next_cursor: "next", has_more: true }), {
    records: [{ id: 1 }], next_cursor: "next", has_more: true,
  });
  assert.throws(() => validateSyncPage({ records: [], next_cursor: null, has_more: true }), /requires next_cursor/);
  assert.throws(() => validateSyncPage({ records: Array.from({ length: 1001 }, () => 1), next_cursor: null, has_more: false }), /records/);
});

test("external sync run exposes success, retry and terminal error states", () => {
  const idle = createSyncStatus({ connector_key: "bank-feed", connection_id: "bank-1", stream: "transactions" });
  assert.equal(validateSyncStatus(idle).state, "idle");
  const running = beginSyncRun(idle, "run:001", new Date("2026-08-03T00:00:00Z"));
  assert.equal(running.state, "running");
  assert.equal(running.attempts, 1);

  const retry = failSyncRun(running, "PROVIDER_429", new Date("2026-08-03T00:01:00Z"), 60);
  assert.equal(retry.state, "retry_scheduled");
  assert.equal(retry.next_attempt_at, "2026-08-03T00:02:00.000Z");

  const rerun = beginSyncRun(retry, "run:002", new Date("2026-08-03T00:02:00Z"));
  const success = completeSyncRun(rerun, new Date("2026-08-03T00:03:00Z"));
  assert.equal(success.state, "succeeded");
  assert.equal(success.run_id, null);
  assert.equal("next_attempt_at" in success, false);
  assert.equal("last_error_code" in success, false);

  const running2 = beginSyncRun(success, "run:003", new Date("2026-08-03T01:00:00Z"));
  const terminal = failSyncRun(running2, "INVALID_CREDENTIAL", new Date("2026-08-03T01:00:05Z"));
  assert.equal(terminal.state, "error");
  assert.equal(terminal.last_error_code, "INVALID_CREDENTIAL");
  assert.equal("next_attempt_at" in terminal, false);
});

test("disabled and concurrent running syncs fail closed", () => {
  const disabled = { ...createSyncStatus({ connector_key: "bank-feed", connection_id: "bank-1", stream: "transactions" }), state: "disabled" };
  assert.throws(() => beginSyncRun(disabled, "run:001", new Date()), /Disabled/);
  const running = beginSyncRun(createSyncStatus({ connector_key: "bank-feed", connection_id: "bank-1", stream: "transactions" }), "run:001", new Date());
  assert.throws(() => beginSyncRun(running, "run:002", new Date()), /already running/);
  assert.throws(() => completeSyncRun(createSyncStatus({ connector_key: "bank-feed", connection_id: "bank-1", stream: "transactions" }), new Date()), /not running/);
});
