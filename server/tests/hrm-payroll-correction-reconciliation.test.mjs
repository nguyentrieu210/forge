import test from "node:test";
import assert from "node:assert/strict";
import { PayrollEntryController, SalarySlipController } from "../dist/packages/clouderp-erpnext/src/enterprise-controllers.js";

function document(name, data, docstatus = 1, version = 1) {
  return { name, docstatus, version, data };
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
    async getPeriodLockDate() { return null; },
  };
}

function context(doctype, name, documentData, reader, action = "submit", tenantId = "demo") {
  return {
    command: {
      document: documentData,
      tenant_id: tenantId,
      aggregate: { doctype, name },
      action,
      actor: { user_id: "payroll@example.test", roles: ["Payroll Manager"] },
    },
    reader,
    existing: null,
    nextVersion: 1,
    now: "2026-08-04T12:00:00.000Z",
  };
}

const salarySlip = {
  employee: "EMP-1",
  company: "Demo",
  posting_at: "2026-08-31T12:00:00Z",
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  payroll_payable_account: "Payroll Payable",
  currency: "VND",
  currency_scale: 0,
  earnings: [
    { row_id: "BASIC", salary_component: "Basic", amount: "20000000", amount_minor: 20_000_000, account: "Salary Expense" },
  ],
  deductions: [
    { row_id: "PIT", salary_component: "PIT", amount: "1000000", amount_minor: 1_000_000, account: "PIT Payable" },
  ],
  gross_pay: "20000000",
  gross_pay_minor: 20_000_000,
  total_deduction: "1000000",
  total_deduction_minor: 1_000_000,
  net_pay: "19000000",
  net_pay_minor: 19_000_000,
};

test("Salary Slip cancel exactly reverses canonical GL and employee payable ledgers", async () => {
  const reader = fakeReader();
  const controller = new SalarySlipController();
  const submit = await controller.ledgers(context("Salary Slip", "SAL-1", salarySlip, reader, "submit"), salarySlip);
  const cancel = await controller.ledgers(context("Salary Slip", "SAL-1", salarySlip, reader, "cancel"), salarySlip);

  assert.equal(submit.gl.length, 3);
  assert.equal(submit.payment.length, 1);
  assert.equal(cancel.gl.length, submit.gl.length);
  assert.equal(cancel.payment.length, submit.payment.length);

  for (const [index, original] of submit.gl.entries()) {
    const reversal = cancel.gl[index];
    assert.equal(reversal.line_key, `REV-${original.line_key}`);
    assert.equal(reversal.debit_minor, original.credit_minor);
    assert.equal(reversal.credit_minor, original.debit_minor);
    assert.equal(reversal.currency, original.currency);
    assert.equal(reversal.currency_scale, original.currency_scale);
  }

  assert.equal(cancel.payment[0].line_key, `REV-${submit.payment[0].line_key}`);
  assert.equal(cancel.payment[0].amount_minor, -submit.payment[0].amount_minor);
  assert.equal(cancel.payment[0].base_amount_minor, -submit.payment[0].base_amount_minor);
  assert.equal(cancel.payment[0].against_voucher_type, "Salary Slip");
  assert.equal(cancel.payment[0].against_voucher_no, "SAL-1");
});

test("Payroll Entry reconciles exactly to submitted Salary Slip net pay and rejects cancelled source slips", async () => {
  const masters = {
    "Company:Demo": { default_currency: "VND" },
    "Currency:VND": { currency_scale: 0 },
  };
  const documents = {
    "Salary Slip:SAL-1": document("SAL-1", salarySlip, 1),
    "Salary Slip:SAL-2": document("SAL-2", { ...salarySlip, employee: "EMP-2", net_pay: "21000000", net_pay_minor: 21_000_000 }, 1),
    "Salary Slip:SAL-CANCELLED": document("SAL-CANCELLED", { ...salarySlip, employee: "EMP-3" }, 2),
  };
  const reader = fakeReader({ masters, documents });
  const controller = new PayrollEntryController();
  const input = {
    company: "Demo",
    posting_at: "2026-08-31T12:00:00Z",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    salary_slips: [{ salary_slip: "SAL-1" }, { salary_slip: "SAL-2" }],
  };

  const normalized = await controller.normalize(context("Payroll Entry", "PAY-1", input, reader), input);
  assert.equal(normalized.employee_count, 2);
  assert.equal(normalized.total_net_pay_minor, 40_000_000);
  assert.equal(normalized.total_net_pay, "40000000");
  assert.deepEqual(normalized.salary_slips.map((row) => row.net_pay_minor), [19_000_000, 21_000_000]);

  const cancelledInput = { ...input, salary_slips: [{ salary_slip: "SAL-CANCELLED" }] };
  await assert.rejects(
    () => controller.normalize(context("Payroll Entry", "PAY-BAD", cancelledInput, reader), cancelledInput),
    /Submitted Salary Slip SAL-CANCELLED is required/,
  );
});

test("Payroll reconciliation remains tenant-scoped", async () => {
  const masters = {
    "Company:Demo": { default_currency: "VND" },
    "Currency:VND": { currency_scale: 0 },
  };
  const documents = { "Salary Slip:SAL-1": document("SAL-1", salarySlip, 1) };
  const reader = fakeReader({ tenant: "tenant-a", masters, documents });
  const input = {
    company: "Demo",
    posting_at: "2026-08-31T12:00:00Z",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    salary_slips: [{ salary_slip: "SAL-1" }],
  };

  await assert.rejects(
    () => new PayrollEntryController().normalize(context("Payroll Entry", "PAY-X", input, reader, "submit", "tenant-b"), input),
    /default currency/,
  );
});
