import test from "node:test";
import assert from "node:assert/strict";
import {
  WorkforcePlanController,
  EmployeeBenefitEnrollmentController,
  EmployeeLoanController,
  EmployeeLoanRepaymentController,
  SalaryBankBatchController,
} from "../dist/packages/clouderp-erpnext/src/hrm-workforce-finance-controllers.js";
import { buildHrmSalarySlipInputs } from "../dist/packages/clouderp-erpnext/src/hrm-payroll.js";

function document(name, data, docstatus = 1, version = 1) {
  return { name, docstatus, version, data };
}

function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) {
      return Object.entries(documents)
        .filter(([key]) => key.startsWith(`${doctype}:`))
        .map(([, value]) => value);
    },
    async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
    async getPeriodLockDate() { return null; },
  };
}

function context(doctype, name, action, documentData, reader) {
  return {
    command: {
      tenant_id: "demo",
      aggregate: { doctype, name },
      action,
      actor: { user_id: "manager@example.test", roles: ["HR Manager", "Payroll Manager"] },
      document: documentData,
    },
    reader,
    existing: null,
    nextVersion: 1,
    now: "2026-08-03T00:00:00Z",
  };
}

test("workforce plan computes fixed-point headcount and period budget", async () => {
  const masters = {
    "Company:Demo": { default_currency: "VND" },
    "Currency:VND": { currency_scale: 0 },
    "Fiscal Year:FY-2026": {},
    "Branch:BR-A": { company: "Demo" },
    "Department:OPS": { company: "Demo" },
    "Designation:TECH": {},
    "Employment Type:Full-time": {},
  };
  const reader = fakeReader({ masters });
  const input = {
    plan_name: "Kế hoạch 2026",
    company: "Demo",
    fiscal_year: "FY-2026",
    from_date: "2026-01-01",
    to_date: "2026-12-31",
    currency: "VND",
    lines: [{
      branch: "BR-A",
      department: "OPS",
      designation: "TECH",
      employment_type: "Full-time",
      planned_headcount: 2,
      monthly_budget_per_head: "10000000",
    }],
  };
  const result = await new WorkforcePlanController().normalize(context("Workforce Plan", "WP-1", "submit", input, reader));
  assert.equal(result.planned_months, 12);
  assert.equal(result.total_planned_headcount, 2);
  assert.equal(result.total_monthly_budget, "20000000");
  assert.equal(result.total_period_budget, "240000000");
  assert.equal(result.lines[0].monthly_budget, "20000000");
  assert.equal(result.lines[0].period_budget, "240000000");
});

test("employee benefit validates payroll component and overlapping enrollment", async () => {
  const masters = {
    "Employee:EMP-1": { employee_status: "Đang làm việc", company: "Demo", branch: "BR-A" },
    "Company:Demo": { default_currency: "VND" },
    "Currency:VND": { currency_scale: 0 },
    "Salary Component:Meal": { type: "Earning", account: "Salary Expense" },
  };
  const documents = {
    "Employee Benefit Enrollment:BEN-OLD": document("BEN-OLD", {
      benefit_code: "MEAL",
      employee: "EMP-1",
      company: "Demo",
      branch: "BR-A",
      salary_component: "Meal",
      currency: "VND",
      amount: "1000000",
      frequency: "Monthly",
      effective_from: "2026-01-01",
      effective_to: "2026-12-31",
    }),
  };
  const reader = fakeReader({ masters, documents });
  const input = {
    benefit_code: "MEAL",
    benefit_name: "Phụ cấp ăn",
    employee: "EMP-1",
    salary_component: "Meal",
    amount: "1200000",
    currency: "VND",
    frequency: "Monthly",
    effective_from: "2026-06-01",
  };
  await assert.rejects(
    new EmployeeBenefitEnrollmentController().normalize(context("Employee Benefit Enrollment", "BEN-NEW", "submit", input, reader)),
    /already has benefit MEAL overlapping/,
  );
});

