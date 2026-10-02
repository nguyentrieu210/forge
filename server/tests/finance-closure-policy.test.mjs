import test from "node:test";
import assert from "node:assert/strict";
import { PermissionService } from "../dist/packages/policy/src/index.js";

const permission = new PermissionService();
const actor = (roles) => ({ user_id: "user@example.com", roles });

test("canonical accounting roles may run Finance Daily Detailed Ledger", () => {
  for (const role of [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Finance Daily Detailed Ledger"));
  }
});

test("legacy Daily Detailed Ledger permission contract is preserved", () => {
  for (const role of ["General Accountant", "Chief Accountant", "Director", "Kế toán tổng hợp", "Kế toán trưởng", "Giám đốc"]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Daily Detailed Ledger"));
  }
  for (const role of ["System Manager", "Accounts Manager", "Accounts User"]) {
    assert.throws(
      () => permission.assertReport(actor([role]), "Daily Detailed Ledger"),
      (error) => error.code === "PERMISSION_DENIED",
    );
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

test("Finance Budget vs Actual is restricted to accounting control roles", () => {
  for (const role of [
    "System Manager",
    "Accounts Manager",
    "Accounts User",
    "General Accountant",
    "Chief Accountant",
    "Kế toán tổng hợp",
    "Kế toán trưởng",
  ]) {
    assert.doesNotThrow(() => permission.assertReport(actor([role]), "Finance Budget vs Actual"));
  }

  for (const role of ["Sales Manager", "Purchase Manager", "Stock Manager", "Director", "Giám đốc"]) {
    assert.throws(
      () => permission.assertReport(actor([role]), "Finance Budget vs Actual"),
      (error) => error.code === "PERMISSION_DENIED",
    );
  }
});

test("Period Closing Voucher static RBAC matches accounting authority", () => {
  assert.doesNotThrow(() => permission.assert({
    actor: actor(["Accounts Manager"]),
    doctype: "Period Closing Voucher",
    action: "submit",
  }));
  assert.doesNotThrow(() => permission.assert({
    actor: actor(["Accounts User"]),
    doctype: "Period Closing Voucher",
    action: "read",
  }));
  assert.throws(
    () => permission.assert({
      actor: actor(["Accounts User"]),
      doctype: "Period Closing Voucher",
      action: "submit",
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});
