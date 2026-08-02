import test from "node:test";
import assert from "node:assert/strict";
import { buildHrmSalarySlipInputs } from "../dist/packages/clouderp-erpnext/src/hrm-payroll.js";

function document(name, data, docstatus = 1, version = 1) { return { name, docstatus, version, data }; }
function readerFor(masters, documents) { return {
  async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
  async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
  async listDocumentsByDoctype(_tenant, doctype) { return Object.entries(documents).filter(([key]) => key.startsWith(`${doctype}:`)).map(([, value]) => value); },
  async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
  async getPeriodLockDate() { return null; },
}; }
function ctx(documentData, reader) { return { command: { document: documentData, tenant_id: "demo", aggregate: { doctype: "Salary Slip", name: "SAL-1" }, action: "submit", actor: { user_id: "payroll@example.test", roles: ["Payroll Manager"] } }, reader, existing: null, nextVersion: 1, now: "2026-08-20T09:00:00.000Z" }; }

function fixture(formulaJson, components, statutoryInputs = []) {
  const masters = {
    "Company:Demo": { default_currency: "USD" }, "Currency:USD": { currency_scale: 2 },
    "Salary Component:Basic": { type: "Earning", account: "Salary Expense" },
    "Salary Component:PIT": { type: "Deduction", account: "Tax Payable" },
    "VN Payroll Rule:RULE-1": { rule_code: "RULE-1", effective_from: "2026-01-01", effective_to: "2026-12-31", legal_document_no: "LEGAL-2026", source_url: "https://example.test/legal-2026", formula_json: formulaJson, approved_by: "payroll.manager@example.test", approved_at: "2026-01-01T00:00:00Z" },
  };
  const documents = {
    "Salary Structure Assignment:SSA-1": document("SSA-1", { employee: "EMP-1", company: "Demo", branch: "BR-A", from_date: "2026-08-01", to_date: "2026-08-31", salary_structure: "SS-1", base_salary: "1000", holiday_list: "HL-PAY", payable_account: "Payroll Payable", payroll_cost_center: "CC-A", statutory_inputs: statutoryInputs }, 1, 3),
    "Salary Structure:SS-1": document("SS-1", { company: "Demo", effective_from: "2026-01-01", payroll_rule: "RULE-1", holiday_list: "HL-PAY", payroll_payable_account: "Payroll Payable", default_cost_center: "CC-A", unmarked_attendance: "Vắng", components }, 1, 2),
    "Holiday List:HL-PAY": document("HL-PAY", { company: "Demo", weekly_off_days: "0,6", holidays_json: "[]" }, 1, 4),
    "Payroll Period:PP-1": document("PP-1", { company: "Demo", branch: "BR-A", start_date: "2026-08-03", end_date: "2026-08-07", pay_date: "2026-08-10" }, 1, 1),
    "Attendance:A-03": document("A-03", { employee: "EMP-1", attendance_date: "2026-08-03", attendance_status: "Có mặt" }),
    "Attendance:A-04": document("A-04", { employee: "EMP-1", attendance_date: "2026-08-04", attendance_status: "Có mặt" }),
    "Attendance:A-05": document("A-05", { employee: "EMP-1", attendance_date: "2026-08-05", attendance_status: "Có mặt" }),
    "Attendance:A-06": document("A-06", { employee: "EMP-1", attendance_date: "2026-08-06", attendance_status: "Có mặt" }),
    "Attendance:A-07": document("A-07", { employee: "EMP-1", attendance_date: "2026-08-07", attendance_status: "Vắng" }),
  };
  return { masters, documents };
}

const slipInput = { employee: "EMP-1", company: "Demo", posting_at: "2026-08-07T12:00:00Z", start_date: "2026-08-03", end_date: "2026-08-07", payroll_payable_account: "", earnings: [], salary_structure_assignment: "SSA-1" };

test("salary generation maps statutory rule output into canonical deduction component", async () => {
  const formulaJson = JSON.stringify({ schema_version: 1, currency: "USD", inputs: { dependents: { type: "integer", required: true } }, outputs: { dependent_deduction: { op: "mul_int", value: { const_minor: "10.00" }, factor: { input: "dependents" } }, taxable: { op: "floor_zero", value: { op: "sub", args: [{ input: "gross_earnings" }, { output: "dependent_deduction" }] } }, pit: { op: "progressive", value: { output: "taxable" }, tiers: [{ up_to: "500.00", rate_bps: 500 }, { up_to: null, rate_bps: 1000 }] } } });
  const { masters, documents } = fixture(formulaJson, [
    { salary_component: "Basic", amount_type: "Fixed", amount: "1000", prorate_by_payment_days: 1 },
    { salary_component: "PIT", amount_type: "Payroll Rule Output", rule_output_key: "pit" },
  ], [{ input_key: "dependents", value: "2" }]);
  const generated = await buildHrmSalarySlipInputs(ctx(slipInput, readerFor(masters, documents)), slipInput);
  assert.equal(generated.earnings[0].amount, "800.00");
  assert.equal(generated.deductions[0].amount, "53.00");
  const trace = JSON.parse(generated.rule_trace_json);
  assert.equal(trace.payroll_rule.formula_schema_version, 1);
  assert.equal(trace.payroll_rule.statutory_inputs.dependents, 2);
  assert.equal(trace.payroll_rule.statutory_outputs_minor.pit, 5300);
});

test("legacy audit-only payroll rule still supports fixed salary structures", async () => {
  const { masters, documents } = fixture("{}", [{ salary_component: "Basic", amount_type: "Fixed", amount: "1000", prorate_by_payment_days: 1 }]);
  const generated = await buildHrmSalarySlipInputs(ctx(slipInput, readerFor(masters, documents)), slipInput);
  assert.equal(generated.earnings[0].amount, "800.00");
  assert.equal(generated.deductions.length, 0);
  const trace = JSON.parse(generated.rule_trace_json);
  assert.equal(trace.payroll_rule.formula_schema_version, 0);
  assert.deepEqual(trace.payroll_rule.statutory_outputs_minor, {});
});
