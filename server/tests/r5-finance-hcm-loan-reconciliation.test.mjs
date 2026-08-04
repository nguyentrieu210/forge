import test from "node:test";
import assert from "node:assert/strict";
import { R5FinanceHcmPaymentEntryController } from "../dist/packages/clouderp-selling/src/r5-finance-hcm-payment-entry.js";
import {
  ReconciledEmployeeLoanDisbursementController,
  ReconciledEmployeeLoanRepaymentController,
} from "../dist/packages/clouderp-erpnext/src/hrm-loan-finance-reconciliation.js";

function document(name, data, docstatus = 1, version = 1) {
  return { name, docstatus, version, data, owner: "owner@example.test", created_at: "2026-08-01T00:00:00Z", modified_at: "2026-08-01T00:00:00Z" };
}

function fakeReader({ tenant = "demo", masters = {}, documents = {} } = {}) {
  return {
    async getDocument(requestTenant, doctype, name) {
      if (requestTenant !== tenant) return null;
      return documents[`${doctype}:${name}`] ?? null;
    },
    async getMasterRecordData(requestTenant, doctype, name) {
      if (requestTenant !== tenant) return null;
      return masters[`${doctype}:${name}`] ?? null;
    },
    async listDocumentsByDoctype(requestTenant, doctype) {
      if (requestTenant !== tenant) return [];
      return Object.entries(documents)
        .filter(([key]) => key.startsWith(`${doctype}:`))
        .map(([, value]) => value);
    },
    async hasMasterRecord(requestTenant, doctype, name) {
      if (requestTenant !== tenant) return false;
      return Boolean(masters[`${doctype}:${name}`] ?? documents[`${doctype}:${name}`]);
    },
    async getPeriodLockDate() { return null; },
  };
}

function context(doctype, name, action, data, reader, options = {}) {
  return {
    command: {
      tenant_id: options.tenant ?? "demo",
      aggregate: { doctype, name },
      action,
      command_id: `CMD-${name}-${action}`,
      actor: { user_id: "finance@example.test", roles: ["Accounts Manager", "Payroll Manager"] },
      document: data,
    },
    reader,
    existing: options.existing ?? null,
    nextVersion: options.nextVersion ?? 1,
    now: "2026-08-04T12:00:00Z",
  };
}

const baseMasters = {
  "Employee:EMP-1": { employee_status: "Đang làm việc", company: "Demo" },
  "Company:Demo": { default_currency: "VND" },
  "Currency:VND": { currency_scale: 0 },
  "Account:Employee Loan Receivable": {},
  "Account:Bank": {},
  "Salary Component:Loan Recovery": { type: "Deduction", account: "Employee Loan Receivable" },
};

const loanData = {
  employee: "EMP-1",
  company: "Demo",
  loan_date: "2026-08-01",
  principal_amount: "12000000",
  currency: "VND",
  salary_component: "Loan Recovery",
};

test("Employee Receive posts exact bank debit and employee receivable credit without a shadow Payment Ledger", async () => {
  const reader = fakeReader({ masters: baseMasters });
  const input = {
    payment_type: "Receive",
    party_type: "Employee",
    party: "EMP-1",
    company: "Demo",
    paid_from: "Employee Loan Receivable",
    paid_to: "Bank",
    currency: "VND",
    posting_at: "2026-08-04T12:00:00Z",
    paid_amount: "1000000",
    received_amount: "1000000",
    references: [],
  };
  const controller = new R5FinanceHcmPaymentEntryController();
  const normalized = await controller.normalize(context("Payment Entry", "PAY-R1", "submit", input, reader));
  assert.equal(normalized.paid_amount_minor, 1_000_000);
  assert.equal(normalized.received_amount_minor, 1_000_000);

  const submit = controller.ledger(context("Payment Entry", "PAY-R1", "submit", normalized, reader), normalized);
  assert.equal(submit.payment.length, 0);
  assert.deepEqual(submit.gl.map((row) => [row.line_key, row.debit_minor, row.credit_minor]), [
    ["BANK", 1_000_000, 0],
    ["EMPLOYEE-RECEIVABLE", 0, 1_000_000],
  ]);

  const cancel = controller.ledger(context("Payment Entry", "PAY-R1", "cancel", normalized, reader), normalized);
  assert.deepEqual(cancel.gl.map((row) => [row.line_key, row.debit_minor, row.credit_minor]), [
    ["REV-BANK", 0, 1_000_000],
    ["REV-EMPLOYEE-RECEIVABLE", 1_000_000, 0],
  ]);
});

