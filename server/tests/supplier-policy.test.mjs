import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSupplierEligible,
  calculateSupplierRating,
  evaluateBlanketRelease,
  validateSupplierContractPolicy,
} from "../dist/packages/clouderp-core/src/index.js";

test("supplier eligibility keeps legacy master backward-compatible until procurement status is configured", () => {
  const result = assertSupplierEligible("SUP-LEGACY", { supplier_group: "General" }, "2026-08-03");
  assert.equal(result.status, "LegacyUncontrolled");
});

test("supplier eligibility fails closed for pending, expired and category-mismatched approvals", () => {
  assert.throws(
    () => assertSupplierEligible("SUP-PENDING", { procurement_status: "Pending" }, "2026-08-03"),
    /not approved/,
  );
  assert.throws(
    () => assertSupplierEligible("SUP-EXPIRED", {
      procurement_status: "Approved",
      approved_from: "2026-01-01",
      approved_until: "2026-07-31",
    }, "2026-08-03"),
    /approval expired/,
  );
  assert.throws(
    () => assertSupplierEligible("SUP-CATEGORY", {
      procurement_status: "Approved",
      approved_categories: ["Aluminium", "Glass"],
    }, "2026-08-03", "Motor"),
    /not approved for category Motor/,
  );
});

test("supplier eligibility accepts in-date approved supplier and normalizes categories", () => {
  const result = assertSupplierEligible("SUP-A", {
    procurement_status: "Approved",
    approved_from: "2026-08-01",
    approved_until: "2026-12-31",
    approved_categories: "Glass, Aluminium, Glass",
  }, "2026-08-03", "Aluminium");
  assert.equal(result.status, "Approved");
  assert.deepEqual(result.categories, ["Aluminium", "Glass"]);
});

test("supplier rating uses exact basis-point weights and stable grades", () => {
  const result = calculateSupplierRating([
    { key: "quality", score_bps: 9_500, weight_bps: 4_000 },
    { key: "delivery", score_bps: 8_000, weight_bps: 3_000 },
    { key: "commercial", score_bps: 8_500, weight_bps: 2_000 },
    { key: "service", score_bps: 9_000, weight_bps: 1_000 },
  ]);
  assert.equal(result.score_bps, 8_800);
  assert.equal(result.grade, "B");
  assert.throws(
    () => calculateSupplierRating([{ key: "quality", score_bps: 9_000, weight_bps: 9_999 }]),
    /weights must total 10000/,
  );
});

test("supplier contract requires an effective period and at least one ceiling", () => {
  const contract = validateSupplierContractPolicy({
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    maximum_qty_micros: 100_000_000,
    maximum_value_minor: 1_000_000,
  });
  assert.equal(contract.valid_until, "2026-12-31");
  assert.throws(() => validateSupplierContractPolicy({
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
  }), /quantity or value ceiling/);
});

test("blanket release enforces cumulative quantity and value ceilings", () => {
  const contract = {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    maximum_qty_micros: 100_000_000,
    maximum_value_minor: 1_000_000,
  };
  const result = evaluateBlanketRelease(contract, {
    release_qty_micros: 30_000_000,
    release_value_minor: 200_000,
    released_qty_before_micros: 50_000_000,
    released_value_before_minor: 500_000,
  });
  assert.equal(result.released_qty_after_micros, 80_000_000);
  assert.equal(result.remaining_qty_micros, 20_000_000);
  assert.equal(result.remaining_value_minor, 300_000);
  assert.throws(() => evaluateBlanketRelease(contract, {
    release_qty_micros: 60_000_000,
    release_value_minor: 100_000,
    released_qty_before_micros: 50_000_000,
    released_value_before_minor: 500_000,
  }), /quantity ceiling/);
});
