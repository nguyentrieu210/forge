import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { parseSemanticAssistantProposal, SemanticAssistantQueryTool } from "../dist/packages/semantic/src/ai-query.js";

const registry = new SemanticModelRegistry([{
  id: "sales.orders",
  label: "Sales orders",
  description: "Submitted sales order performance",
  source: { kind: "view", name: "sales_order_semantic_view", tenantField: "tenant_id" },
  grain: "one submitted sales order",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [
    { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
    { id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" },
  ],
  metrics: [
    { id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } },
    { id: "grand_total_minor", label: "Grand total", aggregation: "sum", field: "grand_total_minor", value: { kind: "currency", scale: 100, exact: true } },
  ],
  maxRows: 500,
}]);

test("AI catalog exposes business semantics but no physical SQL source", () => {
  const calls = [];
  const tool = new SemanticAssistantQueryTool(registry, { run: async () => { throw new Error("not used"); } }, {
    begin: async () => "audit-1", finish: async (value) => calls.push(value),
  });
  const catalog = tool.catalog();
  const serialized = JSON.stringify(catalog);
  assert.match(serialized, /sales.orders/);
  assert.match(serialized, /grand_total_minor/);
  assert.ok(!serialized.includes("sales_order_semantic_view"));
  assert.ok(!serialized.includes("tenant_id"));
  assert.ok(!serialized.includes('"field"'));
});

test("AI proposal is semantic data only and cannot choose tenant", () => {
  const proposal = parseSemanticAssistantProposal(registry, {
    model: "sales.orders",
    dimensions: ["branch"],
    metrics: ["grand_total_minor"],
    filters: [{ dimension: "posting_date", operator: ">=", value: "2026-08-01" }],
    order_by: [{ id: "grand_total_minor", direction: "desc" }],
    limit: 20,
    tenant_id: "attacker-tenant",
    raw_sql: "SELECT * FROM secrets",
  });
  assert.deepEqual(proposal, {
    model: "sales.orders",
    dimensions: ["branch"],
    metrics: ["grand_total_minor"],
    filters: [{ dimension: "posting_date", operator: ">=", value: "2026-08-01" }],
    order_by: [{ id: "grand_total_minor", direction: "desc" }],
    limit: 20,
  });
});

test("AI query opens audit intent before executor and injects trusted tenant", async () => {
  const events = [];
  let executedRequest;
  const executor = {
    async run(request) {
      events.push("execute");
      executedRequest = request;
      return { model: request.model, grain: "one submitted sales order", columns: [], result: [], row_count: 0 };
    },
  };
  const audit = {
    async begin(intent) { events.push("audit-begin"); assert.equal(intent.tenantId, "trusted-tenant"); return "audit-7"; },
    async finish(completion) { events.push(`audit-finish:${completion.status}`); },
  };
  const tool = new SemanticAssistantQueryTool(registry, executor, audit);
  const result = await tool.execute({
    tenantId: "trusted-tenant",
    userId: "manager@example.com",
    question: "Doanh số theo chi nhánh?",
    proposal: { model: "sales.orders", dimensions: ["branch"], metrics: ["grand_total_minor"] },
  });
  assert.equal(result.row_count, 0);
  assert.deepEqual(events, ["audit-begin", "execute", "audit-finish:success"]);
  assert.equal(executedRequest.tenant_id, "trusted-tenant");
});

test("audit begin failure prevents any semantic data read", async () => {
  let executed = false;
  const tool = new SemanticAssistantQueryTool(registry, {
    async run() { executed = true; throw new Error("must not run"); },
  }, {
    async begin() { throw new Error("audit unavailable"); },
    async finish() { throw new Error("must not finish"); },
  });
  await assert.rejects(() => tool.execute({
    tenantId: "trusted-tenant", userId: "u", question: "q",
    proposal: { model: "sales.orders", metrics: ["order_count"] },
  }), /audit unavailable/);
  assert.equal(executed, false);
});

test("permission denial is completed as denied audit evidence", async () => {
  const completions = [];
  const permissionError = Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" });
  const tool = new SemanticAssistantQueryTool(registry, {
    async run() { throw permissionError; },
  }, {
    async begin() { return "audit-denied"; },
    async finish(value) { completions.push(value); },
  });
  await assert.rejects(() => tool.execute({
    tenantId: "trusted-tenant", userId: "u", question: "q",
    proposal: { model: "sales.orders", metrics: ["order_count"] },
  }), (error) => error === permissionError);
  assert.deepEqual(completions, [{ auditId: "audit-denied", status: "denied", errorCode: "PERMISSION_DENIED" }]);
});

test("AI proposal fails closed on unknown members, excessive limits and forged operators", () => {
  assert.throws(() => parseSemanticAssistantProposal(registry, {
    model: "sales.orders", metrics: ["secret_total"],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticAssistantProposal(registry, {
    model: "sales.orders", metrics: ["order_count"], limit: 5000,
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticAssistantProposal(registry, {
    model: "sales.orders", metrics: ["order_count"],
    filters: [{ dimension: "branch", operator: "= ? OR 1=1", value: "x" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});
