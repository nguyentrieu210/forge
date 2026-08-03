import assert from "node:assert/strict";
import test from "node:test";

import {
  BATCH_ACTION_SEMANTICS,
  canonicalBatchRequestMaterial,
  createBatchActionResultEnvelope,
  lowerActionInputTablesForInstall,
  normalizeBatchActionInvocation,
  parseAppManifestWithInputTables,
} from "../dist/packages/app-registry/src/index.js";

function packageWithBatch(overrides = {}) {
  return {
    id: "batch-demo",
    name: "Batch Demo",
    version: "1.0.0",
    doctypes: [{
      name: "Batch Document",
      module: "Operations",
      fields: [{ fieldname: "title", label: "Tiêu đề", fieldtype: "Data" }],
      permissions: [{ role: "Operations User", read: true, write: true, create: true }],
      revision: 1,
    }],
    roles: [{ role: "Operations User" }],
    worker: "batch-demo-worker",
    actions: [{
      name: "apply-lines",
      label: "Apply lines",
      fields: [{ fieldname: "note", label: "Note", fieldtype: "Data" }],
      input_tables: [{
        fieldname: "lines",
        label: "Lines",
        columns: [
          { fieldname: "row_id", label: "Row id", fieldtype: "Data", required: true },
          { fieldname: "amount", label: "Amount", fieldtype: "Float", required: true },
        ],
        min_rows: 1,
        max_rows: 50,
        allow_paste: true,
      }],
      batch: {
        contract_version: 1,
        input_table: "lines",
        item_id_field: "row_id",
        atomicity: "independent",
        max_items: 50,
      },
      preview: { method: "batch_demo.preview", label: "Preview" },
      commit: { method: "batch_demo.commit", label: "Commit" },
      permission_doctype: "Batch Document",
    }],
    ...overrides,
  };
}

test("batch metadata survives lower/install-compatible parse without mutating source", () => {
  const source = packageWithBatch();
  const before = structuredClone(source);
  const lowered = lowerActionInputTablesForInstall(source);
  assert.deepEqual(source, before);

  const loweredAction = lowered.actions[0];
  assert.equal(loweredAction.batch, undefined);
  assert.equal(loweredAction.input_tables, undefined);
  const compatibility = loweredAction.fields.find((field) => field.fieldname === "lines");
  const legacy = JSON.parse(compatibility.options.slice("BulkTransaction:".length));
  assert.deepEqual(legacy.batch, source.actions[0].batch);

  const parsed = parseAppManifestWithInputTables(source);
  assert.deepEqual(parsed.actions[0].batch, source.actions[0].batch);
  assert.equal(parsed.actions[0].input_tables[0].fieldname, "lines");
});

test("batch manifest contract fails closed on unsafe or ambiguous declarations", () => {
  const missingPreview = packageWithBatch();
  delete missingPreview.actions[0].preview;
  assert.throws(() => parseAppManifestWithInputTables(missingPreview), /requires the AppAction to declare preview/);

  const unknownId = packageWithBatch();
  unknownId.actions[0].batch.item_id_field = "missing_id";
  assert.throws(() => parseAppManifestWithInputTables(unknownId), /item_id_field must name a column/);

  const overBound = packageWithBatch();
  overBound.actions[0].batch.max_items = 51;
  assert.throws(() => parseAppManifestWithInputTables(overBound), /cannot exceed lines.max_rows/);

  const noTable = packageWithBatch();
  delete noTable.actions[0].input_tables;
  assert.throws(() => parseAppManifestWithInputTables(noTable), /batch requires input_tables/);
});

test("commit invocation requires stable tenant-scoped replay key and deterministic item identity", () => {
  const contract = parseAppManifestWithInputTables(packageWithBatch()).actions[0].batch;
  const request = {
    contract_version: 1,
    batch_id: "batch-20260804-01",
    idempotency_key: "tenant-request-42",
    payload: {
      lines: [
        { row_id: "row-1", amount: 10, note: "a" },
        { note: "b", amount: 20, row_id: "row-2" },
      ],
    },
  };
  const invocation = normalizeBatchActionInvocation(request, contract, "commit");
  assert.deepEqual(invocation.items.map((item) => item.operation_id), [
    "batch-20260804-01:row-1",
    "batch-20260804-01:row-2",
  ]);
  assert.equal(BATCH_ACTION_SEMANTICS.commit_idempotency, "tenant-scoped-key-required");

  const sameMeaning = normalizeBatchActionInvocation({
    ...request,
    payload: {
      lines: [
        { note: "a", amount: 10, row_id: "row-1" },
        { row_id: "row-2", amount: 20, note: "b" },
      ],
    },
  }, contract, "commit");
  assert.equal(canonicalBatchRequestMaterial(invocation), canonicalBatchRequestMaterial(sameMeaning));

  const noKey = structuredClone(request);
  delete noKey.idempotency_key;
  assert.throws(() => normalizeBatchActionInvocation(noKey, contract, "commit"), /idempotency_key is required/);

  const duplicate = structuredClone(request);
  duplicate.payload.lines[1].row_id = "row-1";
  assert.throws(() => normalizeBatchActionInvocation(duplicate, contract, "commit"), /Duplicate batch item id/);
});

test("public result envelope is deterministic and preserves stable operation correlation", () => {
  const envelope = createBatchActionResultEnvelope({
    batchId: "batch-1",
    mode: "preview",
    atomicity: "independent",
    traceId: "trace-1",
    replayed: false,
    items: [
      { index: 1, itemId: "row-2", operationId: "batch-1:row-2", status: "error", error: { code: "INVALID", message: "Invalid row" } },
      { index: 0, itemId: "row-1", operationId: "batch-1:row-1", status: "success", value: { ok: true } },
    ],
  });

  assert.deepEqual(envelope.items.map((item) => item.index), [0, 1]);
  assert.equal(envelope.items[0].operation_id, "batch-1:row-1");
  assert.equal(envelope.items[1].status, "error");

  assert.throws(() => createBatchActionResultEnvelope({
    batchId: "batch-1",
    mode: "commit",
    atomicity: "atomic",
    traceId: "trace-1",
    replayed: false,
    items: [{ index: 0, itemId: "row-1", operationId: "wrong", status: "success", value: {} }],
  }), /operationId must equal batch-1:row-1/);
});
