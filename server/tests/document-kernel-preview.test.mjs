import test from "node:test";
import assert from "node:assert/strict";
import { ControllerRegistry, DocumentKernel } from "../dist/packages/document-kernel/src/index.js";
import { commandPayloadHash } from "../dist/packages/core/src/index.js";

const now = "2026-08-02T10:00:00.000Z";

async function command(overrides = {}) {
  const value = {
    schema_version: 1,
    command_id: "preview-cmd-1",
    tenant_id: "tenant-a",
    actor: { user_id: "keeper@example.test", roles: ["Thủ kho"] },
    aggregate: { doctype: "Preview Doc", name: "PD-1" },
    action: "save",
    expected_version: 1,
    payload_hash: "",
    document: { value: "new" },
    ...overrides,
  };
  value.payload_hash = await commandPayloadHash(value);
  return value;
}

function existing() {
  return {
    tenant_id: "tenant-a",
    doctype: "Preview Doc",
    name: "PD-1",
    owner: "keeper@example.test",
    docstatus: 0,
    status: "Draft",
    version: 1,
    created_at: now,
    modified_at: now,
    data: { value: "old" },
    children: [],
  };
}

function setup() {
  const calls = { receipt: 0, execute: 0, permission: 0, controller: 0, document: 0 };
  const store = {
    async getDocument() { calls.document += 1; return existing(); },
    async getReceipt() { calls.receipt += 1; throw new Error("preview must not read mutation receipts"); },
    async execute() { calls.execute += 1; throw new Error("preview must not execute mutation plans"); },
  };
  const controller = {
    doctype: "Preview Doc",
    async buildPlan(context) {
      calls.controller += 1;
      return {
        command: context.command,
        document: { ...existing(), version: context.nextVersion, modified_at: context.now, data: context.command.document },
        gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [], stock_bundle_usages: [], events: [],
        result: { ok: true },
      };
    },
  };
  const permissions = {
    async assert(request) {
      calls.permission += 1;
      assert.equal(request.tenantId, "tenant-a");
      assert.equal(request.name, "PD-1");
      assert.deepEqual(request.existingData, { value: "old" });
    },
  };
  const kernel = new DocumentKernel(new ControllerRegistry().register(controller), store, permissions, () => now);
  return { kernel, calls };
}

test("DocumentKernel.preview validates and plans without receipt or store mutation", async () => {
  const { kernel, calls } = setup();
  const plan = await kernel.preview(await command());
  assert.equal(plan.document.version, 2);
  assert.deepEqual(plan.document.data, { value: "new" });
  assert.deepEqual(calls, { receipt: 0, execute: 0, permission: 1, controller: 1, document: 1 });
});

test("DocumentKernel.preview keeps optimistic version checks", async () => {
  const { kernel, calls } = setup();
  await assert.rejects(
    async () => kernel.preview(await command({ expected_version: 0 })),
    (error) => error?.code === "VERSION_CONFLICT",
  );
  assert.equal(calls.receipt, 0);
  assert.equal(calls.execute, 0);
  assert.equal(calls.controller, 0);
});
