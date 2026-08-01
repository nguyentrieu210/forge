import test from "node:test";
import assert from "node:assert/strict";
import { ControllerRegistry, DocumentKernel, DocumentListCompiler, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import {
  GenericMetadataController, InMemoryMetadataStore, MetadataPermissionService,
  parseDocTypeMeta,
} from "../dist/packages/frappe-model/src/index.js";
import { makeCommand } from "../dist/packages/test-harness/src/index.js";

const NOW = "2026-07-25T10:00:00.000Z";
const user = { user_id: "user@example.com", roles: ["Restricted User"] };
const manager = { user_id: "manager@example.com", roles: ["Restricted User", "Restricted Manager"] };

class FakeAccessStore {
  shares = new Map();
  userPermissions = [];
  organizationScopes = [];
  rolePolicies = [];
  key(tenant, doctype, name, actor) { return `${tenant}:${doctype}:${name}:${actor}`; }
  async getShare(tenant, doctype, name, actor) { return this.shares.get(this.key(tenant, doctype, name, actor)) ?? null; }
  async hasAnyShare(tenant, doctype, actor) { return [...this.shares.entries()].some(([key, grant]) => key.startsWith(`${tenant}:${doctype}:`) && key.endsWith(`:${actor}`) && grant.read); }
  async listUserPermissions(_tenant, actor, applicable) { return this.userPermissions.filter((row) => row.user === actor && (!applicable || !row.applicable_for_doctype || row.applicable_for_doctype === applicable)); }
  async listOrganizationScopes(_tenant, actor) { return this.organizationScopes.filter((row) => row.user_id === actor); }
  async listRolePolicies(_tenant, roles, resource) { return this.rolePolicies.filter((row) => roles.includes(row.role) && row.resource === resource); }
}

async function setup() {
  const metadata = new InMemoryMetadataStore();
  const meta = parseDocTypeMeta({
    name: "Restricted Document", module: "Core", custom: true, autoname: "RD-####", title_field: "subject",
    fields: [
      { fieldname: "subject", fieldtype: "Data", required: true, in_list_view: true, search_index: true, permlevel: 0 },
      { fieldname: "company", fieldtype: "Link", options: "Company", required: true, in_list_view: true, in_standard_filter: true, permlevel: 0 },
      { fieldname: "confidential", fieldtype: "Data", permlevel: 1 },
    ],
    permissions: [
      { role: "Restricted User", read: true, write: true, create: true, if_owner: true, permlevel: 0 },
      { role: "Restricted Manager", read: true, write: true, create: true, permlevel: 1 },
    ], revision: 1,
  });
  await metadata.putDocType("demo", meta, "Administrator", NOW);
  const access = new FakeAccessStore();
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const store = new InMemoryMutationStore();
  store.seedMaster("Company", "Demo", "demo", { company_name: "Demo" });
  store.seedMaster("Company", "Other", "demo", { company_name: "Other" });
  const kernel = new DocumentKernel(new ControllerRegistry().setFallback(new GenericMetadataController(metadata)), store, permissions, () => NOW);
  return { metadata, meta, access, permissions, store, kernel };
}

async function command(kernel, actor, input) {
  return kernel.execute(await makeCommand({ tenantId: "demo", actor, ...input }));
}

test("owner-only permission is document-scoped; a read share opens only the shared document", async () => {
  const { access, permissions } = await setup();
  assert.equal((await permissions.getReadScope(user, "demo", "Restricted Document")).mode, "owner");
  await permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id, data: { company: "Demo" }, action: "read" });
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-2", owner: "other@example.com", data: { company: "Demo" }, action: "read" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
  access.shares.set(access.key("demo", "Restricted Document", "RD-2", user.user_id), { read: true, write: false, share: false });
  assert.equal((await permissions.getReadScope(user, "demo", "Restricted Document")).mode, "owner_or_shared");
  await permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-2", owner: "other@example.com", data: { company: "Demo" }, action: "read" });
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-2", owner: "other@example.com", data: { company: "Demo" }, action: "save" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("field permlevel blocks a low-level actor from setting confidential data", async () => {
  const { kernel, store } = await setup();
  await assert.rejects(command(kernel, user, {
    commandId: "restricted-bad", doctype: "Restricted Document", name: "RD-0001", action: "create", expectedVersion: null,
    document: { subject: "Visible", company: "Demo", confidential: "secret" },
  }), (error) => error.code === "PERMISSION_DENIED");

  await command(kernel, user, {
    commandId: "restricted-ok", doctype: "Restricted Document", name: "RD-0001", action: "create", expectedVersion: null,
    document: { subject: "Visible", company: "Demo" },
  });
  assert.equal((await store.getDocument("demo", "Restricted Document", "RD-0001")).owner, user.user_id);

  await command(kernel, manager, {
    commandId: "manager-create", doctype: "Restricted Document", name: "RD-0002", action: "create", expectedVersion: null,
    document: { subject: "Managed", company: "Demo", confidential: "allowed" },
  });
  assert.equal((await store.getDocument("demo", "Restricted Document", "RD-0002")).data.confidential, "allowed");
});

