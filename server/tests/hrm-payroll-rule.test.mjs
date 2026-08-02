import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePayrollRuleFormula, payrollRuleInputRowsToObject } from "../dist/packages/clouderp-erpnext/src/hrm-payroll-rule.js";
import { SalaryStructureController } from "../dist/packages/clouderp-erpnext/src/hrm-policy-controllers.js";

const context = (overrides = {}) => ({ currency: "VND", currencyScale: 0, baseSalaryMinor: 20_000_000, grossEarningsMinor: 30_000_000, preRuleDeductionsMinor: 0, workingDays: 22, paymentHalfUnits: 44, statutoryInputs: { dependents: 2, insured: true }, ...overrides });
const formula = (outputs, inputs = { dependents: { type: "integer", required: true, min: 0, max: 20 }, insured: { type: "boolean", required: true } }) => JSON.stringify({ schema_version: 1, currency: "VND", inputs, outputs });

test("statutory evaluator supports caps, basis points, conditionals and dependent multipliers", () => {
  const result = evaluatePayrollRuleFormula(formula({
    insurance_base: { op: "min", args: [{ input: "base_salary" }, { const_minor: "18000000" }] },
    employee_insurance: { op: "if", condition: { input: "insured" }, then: { op: "mul_bps", value: { output: "insurance_base" }, bps: 1050 }, else: { const_minor: "0" } },
    dependent_deduction: { op: "mul_int", value: { const_minor: "4400000" }, factor: { input: "dependents" } },
  }), context());
  assert.equal(result.outputs.insurance_base, 18_000_000); assert.equal(result.outputs.employee_insurance, 1_890_000); assert.equal(result.outputs.dependent_deduction, 8_800_000);
});

test("statutory evaluator calculates progressive marginal tiers deterministically", () => {
  const result = evaluatePayrollRuleFormula(formula({ taxable: { op: "floor_zero", value: { op: "sub", args: [{ input: "gross_earnings" }, { const_minor: "11000000" }] } }, pit: { op: "progressive", value: { output: "taxable" }, tiers: [{ up_to: "5000000", rate_bps: 500 }, { up_to: "10000000", rate_bps: 1000 }, { up_to: null, rate_bps: 1500 }] } }), context());
  assert.equal(result.outputs.taxable, 19_000_000); assert.equal(result.outputs.pit, 2_100_000);
});

test("statutory evaluator rejects unknown custom inputs and output cycles", () => {
  assert.throws(() => evaluatePayrollRuleFormula(formula({ value: { const_minor: "1" } }, { dependents: { type: "integer" } }), context({ statutoryInputs: { typo: 1 } })), /Unknown statutory payroll input typo/);
  assert.throws(() => evaluatePayrollRuleFormula(formula({ a: { output: "b" }, b: { output: "a" } }), context()), /cycle detected/);
});

test("statutory evaluator fails closed on currency or schema mismatch", () => {
  assert.throws(() => evaluatePayrollRuleFormula(JSON.stringify({ schema_version: 2, currency: "VND", outputs: { x: { const_minor: "1" } } }), context()), /schema_version must be 1/);
  assert.throws(() => evaluatePayrollRuleFormula(JSON.stringify({ schema_version: 1, currency: "USD", outputs: { x: { const_minor: "1" } } }), context()), /currency must be VND/);
});

test("statutory evaluator rejects dimensionally invalid formula operations", () => {
  assert.throws(() => evaluatePayrollRuleFormula(formula({ invalid: { op: "mul_int", value: { input: "gross_earnings" }, factor: { input: "gross_earnings" } } }), context()), /mul_int requires amount value and integer factor/);
  assert.throws(() => evaluatePayrollRuleFormula(formula({ invalid: { op: "if", condition: { input: "dependents" }, then: { const_minor: "1" }, else: { const_minor: "0" } } }), context()), /if condition must be boolean/);
});

test("statutory input row helper rejects duplicate keys before evaluation", () => {
  assert.throws(() => payrollRuleInputRowsToObject([{ input_key: "dependents", value: "1" }, { input_key: "dependents", value: "2" }]), /Statutory payroll input dependents is duplicated/);
});

test("salary structure cannot map non-amount payroll output into a salary component", async () => {
  const formulaJson = JSON.stringify({ schema_version: 1, currency: "VND", inputs: { insured: { type: "boolean", required: true } }, outputs: { insured_flag: { input: "insured" } } });
  const masters = { "Company:Demo": { default_currency: "VND" }, "Currency:VND": { currency_scale: 0 }, "VN Payroll Rule:RULE-BOOL": { rule_code: "RULE-BOOL", effective_from: "2026-01-01", legal_document_no: "LEGAL", source_url: "https://example.test/legal", formula_json: formulaJson, approved_by: "payroll@example.test", approved_at: "2026-01-01T00:00:00Z" }, "Account:Payroll Payable": {}, "Account:Tax Payable": {}, "Cost Center:CC-1": {}, "Salary Component:Tax": { type: "Deduction", account: "Tax Payable" } };
  const documents = { "Holiday List:HL-1": { name: "HL-1", docstatus: 1, version: 1, data: { company: "Demo" } } };
  const reader = { async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; }, async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; }, async listDocumentsByDoctype() { return []; }, async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); }, async getPeriodLockDate() { return null; } };
  const ctx = { command: { tenant_id: "demo", aggregate: { doctype: "Salary Structure", name: "SS-BOOL" }, action: "submit", actor: { user_id: "payroll@example.test", roles: ["Payroll Manager"] }, document: { structure_name: "SS-BOOL", company: "Demo", currency: "VND", effective_from: "2026-01-01", payroll_rule: "RULE-BOOL", payroll_payable_account: "Payroll Payable", default_cost_center: "CC-1", holiday_list: "HL-1", unmarked_attendance: "Vắng", components: [{ salary_component: "Tax", amount_type: "Payroll Rule Output", rule_output_key: "insured_flag" }] } }, reader, existing: null, nextVersion: 1, now: "2026-08-02T00:00:00Z" };
  await assert.rejects(new SalaryStructureController().normalize(ctx), /Payroll rule output insured_flag must be an amount/);
});
