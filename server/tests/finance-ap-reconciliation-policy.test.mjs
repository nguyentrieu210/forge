import test from "node:test";
import assert from "node:assert/strict";
import { PermissionService } from "../dist/packages/policy/src/index.js";

const permission = new PermissionService();
const actor = (roles) => ({ user_id: "user@example.com", roles });

test("accounting roles may run supplier statement and reconciliation", () => {
  for (const role of ["Accounts Manager", "Accounts User", "System Manager"]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Supplier Statement"));
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Supplier Reconciliation"));
  }
});

test("purchase manager can inspect supplier statement but cannot run GL reconciliation", () => {
  assert.doesNotThrow(() => permission.assertReport(actor(["Purchase Manager"]), "Supplier Statement"));
  assert.throws(
    () => permission.assertReport(actor(["Purchase Manager"]), "Supplier Reconciliation"),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("unrelated roles cannot run AP control reports", () => {
  for (const report of ["Supplier Statement", "Supplier Reconciliation"]) {
    assert.throws(
      () => permission.assertReport(actor(["Stock User"]), report),
      (error) => error.code === "PERMISSION_DENIED",
    );
  }
});
