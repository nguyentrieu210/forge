import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  canonicalBatchRequestMaterial,
  createBatchActionResultEnvelope,
  normalizeBatchActionInvocation,
  parseAppManifestWithInputTables,
  toBatchExecutorPlan,
} from "../dist/packages/app-registry/src/index.js";
import { executeBatch } from "../dist/packages/batch-executor/src/index.js";
import {
  STOCK_RECONCILIATION_BATCH_CONTRACT,
  createStockReconciliationBatchDomainExecutor,
} from "../dist/packages/clouderp-erpnext/src/index.js";

class MemoryReplayStore {
  constructor() { this.rows = new Map(); }
  key(scope) { return `${scope.tenantId}:${scope.idempotencyKey}`; }
  async claim(scope) {
    const row = this.rows.get(this.key(scope));
    if (!row) {
      this.rows.set(this.key(scope), { state: "in_flight", requestHash: scope.requestHash });
      return { state: "acquired" };
    }
    if (row.state === "completed") return { state: "replay", requestHash: row.requestHash, result: row.result };
    return { state: "in_flight", requestHash: row.requestHash };
  }
  async complete(scope, result) {
    this.rows.set(this.key(scope), { state: "completed", requestHash: scope.requestHash, result });
  }
  async release() {}
}

function snapshotDraft() {
  return {
    warehouse: "KHO-1",
    scope: "Toàn kho",
    snapshot_at: "2026-08-04T03:00:00.000Z",
    counted_by: "counter@example.test",
    company: "ALU",
    currency: "VND",
    currency_scale: 0,
    items: [
      {
        row_id: "ROW-A",
        item_code: "A",
        batch_no: "B1",
        book_qty_micros: 10_000_000,
        counted_qty: "10.000000",
        variance_qty_micros: 0,
      },
      {
        row_id: "ROW-B",
        item_code: "B",
        batch_no: "B2",
        book_qty_micros: 20_000_000,
        counted_qty: "20.000000",
        variance_qty_micros: 0,
      },
    ],
  };
}

function manifest() {
  return {
    id: "inventory-batch-test",
    name: "Inventory Batch Test",
    version: "1.0.0",
    doctypes: [{
      name: "Stock Reconciliation",
      module: "Stock",
      fields: [{ fieldname: "warehouse", label: "Warehouse", fieldtype: "Data" }],
      permissions: [{ role: "Stock User", read: true, write: true, create: true }],
      revision: 1,
    }],
    roles: [{ role: "Stock User" }],
    worker: "inventory-batch-test-worker",
    actions: [{
      name: "count-stock",
      label: "Count stock",
      fields: [{ fieldname: "reconciliation", label: "Reconciliation", fieldtype: "Data", required: true }],
      input_tables: [{
        fieldname: "counts",
        label: "Counts",
        columns: [
          { fieldname: "item_code", label: "Item", fieldtype: "Data", required: true },
          { fieldname: "batch_no", label: "Batch", fieldtype: "Data" },
          { fieldname: "counted_qty", label: "Counted qty", fieldtype: "Float", required: true },
        ],
        min_rows: 1,
        max_rows: 500,
        allow_paste: true,
      }],
      batch: STOCK_RECONCILIATION_BATCH_CONTRACT,
      preview: { method: "inventory.preview", label: "Preview" },
      commit: { method: "inventory.commit", label: "Save" },
      permission_doctype: "Stock Reconciliation",
    }],
  };
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function invocation(mode = "commit") {
  const action = parseAppManifestWithInputTables(manifest()).actions[0];
  return normalizeBatchActionInvocation({
    contract_version: 1,
    batch_id: "recon-batch-1",
    ...(mode === "commit" ? { idempotency_key: "recon-idem-1" } : {}),
    payload: {
      reconciliation: "RECON-1",
      counts: [
        { item_code: "B", batch_no: "B2", counted_qty: 20 },
        { item_code: "A", batch_no: "B1", counted_qty: 9 },
      ],
    },
  }, action.batch, mode);
}

test("A3 declares one whole-table transaction and preview delegates to canonical save gateway without commit", async () => {
  const normalized = invocation("preview");
  assert.equal(normalized.itemization, "table");
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].operation_id, "recon-batch-1:counts");

  const calls = [];
  const domain = createStockReconciliationBatchDomainExecutor({
    async assertCanSave(context, name) { calls.push(["permission", context.tenantId, context.actor.user_id, name]); },
    async loadDraft(context, name) { calls.push(["load", context.tenantId, name]); return snapshotDraft(); },
    async previewCanonicalSave(context, name, document) {
      calls.push(["preview", context.operationId, name]);
      return { name, items: document.items };
    },
    async commitCanonicalSave() { throw new Error("commit must not run during preview"); },
  });

  const plan = toBatchExecutorPlan(normalized, sha256(canonicalBatchRequestMaterial(normalized)));
  const trace = await executeBatch({
    plan,
    context: {
      tenantId: "tenant-trusted",
      actor: { user_id: "stock@example.test", roles: ["Stock User"] },
      traceId: "trace-recon-preview",
    },
    domain,
  });
  const result = createBatchActionResultEnvelope(trace);

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].value.items.map((row) => [row.row_id, row.item_code, row.counted_qty]), [
    ["ROW-A", "A", 9],
    ["ROW-B", "B", 20],
  ]);
  assert.deepEqual(calls.map((entry) => entry[0]), ["permission", "load", "preview"]);
  assert.ok(calls.every((entry) => !entry.includes("client-tenant")));
});

test("A3 commit executes one canonical save and A2 replay prevents a duplicate save", async () => {
  const normalized = invocation("commit");
  const plan = toBatchExecutorPlan(normalized, sha256(canonicalBatchRequestMaterial(normalized)));
  let commits = 0;
  const domain = createStockReconciliationBatchDomainExecutor({
    async assertCanSave(context) { assert.equal(context.tenantId, "tenant-trusted"); },
    async loadDraft() { return snapshotDraft(); },
    async previewCanonicalSave() { throw new Error("preview must not run during commit"); },
    async commitCanonicalSave(context, name, document) {
      commits += 1;
      return { name, operation_id: context.operationId, row_count: document.items.length };
    },
  });
  const options = {
    plan,
    context: {
      tenantId: "tenant-trusted",
      actor: { user_id: "stock@example.test", roles: ["Stock User"] },
      traceId: "trace-recon-commit",
    },
    domain,
    replayStore: new MemoryReplayStore(),
  };

  const first = await executeBatch(options);
  const replay = await executeBatch(options);
  assert.equal(commits, 1);
  assert.equal(first.items[0].operationId, "recon-batch-1:counts");
  assert.equal(replay.replayed, true);
});

test("A3 consumer rejects client-supplied tenant or actor authority", async () => {
  const domain = createStockReconciliationBatchDomainExecutor({
    async assertCanSave() { throw new Error("must fail before permission gateway"); },
    async loadDraft() { return snapshotDraft(); },
    async previewCanonicalSave() { return {}; },
    async commitCanonicalSave() { return {}; },
  });
  const context = {
    tenantId: "tenant-trusted",
    actor: { user_id: "stock@example.test", roles: ["Stock User"] },
    traceId: "trace",
    batchId: "batch",
    itemId: "counts",
    itemIndex: 0,
    operationId: "batch:counts",
  };

  await assert.rejects(
    () => domain.preview({
      shared_inputs: { reconciliation: "RECON-1", tenant_id: "client-tenant" },
      item: { counts: [{ item_code: "A", batch_no: "B1", counted_qty: 10 }] },
    }, context),
    /server-authoritative/,
  );
});
