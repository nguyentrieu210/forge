import assert from "node:assert/strict";
import test from "node:test";
import {
  migrationBookkeepingSql,
  readAppliedMigrationNames,
} from "../scripts/lib/d1-migration-bookkeeping.mjs";

const database = { name: "cloudforge-alu", configArg: "generated/alu.jsonc" };

function recorder(responses) {
  const calls = [];
  const query = (_database, sql) => {
    calls.push(sql);
    if (sql === migrationBookkeepingSql.trackingTableExists) return responses.exists ?? [];
    if (sql === migrationBookkeepingSql.createTrackingTable) return responses.create ?? [];
    if (sql === migrationBookkeepingSql.readApplied) return responses.applied ?? [];
    throw new Error(`unexpected SQL: ${sql}`);
  };
  return { calls, query };
}

test("dry-run with missing d1_migrations is strictly read-only", () => {
  const spy = recorder({ exists: [{ total: 0 }] });
  const result = readAppliedMigrationNames({ database, dryRun: true, query: spy.query });
  assert.deepEqual(result, { names: [], trackingTablePresent: false, trackingTableCreated: false });
  assert.deepEqual(spy.calls, [migrationBookkeepingSql.trackingTableExists]);
  assert.equal(spy.calls.some((sql) => /\bCREATE\b/i.test(sql)), false);
});

test("dry-run reads existing applied migration names without mutation", () => {
  const spy = recorder({
    exists: [{ total: 1 }],
    applied: [{ name: "0001_init.sql" }, { name: "0002_auth.sql" }],
  });
  const result = readAppliedMigrationNames({ database, dryRun: true, query: spy.query });
  assert.deepEqual(result.names, ["0001_init.sql", "0002_auth.sql"]);
  assert.equal(result.trackingTablePresent, true);
  assert.equal(result.trackingTableCreated, false);
  assert.deepEqual(spy.calls, [migrationBookkeepingSql.trackingTableExists, migrationBookkeepingSql.readApplied]);
  assert.equal(spy.calls.some((sql) => /\b(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(sql)), false);
});

test("live apply may create compatible bookkeeping before reading applied state", () => {
  const spy = recorder({ exists: [{ total: 0 }], create: [], applied: [] });
  const result = readAppliedMigrationNames({ database, dryRun: false, query: spy.query });
  assert.deepEqual(result.names, []);
  assert.equal(result.trackingTablePresent, true);
  assert.equal(result.trackingTableCreated, true);
  assert.deepEqual(spy.calls, [
    migrationBookkeepingSql.trackingTableExists,
    migrationBookkeepingSql.createTrackingTable,
    migrationBookkeepingSql.readApplied,
  ]);
});
