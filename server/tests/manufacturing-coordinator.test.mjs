import test from "node:test";
import assert from "node:assert/strict";
import { manufacturingCoordinatorKey } from "../dist/apps/tenant-worker/src/manufacturing-coordinator.js";

function command({
  doctype = "Stock Entry",
  name = "STE-1",
  action = "submit",
  document = {},
} = {}) {
  return {
    command_id: `${name}-${action}`,
    tenant_id: "demo",
    actor: { user_id: "Administrator", roles: ["System Manager"] },
    aggregate: { doctype, name },
    action,
    expected_version: action === "create" ? null : 1,
    document,
    payload_hash: "test",
  };
}

test("manufacturing Stock Entry submit and cancel share the Work Order coordinator", () => {
  const submit = command({
    document: {
      purpose: "Manufacture",
      work_order: "WO-0001",
    },
  });
  const cancel = command({ name: "STE-1", action: "cancel" });
  const existing = {
    purpose: "Manufacture",
    work_order: "WO-0001",
  };

  assert.equal(manufacturingCoordinatorKey(submit), "demo:Work Order:WO-0001");
  assert.equal(manufacturingCoordinatorKey(cancel, existing), "demo:Work Order:WO-0001");
});

test("material issue shares the same coordinator as the Work Order aggregate", () => {
  const issue = command({
    name: "STE-ISSUE",
    document: {
      purpose: "Material Transfer",
      work_order: "WO-0002",
    },
  });
  const workOrderDocumentKey = `${issue.tenant_id}:Work Order:${issue.document.work_order}`;
  assert.equal(manufacturingCoordinatorKey(issue), workOrderDocumentKey);
});

test("ordinary stock and unrelated aggregates keep their own coordinators", () => {
  assert.equal(manufacturingCoordinatorKey(command({
    document: { purpose: "Material Transfer" },
  })), null);
  assert.equal(manufacturingCoordinatorKey(command({
    document: { purpose: "Material Receipt", work_order: "WO-IGNORED" },
  })), null);
  assert.equal(manufacturingCoordinatorKey(command({
    doctype: "Work Order",
    name: "WO-0003",
    document: {},
  })), null);
});