test("employee loan splits principal deterministically with exact final remainder", async () => {
  const masters = {
    "Employee:EMP-1": { employee_status: "Đang làm việc", company: "Demo", branch: "BR-A" },
    "Company:Demo": { default_currency: "VND" },
    "Currency:VND": { currency_scale: 0 },
    "Salary Component:Loan Recovery": { type: "Deduction", account: "Employee Loan Receivable" },
    "Account:Employee Loan Receivable": {},
  };
  const reader = fakeReader({ masters });
  const input = {
    employee: "EMP-1",
    loan_date: "2026-01-01",
    principal_amount: "10000000",
    currency: "VND",
    installment_count: 3,
    first_repayment_date: "2026-02-28",
    salary_component: "Loan Recovery",
    purpose: "Thiết bị làm việc",
  };
  const result = await new EmployeeLoanController().normalize(context("Employee Loan", "LOAN-1", "submit", input, reader));
  assert.equal(result.installment_amount, "3333333");
  assert.equal(result.final_installment_amount, "3333334");
});

test("manual loan repayment fails closed when it would exceed outstanding", async () => {
  const masters = {
    "Currency:VND": { currency_scale: 0 },
  };
  const documents = {
    "Employee Loan:LOAN-1": document("LOAN-1", {
      employee: "EMP-1", company: "Demo", loan_date: "2026-01-01",
      principal_amount: "10000000", currency: "VND",
    }),
    "Employee Loan Repayment:LR-OLD": document("LR-OLD", {
      employee_loan: "LOAN-1", posting_date: "2026-02-01", amount: "9000000",
    }),
    "Payment Entry:PAY-1": document("PAY-1", {
      company: "Demo", party_type: "Employee", party: "EMP-1",
    }),
  };
  const reader = fakeReader({ masters, documents });
  const input = { employee_loan: "LOAN-1", posting_date: "2026-03-01", amount: "2000000", payment_entry: "PAY-1" };
  await assert.rejects(
    new EmployeeLoanRepaymentController().normalize(context("Employee Loan Repayment", "LR-NEW", "submit", input, reader)),
    /exceeds the outstanding amount/,
  );
});

test("salary bank batch is a reconciled control artifact over canonical payroll", async () => {
  const masters = {
    "Currency:VND": { currency_scale: 0 },
    "Bank Account:COMPANY-BANK": { company: "Demo", currency: "VND" },
    "Employee:EMP-1": { employee_name: "Nguyễn A", bank_name: "VCB", bank_account_no: "001122" },
    "Employee:EMP-2": { employee_name: "Nguyễn B", bank_name: "BIDV", bank_account_no: "003344" },
  };
  const documents = {
    "Payroll Entry:PAYROLL-1": document("PAYROLL-1", {
      company: "Demo", currency: "VND", start_date: "2026-07-01", end_date: "2026-07-31",
      total_net_pay_minor: 25000000,
      salary_slips: [{ salary_slip: "SLIP-1" }, { salary_slip: "SLIP-2" }],
    }),
    "Salary Slip:SLIP-1": document("SLIP-1", { employee: "EMP-1", company: "Demo", net_pay_minor: 10000000 }),
    "Salary Slip:SLIP-2": document("SLIP-2", { employee: "EMP-2", company: "Demo", net_pay_minor: 15000000 }),
  };
  const reader = fakeReader({ masters, documents });
  const input = { payroll_entry: "PAYROLL-1", transfer_date: "2026-08-01", bank_account: "COMPANY-BANK" };
  const result = await new SalaryBankBatchController().normalize(context("Salary Bank Batch", "BANK-1", "submit", input, reader));
  assert.equal(result.employee_count, 2);
  assert.equal(result.total_amount, "25000000");
  assert.equal(result.transfers[0].bank_account_no, "001122");
  assert.equal(result.transfers[1].amount, "15000000");
});