test("user permission constrains Link values in document authorization and list SQL", async () => {
  const { access, permissions } = await setup();
  access.userPermissions.push({
    user: user.user_id, allow_doctype: "Company", allow_name: "Demo", applicable_for_doctype: "Restricted Document",
    is_default: true, hide_descendants: false, created_by: "Administrator", created_at: NOW,
  });
  const scope = await permissions.getReadScope(user, "demo", "Restricted Document");
  assert.deepEqual(scope.user_permissions, [{ allow_doctype: "Company", fields: ["company"], allowed_values: ["Demo"] }]);
  await permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id, data: { company: "Demo" }, action: "read" });
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-2", owner: user.user_id, data: { company: "Other" }, action: "read" }),
    (error) => error.code === "PERMISSION_DENIED",
  );

  const definition = {
    doctype: "Restricted Document", table: "documents",
    fields: {
      name: { type: "string", source: { column: "name" } },
      owner: { type: "string", source: { column: "owner" } },
      docstatus: { type: "int", source: { column: "docstatus" } },
      version: { type: "int", source: { column: "version" } },
      modified_at: { type: "date", source: { column: "modified_at" } },
      company: { type: "string", source: { json: "$.company" } },
    },
    defaultFields: ["name", "company"], searchFields: ["name"], filterFields: ["company"], sortFields: ["modified_at", "name"], defaultSort: [{ field: "modified_at", direction: "desc" }],
  };
  const compiled = new DocumentListCompiler().compileList("demo", { doctype: "Restricted Document" }, definition, scope);
  assert.match(compiled.sql, /owner=\?3/);
  assert.match(compiled.sql, /json_extract\(payload_json, '\$\.company'\) IN/);
  assert.deepEqual(compiled.params.slice(0, 4), ["demo", "Restricted Document", user.user_id, "Demo"]);
});

test("document redaction removes fields above the actor's readable permlevel", async () => {
  const { meta, permissions } = await setup();
  const document = {
    tenant_id: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id,
    docstatus: 0, status: "Draft", version: 1, created_at: NOW, modified_at: NOW,
    data: { subject: "Visible", company: "Demo", confidential: "hidden", _metadata_revision: 1 }, children: [],
  };
  const userView = permissions.redactDocument(meta, document, user);
  assert.equal(userView.data.subject, "Visible");
  assert.equal(userView.data.confidential, undefined);
  const managerView = permissions.redactDocument(meta, { ...document, owner: manager.user_id }, manager);
  assert.equal(managerView.data.confidential, "hidden");
});

