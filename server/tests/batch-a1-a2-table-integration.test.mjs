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

function tablePackage() {
  return {
    id: "table-integration",
    name: "Table Integration",
    version: "1.0.0",
    doctypes: [{
      name: "Document Transaction",
      module: "Operations",
      fields: [{ fieldname: "title", label: "Title", fieldtype: "Data" }],
      permissions: [{ role: "Operations User", read: true, write: true, create: true }],
      revision: 1,
    }],
    roles: [{ role: "Operations User" }],
    worker: "table-integration-worker",
    actions: [{
      name: "apply-document",
      label: "Apply document",
      fields: [
        { fieldname: "company", label: "Company", fieldtype: "Data", required: true },
        { fieldname: "warehouse", label: "Warehouse", fieldtype: "Data", required: true },
      ],
      input_tables: [{
        fieldname: "lines",
        label: "Lines",
        columns: [
          { fieldname: "item_code", label: "Item", fieldtype: "Data", required: true },
          { fieldname: "qty", label: "Qty", fieldtype: "Float", required: true },
        ],
        min_rows: 1,
        max_rows: 20,
        allow_paste: true,
      }],
      batch: {
        contract_version: 1,
        input_table: "lines",
        itemization: "table",
        atomicity: "independent",
        max_items: 20,
      },
      preview: { method: "table_integration.preview", label: "Preview" },
      commit: { method: "table_integration.commit", label: "Commit" },
      permission_doctype: "Document Transaction",
    }],
  };
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("table-itemized A1 transaction reaches A2 as one domain operation and replays once", async () => {
  const action = parseAppManifestWithInputTables(tablePackage()).actions[0];
  const invocation = normalizeBatchActionInvocation({
    contract_version: 1,
    batch_id: "document-batch-1",
    idempotency_key: "document-idem-1",
    payload: {
      company: "ACME",
      warehouse: "MAIN",
      lines: [
        { item_code: "A", qty: 2 },
        { item_code: "B", qty: 3 },
      ],
    },
  }, action.batch, "commit");
  const plan = toBatchExecutorPlan(invocation, sha256(canonicalBatchRequestMaterial(invocation)));

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].id, "lines");
  assert.deepEqual(plan.items[0].value.shared_inputs, { company: "ACME", warehouse: "MAIN" });
  assert.deepEqual(plan.items[0].value.item.lines, [
    { item_code: "A", qty: 2 },
    { item_code: "B", qty: 3 },
  ]);

  const replayStore = new MemoryReplayStore();
  const committed = [];
  const options = {
    plan,
    context: {
      tenantId: "tenant-authoritative",
      actor: { user_id: "operator@example.com" },
      traceId: "trace-table-1",
    },
    replayStore,
    domain: {
      async preview() { throw new Error("preview must not run during commit"); },
      async commit(value, context) {
        committed.push({ value, context });
        return { row_count: value.item.lines.length, company: value.shared_inputs.company };
      },
    },
  };

  const first = await executeBatch(options);
  const second = await executeBatch(options);
  const publicResult = createBatchActionResultEnvelope(first);

  assert.equal(committed.length, 1);
  assert.equal(committed[0].context.operationId, "document-batch-1:lines");
  assert.equal(committed[0].context.tenantId, "tenant-authoritative");
  assert.equal(publicResult.items[0].value.row_count, 2);
  assert.equal(second.replayed, true);
});
