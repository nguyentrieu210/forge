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

class MemoryReplayStore {
  constructor() { this.rows = new Map(); }
  key(scope) { return `${scope.tenantId}:${scope.idempotencyKey}`; }
  async claim(scope) {
    const row = this.rows.get(this.key(scope));
    if (!row) {
      this.rows.set(this.key(scope), { requestHash: scope.requestHash, state: "in_flight" });
      return { state: "acquired" };
    }
    if (row.state === "completed") return { state: "replay", requestHash: row.requestHash, result: row.result };
    return { state: "in_flight", requestHash: row.requestHash };
  }
  async complete(scope, result) {
    this.rows.set(this.key(scope), { requestHash: scope.requestHash, state: "completed", result });
  }
  async release() {}
}

function packageWithBatch() {
  return {
    id: "batch-integration",
    name: "Batch Integration",
    version: "1.0.0",
    doctypes: [{
      name: "Batch Document",
      module: "Operations",
      fields: [{ fieldname: "title", label: "Title", fieldtype: "Data" }],
      permissions: [{ role: "Operations User", read: true, write: true, create: true }],
      revision: 1,
    }],
    roles: [{ role: "Operations User" }],
    worker: "batch-integration-worker",
    actions: [{
      name: "apply-lines",
      label: "Apply lines",
      fields: [
        { fieldname: "company", label: "Company", fieldtype: "Data", required: true },
        { fieldname: "warehouse", label: "Warehouse", fieldtype: "Data", required: true },
      ],
      input_tables: [{
        fieldname: "lines",
        label: "Lines",
        columns: [
          { fieldname: "row_id", label: "Row", fieldtype: "Data", required: true },
          { fieldname: "qty", label: "Qty", fieldtype: "Float", required: true },
        ],
        min_rows: 1,
        max_rows: 20,
        allow_paste: true,
      }],
      batch: {
        contract_version: 1,
        input_table: "lines",
        item_id_field: "row_id",
        atomicity: "independent",
        max_items: 20,
      },
      preview: { method: "batch_integration.preview", label: "Preview" },
      commit: { method: "batch_integration.commit", label: "Commit" },
      permission_doctype: "Batch Document",
    }],
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("A1 canonical invocation adapts losslessly into A2 and back to public result", async () => {
  const action = parseAppManifestWithInputTables(packageWithBatch()).actions[0];
  const invocation = normalizeBatchActionInvocation({
    contract_version: 1,
    batch_id: "batch-integration-1",
    idempotency_key: "idem-integration-1",
    payload: {
      company: "ACME",
      warehouse: "MAIN",
      lines: [
        { row_id: "row-1", qty: 2 },
        { row_id: "row-2", qty: 3 },
      ],
    },
  }, action.batch, "commit");

  const requestHash = sha256(canonicalBatchRequestMaterial(invocation));
  const plan = toBatchExecutorPlan(invocation, requestHash);
  assert.equal(plan.items[0].value.shared_inputs.company, "ACME");
  assert.equal(plan.items[0].value.shared_inputs.warehouse, "MAIN");
  assert.equal(plan.items[0].value.item.row_id, "row-1");

  const replayStore = new MemoryReplayStore();
  const committed = [];
  const options = {
    plan,
    context: {
      tenantId: "tenant-server-authority",
      actor: { user_id: "operator@example.com" },
      traceId: "trace-integration-1",
    },
    replayStore,
    domain: {
      async preview() { throw new Error("preview must not run during commit"); },
      async commit(value, context) {
        committed.push({ value, operationId: context.operationId, tenantId: context.tenantId });
        return { accepted_qty: value.item.qty, company: value.shared_inputs.company };
      },
    },
  };

  const firstTrace = await executeBatch(options);
  const replayTrace = await executeBatch(options);
  const publicResult = createBatchActionResultEnvelope(firstTrace);

  assert.deepEqual(committed.map((entry) => entry.operationId), [
    "batch-integration-1:row-1",
    "batch-integration-1:row-2",
  ]);
  assert.ok(committed.every((entry) => entry.tenantId === "tenant-server-authority"));
  assert.equal(publicResult.items[0].value.company, "ACME");
  assert.equal(replayTrace.replayed, true);
});

test("shared scalar changes alter canonical replay identity", () => {
  const action = parseAppManifestWithInputTables(packageWithBatch()).actions[0];
  const make = (warehouse) => normalizeBatchActionInvocation({
    contract_version: 1,
    batch_id: "batch-integration-2",
    idempotency_key: "same-key",
    payload: {
      company: "ACME",
      warehouse,
      lines: [{ row_id: "row-1", qty: 2 }],
    },
  }, action.batch, "commit");

  assert.notEqual(
    sha256(canonicalBatchRequestMaterial(make("MAIN"))),
    sha256(canonicalBatchRequestMaterial(make("SECONDARY"))),
  );
});
