import test from "node:test";
import assert from "node:assert/strict";
import { newDecisionRule, serializeDecisionRuleSet, validateDecisionRuleSet } from "../dist/rule/decision-rule.js";

test("numeric-looking literal stays a string", () => {
  const rule = newDecisionRule(0);
  rule.conditions = [{ field: "item_code", operator: "eq", value: "001", valueType: "literal" }];
  const payload = serializeDecisionRuleSet({ rules: [rule] });
  assert.equal(payload.rules[0].when.right.value, "001");
  assert.equal(payload.rules[0].when.right.value_type, undefined);
});

test("decimal value stays a decimal string and carries explicit server mode", () => {
  const rule = newDecisionRule(0);
  rule.conditions = [{ field: "grand_total", operator: "gte", value: "9007199254740993.01", valueType: "decimal" }];
  const payload = serializeDecisionRuleSet({ rules: [rule] });
  assert.equal(payload.rules[0].when.right.value, "9007199254740993.01");
  assert.equal(payload.rules[0].when.right.value_type, "decimal");
});

test("decimal lists stay strings while booleans in literal lists retain JSON type", () => {
  const decimal = newDecisionRule(0);
  decimal.conditions = [{ field: "amount", operator: "in", value: "0.10, 2.000", valueType: "decimal" }];
  assert.deepEqual(serializeDecisionRuleSet({ rules: [decimal] }).rules[0].when.right.value, ["0.10", "2.000"]);

  const literal = newDecisionRule(0);
  literal.conditions = [{ field: "flag", operator: "in", value: "true, false, 001", valueType: "literal" }];
  assert.deepEqual(serializeDecisionRuleSet({ rules: [literal] }).rules[0].when.right.value, [true, false, "001"]);
});

test("builder rejects exponent notation in decimal mode", () => {
  const rule = newDecisionRule(0);
  rule.conditions = [{ field: "amount", operator: "gt", value: "1e9", valueType: "decimal" }];
  const result = validateDecisionRuleSet({ rules: [rule] });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "decimal"));
});
