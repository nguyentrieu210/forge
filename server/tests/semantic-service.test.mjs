import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry, SemanticQueryCompiler } from "../dist/packages/semantic/src/index.js";
import { D1SemanticQueryService } from "../dist/packages/semantic/src/service.js";

const registry = new SemanticModelRegistry([{
  id: "inventory.stock_balance",
  label: "Stock balance",
  source: { kind: "view", name: "stock_balance", tenantField: "tenant_id" },
  grain: "one item and warehouse balance",
  permission: { doctype: "Stock Entry", action: "report" },
  dimensions: [
    { id: "item_code", label: "Item", field: "item_code", kind: "link", options: "Item" },
    { id: "warehouse", label: "Warehouse", field: "warehouse", kind: "link", options: "Warehouse" },
  ],
  metrics: [{
    id: "actual_qty",
    label: "Actual quantity",
    aggregation: "sum",
    field: "actual_qty_micros",
    value: { kind: "quantity", scale: 1_000_000, unit: "stock-uom", exact: true },
    additive: "full",
  }],
  maxRows: 5000,
}]);

const compiler = new SemanticQueryCompiler(registry);
const allScope = { mode: "all", actor_user_id: "reader@example.com", user_permissions: [] };

function fakeDb(events) {
  return {
    prepare(sql) {
      events.push(["prepare", sql]);
      return {
        bind(...params) {
          events.push(["bind", params]);
          return {
            async all() {
              events.push(["all"]);
              return { results: [{ item_code: "AL71", actual_qty: 7_000_000 }] };
            },
          };
        },
      };
    },
  };
}

test("semantic execution resolves permission/read scope before touching D1", async () => {
  const events = [];
  const access = {
    async authorize(request) {
      events.push(["access", request]);
      return allScope;
    },
  };
  const service = new D1SemanticQueryService(fakeDb(events), compiler, access);
  const result = await service.run({
    model: "inventory.stock_balance",
    tenant_id: "tenant-a",
    dimensions: ["item_code"],
    metrics: ["actual_qty"],
  });

  assert.equal(events[0][0], "access");
  assert.deepEqual(events[0][1], {
    tenantId: "tenant-a",
    model: "inventory.stock_balance",
    permission: { doctype: "Stock Entry", action: "report" },
  });
  assert.equal(events[1][0], "prepare");
  assert.equal(result.row_count, 1);
  assert.equal(result.result[0].actual_qty, 7_000_000);
  assert.deepEqual(result.columns.find((column) => column.id === "actual_qty"), {
    id: "actual_qty",
    label: "Actual quantity",
    role: "metric",
    valueKind: "quantity",
    scale: 1_000_000,
    unit: "stock-uom",
    exact: true,
  });
});

test("denied semantic access fails closed before SQL preparation", async () => {
  const events = [];
  const access = {
    async authorize(request) {
      events.push(["access", request]);
      const error = new Error("denied");
      error.code = "PERMISSION_DENIED";
      throw error;
    },
  };
  const service = new D1SemanticQueryService(fakeDb(events), compiler, access);

  await assert.rejects(() => service.run({
    model: "inventory.stock_balance",
    tenant_id: "tenant-a",
    metrics: ["actual_qty"],
  }), (error) => error.code === "PERMISSION_DENIED");

  assert.deepEqual(events.map((entry) => entry[0]), ["access"]);
});

test("unsafe runtime filter values fail before permission or D1 side effects", async () => {
  const events = [];
  const access = { async authorize(request) { events.push(["access", request]); return allScope; } };
  const service = new D1SemanticQueryService(fakeDb(events), compiler, access);

  await assert.rejects(() => service.run({
    model: "inventory.stock_balance",
    tenant_id: "tenant-a",
    metrics: ["actual_qty"],
    filters: [{ dimension: "warehouse", operator: "=", value: { injected: true } }],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.deepEqual(events, []);

  await assert.rejects(() => service.run({
    model: "inventory.stock_balance",
    tenant_id: "tenant-a",
    metrics: ["actual_qty"],
    filters: [{ dimension: "warehouse", operator: "in", value: ["K1", { injected: true }] }],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.deepEqual(events, []);

  await assert.rejects(() => service.run({
    model: "inventory.stock_balance",
    tenant_id: "tenant-a",
    metrics: ["actual_qty"],
    filters: [{ dimension: "warehouse", operator: "like", value: 123 }],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.deepEqual(events, []);
});

test("large offset is refused so bulk extraction must use a cursor/feed path", async () => {
  const events = [];
  const service = new D1SemanticQueryService(fakeDb(events), compiler, {
    async authorize(request) { events.push(["access", request]); return allScope; },
  });
  await assert.rejects(() => service.run({
    model: "inventory.stock_balance",
    tenant_id: "tenant-a",
    metrics: ["actual_qty"],
    offset: 100_001,
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.deepEqual(events, []);
});
