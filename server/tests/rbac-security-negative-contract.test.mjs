import test from "node:test";
import assert from "node:assert/strict";
import {
  MetadataPermissionService,
  blocksSelfApproval,
} from "../dist/packages/frappe-model/src/index.js";

const ACTOR = { user_id: "worker@example.com", roles: ["Business Role"] };
const TENANT = "tenant-a";
const DOCTYPE = "Security Fixture";

function metadata(permissions) {
  return {
    async getDocType(_tenantId, doctype) {
      if (doctype !== DOCTYPE) return null;
      return {
        name: DOCTYPE,
        module: "Test",
        fields: [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", required: false, read_only: false, hidden: false, list_only: false, allow_on_submit: false, no_copy: false, unique: false, idx: 1 }],
        permissions,
        revision: 1,
        is_child: false,
        is_tree: false,
        is_single: false,
        is_submittable: true,
        track_changes: true,
        track_seen: false,
        allow_rename: false,
        allow_delete_non_draft: false,
        sort_order: "DESC",
      };
    },
  };
}

function access({ share = null, policies = [] } = {}) {
  return {
    async getShare() { return share; },
    async hasAnyShare() { return Boolean(share?.read); },
    async listUserPermissions() { return []; },
    async listOrganizationScopes() { return []; },
    async listRolePolicies() { return policies; },
  };
}

function request(action) {
  return {
    actor: ACTOR,
    tenantId: TENANT,
    doctype: DOCTYPE,
    name: "SEC-1",
    owner: "owner@example.com",
    data: { company: "ACME" },
    action,
  };
}

test("Role Policy narrows an otherwise granted static DocPerm", async () => {
  const service = new MetadataPermissionService(
    metadata([{ role: "Business Role", read: true, write: true, create: true, submit: true, cancel: true }]),
    undefined,
    access({ policies: [{ name: "POL-READ", role: "Business Role", resource: DOCTYPE, actions: ["read"], row_rule: {}, field_rule: {} }] }),
  );
  await service.assert(request("read"));
  await assert.rejects(service.assert(request("save")));
});

test("Role Policy cannot widen the static DocPerm ceiling", async () => {
  const service = new MetadataPermissionService(
    metadata([{ role: "Business Role", read: true, write: false, create: false }]),
    undefined,
    access({ policies: [{ name: "POL-WRITE", role: "Business Role", resource: DOCTYPE, actions: ["read", "write", "save"], row_rule: {}, field_rule: {} }] }),
  );
  await service.assert(request("read"));
  await assert.rejects(service.assert(request("save")));
});

test("a read-only document share grants read but never write", async () => {
  const service = new MetadataPermissionService(
    metadata([]),
    undefined,
    access({ share: { read: true, write: false, share: false } }),
  );
  await service.assert(request("read"));
  await assert.rejects(service.assert(request("save")));
});

test("maker-checker blocks Role Policy self-approval on a docstatus-advancing transition", () => {
  const transition = { allow_self_approval: false };
  assert.equal(blocksSelfApproval(transition, ACTOR.user_id, ACTOR.user_id, 0, 1), true);
  assert.equal(blocksSelfApproval(transition, ACTOR.user_id, "reviewer@example.com", 0, 1), false);
  assert.equal(blocksSelfApproval({ allow_self_approval: true }, ACTOR.user_id, ACTOR.user_id, 0, 1), false);
  assert.equal(blocksSelfApproval(transition, ACTOR.user_id, ACTOR.user_id, 0, 0), false);
});
