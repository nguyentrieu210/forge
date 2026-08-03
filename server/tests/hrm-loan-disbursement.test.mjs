import test from "node:test";
import assert from "node:assert/strict";
import { EmployeeLoanDisbursementController } from "../dist/packages/clouderp-erpnext/src/hrm-loan-disbursement-controller.js";

function document(name, data, docstatus = 1, version = 1) { return { name, docstatus, version, data }; }
function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) { return Object.entries(documents).filter(([key]) => key.startsWith(`${doctype}:`)).map(([, value]) => value); },
    async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
    async getPeriodLockDate() { return null; },
  };
}
function context(name, action, data, reader) { return { command: { tenant_id: "demo", aggregate: { doctype: "Employee Loan Disbursement", name }, action, actor: { user_id: "payroll@example.test", roles: ["Payroll Manager"] }, document: data }, reader, existing: null, nextVersion: 1, now: "2026-08-03T00:00:00Z" }; }

test("loan disbursement derives authoritative amount from draft loan and reconciles payment entry", async () => {
  const masters = { "Currency:VND": { currency_scale: 0 } };
  const documents = {
    "Employee Loan:LOAN-1": document("LOAN-1", { employee: "EMP-1", company: "Demo", loan_date: "2026-08-01", principal_amount: "12000000", currency: "VND" }, 0),
    "Payment Entry:PAY-1": document("PAY-1", { company: "Demo", party_type: "Employee", party: "EMP-1", currency: "VND", paid_amount: "12000000" }),
  };
  const result = await new EmployeeLoanDisbursementController().normalize(context("DISB-1", "submit", { employee_loan: "LOAN-1", disbursement_date: "2026-08-02", payment_entry: "PAY-1" }, fakeReader({ masters, documents })));
  assert.equal(result.employee, "EMP-1");
  assert.equal(result.amount, "12000000");
  assert.equal(result.payment_entry, "PAY-1");
});

test("loan disbursement rejects payment amount or employee mismatch", async () => {
  const masters = { "Currency:VND": { currency_scale: 0 } };
  const baseDocuments = {
    "Employee Loan:LOAN-1": document("LOAN-1", { employee: "EMP-1", company: "Demo", loan_date: "2026-08-01", principal_amount: "12000000", currency: "VND" }, 0),
  };
  await assert.rejects(new EmployeeLoanDisbursementController().normalize(context("DISB-A", "submit", { employee_loan: "LOAN-1", disbursement_date: "2026-08-02", payment_entry: "PAY-BAD" }, fakeReader({ masters, documents: { ...baseDocuments, "Payment Entry:PAY-BAD": document("PAY-BAD", { company: "Demo", party_type: "Employee", party: "EMP-2", currency: "VND", paid_amount: "12000000" }) } }))), /belongs to another employee/);
  await assert.rejects(new EmployeeLoanDisbursementController().normalize(context("DISB-B", "submit", { employee_loan: "LOAN-1", disbursement_date: "2026-08-02", payment_entry: "PAY-BAD" }, fakeReader({ masters, documents: { ...baseDocuments, "Payment Entry:PAY-BAD": document("PAY-BAD", { company: "Demo", party_type: "Employee", party: "EMP-1", currency: "VND", paid_amount: "11999999" }) } }))), /amount does not equal/);
});

test("loan disbursement rejects duplicate submitted evidence", async () => {
  const masters = { "Currency:VND": { currency_scale: 0 } };
  const documents = {
    "Employee Loan:LOAN-1": document("LOAN-1", { employee: "EMP-1", company: "Demo", loan_date: "2026-08-01", principal_amount: "12000000", currency: "VND" }, 0),
    "Payment Entry:PAY-1": document("PAY-1", { company: "Demo", party_type: "Employee", party: "EMP-1", currency: "VND", paid_amount: "12000000" }),
    "Employee Loan Disbursement:DISB-OLD": document("DISB-OLD", { employee_loan: "LOAN-1", payment_entry: "PAY-0", amount: "12000000" }),
  };
  await assert.rejects(new EmployeeLoanDisbursementController().normalize(context("DISB-NEW", "submit", { employee_loan: "LOAN-1", disbursement_date: "2026-08-02", payment_entry: "PAY-1" }, fakeReader({ masters, documents }))), /already has a submitted disbursement/);
});