test("loan disbursement requires Pay direction and exact loan receivable account", async () => {
  const documents = {
    "Employee Loan:LOAN-1": document("LOAN-1", loanData, 0),
    "Payment Entry:PAY-DISB": document("PAY-DISB", {
      payment_type: "Pay",
      party_type: "Employee",
      party: "EMP-1",
      company: "Demo",
      currency: "VND",
      paid_amount: "12000000",
      received_amount: "12000000",
      paid_from: "Bank",
      paid_to: "Employee Loan Receivable",
    }),
  };
  const reader = fakeReader({ masters: baseMasters, documents });
  const input = { employee_loan: "LOAN-1", disbursement_date: "2026-08-02", payment_entry: "PAY-DISB" };
  const result = await new ReconciledEmployeeLoanDisbursementController().normalize(
    context("Employee Loan Disbursement", "DISB-1", "submit", input, reader),
  );
  assert.equal(result.amount, "12000000");

  const badDocuments = {
    ...documents,
    "Payment Entry:PAY-DISB": document("PAY-DISB", {
      ...documents["Payment Entry:PAY-DISB"].data,
      paid_to: "Other Receivable",
    }),
  };
  await assert.rejects(
    new ReconciledEmployeeLoanDisbursementController().normalize(
      context("Employee Loan Disbursement", "DISB-BAD", "submit", input, fakeReader({ masters: { ...baseMasters, "Account:Other Receivable": {} }, documents: badDocuments })),
    ),
    /must debit Employee Loan receivable account/,
  );
});

test("loan repayment requires Receive direction, exact amount/account and unique cash evidence", async () => {
  const documents = {
    "Employee Loan:LOAN-1": document("LOAN-1", loanData),
    "Payment Entry:PAY-REPAY": document("PAY-REPAY", {
      payment_type: "Receive",
      party_type: "Employee",
      party: "EMP-1",
      company: "Demo",
      currency: "VND",
      paid_amount: "2000000",
      received_amount: "2000000",
      paid_from: "Employee Loan Receivable",
      paid_to: "Bank",
    }),
  };
  const input = { employee_loan: "LOAN-1", posting_date: "2026-08-04", amount: "2000000", payment_entry: "PAY-REPAY" };
  const controller = new ReconciledEmployeeLoanRepaymentController();
  const result = await controller.normalize(context("Employee Loan Repayment", "REPAY-1", "submit", input, fakeReader({ masters: baseMasters, documents })));
  assert.equal(result.amount, "2000000");

  const wrongDirection = {
    ...documents,
    "Payment Entry:PAY-REPAY": document("PAY-REPAY", { ...documents["Payment Entry:PAY-REPAY"].data, payment_type: "Pay" }),
  };
  await assert.rejects(
    controller.normalize(context("Employee Loan Repayment", "REPAY-2", "submit", input, fakeReader({ masters: baseMasters, documents: wrongDirection }))),
    /must be a Receive payment/,
  );

  const duplicate = {
    ...documents,
    "Employee Loan Repayment:REPAY-OLD": document("REPAY-OLD", { ...input, amount: "1000000" }),
  };
  await assert.rejects(
    controller.normalize(context("Employee Loan Repayment", "REPAY-NEW", "submit", input, fakeReader({ masters: baseMasters, documents: duplicate }))),
    /already consumed by submitted Employee Loan Repayment REPAY-OLD/,
  );
});

test("Payment Entry cancellation fails closed while submitted loan evidence consumes it", async () => {
  const paymentData = {
    payment_type: "Receive",
    party_type: "Employee",
    party: "EMP-1",
    company: "Demo",
    paid_from: "Employee Loan Receivable",
    paid_to: "Bank",
    currency: "VND",
    posting_at: "2026-08-04T12:00:00Z",
    paid_amount: "2000000",
    paid_amount_minor: 2_000_000,
    received_amount: "2000000",
    received_amount_minor: 2_000_000,
    currency_scale: 0,
    company_currency: "VND",
    company_currency_scale: 0,
    references: [],
  };
  const submittedEvidence = {
    "Employee Loan Repayment:REPAY-1": document("REPAY-1", { employee_loan: "LOAN-1", payment_entry: "PAY-REPAY", amount: "2000000" }),
  };
  const existing = document("PAY-REPAY", paymentData);
  const controller = new R5FinanceHcmPaymentEntryController();
  await assert.rejects(
    controller.buildPlan(context("Payment Entry", "PAY-REPAY", "cancel", paymentData, fakeReader({ masters: baseMasters, documents: submittedEvidence }), { existing, nextVersion: 2 })),
    /cancel that evidence first/,
  );

  const cancelledEvidence = {
    "Employee Loan Repayment:REPAY-1": document("REPAY-1", { employee_loan: "LOAN-1", payment_entry: "PAY-REPAY", amount: "2000000" }, 2),
  };
  const plan = await controller.buildPlan(
    context("Payment Entry", "PAY-REPAY", "cancel", paymentData, fakeReader({ masters: baseMasters, documents: cancelledEvidence }), { existing, nextVersion: 2 }),
  );
  assert.equal(plan.document.docstatus, 2);
  assert.equal(plan.payment_entries.length, 0);
  assert.deepEqual(plan.gl_entries.map((row) => [row.line_key, row.debit_minor, row.credit_minor]), [
    ["REV-BANK", 0, 2_000_000],
    ["REV-EMPLOYEE-RECEIVABLE", 2_000_000, 0],
  ]);
});
