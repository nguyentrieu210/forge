import test from "node:test";
import assert from "node:assert/strict";
import { SemanticSnapshotFeedService } from "../dist/packages/semantic/src/feed.js";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";

const registry = new SemanticModelRegistry([{
  id: "sales.summary",
  label: "Sales summary",
  source: { kind: "view", name: "sales_summary", tenantField: "tenant_id" },
  grain: "one submitted sales order",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [
    { id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" },
    { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
  ],
  metrics: [{ id: "revenue_minor", label: "Revenue", aggregation: "sum", field: "revenue_minor", value: { kind: "currency", scale: 100, exact: true } }],
  maxRows: 3,
}]);

const definition = {
  id: "sales.daily_snapshot",
  label: "Daily sales snapshot",
  model: "sales.summary",
  dimensions: ["posting_date", "branch"],
  metrics: ["revenue_minor"],
  order_by: [{ id: "posting_date", direction: "asc" }],
  maxRows: 2,
};

const columns = [
  { id: "posting_date", label: "Posting date", role: "dimension", valueKind: "date" },
  { id: "branch", label: "Branch", role: "dimension", valueKind: "link", options: "Branch" },
  { id: "revenue_minor", label: "Revenue", role: "metric", valueKind: "currency", scale: 100, exact: true },
];

test("snapshot feed injects tenant, keeps source version and proves truncation with one extra row", async () => {
  let request;
  const service = new SemanticSnapshotFeedService({
    async run(input) {
      request = input;
      return {
        model: input.model,
        grain: "one submitted sales order",
        columns,
        result: [
          { posting_date: "2026-08-01", branch: "HCM", revenue_minor: 10000 },
          { posting_date: "2026-08-02", branch: "HN", revenue_minor: 20000 },
          { posting_date: "2026-08-03", branch: "DN", revenue_minor: 30000 },
        ],
        row_count: 3,
      };
    },
  }, registry, () => "2026-08-03T00:00:00.000Z");

  const batch = await service.export({ tenantId: "tenant-a", sourceVersion: "ledger-snapshot-42", definition });
  assert.equal(request.tenant_id, "tenant-a");
  assert.equal(request.limit, 3);
  assert.equal(batch.sourceVersion, "ledger-snapshot-42");
  assert.equal(batch.generatedAt, "2026-08-03T00:00:00.000Z");
  assert.equal(batch.rowCount, 2);
  assert.equal(batch.truncated, true);
  assert.deepEqual(batch.rows.map((row) => row.revenue_minor), [10000, 20000]);
});

test("bounded feed returns complete batch when source fits", async () => {
  const service = new SemanticSnapshotFeedService({
    async run(input) {
      return {
        model: input.model,
        grain: "one submitted sales order",
        columns,
        result: [{ posting_date: "2026-08-01", branch: "HCM", revenue_minor: 10000 }],
        row_count: 1,
      };
    },
  }, registry, () => "2026-08-03T00:00:00.000Z");
  const batch = await service.export({ tenantId: "tenant-a", sourceVersion: "v1", definition });
  assert.equal(batch.truncated, false);
  assert.equal(batch.rowCount, 1);
});

test("exact feed metrics fail closed if executor returns fractional or unsafe numbers", async () => {
  const service = new SemanticSnapshotFeedService({
    async run(input) {
      return {
        model: input.model,
        grain: "one submitted sales order",
        columns,
        result: [{ posting_date: "2026-08-01", branch: "HCM", revenue_minor: 100.5 }],
        row_count: 1,
      };
    },
  }, registry);
  await assert.rejects(() => service.export({ tenantId: "tenant-a", sourceVersion: "v1", definition }), (error) => error.code === "VALIDATION_ERROR");
});

test("feed refuses a row cap that cannot prove whether more data exists", async () => {
  let executed = false;
  const service = new SemanticSnapshotFeedService({ async run() { executed = true; throw new Error("must not run"); } }, registry);
  await assert.rejects(() => service.export({
    tenantId: "tenant-a", sourceVersion: "v1",
    definition: { ...definition, maxRows: 3 },
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(executed, false);
});

test("feed refuses malformed member definitions or missing source version", async () => {
  let executed = false;
  const service = new SemanticSnapshotFeedService({ async run() { executed = true; throw new Error("must not run"); } }, registry);
  await assert.rejects(() => service.export({
    tenantId: "tenant-a", sourceVersion: "v1",
    definition: { ...definition, metrics: ["unknown_metric"] },
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(executed, false);

  await assert.rejects(() => service.export({
    tenantId: "tenant-a", sourceVersion: "",
    definition,
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(executed, false);
});
