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
  MANUFACTURING_BOM_BATCH_CONTRACT,
  createManufacturingBomBatchDomainExecutor,
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

function manifest() {
  return {
    id: "bom-batch-test",
    name: "BOM Batch Test",
    version: "1.0.0",
    doctypes: [{
      name: "Bill of Materials",
      module: "Manufacturing",
      fields: [{ fieldname: "item", label: "Item", fieldtype: "Data" }],
      permissions: [{ role: "Manufacturing User", read: true, write: true, create: true }],
      revision: 1,
    }],
    roles: [{ role: "Manufacturing User" }],
    worker: "bom-batch-test-worker",
    actions: [{
      name: "create-bom-draft",
      label: "Create BOM Draft",
      fields: [
        { fieldname: "company", label: "Company", fieldtype: "Data", required: true },
        { fieldname: "item", label: "Output item", fieldtype: "Data", required: true },
        { fieldname: "revision", label: "Revision", fieldtype: "Int", required: true },
        { fieldname: "effective_from", label: "Effective from", fieldtype: "Date", required: true },
      ],
      input_tables: [{
        fieldname: "components",
        label: "Components",
        columns: [
          { fieldname: "item_code", label: "Item", fieldtype: "Data", required: true },
          { fieldname: "qty", label: "Qty", fieldtype: "Float", required: true },
        ],
        min_rows: 1,
        max_rows: 500,
        allow_paste: true,
      }],
      batch: MANUFACTURING_BOM_BATCH_CONTRACT,
      preview: { method: "manufacturing.preview", label: "Preview" },
      commit: { method: "manufacturing.commit", label: "Create Draft" },
      permission_doctype: "Bill of Materials",
    }],
  };
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function invocation(mode = "commit") {
  const action = parseAppManifestWithInputTables(manifest()).actions[0];
  return normalizeBatchActionInvocation({
    contract_version: 1,
    batch_id: "bom-batch-1",
    ...(mode === "commit" ? { idempotency_key: "bom-idem-1" } : {}),
    payload: {
      company: "ACME",
      item: "FINISHED-1",
      revision: 2,
      effective_from: "2026-08-04",
      components: [
        { item_code: "RAW-A", qty: 2 },
        { item_code: "RAW-B", qty: 3 },
      ],
    },
  }, action.batch, mode);
}

test("A4 table transaction previews one canonical BOM Draft with no commit", async () => {
  const normalized = invocation("preview");
  assert.equal(normalized.itemization, "table");
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].operation_id, "bom-batch-1:components");

  const calls = [];
  const domain = createManufacturingBomBatchDomainExecutor({
    async assertCanCreate(context, input) {
      calls.push(["permission", context.tenantId, context.actor.user_id, input.item]);
    },
    async commitCanonicalDraft() { throw new Error("commit must not run during preview"); },
  });
  const plan = toBatchExecutorPlan(normalized, sha256(canonicalBatchRequestMaterial(normalized)));
  const trace = await executeBatch({
    plan,
    context: {
      tenantId: "tenant-trusted",
      actor: { user_id: "maker@example.test", roles: ["Manufacturing User"] },
      traceId: "trace-bom-preview",
    },
    domain,
  });
  const result = createBatchActionResultEnvelope(trace);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].value.item, "FINISHED-1");
  assert.equal(result.items[0].value.revision, 2);
  assert.equal(result.items[0].value.row_count, 2);
  assert.deepEqual(result.items[0].value.document.items.map((row) => [row.row_id, row.item_code, row.qty]), [
    ["ROW-1", "RAW-A", "2.000000"],
    ["ROW-2", "RAW-B", "3.000000"],
  ]);
  assert.deepEqual(calls.map((entry) => entry[0]), ["permission"]);
});

test("A4 commit delegates exactly one canonical Draft create and A2 replay prevents duplicate create", async () => {
  const normalized = invocation("commit");
  const plan = toBatchExecutorPlan(normalized, sha256(canonicalBatchRequestMaterial(normalized)));
  let commits = 0;
  const domain = createManufacturingBomBatchDomainExecutor({
    async assertCanCreate(context) { assert.equal(context.tenantId, "tenant-trusted"); },
    async commitCanonicalDraft(context, input) {
      commits += 1;
      return {
        name: "BOM-FINISHED-1-002",
        draft: true,
        operation_id: context.operationId,
        row_count: input.rows.length,
      };
    },
  });
  const options = {
    plan,
    context: {
      tenantId: "tenant-trusted",
      actor: { user_id: "maker@example.test", roles: ["Manufacturing User"] },
      traceId: "trace-bom-commit",
    },
    domain,
    replayStore: new MemoryReplayStore(),
  };

  const first = await executeBatch(options);
  const replay = await executeBatch(options);
  assert.equal(commits, 1);
  assert.equal(first.items[0].operationId, "bom-batch-1:components");
  assert.equal(replay.replayed, true);
});

test("A4 consumer rejects client tenant authority and unknown parent fields", async () => {
  const domain = createManufacturingBomBatchDomainExecutor({
    async assertCanCreate() { throw new Error("must fail before permission gateway"); },
    async commitCanonicalDraft() { return {}; },
  });
  const context = {
    tenantId: "tenant-trusted",
    actor: { user_id: "maker@example.test", roles: ["Manufacturing User"] },
    traceId: "trace",
    batchId: "batch",
    itemId: "components",
    itemIndex: 0,
    operationId: "batch:components",
  };

  await assert.rejects(
    () => domain.preview({
      shared_inputs: {
        company: "ACME",
        item: "FINISHED-1",
        effective_from: "2026-08-04",
        tenant_id: "client-tenant",
      },
      item: { components: [{ item_code: "RAW-A", qty: 1 }] },
    }, context),
    /server-authoritative/,
  );
});
