import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDecisionRules, parseDecisionRuleSet } from "../dist/packages/app-registry/src/index.js";

function rule(op, right, valueType = "decimal") {
  return {
    rules: [{
      key: "threshold",
      when: {
        op,
        left: { kind: "field", field: "amount" },
        right: { kind: "value", value: right, ...(valueType ? { value_type: valueType } : {}) },
      },
      outcome: { matched: true },
    }],
  };
}

test("decimal threshold beyond MAX_SAFE_INTEGER remains exact", () => {
  const rules = rule("gt", "9007199254740993.01");
  assert.equal(evaluateDecisionRules(rules, { amount: "9007199254740993.02" }, "2026-08-03").length, 1);
  assert.equal(evaluateDecisionRules(rules, { amount: "9007199254740993.01" }, "2026-08-03").length, 0);
  assert.equal(evaluateDecisionRules(rules, { amount: "9007199254740993.00" }, "2026-08-03").length, 0);
});

test("decimal equality normalizes scale without binary floating point", () => {
  assert.equal(evaluateDecisionRules(rule("eq", "1.0"), { amount: "1.000" }, "2026-08-03").length, 1);
  assert.equal(evaluateDecisionRules(rule("eq", "0.10"), { amount: "0.1000000000000000000001" }, "2026-08-03").length, 0);
});

test("literal numeric-looking identifiers remain literal strings", () => {
  const literal = {
    rules: [{
      key: "code",
      when: {
        op: "eq",
        left: { kind: "field", field: "code" },
        right: { kind: "value", value: "001" },
      },
      outcome: { matched: true },
    }],
  };
  assert.equal(evaluateDecisionRules(literal, { code: "001" }, "2026-08-03").length, 1);
  assert.equal(evaluateDecisionRules(literal, { code: "1" }, "2026-08-03").length, 0);
});

test("decimal list membership uses exact scaled comparison", () => {
  const rules = rule("in", ["0.10", "9007199254740993.01"]);
  assert.equal(evaluateDecisionRules(rules, { amount: "0.100" }, "2026-08-03").length, 1);
  assert.equal(evaluateDecisionRules(rules, { amount: "9007199254740993.010" }, "2026-08-03").length, 1);
});

test("decimal mode rejects exponent notation instead of silently rounding it", () => {
  assert.throws(() => parseDecisionRuleSet(rule("gte", "1e9")), /plain decimal/);
});
