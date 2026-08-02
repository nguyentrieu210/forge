import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAppRollbackAutomatable,
  planAppRollback,
} from "../dist/packages/app-registry/src/index.js";

function doctype(overrides = {}) {
  return {
    name: "Thing",
    module: "Demo",
    fields: [
      { fieldname: "title", label: "Title", fieldtype: "Data", required: true },
      { fieldname: "amount", label: "Amount", fieldtype: "Currency" },
    ],
    permissions: [{ role: "Demo User", read: true, write: true, create: true }],
    revision: 1,
    ...overrides,
  };
}

function pkg(version, overrides = {}) {
  return {
    id: "demo",
    name: "Demo",
    version,
    roles: [{ role: "Demo User" }],
    doctypes: [doctype()],
    nav: [{ key: "Thing", label: "Thing", kind: "doctype" }],
    ...overrides,
  };
}

test("presentation-only rollback with identical data contract is automatable", () => {
  const current = pkg("2.0.0", { nav: [{ key: "Thing", label: "Đồ vật mới", kind: "doctype" }] });
  const target = pkg("1.0.0", { nav: [{ key: "Thing", label: "Đồ vật", kind: "doctype" }] });
  const plan = planAppRollback(current, target);
  assert.equal(plan.automatable, true);
  assert.deepEqual(plan.issues, []);
  assert.doesNotThrow(() => assertAppRollbackAutomatable(plan));
});

test("rollback refuses a target that drops a field current documents may contain", () => {
  const current = pkg("2.0.0");
  const target = pkg("1.0.0", {
    doctypes: [doctype({ fields: [{ fieldname: "title", label: "Title", fieldtype: "Data", required: true }] })],
  });
  const plan = planAppRollback(current, target);
  assert.equal(plan.automatable, false);
  assert.ok(plan.issues.some((entry) => entry.code === "FIELD_REMOVED" && entry.path.endsWith("amount")));
  assert.throws(() => assertAppRollbackAutomatable(plan), /FIELD_REMOVED/);
});

test("rollback refuses field type/link semantics and newly-required fields", () => {
  const current = pkg("2.0.0");
  const target = pkg("1.0.0", {
    doctypes: [doctype({
      fields: [
        { fieldname: "title", label: "Title", fieldtype: "Data", required: true },
        { fieldname: "amount", label: "Amount", fieldtype: "Float", required: true },
      ],
    })],
  });
  const plan = planAppRollback(current, target);
  assert.ok(plan.issues.some((entry) => entry.code === "FIELD_TYPE_CHANGED"));
  assert.ok(plan.issues.some((entry) => entry.code === "FIELD_BECOMES_REQUIRED"));
});

test("workflow state removal or docstatus change blocks rollback", () => {
  const workflow = {
    name: "Thing Workflow",
    document_type: "Thing",
    state_field: "workflow_state",
    is_active: true,
    states: [
      { state: "Draft", docstatus: 0 },
      { state: "Approved", docstatus: 1 },
    ],
    transitions: [{ state: "Draft", action: "Approve", next_state: "Approved", allowed_role: "Demo User" }],
    revision: 1,
  };
  const current = pkg("2.0.0", { workflows: [workflow] });
  const target = pkg("1.0.0", {
    workflows: [{
      ...workflow,
      states: [{ state: "Draft", docstatus: 0 }],
      transitions: [],
    }],
  });
  const plan = planAppRollback(current, target);
  assert.ok(plan.issues.some((entry) => entry.code === "WORKFLOW_STATE_REMOVED"));
});

test("permission/dependency/fixture drift is review-gated rather than silently automated", () => {
  const current = pkg("2.0.0", {
    requires: [{ id: "base", version: "2.0.0" }],
    fixtures: [{ record_type: "Setting", name: "A", data: { value: 2 } }],
  });
  const target = pkg("1.0.0", {
    requires: [{ id: "base", version: "1.0.0" }],
    fixtures: [{ record_type: "Setting", name: "A", data: { value: 1 } }],
    doctypes: [doctype({ permissions: [{ role: "Demo User", read: true, write: true }] })],
  });
  const plan = planAppRollback(current, target);
  assert.equal(plan.automatable, false);
  assert.ok(plan.issues.some((entry) => entry.code === "DEPENDENCIES_CHANGED" && entry.severity === "review"));
  assert.ok(plan.issues.some((entry) => entry.code === "FIXTURES_CHANGED" && entry.severity === "review"));
  assert.ok(plan.issues.some((entry) => entry.code === "PERMISSION_POLICY_CHANGED" && entry.severity === "review"));
});

test("rollback cannot cross app ids or point to a newer version", () => {
  assert.ok(planAppRollback(pkg("2.0.0"), { ...pkg("1.0.0"), id: "other" }).issues.some((entry) => entry.code === "APP_ID_MISMATCH"));
  assert.ok(planAppRollback(pkg("2.0.0"), pkg("3.0.0")).issues.some((entry) => entry.code === "NOT_OLDER_REVISION"));
});
