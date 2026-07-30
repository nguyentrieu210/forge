import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  PROFILE_WEIGHT_ITEMS,
  buildProfileSpecificationSql,
  loadProfileSpecifications,
} from "../scripts/build-alumdoor-profile-specifications.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

test("all sixteen profile aluminium items have an authoritative kg/m mapping", async () => {
  const rows = await loadProfileSpecifications(repoRoot);
  assert.equal(rows.length, 16);
  assert.equal(new Set(rows.map((row) => row.itemCode)).size, 16);
  assert.deepEqual(rows.find((row) => row.itemCode === "AL71"), {
    itemCode: "AL71",
    supplierCode: "TD-AL71N",
    kgPerM: 0.389,
  });
  assert.equal(PROFILE_WEIGHT_ITEMS["TD-AL70-15mm"], "AL70 1.5MM");
});

test("profile specification migration is bounded and idempotent", async () => {
  const sql = await buildProfileSpecificationSql(repoRoot);
  assert.equal((sql.match(/INSERT INTO documents/g) ?? []).length, 16);
  assert.equal((sql.match(/UPDATE documents/g) ?? []).length, 16);
  assert.match(sql, /ON CONFLICT\(tenant_id,doc_key\) DO UPDATE/);
  assert.match(sql, /documents\.payload_json<>json_patch/);
  assert.doesNotMatch(sql, /DELETE|stock_ledger_entries|general_ledger_entries/i);
});
