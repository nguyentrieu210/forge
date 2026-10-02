import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

test("R8 ERPNext baseline and denominator are fail-closed", async () => {
  const lock = await readJson(path.join(serverRoot, "source-lock.json"));
  const ledger = await readJson(path.join(serverRoot, "docs/spec/source-exact/erpnext-artifact-resolution-ledger.json"));
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const source = lock.sources.find((x) => x.app === "erpnext");

  assert.equal(source.tag, matrix.upstream.tag);
  assert.equal(source.full_sha, matrix.upstream.full_sha);
  assert.equal(ledger.baseline.tag, matrix.upstream.tag);
  assert.equal(ledger.baseline.commit, matrix.upstream.full_sha);
  assert.equal(ledger.entries.length, 109);
  assert.equal(matrix.module_depth.length, 11);
  assert.equal(matrix.flow_depth.length, 18);

  const canonical = ledger.entries.map((x) => x.resolution_id).sort();
  const covered = matrix.module_depth.flatMap((x) => x.artifact_resolution_ids).sort();
  assert.deepEqual(covered, canonical);
  assert.equal(new Set(matrix.flow_depth.map((x) => x.flow_id)).size, 18);
});

test("R8 starts conservatively instead of fabricating ERPNext parity", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const o2c = matrix.flow_depth.find((x) => x.flow_id === "R8-F01-O2C");
  assert.equal(o2c.classification, "PARTIAL");
  assert.ok(matrix.module_depth.every((x) => x.classification === "UNRESOLVED"));
  assert.ok(matrix.flow_depth.filter((x) => x.flow_id !== "R8-F01-O2C").every((x) => x.classification === "UNRESOLVED"));
});


test("R8 O2C remap detects stale oracle-side Forge conclusions", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const oracle = await readJson(path.join(serverRoot, "docs/spec/source-exact/oracle/ORACLE_REPORT.json"));
  const staleAggregate = await readJson(path.join(serverRoot, "docs/spec/source-exact/oracle/differential/differential-report.json"));
  const totals = await readFile(path.join(serverRoot, "packages/clouderp-selling/src/totals.ts"), "utf8");
  const finance = await readFile(path.join(serverRoot, "packages/clouderp-selling/src/finance-controllers.ts"), "utf8");
  const valuation = await readFile(path.join(serverRoot, "packages/clouderp-stock/src/valuation.ts"), "utf8");
  const tracking = await readFile(path.join(serverRoot, "packages/clouderp-stock/src/tracking.ts"), "utf8");

  assert.equal(oracle.s6.total_fixtures, 115);
  assert.equal(oracle.s6.erpnext_captured, 115);
  assert.equal(staleAggregate.erpnext_captured, 0);

  assert.match(totals, /included_in_print_rate/);
  assert.match(totals, /On Previous Row Total/);
  assert.match(totals, /On Item Quantity/);
  assert.match(totals, /Actual/);
  assert.match(finance, /EXCHANGE-DIFFERENCE/);
  assert.match(valuation, /"FIFO" \| "Moving Average"/);
  assert.doesNotMatch(valuation, /"FIFO" \| "Moving Average" \| "LIFO"/);
  assert.match(tracking, /Serial and Batch Bundle/);
  assert.match(tracking, /is expired/);

  for (const id of ["R8-F01-O2C","R8-F03-AR-AP-SETTLEMENT","R8-F06-PRICING-TAX-CURRENCY","R8-F07-STOCK-VALUATION-REPOST","R8-F08-SERIAL-BATCH-TRACEABILITY"]) {
    assert.equal(matrix.flow_depth.find((x) => x.flow_id === id)?.classification, "PARTIAL");
  }
});


test("R8 P2P distinguishes transaction depth from landed-cost/subcontracting gaps", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const p2p = await readFile(path.join(serverRoot, "packages/clouderp-core/src/procurement-p2p-controllers.ts"), "utf8");
  const landed = await readFile(path.join(serverRoot, "packages/clouderp-core/src/procurement-landed-cost.ts"), "utf8");

  assert.match(p2p, /PURCHASE_MATCH_POLICY_VERSION/);
  assert.match(p2p, /receipt_match_required/);
  assert.match(landed, /never emits a Stock Ledger or GL entry/);

  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F02-P2P")?.classification, "PARTIAL");
  const subcontracting = matrix.flow_depth.find((x) => x.flow_id === "R8-F12-SUBCONTRACTING");
  assert.equal(subcontracting?.classification, "GAP");
  assert.ok(Array.isArray(subcontracting?.gaps) && subcontracting.gaps.length >= 3);
});
