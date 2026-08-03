import test from "node:test";
import assert from "node:assert/strict";
import { loanRepaidMinor } from "../dist/packages/clouderp-erpnext/src/hrm-workforce-finance-controllers.js";

function document(name, data, docstatus = 1, version = 1) {
  return { name, docstatus, version, data };
}

function reader(documents) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData() { return null; },
    async listDocumentsByDoctype(_tenant, doctype) {
      return Object.entries(documents)
        .filter(([key]) => key.startsWith(`${doctype}:`))
        .map(([, value]) => value);
    },
    async hasMasterRecord() { return false; },
    async getPeriodLockDate() { return null; },
  };
}

test("loan balance replay ignores repayments and salary slips after payroll end date", async () => {
  const documents = {
    "Employee Loan Repayment:LR-PAST": document("LR-PAST", {
      employee_loan: "LOAN-1", posting_date: "2026-06-15", amount: "100.00",
    }),
    "Employee Loan Repayment:LR-FUTURE": document("LR-FUTURE", {
      employee_loan: "LOAN-1", posting_date: "2026-08-15", amount: "200.00",
    }),
    "Salary Slip:SLIP-PAST": document("SLIP-PAST", {
      end_date: "2026-06-30",
      rule_trace_json: JSON.stringify({ employee_loans: [{ name: "LOAN-1", amount_minor: 5000 }] }),
    }),
    "Salary Slip:SLIP-FUTURE": document("SLIP-FUTURE", {
      end_date: "2026-08-31",
      rule_trace_json: JSON.stringify({ employee_loans: [{ name: "LOAN-1", amount_minor: 7000 }] }),
    }),
  };
  const context = {
    command: {
      tenant_id: "demo",
      aggregate: { doctype: "Salary Slip", name: "SLIP-JULY" },
      action: "submit",
      actor: { user_id: "payroll@example.test", roles: ["Payroll Manager"] },
      document: { end_date: "2026-07-31" },
    },
    reader: reader(documents),
    existing: null,
    nextVersion: 1,
    now: "2026-07-31T12:00:00Z",
  };
  const amount = await loanRepaidMinor(context, "LOAN-1", 2);
  assert.equal(amount, 15000);
});
