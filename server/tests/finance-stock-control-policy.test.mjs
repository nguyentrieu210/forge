import test from "node:test";
import assert from "node:assert/strict";
import { PermissionService } from "../dist/packages/policy/src/index.js";

const permission = new PermissionService();
const actor = (roles) => ({ user_id: "user@example.com", roles });

test("accounting control roles may run Stock Valuation Reconciliation", () => {
  for (const role of [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Stock Valuation Reconciliation"));
  }
});

test("non-accounting operational roles cannot run Stock Valuation Reconciliation", () => {
  for (const role of ["Stock Manager", "Stock User", "Purchase Manager", "Sales Manager", "Director", "Giám đốc"]) {
    assert.throws(
      () => permission.assertReport(actor([role]), "Stock Valuation Reconciliation"),
      (error) => error.code === "PERMISSION_DENIED",
    );
  }
});
