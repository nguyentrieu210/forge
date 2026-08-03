import test from "node:test";
import assert from "node:assert/strict";
import { newDecisionRule, serializeDecisionRuleSet, validateDecisionRuleSet } from "../dist/rule/decision-rule.js";

test("decision rule builder serializes all/any conditions into safe AST", () => {
  const rule = newDecisionRule(0);
  rule.key = "high-value";
  rule.logic = "all";
  rule.conditions = [
    { field: "grand_total", operator: "gte", value: "1000000" },
    { field: "company", operator: "eq", value: "ACME" },
  ];
  rule.outcomeJson = '{"route":"director"}';
  rule.stop = true;
  const payload = serializeDecisionRuleSet({ rules: [rule] });
  assert.equal(payload.rules[0].when.op, "and");
  assert.equal(payload.rules[0].when.args[0].right.value, 1000000);
  assert.deepEqual(payload.rules[0].outcome, { route: "director" });
  assert.equal(payload.rules[0].stop, true);
});

test("in/not_in values become typed lists and exists stays data-only", () => {
  const rule = newDecisionRule(0);
  rule.conditions = [
    { field: "status", operator: "in", value: "Open, Pending, 3" },
    { field: "project", operator: "exists", value: "false" },
  ];
  const payload = serializeDecisionRuleSet({ rules: [rule] });
  assert.deepEqual(payload.rules[0].when.args[0].right.value, ["Open", "Pending", 3]);
  assert.deepEqual(payload.rules[0].when.args[1], { op: "exists", field: "project", exists: false });
});

test("builder validates known fields, duplicate versions and outcome JSON", () => {
  const first = newDecisionRule(0);
  first.key = "x";
  first.conditions[0].field = "ghost";
  first.conditions[0].value = "1";
  first.outcomeJson = "{bad";
  const second = structuredClone(first);
  const result = validateDecisionRuleSet({ rules: [first, second] }, new Set(["amount"]));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "field_unknown"));
  assert.ok(result.issues.some((entry) => entry.code === "duplicate"));
  assert.ok(result.issues.some((entry) => entry.code === "outcome_json"));
});
