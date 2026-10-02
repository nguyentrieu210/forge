import test from "node:test";
import assert from "node:assert/strict";
import { FrappeArgs } from "../dist/packages/frappe-api/src/args.js";
import { parseWebForm } from "../dist/packages/frappe-model/src/web-form.js";
import { submissionActor, isWebFormPath } from "../dist/packages/frappe-api/src/web-form-routes.js";
import { toFrappeModified } from "../dist/packages/frappe-api/src/datetime.js";
import { webFormPortalRead, webFormPortalList, webFormPortalUpdate, webFormPortalDelete, WEB_FORM_READ } from "../dist/packages/frappe-api/src/web-form-portal.js";

const args = (input = {}) => new FrappeArgs(new Map(Object.entries({ route: "claims", name: "C-1", ...input })));
function fixture() {
  const form = { name: "Claims", route: "claims", doc_type: "Claim", fields_json: '["message"]',
    title: "Claims", introduction: "", success_message: "", submit_as_role: "Visitor",
    login_required: 1, published: 1, max_per_day: 20, allow_edit: 1, allow_delete: 1, show_list: 1, allow_multiple: 1 };
  let current = { tenant_id: "T1", doctype: "Claim", name: "C-1", owner: "alice", data: { message: "before", internal: "private" },
    children: [], version: 3, docstatus: 0, status: "Draft", created_at: "2026-10-02T00:00:00Z", modified_at: "2026-10-02T00:00:00Z" };
  const calls = [];
  const ctx = { tenantId: "T1", actor: { user_id: "alice", roles: ["Portal"] }, now: () => "2026-10-02T00:00:00Z",
    webForms: { db: { prepare(sql) { return { bind(tenant, route) { assert.equal(tenant, "T1"); assert.equal(route, "claims"); return { first: async () => form.published ? form : null }; } }; } }, salt: "test" },
    metadata: { getDocType: async () => ({ name: "Claim", fields: [{ fieldname: "message", fieldtype: "Data" }, { fieldname: "internal", fieldtype: "Data" }] }) },
    documents: { getDocument: async () => current },
    permissions: { assert: async (input) => { calls.push(input); }, redactDocumentWithPolicies: async (_tenant, _meta, doc) => doc },
    listService: { list: async (_actor, _tenant, query) => { calls.push(query); return { rows: [{ name: "C-1" }] }; } },
    runCommand: async (command) => { calls.push(command); current = { ...current, data: command.document, version: current.version + 1 }; return {}; },
  };
  return { ctx, form, calls, get current() { return current; }, set current(value) { current = value; } };
}
const fails = (promise, status) => assert.rejects(promise, (error) => error.status === status);

test("portal flags default deny and authenticated submissions gain no form role", () => {
  const form = parseWebForm({ name: "Claim", route: "claims", doc_type: "Claim", fields: ["message"], submit_as_role: "Visitor" });
  for (const key of ["allow_edit", "allow_delete", "allow_multiple", "show_list"]) assert.equal(form[key], false);
  const actor = { user_id: "alice", roles: ["Portal"] };
  assert.equal(submissionActor(form, actor), actor);
  assert.deepEqual(submissionActor(form), { user_id: "Guest", roles: ["Visitor"] });
  assert.equal(isWebFormPath(WEB_FORM_READ), false);
});

test("guest portal calls stop before database and unpublished forms are hidden", async () => {
  const f = fixture(); f.ctx.actor.user_id = "Guest";
  for (const route of [webFormPortalRead, webFormPortalList, webFormPortalUpdate, webFormPortalDelete]) await fails(route(args(), f.ctx), 401);
  f.ctx.actor.user_id = "alice"; f.form.published = 0;
  await fails(webFormPortalRead(args(), f.ctx), 404);
});

test("owners read only form fields after policy redaction; other owners including admin are hidden", async () => {
  const f = fixture();
  assert.deepEqual(await webFormPortalRead(args(), f.ctx), { name: "C-1", modified: toFrappeModified(f.current.modified_at, 3), message: "before" });
  f.ctx.permissions.redactDocumentWithPolicies = async (_tenant, _meta, doc) => ({ ...doc, data: {} });
  assert.equal((await webFormPortalRead(args(), f.ctx)).message, undefined);
  f.ctx.actor = { user_id: "bob", roles: ["Administrator"] };
  await fails(webFormPortalRead(args(), f.ctx), 404);
  await fails(webFormPortalUpdate(args({ data: { message: "stolen" } }), f.ctx), 404);
});

