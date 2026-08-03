import test from "node:test";
import assert from "node:assert/strict";
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

function context(documentData, reader) {
  return {
    command: {
      document: documentData,
      tenant_id: "demo",
      aggregate: { doctype: "Salary Slip", name: "SAL-1" },
      action: "submit",
      actor: { user_id: "payroll@example.test", roles: ["Payroll Manager"] },
    },
    reader,
    existing: null,
    nextVersion: 1,
    now: "2026-08-07T12:00:00.000Z",
  };
}

const statutoryFormula = JSON.stringify({
  schema_version: 1,
  currency: "USD",
  inputs: {
    dependent_count: { type: "integer", required: true, min: 0, max: 20 },
  },
  outputs: {
    dependent_deduction: {
      op: "mul_int",
      value: { const_minor: "10.00" },
      factor: { input: "dependent_count" },
    },
    taxable_income: {
      op: "floor_zero",
      value: {
        op: "sub",
        args: [{ input: "gross_earnings" }, { output: "dependent_deduction" }],
      },
    },
    pit: {
      op: "progressive",
      value: { output: "taxable_income" },
      tiers: [
        { up_to: "500.00", rate_bps: 500 },
        { up_to: null, rate_bps: 1000 },
      ],
    },
  },
});

function payrollFixture() {
  const masters = {
    "Company:Demo": { default_currency: "USD" },
    "Currency:USD": { currency_scale: 2 },
    "Salary Component:Basic": { type: "Earning", account: "Salary Expense" },
    "Salary Component:PIT": { type: "Deduction", account: "Tax Payable" },
    "VN Payroll Rule:RULE-1": {
      rule_code: "RULE-1",
      effective_from: "2026-01-01",
      effective_to: "2026-12-31",
      legal_document_no: "LEGAL-2026",
      source_url: "https://example.test/legal-2026",
      formula_json: statutoryFormula,
      approved_by: "payroll.manager@example.test",
      approved_at: "2026-01-01T00:00:00Z",
    },
  };
  const documents = {
    "Salary Structure Assignment:SSA-1": document("SSA-1", {
      employee: "EMP-1",
      company: "Demo",
      branch: "BR-A",
      from_date: "2026-08-01",
      to_date: "2026-08-31",
      salary_structure: "SS-1",
      base_salary: "1000",
      holiday_list: "HL-PAY",
      payable_account: "Payroll Payable",
      payroll_cost_center: "CC-A",
      payroll_rule: "RULE-1",
      statutory_inputs: [{ input_key: "dependent_count", value: "2" }],
    }, 1, 3),
    "Salary Structure:SS-1": document("SS-1", {
      company: "Demo",
      currency: "USD",
      effective_from: "2026-01-01",
      payroll_rule: "RULE-1",
      holiday_list: "HL-PAY",
      payroll_payable_account: "Payroll Payable",
      default_cost_center: "CC-A",
      unmarked_attendance: "Vắng",
      components: [
        { salary_component: "Basic", amount_type: "Fixed", amount: "1000", prorate_by_payment_days: 1 },
        { salary_component: "PIT", amount_type: "Payroll Rule Output", rule_output_key: "pit" },
      ],
    }, 1, 2),
    "Holiday List:HL-PAY": document("HL-PAY", {
      company: "Demo",
      weekly_off_days: "0,6",
      holidays_json: "[]",
    }, 1, 4),
    "Payroll Period:PP-1": document("PP-1", {
      company: "Demo",
      branch: "BR-A",
      start_date: "2026-08-03",
      end_date: "2026-08-07",
      pay_date: "2026-08-10",
    }),
    "Attendance:A-03": document("A-03", { employee: "EMP-1", attendance_date: "2026-08-03", attendance_status: "Có mặt" }),
    "Attendance:A-04": document("A-04", { employee: "EMP-1", attendance_date: "2026-08-04", attendance_status: "Có mặt" }),
    "Attendance:A-05": document("A-05", { employee: "EMP-1", attendance_date: "2026-08-05", attendance_status: "Có mặt" }),
    "Attendance:A-06": document("A-06", { employee: "EMP-1", attendance_date: "2026-08-06", attendance_status: "Có mặt" }),
    "Attendance:A-07": document("A-07", { employee: "EMP-1", attendance_date: "2026-08-07", attendance_status: "Vắng" }),
  };
  return { masters, documents };
}

test("salary slip generation consumes statutory rule outputs and audits exact inputs", async () => {
  const { masters, documents } = payrollFixture();
  const reader = fakeReader({ masters, documents });
  const input = {
    employee: "EMP-1",
    company: "Demo",
    posting_at: "2026-08-07T12:00:00Z",
    start_date: "2026-08-03",
    end_date: "2026-08-07",
    payroll_payable_account: "",
    earnings: [],
    salary_structure_assignment: "SSA-1",
  };

  const generated = await buildHrmSalarySlipInputs(context(input, reader), input);
  assert.ok(generated);
  assert.equal(generated.working_days, 5);
  assert.equal(generated.payment_days, 4);
  assert.equal(generated.earnings[0].salary_component, "Basic");
  assert.equal(generated.earnings[0].amount, "800.00");
  assert.equal(generated.deductions[0].salary_component, "PIT");
  assert.equal(generated.deductions[0].amount, "53.00");
  assert.equal(generated.input_hash.length, 64);

  const trace = JSON.parse(generated.rule_trace_json);
  assert.equal(trace.payroll_rule.name, "RULE-1");
  assert.equal(trace.payroll_rule.formula_schema_version, 1);
  assert.equal(trace.payroll_rule.formula_sha256.length, 64);
  assert.equal(trace.payroll_rule.statutory_inputs.dependent_count, 2);
  assert.equal(trace.payroll_rule.statutory_outputs_minor.pit, 5300);
});
