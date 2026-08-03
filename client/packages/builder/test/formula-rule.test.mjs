import test from "node:test";
import assert from "node:assert/strict";
import { newFormulaRule, serializeFormulaRuleSet, validateFormulaRuleSet } from "../dist/formula/formula-rule.js";

test("formula builder serializes left-to-right arithmetic into deterministic AST", () => {
  const formula = newFormulaRule(0);
  formula.key = "grand-total";
  formula.start = { kind: "field", value: "subtotal" };
  formula.steps = [
    { operator: "add", operand: { kind: "formula", value: "tax" } },
    { operator: "sub", operand: { kind: "const", value: "5.00" } },
  ];
  const payload = serializeFormulaRuleSet({ formulas: [formula] });
  assert.deepEqual(payload.formulas[0].expression, {
    op: "sub",
    args: [
      { op: "add", args: [{ op: "field", field: "subtotal" }, { op: "formula", formula: "tax" }] },
      { op: "const", value: "5.00" },
    ],
  });
});

test("constants remain decimal strings instead of JavaScript binary floats", () => {
  const formula = newFormulaRule(0);
  formula.start = { kind: "const", value: "0.10" };
  formula.steps = [{ operator: "mul", operand: { kind: "field", value: "amount" } }];
  const payload = serializeFormulaRuleSet({ formulas: [formula] });
  assert.equal(payload.formulas[0].expression.args[0].value, "0.10");
});

test("builder validates scale, field references and decimal constants", () => {
  const formula = newFormulaRule(0);
  formula.scale = 9;
  formula.start = { kind: "field", value: "ghost" };
  formula.steps = [{ operator: "add", operand: { kind: "const", value: "1e3" } }];
  const result = validateFormulaRuleSet({ formulas: [formula] }, new Set(["amount"]));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "scale"));
  assert.ok(result.issues.some((entry) => entry.code === "field_unknown"));
  assert.ok(result.issues.some((entry) => entry.code === "decimal"));
});