test("field permlevel is enforced centrally on save while unchanged protected fields may round-trip", async () => {
  const { permissions } = await setup();
  const current = { subject: "Visible", company: "Demo", confidential: "locked" };
  await permissions.assert({
    actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-9", owner: user.user_id,
    data: { subject: "Changed", company: "Demo", confidential: "locked" }, existingData: current, action: "save",
  });
  await assert.rejects(
    permissions.assert({
      actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-9", owner: user.user_id,
      data: { subject: "Changed", company: "Demo", confidential: "tampered" }, existingData: current, action: "save",
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("write share grants only permlevel zero and never permits protected field changes", async () => {
  const { access, permissions } = await setup();
  access.shares.set(access.key("demo", "Restricted Document", "RD-SHARED", user.user_id), { read: true, write: true, share: false });
  const current = { subject: "Visible", company: "Demo", confidential: "locked" };
  await permissions.assert({
    actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-SHARED", owner: "other@example.com",
    data: { subject: "Shared edit", company: "Demo", confidential: "locked" }, existingData: current, action: "save",
  });
  await assert.rejects(
    permissions.assert({
      actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-SHARED", owner: "other@example.com",
      data: { subject: "Shared edit", company: "Demo", confidential: "tampered" }, existingData: current, action: "save",
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("metadata response reflects create/save/share write capability without exposing permission rows", async () => {
  const { meta, permissions } = await setup();
  const createMeta = permissions.filterMetaForActor(meta, user, user.user_id, false, { action: "create" });
  assert.equal(createMeta.fields.find((field) => field.fieldname === "subject").read_only, false);
  assert.equal(createMeta.fields.some((field) => field.fieldname === "confidential"), false);
  assert.deepEqual(createMeta.permissions, []);

  const sharedRead = permissions.filterMetaForActor(meta, user, "other@example.com", true, { action: "save", sharedWrite: false });
  assert.equal(sharedRead.fields.find((field) => field.fieldname === "subject").read_only, true);
  const sharedWrite = permissions.filterMetaForActor(meta, user, "other@example.com", true, { action: "save", sharedWrite: true });
  assert.equal(sharedWrite.fields.find((field) => field.fieldname === "subject").read_only, false);
});

test("published organization assignments constrain matching company dimensions without denying unrelated dimensions", async () => {
  const { access, permissions } = await setup();
  access.organizationScopes.push(
    { assignment_name: "ORG-ASG-1", user_id: user.user_id, allow_doctype: "Company", allow_name: "Demo", effective_from: "2026-01-01", effective_to: null },
    { assignment_name: "ORG-ASG-1", user_id: user.user_id, allow_doctype: "Department", allow_name: "Sales", effective_from: "2026-01-01", effective_to: null },
  );

  const scope = await permissions.getReadScope(user, "demo", "Restricted Document");
  assert.deepEqual(scope.user_permissions, [{ allow_doctype: "Company", fields: ["company"], allowed_values: ["Demo"] }]);
  await permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id, data: { company: "Demo" }, action: "read" });
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-2", owner: user.user_id, data: { company: "Other" }, action: "read" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("organization assignments cannot widen an explicit user permission", async () => {
  const { access, permissions } = await setup();
  access.userPermissions.push({
    user: user.user_id, allow_doctype: "Company", allow_name: "Demo", applicable_for_doctype: "Restricted Document",
    is_default: true, hide_descendants: false, created_by: "Administrator", created_at: NOW,
  });
  access.organizationScopes.push(
    { assignment_name: "ORG-ASG-2", user_id: user.user_id, allow_doctype: "Company", allow_name: "Other", effective_from: "2026-01-01", effective_to: null },
  );

  const scope = await permissions.getReadScope(user, "demo", "Restricted Document");
  assert.equal(scope.user_permissions.length, 2);
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-3", owner: user.user_id, data: { company: "Demo" }, action: "read" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-4", owner: user.user_id, data: { company: "Other" }, action: "read" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("a published role policy narrows static DocPerm and never grants above it", async () => {
  const { access, permissions } = await setup();
  access.rolePolicies.push({
    name: "ROLE-POL-1", role: "Restricted User", resource: "Restricted Document",
    actions: ["read"], row_rule: {}, field_rule: {},
  });

  await permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id, data: { company: "Demo" }, action: "read" });
  await assert.rejects(
    permissions.assert({ actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id, data: { company: "Demo" }, action: "save" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
  await assert.rejects(
    permissions.assert({ actor: { user_id: user.user_id, roles: ["No Static Grant"] }, tenantId: "demo", doctype: "Restricted Document", name: "RD-1", owner: user.user_id, data: { company: "Demo" }, action: "read" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("the tenant rescue administrator cannot be locked out by a role policy", async () => {
  const { access, permissions } = await setup();
  access.rolePolicies.push({
    name: "ROLE-POL-LOCKOUT", role: "System Manager", resource: "Restricted Document",
    actions: [], row_rule: {}, field_rule: { hidden: ["subject"] },
  });
  const administrator = { user_id: "Administrator", roles: ["System Manager"] };
  await permissions.assert({
    actor: administrator, tenantId: "demo", doctype: "Restricted Document", name: "RD-RESCUE",
    owner: "someone@example.com", data: { subject: "Recovery", company: "Demo" }, action: "save",
  });
});

test("role policy field rules redact hidden fields and block protected writes", async () => {
  const { access, meta, permissions } = await setup();
  access.rolePolicies.push({
    name: "ROLE-POL-FIELD", role: "Restricted User", resource: "Restricted Document",
    actions: ["read", "write", "create"], row_rule: {}, field_rule: { hidden: ["subject"], read_only: ["company"] },
  });
  const document = {
    tenant_id: "demo", doctype: "Restricted Document", name: "RD-FIELD", owner: user.user_id,
    docstatus: 0, status: "Draft", version: 1, created_at: NOW, modified_at: NOW,
    data: { subject: "Sensitive", company: "Demo", _metadata_revision: 1 }, children: [],
  };
  const redacted = await permissions.redactDocumentWithPolicies("demo", meta, document, user);
  assert.equal(redacted.data.subject, undefined);
  assert.equal(redacted.data.company, "Demo");
  const filteredMeta = await permissions.filterMetaForActorWithPolicies("demo", meta, user, user.user_id, false, { action: "save" });
  assert.equal(filteredMeta.fields.some((field) => field.fieldname === "subject"), false);
  assert.equal(filteredMeta.fields.find((field) => field.fieldname === "company").read_only, true);
  await assert.rejects(
    permissions.assert({
      actor: user, tenantId: "demo", doctype: "Restricted Document", name: "RD-FIELD", owner: user.user_id,
      data: { subject: "Sensitive", company: "Other" }, existingData: { subject: "Sensitive", company: "Demo" }, action: "save",
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});
