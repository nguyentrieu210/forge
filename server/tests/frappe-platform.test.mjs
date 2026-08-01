import test from "node:test";
import assert from "node:assert/strict";
import { ControllerRegistry, DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import {
  GenericMetadataController, InMemoryMetadataStore, MetadataPermissionService,
  parseCsvImport, parseDocTypeMeta, renderPrintFormat, validateWorkflow,
} from "../dist/packages/frappe-model/src/index.js";
import { makeCommand } from "../dist/packages/test-harness/src/index.js";

const NOW = "2026-07-25T08:00:00.000Z";
const admin = { user_id: "Administrator", roles: ["System Manager"] };

async function execute(kernel, input) {
  return kernel.execute(await makeCommand({ tenantId: "demo", actor: admin, ...input }));
}

async function setup() {
  const metadata = new InMemoryMetadataStore();
  const child = parseDocTypeMeta({
    name: "Inspection Request Item", module: "Quality", custom: true, is_child: true,
    fields: [
      { fieldname: "check", fieldtype: "Data", required: true },
      { fieldname: "result", fieldtype: "Select", options: "Pass\nFail", required: true },
    ], permissions: [], revision: 1,
  });
  const parent = parseDocTypeMeta({
    name: "Inspection Request", module: "Quality", custom: true, is_submittable: true,
    autoname: "INSP-.YYYY.-####", title_field: "subject", search_fields: ["subject", "customer"],
    fields: [
      { fieldname: "subject", fieldtype: "Data", required: true, in_list_view: true, search_index: true },
      { fieldname: "customer", fieldtype: "Link", options: "Customer", required: true, in_standard_filter: true },
      { fieldname: "inspection_date", fieldtype: "Date", required: true },
      { fieldname: "amount", fieldtype: "Currency", precision: 2, default: "0.00" },
      {
        fieldname: "source_tenant", fieldtype: "Data", default: "demo", hidden: true,
        valueSource: "system", editMode: "hidden", surface: "internal", serverEnforced: true,
      },
      { fieldname: "items", fieldtype: "Table", options: "Inspection Request Item", required: true },
    ],
    permissions: [
      { role: "Quality User", read: true, write: true, create: true, print: true, import: true },
      { role: "Quality Manager", read: true, write: true, create: true, submit: true, cancel: true, print: true, import: true, share: true },
    ], revision: 1,
  });
  await metadata.putDocType("demo", child, admin.user_id, NOW);
  await metadata.putDocType("demo", parent, admin.user_id, NOW);
  await metadata.putWorkflow("demo", validateWorkflow({
    name: "Inspection Approval", document_type: "Inspection Request", state_field: "workflow_state", is_active: true,
    states: [
      { state: "Draft", docstatus: 0, allow_edit: "Quality User" },
      { state: "Approved", docstatus: 1, allow_edit: "Quality Manager" },
      { state: "Cancelled", docstatus: 2, allow_edit: "Quality Manager" },
    ],
    transitions: [
      { state: "Draft", action: "Approve", next_state: "Approved", allowed_role: "Quality Manager", allow_self_approval: true, condition: "amount >= 0" },
      { state: "Approved", action: "Cancel", next_state: "Cancelled", allowed_role: "Quality Manager", allow_self_approval: true },
    ], revision: 1,
  }), admin.user_id, NOW);
  const store = new InMemoryMutationStore();
  store.seedMaster("Customer", "CUST-001", "demo", { customer_name: "Acme <North>" });
  const registry = new ControllerRegistry().setFallback(new GenericMetadataController(metadata));
  const kernel = new DocumentKernel(registry, store, new MetadataPermissionService(metadata), () => NOW);
  return { metadata, store, kernel };
}

test("metadata runtime creates, validates, workflows and cancels a custom submittable DocType", async () => {
  const { store, kernel } = await setup();
  const data = {
    subject: "Incoming inspection", customer: "CUST-001", inspection_date: "2026-07-25", amount: "12.50",
    workflow_state: "Draft", items: [{ row_id: "ROW-1", check: "Packaging", result: "Pass" }],
  };
  await execute(kernel, { commandId: "insp-create", doctype: "Inspection Request", name: "INSP-2026-0001", action: "create", expectedVersion: null, document: data });
  let document = await store.getDocument("demo", "Inspection Request", "INSP-2026-0001");
  assert.equal(document.docstatus, 0);
  assert.equal(document.status, "Draft");
  assert.equal(document.data._metadata_revision, 1);
  assert.equal(document.children.length, 1);
  assert.equal(document.children[0].child_doctype, "Inspection Request Item");

  await execute(kernel, { commandId: "insp-submit", doctype: "Inspection Request", name: "INSP-2026-0001", action: "submit", expectedVersion: 1, document: { ...data, workflow_state: "Approved" } });
  document = await store.getDocument("demo", "Inspection Request", "INSP-2026-0001");
  assert.equal(document.docstatus, 1);
  assert.equal(document.status, "Approved");

  await execute(kernel, { commandId: "insp-cancel", doctype: "Inspection Request", name: "INSP-2026-0001", action: "cancel", expectedVersion: 2, document: { workflow_state: "Cancelled" } });
  document = await store.getDocument("demo", "Inspection Request", "INSP-2026-0001");
  assert.equal(document.docstatus, 2);
  assert.equal(document.status, "Cancelled");
  assert.equal(store.snapshot().gl_entries.length, 0);
});

test("generic metadata rejects unknown fields and invalid Link references at the submit gate", async () => {
  const { kernel } = await setup();
  await assert.rejects(execute(kernel, {
    commandId: "unknown-create", doctype: "Inspection Request", name: "INSP-X", action: "create", expectedVersion: null,
    document: { subject: "Bad", customer: "CUST-001", inspection_date: "2026-07-25", items: [{ check: "A", result: "Pass" }], hacked: true },
  }), (error) => error.code === "VALIDATION_ERROR");

  const draft = { subject: "Missing customer", customer: "CUST-NO", inspection_date: "2026-07-25", amount: "0", workflow_state: "Draft", items: [{ check: "A", result: "Pass" }] };
  await execute(kernel, { commandId: "bad-link-create", doctype: "Inspection Request", name: "INSP-BAD", action: "create", expectedVersion: null, document: draft });
  await assert.rejects(execute(kernel, { commandId: "bad-link-submit", doctype: "Inspection Request", name: "INSP-BAD", action: "submit", expectedVersion: 1, document: { ...draft, workflow_state: "Approved" } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("server-enforced hidden fields are derived by the runtime and cannot be forged", async () => {
  const { store, kernel } = await setup();
  const document = {
    subject: "Runtime-owned metadata", customer: "CUST-001", inspection_date: "2026-07-25",
    amount: "0", workflow_state: "Draft", items: [{ check: "A", result: "Pass" }],
  };

  await assert.rejects(execute(kernel, {
    commandId: "hidden-forged-create", doctype: "Inspection Request", name: "INSP-FORGED", action: "create", expectedVersion: null,
    document: { ...document, source_tenant: "another-tenant" },
  }), (error) => error.code === "VALIDATION_ERROR" && /server-controlled/.test(error.message));

  await execute(kernel, {
    commandId: "hidden-default-create", doctype: "Inspection Request", name: "INSP-HIDDEN", action: "create", expectedVersion: null,
    document,
  });
  const created = await store.getDocument("demo", "Inspection Request", "INSP-HIDDEN");
  assert.equal(created.data.source_tenant, "demo");

  await assert.rejects(execute(kernel, {
    commandId: "hidden-change-save", doctype: "Inspection Request", name: "INSP-HIDDEN", action: "save", expectedVersion: 1,
    document: { ...document, source_tenant: "another-tenant" },
  }), (error) => error.code === "VALIDATION_ERROR" && /server-controlled/.test(error.message));
});

test("metadata naming, safe print rendering and CSV import preview are deterministic", async () => {
  const { metadata, store } = await setup();
  // In a Frappe naming series the dots are SEPARATORS between literal and
  // placeholder segments, not literal characters: `INSP-.YYYY.-####` yields
  // `INSP-2026-0001`. The earlier implementation left them in the name.
  assert.equal(await metadata.nextName("demo", "Inspection Request", "INSP-.YYYY.-####", NOW), "INSP-2026-0001");
  assert.equal(await metadata.nextName("demo", "Inspection Request", "INSP-.YYYY.-####", NOW), "INSP-2026-0002");
  const document = {
    tenant_id: "demo", doctype: "Inspection Request", name: "INSP-1", owner: "Administrator", docstatus: 0,
    status: "Draft", version: 1, created_at: NOW, modified_at: NOW, data: { subject: "<script>alert(1)</script>" }, children: [],
  };
  const html = renderPrintFormat({ name: "Inspection", doc_type: "Inspection Request", format_type: "Standard", html: "<h1>{{ subject }}</h1>", revision: 1 }, document);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  const preview = parseCsvImport('subject,customer\n"A, quoted",CUST-001\nBroken\n');
  assert.deepEqual(preview.headers, ["subject", "customer"]);
  assert.equal(preview.rows[0].subject, "A, quoted");
  assert.equal(preview.errors.length, 1);
  assert.equal(store.snapshot().documents.length, 0);
});
