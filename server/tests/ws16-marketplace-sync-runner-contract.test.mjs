import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runnerPath = new URL("../packages/social-commerce/src/marketplace-sync-runner.ts", import.meta.url);
const storePath = new URL("../packages/integration-hub/src/marketplace-sync-store.ts", import.meta.url);
const migrationPath = new URL("../migrations/tenant/0119_marketplace_sync_state.sql", import.meta.url);

test("marketplace sync persists only operational cursor/lease state", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketplace_sync_state/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, connection_id, stream\)/);
  assert.match(migration, /checkpoint INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /state TEXT NOT NULL DEFAULT 'idle'/);
  assert.doesNotMatch(migration, /sales_order|stock|gl_|payment|customer|item_code/i);
});

test("marketplace sync state store claims one lease and compare-and-swaps cursor", async () => {
  const store = await readFile(storePath, "utf8");
  assert.match(store, /state NOT IN \('running','disabled'\)/);
  assert.match(store, /state='running' AND run_id=\?6 AND checkpoint=\?7/);
  assert.match(store, /SET cursor=\?1,checkpoint=checkpoint\+1/);
  assert.match(store, /Marketplace sync cursor changed concurrently/);
  assert.match(store, /state='running' AND run_id=\?5/);
});

test("marketplace runner ingests canonical page before advancing its cursor", async () => {
  const runner = await readFile(runnerPath, "utf8");
  const ingestIndex = runner.indexOf("await ingestMarketplaceSyncPage(");
  const advanceIndex = runner.indexOf("await state.advance({");
  assert.ok(ingestIndex >= 0 && advanceIndex > ingestIndex, "cursor must advance only after canonical page ingest");
  assert.match(runner, /prepareMarketplaceSyncRuntime\(connection, cursor, pageSize, credentials\)/);
  assert.match(runner, /page\.records\.filter\(\(record\) => record\.idempotent_replay\)/);
  assert.match(runner, /attempt >= policy\.max_attempts/);
  assert.match(runner, /await state\.fail\(/);
});
