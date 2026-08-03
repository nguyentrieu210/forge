import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTaxRuleset,
  parseTaxRuleset,
  parseTaxTestVectors,
  validateTaxTestVectors,
} from "../dist/apps-src/vn-accounting-worker/src/evaluator.js";

const input = (name) => ({ op: "input", name });
const constant = (value) => ({ op: "const", value });

test("tax evaluator calculates VAT using integer basis points", () => {
  const schema = parseTaxRuleset({
    version: 1,
    outputs: {
      vat_minor: { op: "mul_bps", value: input("taxable_minor"), basis_points: 1000 },
    },
  });
  assert.deepEqual(evaluateTaxRuleset(schema, { taxable_minor: 1_234_567 }).outputs, { vat_minor: 123_457 });
});

test("tax evaluator handles progressive marginal tiers without floating point", () => {
  const schema = parseTaxRuleset({
    version: 1,
    outputs: {
      pit_minor: {
        op: "progressive",
        value: { op: "floor_zero", value: input("taxable_income_minor") },
        tiers: [
          { up_to_minor: 10_000, basis_points: 500 },
          { up_to_minor: 20_000, basis_points: 1000 },
          { up_to_minor: null, basis_points: 2000 },
        ],
      },
    },
  });
  assert.equal(evaluateTaxRuleset(schema, { taxable_income_minor: 30_000 }).outputs.pit_minor, 3_500);
  assert.equal(evaluateTaxRuleset(schema, { taxable_income_minor: -1 }).outputs.pit_minor, 0);
});

test("tax evaluator supports conditional deductible rules", () => {
  const schema = parseTaxRuleset({
    version: 1,
    outputs: {
      deductible_minor: {
        op: "if",
        condition: { op: "lte", left: input("expense_minor"), right: input("deduction_cap_minor") },
        then: input("expense_minor"),
        else: input("deduction_cap_minor"),
      },
      adjustment_minor: {
        op: "max",
        args: [
          constant(0),
          { op: "sub", left: input("expense_minor"), right: input("deduction_cap_minor") },
        ],
      },
    },
  });
  assert.deepEqual(evaluateTaxRuleset(schema, { expense_minor: 1500, deduction_cap_minor: 1000 }).outputs, {
    deductible_minor: 1000,
    adjustment_minor: 500,
  });
});

test("tax ruleset approval vectors must match every output exactly", () => {
  const schema = parseTaxRuleset({
    version: 1,
    outputs: { vat_minor: { op: "mul_bps", value: input("base_minor"), basis_points: 1000 } },
  });
  const passing = parseTaxTestVectors(JSON.stringify([
    { name: "basic", inputs: { base_minor: 10_000 }, expected: { vat_minor: 1_000 } },
  ]));
  assert.doesNotThrow(() => validateTaxTestVectors(schema, passing));
  const failing = parseTaxTestVectors([
    { name: "wrong", inputs: { base_minor: 10_000 }, expected: { vat_minor: 999 } },
  ]);
  assert.throws(() => validateTaxTestVectors(schema, failing), /failed vat_minor/);
});

test("tax evaluator fails closed on unsupported schemas, uncovered tiers and overflow", () => {
  assert.throws(() => parseTaxRuleset({ version: 2, outputs: { x: constant(1) } }), /version must be 1/);
  const uncovered = parseTaxRuleset({
    version: 1,
    outputs: {
      tax_minor: { op: "progressive", value: input("base_minor"), tiers: [{ up_to_minor: 10, basis_points: 100 }] },
    },
  });
  assert.throws(() => evaluateTaxRuleset(uncovered, { base_minor: 11 }), /do not cover taxable value/);
  const overflow = parseTaxRuleset({
    version: 1,
    outputs: {
      x: { op: "add", args: [constant(Number.MAX_SAFE_INTEGER), constant(1)] },
    },
  });
  assert.throws(() => evaluateTaxRuleset(overflow, {}), /safe integer bounds/);
});
