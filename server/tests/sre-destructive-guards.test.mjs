import test from "node:test";
import assert from "node:assert/strict";
import { assertPitrRequest, assertPastTimestamp, findString, requireBookmark } from "../scripts/lib/pitr-guard.mjs";
import { assertWorkerRollbackRequest, containsString } from "../scripts/lib/worker-rollback-guard.mjs";

const NOW = Date.parse("2026-08-03T03:00:00Z");

test("PITR accepts one past restore selector in plan mode", () => {
  assert.deepEqual(assertPitrRequest({
    tenant: "alu",
    timestamp: "2026-08-03T02:00:00Z",
    execute: false,
    nowMs: NOW,
  }), {
    tenant: "alu",
    timestamp: "2026-08-03T02:00:00Z",
    bookmark: null,
    execute: false,
  });
  assert.equal(assertPastTimestamp("2026-08-03T02:00:00+00:00", NOW), Date.parse("2026-08-03T02:00:00Z"));
});

test("PITR fails closed on selector, future time and ambiguous timezone", () => {
  assert.throws(() => assertPitrRequest({ tenant: "alu", execute: false, nowMs: NOW }), /exactly one/);
  assert.throws(() => assertPitrRequest({
    tenant: "alu", timestamp: "2026-08-03T02:00:00Z", bookmark: "00000085-0000024c-abcdef1234567890", nowMs: NOW,
  }), /exactly one/);
  assert.throws(() => assertPastTimestamp("2026-08-03T04:00:00Z", NOW), /past RFC3339/);
  assert.throws(() => assertPastTimestamp("2026-08-03T02:00:00", NOW), /explicit timezone/);
});

test("destructive PITR requires exact tenant confirmation, reason and backup directory", () => {
  const base = { tenant: "alu", bookmark: "00000085-0000024c-abcdef1234567890", execute: true, nowMs: NOW };
  assert.throws(() => assertPitrRequest({ ...base, reason: "recover", backupDir: "/secure" }), /--confirm alu/);
  assert.throws(() => assertPitrRequest({ ...base, confirm: "alu", backupDir: "/secure" }), /--reason/);
  assert.throws(() => assertPitrRequest({ ...base, confirm: "alu", reason: "recover" }), /--backup-dir/);
  assert.equal(assertPitrRequest({
    ...base, confirm: "alu", reason: "recover", backupDir: "/secure",
  }).execute, true);
});

test("PITR bookmark extraction verifies nested provider responses", () => {
  const provider = { result: { bookmark: "target", previous_bookmark: "previous" } };
  assert.equal(requireBookmark(provider, "restore"), "target");
  assert.equal(findString(provider, "previous_bookmark"), "previous");
  assert.throws(() => requireBookmark({ result: {} }, "restore"), /no bookmark/);
});

test("Worker rollback plan validates exact regular Worker and version id", () => {
  const version = "12345678-1234-1234-1234-1234567890ab";
  assert.deepEqual(assertWorkerRollbackRequest({ worker: "cloudforge-gateway", versionId: version }), {
    worker: "cloudforge-gateway",
    versionId: version,
    execute: false,
  });
  assert.throws(() => assertWorkerRollbackRequest({ worker: "cloudforge-tenant-alu", versionId: version }), /must be one of/);
  assert.throws(() => assertWorkerRollbackRequest({ worker: "cloudforge-gateway", versionId: "latest" }), /exact Worker version id/);
});

test("destructive Worker rollback requires exact confirmation and reason", () => {
  const version = "12345678-1234-1234-1234-1234567890ab";
  assert.throws(() => assertWorkerRollbackRequest({
    worker: "cloudforge-gateway", versionId: version, execute: true, reason: "bad release",
  }), /--confirm cloudforge-gateway/);
  assert.throws(() => assertWorkerRollbackRequest({
    worker: "cloudforge-gateway", versionId: version, execute: true, confirm: "cloudforge-gateway",
  }), /--reason/);
  assert.equal(assertWorkerRollbackRequest({
    worker: "cloudforge-gateway", versionId: version, execute: true,
    confirm: "cloudforge-gateway", reason: "bad release",
  }).execute, true);
});

test("rollback provider response matching handles nested deployment payloads", () => {
  const version = "12345678-1234-1234-1234-1234567890ab";
  assert.equal(containsString({ deployment: { versions: [{ version_id: version }] } }, version), true);
  assert.equal(containsString({ deployment: { versions: [] } }, version), false);
});
