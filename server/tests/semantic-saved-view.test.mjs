import test from "node:test";
import assert from "node:assert/strict";
import { parseSemanticSavedView, SemanticSavedViewRegistry } from "../dist/packages/semantic/src/saved-view.js";

const saved = {
  id: "sales.my_branch",
  label: "My branch sales",
  ownerUserId: "alice@example.com",
  query: {
    model: "sales.orders",
    dimensions: ["branch"],
    metrics: ["order_count"],
    filters: [{ dimension: "branch", operator: "=", value: "HCM" }],
    limit: 100,
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  modifiedAt: "2026-08-03T00:00:00.000Z",
};

test("saved view stores semantic query only and tenant is injected at use time", () => {
  const registry = new SemanticSavedViewRegistry([saved]);
  const request = registry.materialize({ id: "sales.my_branch", ownerUserId: "alice@example.com", tenantId: "tenant-a" });
  assert.equal(request.tenant_id, "tenant-a");
  assert.equal(request.model, "sales.orders");
  assert.ok(!JSON.stringify(saved).includes("tenant-a"));
});

test("saved view is owner-private and not discoverable through another owner", () => {
  const registry = new SemanticSavedViewRegistry([saved]);
  assert.deepEqual(registry.list("bob@example.com"), []);
  assert.throws(() => registry.materialize({ id: "sales.my_branch", ownerUserId: "bob@example.com", tenantId: "tenant-a" }), (error) => error.code === "PERMISSION_DENIED");
});

test("saved view query rejects raw SQL, tenant overrides, offsets and nested filters", () => {
  assert.throws(() => parseSemanticSavedView({ ...saved, query: { ...saved.query, raw_sql: "select * from secrets" } }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticSavedView({ ...saved, query: { ...saved.query, tenant_id: "attacker" } }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticSavedView({ ...saved, query: { ...saved.query, offset: 10 } }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticSavedView({
    ...saved,
    query: { ...saved.query, filters: [{ dimension: "branch", operator: "=", value: { injected: true } }] },
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("saved view timestamps and duplicate ids fail closed", () => {
  assert.throws(() => parseSemanticSavedView({ ...saved, modifiedAt: "2026-07-01T00:00:00.000Z" }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => new SemanticSavedViewRegistry([saved, saved]), (error) => error.code === "VALIDATION_ERROR");
});
