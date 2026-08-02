import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDecisionRules,
  parseDecisionRuleSet,
} from "../dist/packages/app-registry/src/index.js";

const RULES = {
  schema_version: 1,
  rules: [
    {
      key: "high-value",
      version: 1,
      priority: 20,
      effective_from: "2026-01-01",
      when: {
        op: "and",
        args: [
          { op: "gte", left: { kind: "field", field: "amount" }, right: { kind: "value", value: 1000000 } },
          { op: "eq", left: { kind: "field", field: "company" }, right: { kind: "value", value: "ACME" } },
        ],
      },
      outcome: { route: "director" },
    },
    {
      key: "high-value",
      version: 2,
      priority: 10,
      effective_from: "2026-07-01",
      when: { op: "gte", left: { kind: "field", field: "amount" }, right: { kind: "value", value: 2000000 } },
      outcome: { route: "board" },
      stop: true,
    },
    {
      key: "priority-supplier",
      version: 1,
      priority: 30,
      when: { op: "in", left: { kind: "field", field: "supplier" }, right: { kind: "value", value: ["S1", "S2"] } },
      outcome: { tag: "priority" },
    },
  ],
};

test("latest effective rule version wins and stop is deterministic", () => {
  const matches = evaluateDecisionRules(RULES, { amount: 2500000, company: "ACME", supplier: "S1" }, "2026-08-03");
  assert.deepEqual(matches.map((entry) => `${entry.key}@${entry.version}`), ["high-value@2"]);
  assert.equal(matches[0].outcome.route, "board");
});

test("older effective version remains active before the new version starts", () => {
  const matches = evaluateDecisionRules(RULES, { amount: 1500000, company: "ACME", supplier: "S1" }, "2026-06-01");
  assert.deepEqual(matches.map((entry) => entry.key), ["high-value", "priority-supplier"]);
  assert.equal(matches[0].version, 1);
});

test("exists/not/in/not_in and logical composition remain data-only", () => {
  const rules = {
    rules: [{
      key: "route",
      when: {
        op: "and",
        args: [
          { op: "exists", field: "project", exists: true },
          { op: "not", args: [{ op: "not_in", left: { kind: "field", field: "status" }, right: { kind: "value", value: ["Open", "Pending"] } }] },
        ],
      },
      outcome: { queue: "ops" },
    }],
  };
  assert.equal(evaluateDecisionRules(rules, { project: "P1", status: "Open" }, "2026-08-03").length, 1);
  assert.equal(evaluateDecisionRules(rules, { project: "", status: "Open" }, "2026-08-03").length, 0);
});

test("parser validates known fields and rejects executable-looking/unknown operations", () => {
  const known = new Set(["amount"]);
  assert.doesNotThrow(() => parseDecisionRuleSet({
    rules: [{ key: "ok", when: { op: "gt", left: { kind: "field", field: "amount" }, right: { kind: "value", value: 0 } }, outcome: {} }],
  }, known));
  assert.throws(() => parseDecisionRuleSet({
    rules: [{ key: "bad", when: { op: "gt", left: { kind: "field", field: "ghost" }, right: { kind: "value", value: 0 } }, outcome: {} }],
  }, known), /unknown field ghost/);
  assert.throws(() => parseDecisionRuleSet({
    rules: [{ key: "bad", when: { op: "eval", source: "process.exit()" }, outcome: {} }],
  }), /unsupported/);
});

test("duplicate versions and invalid effective periods fail closed", () => {
  assert.throws(() => parseDecisionRuleSet({ rules: [
    { key: "x", version: 1, when: { op: "exists", field: "a", exists: true }, outcome: {} },
    { key: "x", version: 1, when: { op: "exists", field: "a", exists: true }, outcome: {} },
  ] }), /Duplicate decision rule version/);
  assert.throws(() => parseDecisionRuleSet({ rules: [{
    key: "x", effective_from: "2026-08-03", effective_to: "2026-08-01",
    when: { op: "exists", field: "a", exists: true }, outcome: {},
  }] }), /must not precede/);
});
