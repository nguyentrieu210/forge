import test from "node:test";
import assert from "node:assert/strict";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { makeCommand } from "../dist/packages/test-harness/src/index.js";
import { parseMutationCommandInput } from "../dist/packages/contracts/src/index.js";
import { buildCommand } from "../dist/packages/frappe-api/src/index.js";
import { seedStandardMasters, orderDocument } from "./helpers.mjs";

function newKernel() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, undefined, () => "2026-07-26T00:00:00.000Z") };
}

async function step(kernel, name, commandId, action, expectedVersion, extra = {}) {
  return kernel.execute(await makeCommand({
    commandId, doctype: "Sales Order", name, action, expectedVersion, document: orderDocument(), ...extra,
  }));
}

async function lifecycle(kernel, name, { cancel = true } = {}) {
  await step(kernel, name, `${name}-c`, "create", null);
  await step(kernel, name, `${name}-s`, "submit", 1);
  if (cancel) await step(kernel, name, `${name}-x`, "cancel", 2);
}

async function amend(kernel, source, name) {
  return kernel.execute(await makeCommand({
    commandId: `${name}-amend`, doctype: "Sales Order", name,
    action: "create", expectedVersion: null, document: orderDocument(), amendedFrom: source,
  }));
}

// ---- command contract -------------------------------------------------------

test("amended_from is validated on the command and only accepted on a create", () => {
  const base = {
    schema_version: 1, command_id: "c1", tenant_id: "demo",
    aggregate: { doctype: "Sales Order", name: "SO-1-1" }, action: "create",
    expected_version: null, payload_hash: "a".repeat(64), document: {},
  };
  assert.equal(parseMutationCommandInput({ ...base, amended_from: "SO-1" }).amended_from, "SO-1");
  assert.equal(parseMutationCommandInput({ ...base, amended_from: "  SO-1  " }).amended_from, "SO-1");
  assert.equal(parseMutationCommandInput(base).amended_from, undefined);

  // Re-supplying the chain on a later save could rewrite history.
  assert.throws(() => parseMutationCommandInput({ ...base, action: "save", expected_version: 1, amended_from: "SO-1" }), /only valid on a create/);
  assert.throws(() => parseMutationCommandInput({ ...base, amended_from: "" }), /amended_from/);
  assert.throws(() => parseMutationCommandInput({ ...base, amended_from: 5 }), /amended_from/);
});

test("two creates differing only in what they amend get different idempotency keys", async () => {
  const base = { tenantId: "demo", actor: { user_id: "u", roles: ["System Manager"] }, doctype: "Sales Order", name: "SO-1-1", action: "create", expectedVersion: null, document: { customer: "C1" } };
  const plain = await buildCommand(base);
  const amendA = await buildCommand({ ...base, amendedFrom: "SO-1" });
  const amendB = await buildCommand({ ...base, amendedFrom: "SO-2" });
  assert.equal(new Set([plain.command_id, amendA.command_id, amendB.command_id]).size, 3);
  assert.equal(amendA.amended_from, "SO-1");
});

// ---- chain rules (mirrors the documents_amend_guard SQL trigger) -----------

test("a cancelled document can be amended once, and the chain is recorded", async () => {
  const { kernel, store } = newKernel();
  await lifecycle(kernel, "SO-AM1");
  await amend(kernel, "SO-AM1", "SO-AM1-1");

  const amendment = await store.getDocument("demo", "Sales Order", "SO-AM1-1");
  assert.equal(amendment.amended_from, "SO-AM1");
  assert.equal(amendment.docstatus, 0, "an amendment starts as a draft");
  // The source is untouched: an amendment is a successor, not an edit.
  const source = await store.getDocument("demo", "Sales Order", "SO-AM1");
  assert.equal(source.docstatus, 2);
  assert.equal(source.amended_from, undefined);
});

test("a live document cannot be amended, because that would duplicate an active voucher", async () => {
  const { kernel } = newKernel();
  await lifecycle(kernel, "SO-AM2", { cancel: false });
  await assert.rejects(() => amend(kernel, "SO-AM2", "SO-AM2-1"), /AMEND_SOURCE_NOT_CANCELLED/);
});

test("a draft cannot be amended either", async () => {
  const { kernel } = newKernel();
  await kernel.execute(await makeCommand({ commandId: "d-c", doctype: "Sales Order", name: "SO-AM3", action: "create", expectedVersion: null, document: orderDocument() }));
  await assert.rejects(() => amend(kernel, "SO-AM3", "SO-AM3-1"), /AMEND_SOURCE_NOT_CANCELLED/);
});

test("amending something that never existed is refused", async () => {
  const { kernel } = newKernel();
  await assert.rejects(() => amend(kernel, "SO-GHOST", "SO-GHOST-1"), /AMEND_SOURCE_NOT_CANCELLED/);
});

test("the same source cannot be amended twice, so the chain cannot fork", async () => {
  const { kernel } = newKernel();
  await lifecycle(kernel, "SO-AM4");
  await amend(kernel, "SO-AM4", "SO-AM4-1");
  // Two successors would each believe they are the authoritative document.
  await assert.rejects(() => amend(kernel, "SO-AM4", "SO-AM4-2"), /AMEND_SOURCE_ALREADY_AMENDED/);
});

test("an amendment that is itself cancelled can be amended in turn, extending the chain", async () => {
  const { kernel, store } = newKernel();
  await lifecycle(kernel, "SO-AM5");
  await amend(kernel, "SO-AM5", "SO-AM5-1");
  await step(kernel, "SO-AM5-1", "am5-1-s", "submit", 1);
  await step(kernel, "SO-AM5-1", "am5-1-x", "cancel", 2);
  await amend(kernel, "SO-AM5-1", "SO-AM5-1-1");

  assert.equal((await store.getDocument("demo", "Sales Order", "SO-AM5-1-1")).amended_from, "SO-AM5-1");
});

test("replaying the identical amend command is idempotent rather than a second successor", async () => {
  const { kernel, store } = newKernel();
  await lifecycle(kernel, "SO-AM6");
  const command = await makeCommand({
    commandId: "am6-once", doctype: "Sales Order", name: "SO-AM6-1",
    action: "create", expectedVersion: null, document: orderDocument(), amendedFrom: "SO-AM6",
  });
  await kernel.execute(command);
  await kernel.execute(command);
  assert.equal((await store.getDocument("demo", "Sales Order", "SO-AM6-1")).version, 1);
});
