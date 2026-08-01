import test from "node:test";
import assert from "node:assert/strict";
import { PermissionService } from "../dist/packages/policy/src/index.js";

const permission = new PermissionService();
const actor = (roles) => ({ user_id: "user@example.com", roles });

test("accounting roles may run both finance aging reports", () => {
  for (const role of ["Accounts Manager", "Accounts User", "System Manager"]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Accounts Receivable Aging"));
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Accounts Payable Aging"));
  }
});

test("commercial managers only receive their matching aging report", () => {
  assert.doesNotThrow(() => permission.assertReport(actor(["Sales Manager"]), "Accounts Receivable Aging"));
  assert.throws(
    () => permission.assertReport(actor(["Sales Manager"]), "Accounts Payable Aging"),
    (error) => error.code === "PERMISSION_DENIED",
  );

  assert.doesNotThrow(() => permission.assertReport(actor(["Purchase Manager"]), "Accounts Payable Aging"));
  assert.throws(
    () => permission.assertReport(actor(["Purchase Manager"]), "Accounts Receivable Aging"),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("unrelated roles cannot run finance aging reports", () => {
  for (const report of ["Accounts Receivable Aging", "Accounts Payable Aging"]) {
    assert.throws(
      () => permission.assertReport(actor(["Stock User"]), report),
      (error) => error.code === "PERMISSION_DENIED",
    );
  }
});
