import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStandardization,
  COMPOSITE_ITEMS,
  loadKgItems,
} from "../scripts/lib/alumdoor-item-standardization.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..");

test("real supplier rows map to twelve atomic Alumdoor items", async () => {
  const targets = await loadKgItems(repoRoot);
  const supplierTargets = targets.filter((row) => row.supplierCode);
  assert.equal(supplierTargets.length, 12);
  assert.equal(new Set(supplierTargets.map((row) => row.itemCode)).size, 12);
  assert.deepEqual(
    supplierTargets.filter((row) => row.create).map((row) => row.itemCode).sort(),
    ["AL-YST", "CQ-VM111", "RHM8(2.4MM)", "TD-TG-ALD", "TDU26"],
  );
  assert.equal(supplierTargets.find((row) => row.supplierCode === "TD325")?.itemCode, "TP-TD325");
  assert.equal(supplierTargets.find((row) => row.supplierCode === "RHM8")?.itemCode, "TP-RAYHOP");
  assert.equal(supplierTargets.find((row) => row.supplierCode === "RHU100")?.kgPerM, 1.419);
});

test("ron, ray, trục and atomic leaves are purchased and stocked by Kg", async () => {
  const targets = await loadKgItems(repoRoot);
  assert.equal(targets.length, 17);
  for (const code of [
    "RNHUA-DR",
    "RNINOX-DR",
    "TP-TD325",
    "TP-TD326",
    "TP-TD327",
    "TP-A282",
    "TP-RAYHOP",
    "TP-RAY HỘP TD U100",
    "TRỤC 114_1.8LY",
    "TRỤC 114_2.1LY",
  ]) {
    assert.ok(targets.some((row) => row.itemCode === code), `thiếu ${code}`);
  }
  assert.equal(targets.find((row) => row.itemCode === "RNHUA-DR")?.kgPerM, 0.263);
  assert.equal(targets.find((row) => row.itemCode === "RNINOX-DR")?.kgPerM, 0.124);
});

test("three composite catalog records are disabled in favor of atomic children", () => {
  assert.deepEqual(
    COMPOSITE_ITEMS.map((row) => row.itemCode),
    ["RONNHUA_INOX", "TP-BO3LADAY", "BỘ BA LÁ ĐÁY + LÁ ĐẦU"],
  );
  assert.deepEqual(COMPOSITE_ITEMS[0].children, ["RNHUA-DR", "RNINOX-DR"]);
  assert.deepEqual(COMPOSITE_ITEMS[1].children, ["TP-TD325", "TP-TD326", "TP-TD327"]);
});

test("migration is catalog-only and contains no purchasing formula implementation", async () => {
  const { sql, audit } = await buildStandardization(repoRoot);
  assert.match(sql, /KHÔNG chứa công thức đặt hàng/);
  assert.doesNotMatch(sql, /Purchase Order Item|receipt allocation|outstanding_bars/i);
  assert.equal(audit.scope.purchase_order_formula, false);
  assert.equal(audit.scope.automatic_kg_calculation, false);
  assert.equal(audit.scope.fifo_receipt_allocation, false);
  assert.equal(audit.counts.newly_created_items, 5);
  assert.equal(audit.counts.disabled_composites, 3);
});
