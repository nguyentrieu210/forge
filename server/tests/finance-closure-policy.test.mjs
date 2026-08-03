import test from "node:test";
import assert from "node:assert/strict";
import { PermissionService } from "../dist/packages/policy/src/index.js";

const permission = new PermissionService();
const actor = (roles) => ({ user_id: "user@example.com", roles });

test("canonical accounting roles may run the financial daily detailed ledger", () => {
  for (const role of [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Daily Detailed Ledger"));
  }
});

test("legacy director roles retain daily ledger read access", () => {
  for (const role of ["Director", "Giám đốc"]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Daily Detailed Ledger"));
  }
});

test("finance reconciliation diagnostics are restricted to accounting control roles", () => {
  for (const role of [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Finance Reconciliation Diagnostics"));
  }

  for (const role of ["Sales Manager", "Purchase Manager", "Stock Manager", "Director", "Giám đốc"]) {
    assert.throws(
      () => permission.assertReport(actor([role]), "Finance Reconciliation Diagnostics"),
      (error) => error.code === "PERMISSION_DENIED",
    );
  }
});
