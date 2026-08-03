import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFormulaRules,
  parseFormulaRuleSet,
} from "../dist/packages/app-registry/src/index.js";

const RULES = {
  formulas: [
    {
      key: "subtotal",
      version: 1,
      scale: 2,
      expression: {
        op: "mul",
        args: [
          { op: "field", field: "qty" },
          { op: "field", field: "rate" },
        ],
      },
    },
    {
      key: "tax",
      version: 1,
      scale: 2,
      expression: {
        op: "mul",
        args: [
          { op: "formula", formula: "subtotal" },
          { op: "const", value: "0.10" },
        ],
      },
    },
    {
      key: "grand-total",
      version: 1,
      scale: 2,
      expression: {
        op: "add",
        args: [
          { op: "formula", formula: "subtotal" },
          { op: "formula", formula: "tax" },
        ],
      },
    },
  ],
};

test("fixed-point multiplication and dependent formulas avoid binary float drift", () => {
  const result = evaluateFormulaRules(RULES, { qty: "3", rate: "0.10" }, "2026-08-03");
  const values = Object.fromEntries(result.map((entry) => [entry.key, entry.value]));
  assert.deepEqual(values, {
    "grand-total": "0.33",
    subtotal: "0.30",
    tax: "0.03",
  });
});

test("division rounds half away from zero at declared scale", () => {
  const rules = {
    formulas: [
      { key: "positive", scale: 2, expression: { op: "div", args: [{ op: "const", value: "1" }, { op: "const", value: "8" }] } },
      { key: "negative", scale: 2, expression: { op: "div", args: [{ op: "const", value: "-1" }, { op: "const", value: "8" }] } },
    ],
  };
  const values = Object.fromEntries(evaluateFormulaRules(rules, {}, "2026-08-03").map((entry) => [entry.key, entry.value]));
  assert.equal(values.positive, "0.13");
  assert.equal(values.negative, "-0.13");
});

test("latest effective formula version wins while historical version remains reproducible by date", () => {
  const rules = {
    formulas: [
      { key: "fee", version: 1, scale: 2, effective_from: "2026-01-01", expression: { op: "const", value: "5.00" } },
      { key: "fee", version: 2, scale: 2, effective_from: "2026-07-01", expression: { op: "const", value: "7.50" } },
    ],
  };
  assert.equal(evaluateFormulaRules(rules, {}, "2026-06-30")[0].value, "5.00");
  assert.equal(evaluateFormulaRules(rules, {}, "2026-08-03")[0].value, "7.50");
});

test("formula references are checked and cycles fail closed", () => {
  assert.throws(() => evaluateFormulaRules({
    formulas: [{ key: "a", expression: { op: "formula", formula: "missing" } }],
  }, {}, "2026-08-03"), /unavailable formula missing/);

  assert.throws(() => evaluateFormulaRules({
    formulas: [
      { key: "a", expression: { op: "formula", formula: "b" } },
      { key: "b", expression: { op: "formula", formula: "a" } },
    ],
  }, {}, "2026-08-03"), /dependency cycle/);
});

test("formula parser validates known fields and rejects executable or malformed arithmetic", () => {
  assert.doesNotThrow(() => parseFormulaRuleSet({
    formulas: [{ key: "x", expression: { op: "field", field: "amount" } }],
  }, new Set(["amount"])));
  assert.throws(() => parseFormulaRuleSet({
    formulas: [{ key: "x", expression: { op: "field", field: "ghost" } }],
  }, new Set(["amount"])), /unknown field ghost/);
  assert.throws(() => parseFormulaRuleSet({
    formulas: [{ key: "x", expression: { op: "eval", source: "doc.amount * 2" } }],
  }), /unsupported/);
  assert.throws(() => parseFormulaRuleSet({
    formulas: [{ key: "x", expression: { op: "sub", args: [{ op: "const", value: 1 }] } }],
  }), /exactly two/);
});

test("division by zero is a visible validation failure", () => {
  assert.throws(() => evaluateFormulaRules({
    formulas: [{ key: "x", expression: { op: "div", args: [{ op: "const", value: 1 }, { op: "const", value: 0 }] } }],
  }, {}, "2026-08-03"), /division by zero/);
});