test("list enforces current show_list, server owner filter and bounded page", async () => {
  const f = fixture();
  await webFormPortalList(args({ filters: { owner: "bob" }, doctype: "Secrets" }), f.ctx);
  const query = f.calls.find((call) => call.filters);
  assert.equal(query.doctype, "Claim");
  assert.deepEqual(query.filters, [{ field: "owner", operator: "eq", value: "alice" }]);
  await fails(webFormPortalList(args({ limit_page_length: 101 }), f.ctx), 422);
  f.form.show_list = 0;
  await fails(webFormPortalList(args(), f.ctx), 403);
});

test("save preserves hidden values, routes expected version through deterministic kernel command", async () => {
  const f = fixture();
  await webFormPortalUpdate(args({ modified: toFrappeModified(f.current.modified_at, 3), data: { message: "after" } }), f.ctx);
  const command = f.calls.find((call) => call.command_id);
  assert.equal(command.expected_version, 3);
  assert.equal(command.actor.user_id, "alice");
  assert.equal(command.document.internal, "private");
  assert.equal(command.document.message, "after");
  assert.equal(command.document.status, undefined);
  assert.match(command.command_id, /^frappe-/);
  assert.ok(f.calls.some((call) => call.action === "save"));
  await fails(webFormPortalUpdate(args({ modified: toFrappeModified(f.current.modified_at, 3), data: { message: "stale" } }), f.ctx), 409);
});

test("current edit configuration, DocPerm, missing OCC and injected fields fail closed", async () => {
  const f = fixture();
  await fails(webFormPortalUpdate(args({ data: { message: "after" } }), f.ctx), 409);
  await fails(webFormPortalUpdate(args({ modified: toFrappeModified(f.current.modified_at, 3), data: { owner: "bob" } }), f.ctx), 422);
  f.form.allow_edit = 0; await fails(webFormPortalUpdate(args(), f.ctx), 403);
  assert.equal(f.calls.filter((call) => call.command_id).length, 0);
});

test("delete never falls back to unversioned store deletion", async () => {
  const f = fixture(); f.ctx.documents.deleteDraftDocument = () => assert.fail("Unversioned delete must never run");
  await fails(webFormPortalDelete(args(), f.ctx), 501);
  f.form.allow_delete = 0; await fails(webFormPortalDelete(args(), f.ctx), 403);
});


test("record DocPerm denial blocks read/save and kernel OCC races are propagated", async () => {
  const f = fixture();
  f.ctx.permissions.assert = async ({ action }) => {
    if (action === "save") throw Object.assign(new Error("denied"), { status: 403 });
  };
  await fails(webFormPortalUpdate(args({ modified: toFrappeModified(f.current.modified_at, 3), data: { message: "after" } }), f.ctx), 403);
  assert.equal(f.calls.filter((call) => call.command_id).length, 0);
  f.ctx.permissions.assert = async () => {};
  f.ctx.runCommand = async () => { throw Object.assign(new Error("concurrent edit"), { status: 409 }); };
  await fails(webFormPortalUpdate(args({ modified: toFrappeModified(f.current.modified_at, 3), data: { message: "after" } }), f.ctx), 409);
  assert.equal(f.current.data.message, "before");
});


test("the same portal save builds the same kernel idempotency identity", async () => {
  const a = fixture(); const b = fixture();
  const input = { modified: toFrappeModified(a.current.modified_at, 3), data: { message: "same edit" } };
  await webFormPortalUpdate(args(input), a.ctx);
  await webFormPortalUpdate(args(input), b.ctx);
  const left = a.calls.find((call) => call.command_id);
  const right = b.calls.find((call) => call.command_id);
  assert.equal(left.command_id, right.command_id);
  assert.equal(left.payload_hash, right.payload_hash);
});
