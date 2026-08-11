import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSalesAdjustmentRules,
  salesAdjustmentRulesFromRecords,
} from "../dist/packages/clouderp-selling/src/index.js";

function record(name, data, version = 1) {
  return { name, data, version };
}

const context = {
  postingDate: "2026-08-11",
  currency: "VND",
  currencyScale: 0,
};

test("persisted adjustment rule is effective-dated, auditable and executable", () => {
  const rules = salesAdjustmentRulesFromRecords([
    record("SAR-0001", {
      code: "PREMIUM_FINISH",
      description: "Premium finish",
      currency: "VND",
      basis: "AREA_SQM",
      rate: 465000,
      scope: "LINE",
      valid_from: "2026-08-01",
      valid_upto: "2026-12-31",
      priority: 100,
      taxable: 1,
      discountable: 0,
      conditions: [
        { field: "finish_type", operator: "eq", value: "PREMIUM" },
      ],
    }, 7),
  ], context);

  assert.equal(rules.length, 1);
  assert.equal(rules[0].source_name, "SAR-0001");
  assert.equal(rules[0].source_version, 7);
  assert.equal(rules[0].rate_minor, 465000);

  const result = evaluateSalesAdjustmentRules({
    facts: { finish_type: "PREMIUM" },
    area_sqm: 5.2,
  }, rules);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].rule_code, "PREMIUM_FINISH");
  assert.equal(result.applied[0].basis_qty, "5.200000");
  assert.equal(result.applied[0].amount_minor, 2418000);
});

test("disabled, out-of-period and other-currency rules are not active", () => {
  const rules = salesAdjustmentRulesFromRecords([
    record("DISABLED", {
      code: "DISABLED", currency: "VND", basis: "FIXED", rate: 1, disabled: 1,
    }),
    record("FUTURE", {
      code: "FUTURE", currency: "VND", basis: "FIXED", rate: 1, valid_from: "2027-01-01",
    }),
    record("OLD", {
      code: "OLD", currency: "VND", basis: "FIXED", rate: 1, valid_upto: "2026-01-01",
    }),
    record("USD-RULE", {
      code: "USD_RULE", currency: "USD", basis: "FIXED", rate: 1,
    }),
    record("ACTIVE", {
      code: "ACTIVE", currency: "VND", basis: "FIXED", rate: 1000,
    }),
  ], context);

  assert.deepEqual(rules.map((rule) => rule.code), ["ACTIVE"]);
});

test("persisted rule contract fails closed on malformed basis/operator/rate", () => {
  assert.throws(() => salesAdjustmentRulesFromRecords([
    record("BAD-BASIS", { code: "BAD", currency: "VND", basis: "MAGIC", rate: 1 }),
  ], context), /unsupported basis/);

  assert.throws(() => salesAdjustmentRulesFromRecords([
    record("BAD-OP", {
      code: "BAD_OP", currency: "VND", basis: "FIXED", rate: 1,
      conditions: [{ field: "finish_type", operator: "contains", value: "X" }],
    }),
  ], context), /unsupported operator/);

  assert.throws(() => salesAdjustmentRulesFromRecords([
    record("BAD-RATE", { code: "BAD_RATE", currency: "VND", basis: "FIXED", rate: -1 }),
  ], context), /rate cannot be negative/);
});

test("duplicate active rule codes are rejected instead of being resolved by record order", () => {
  assert.throws(() => salesAdjustmentRulesFromRecords([
    record("SAR-A", { code: "SAME", currency: "VND", basis: "FIXED", rate: 1000 }),
    record("SAR-B", { code: "SAME", currency: "VND", basis: "FIXED", rate: 2000 }),
  ], context), /Multiple active Sales Adjustment Rule records use code SAME/);
});

test("IN conditions are stored as typed child-row values rather than code branches", () => {
  const rules = salesAdjustmentRulesFromRecords([
    record("SAR-IN", {
      code: "TARGET_CLASS",
      currency: "VND",
      basis: "SET_COUNT",
      rate: 300000,
      conditions: [{ field: "product_class", op: "in", values: ["A", "B"] }],
    }),
  ], context);

  const applied = evaluateSalesAdjustmentRules({
    facts: { product_class: "B" },
    set_count: 2,
  }, rules);
  assert.equal(applied.applied[0].amount_minor, 600000);
});
