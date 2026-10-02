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

test("R8 benchmark stays conservative after resolving the denominator", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  assert.equal(matrix.module_depth.filter((x) => x.classification === "UNRESOLVED").length, 0);
  assert.equal(matrix.flow_depth.filter((x) => x.classification === "UNRESOLVED").length, 0);
  assert.equal(
    [...matrix.module_depth, ...matrix.flow_depth].filter((x) =>
      ["DEEP_PARITY", "SEMANTIC_PARITY", "FORGE_SUPERSET"].includes(x.classification)
    ).length,
    0,
  );
  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F12-SUBCONTRACTING")?.classification, "PARTIAL");
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


test("R8 P2P distinguishes transaction depth from landed-cost and subcontracting residuals", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const p2p = await readFile(path.join(serverRoot, "packages/clouderp-core/src/procurement-p2p-controllers.ts"), "utf8");
  const landed = await readFile(path.join(serverRoot, "packages/clouderp-core/src/procurement-landed-cost.ts"), "utf8");

  assert.match(p2p, /PURCHASE_MATCH_POLICY_VERSION/);
  assert.match(p2p, /receipt_match_required/);
  assert.match(landed, /never emits a Stock Ledger or GL entry/);

  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F02-P2P")?.classification, "PARTIAL");
  const subcontracting = matrix.flow_depth.find((x) => x.flow_id === "R8-F12-SUBCONTRACTING");
  assert.equal(subcontracting?.classification, "PARTIAL");
  assert.ok(Array.isArray(subcontracting?.gaps) && subcontracting.gaps.length >= 3);
});


test("R8 finance remap keeps strong ledger core separate from unclosed close semantics", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const budget = await readFile(path.join(serverRoot, "packages/clouderp-erpnext/src/finance-budget.ts"), "utf8");
  const enterprise = await readFile(path.join(serverRoot, "packages/clouderp-erpnext/src/enterprise-controllers.ts"), "utf8");
  const bankMatch = await readFile(path.join(serverRoot, "apps-src/vn-accounting-worker/src/bank-match.ts"), "utf8");

  assert.match(budget, /FinanceBudgetController/);
  assert.match(budget, /FinanceBudgetRevisionController/);
  assert.match(budget, /FinanceBudgetCommitmentController/);
  assert.match(enterprise, /BankTransactionController/);
  assert.match(enterprise, /BankReconciliationController/);
  assert.match(bankMatch, /EXACT_AMOUNT/);

  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F04-GL-PERIOD-CLOSE")?.classification, "PARTIAL");
  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F05-CASH-BANK-RECON")?.classification, "PARTIAL");
});


test("R8 manufacturing remap exposes MRP and posted-cost depth boundaries", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  const mrp = await readFile(path.join(serverRoot, "packages/clouderp-erpnext/src/manufacturing-mrp.ts"), "utf8");
  const netting = await readFile(path.join(serverRoot, "packages/clouderp-erpnext/src/manufacturing-mrp-netting.ts"), "utf8");
  const costing = await readFile(path.join(serverRoot, "packages/clouderp-erpnext/src/manufacturing-costing-read.ts"), "utf8");
  const lifecycle = await readFile(path.join(serverRoot, "packages/clouderp-erpnext/src/manufacturing-lifecycle.ts"), "utf8");

  assert.match(mrp, /netting_mode: "gross_only"/);
  assert.match(netting, /ON_HAND_ONLY_NOT_ATP/);
  assert.match(costing, /posting_status: "NOT_POSTED"/);
  assert.match(lifecycle, /VersionedBillOfMaterialsController/);
  assert.match(lifecycle, /SnapshotWorkOrderController/);

  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F10-MFG-BOM-MRP")?.classification, "PARTIAL");
  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F11-MFG-EXEC-COST")?.classification, "PARTIAL");
});


test("R8 P1 breadth resolves every business flow without fabricating parity", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  assert.equal(matrix.flow_depth.filter((x) => x.classification === "UNRESOLVED").length, 0);
  assert.equal(matrix.flow_depth.filter((x) => ["DEEP_PARITY","SEMANTIC_PARITY","FORGE_SUPERSET"].includes(x.classification)).length, 0);
  for (const id of ["R8-F09-WMS","R8-F13-ASSETS","R8-F14-PROJECTS","R8-F15-QUALITY","R8-F16-SUPPORT","R8-F17-COMMERCE-POS","R8-F18-REGIONAL"]) {
    assert.equal(matrix.flow_depth.find((x) => x.flow_id === id)?.classification, "PARTIAL");
  }
});

test("R8 module denominator is benchmark-complete but business closure stays blocked", async () => {
  const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));
  assert.equal(matrix.module_depth.length, 11);
  assert.ok(matrix.module_depth.every((x) => x.classification === "PARTIAL"));
  assert.ok(matrix.module_depth.every((x) => Array.isArray(x.forge_evidence_roots) && x.forge_evidence_roots.length > 0));
  assert.ok(matrix.module_depth.every((x) => Array.isArray(x.gaps) && x.gaps.length > 0));
  assert.equal(matrix.flow_depth.find((x) => x.flow_id === "R8-F12-SUBCONTRACTING")?.classification, "PARTIAL");
});