test("salary slip consumes benefit and scheduled loan deduction and traces both sources", async () => {
  const formulaJson = JSON.stringify({ schema_version: 1, currency: "USD", outputs: { noop: { const_minor: "0.00" } } });
  const masters = {
    "Company:Demo": { default_currency: "USD" },
    "Currency:USD": { currency_scale: 2 },
    "Salary Component:Basic": { type: "Earning", account: "Salary Expense" },
    "Salary Component:Meal": { type: "Earning", account: "Benefit Expense" },
    "Salary Component:Loan Recovery": { type: "Deduction", account: "Loan Receivable" },
    "VN Payroll Rule:RULE-1": {
      rule_code: "RULE-1", effective_from: "2026-01-01", effective_to: "2026-12-31",
      legal_document_no: "LEGAL", source_url: "https://example.test/legal", formula_json: formulaJson,
      approved_by: "payroll@example.test", approved_at: "2026-01-01T00:00:00Z",
    },
  };
  const documents = {
    "Salary Structure Assignment:SSA-1": document("SSA-1", {
      employee: "EMP-1", company: "Demo", branch: "BR-A", from_date: "2026-01-01", to_date: "2026-12-31",
      salary_structure: "SS-1", base_salary: "1000.00", holiday_list: "HL-1", payable_account: "Payroll Payable",
      payroll_cost_center: "CC-1", payroll_rule: "RULE-1", statutory_inputs: [],
    }),
    "Salary Structure:SS-1": document("SS-1", {
      company: "Demo", currency: "USD", effective_from: "2026-01-01", effective_to: "2026-12-31",
      payroll_rule: "RULE-1", holiday_list: "HL-1", payroll_payable_account: "Payroll Payable", default_cost_center: "CC-1",
      unmarked_attendance: "Có mặt",
      components: [{ salary_component: "Basic", amount_type: "Fixed", amount: "1000.00", prorate_by_payment_days: 1 }],
    }),
    "Holiday List:HL-1": document("HL-1", { weekly_off_days: "0,6", holidays_json: "[]" }),
    "Payroll Period:PP-1": document("PP-1", { company: "Demo", branch: "BR-A", start_date: "2026-08-03", end_date: "2026-08-07" }),
    "Employee Benefit Enrollment:BEN-1": document("BEN-1", {
      employee: "EMP-1", company: "Demo", salary_component: "Meal", amount: "100.00", currency: "USD",
      frequency: "Monthly", effective_from: "2026-01-01", prorate_by_payment_days: 0,
    }),
    "Employee Loan:LOAN-1": document("LOAN-1", {
      employee: "EMP-1", company: "Demo", loan_date: "2026-06-01", principal_amount: "300.00", currency: "USD",
      installment_count: 3, first_repayment_date: "2026-08-05", installment_amount: "100.00", final_installment_amount: "100.00",
      salary_component: "Loan Recovery",
    }),
  };
  const reader = fakeReader({ masters, documents });
  const input = {
    employee: "EMP-1", company: "Demo", posting_at: "2026-08-07T12:00:00Z",
    start_date: "2026-08-03", end_date: "2026-08-07", payroll_payable_account: "", earnings: [],
    salary_structure_assignment: "SSA-1",
  };
  const generated = await buildHrmSalarySlipInputs(context("Salary Slip", "SLIP-NEW", "submit", input, reader), input);
  assert.ok(generated);
  assert.equal(generated.earnings.find((row) => row.salary_component === "Basic").amount, "1000.00");
  assert.equal(generated.earnings.find((row) => row.salary_component === "Meal").amount, "100.00");
  assert.equal(generated.deductions.find((row) => row.salary_component === "Loan Recovery").amount, "100.00");
  const trace = JSON.parse(generated.rule_trace_json);
  assert.equal(trace.benefit_enrollments[0].name, "BEN-1");
  assert.equal(trace.employee_loans[0].name, "LOAN-1");
  assert.equal(trace.employee_loans[0].amount_minor, 10000);
});
