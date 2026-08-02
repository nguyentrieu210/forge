import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePayrollRuleFormula } from "../dist/packages/clouderp-erpnext/src/hrm-payroll-rule.js";

const fixtureUrl = new URL("../apps-src/hrm/fixtures/vn-payroll-rule-2026-template.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
const rule = fixture.data;

test("Vietnam 2026 payroll reference fixture stays disabled until tenant approval", () => {
  assert.equal(fixture.record_type, "VN Payroll Rule");
  assert.equal(fixture.name, "VN-2026-REFERENCE-TEMPLATE");
  assert.equal(rule.disabled, 1);
  assert.match(rule.legal_document_no, /109\/2025\/QH15/);
  assert.match(rule.legal_document_no, /110\/2025\/UBTVQH15/);
  assert.match(rule.legal_document_no, /41\/2024\/QH15/);
  assert.match(rule.source_url, /^https:\/\/baochinhphu\.vn\//);
});

test("Vietnam 2026 reference computes employee insurance and five-tier PIT deterministically", () => {
  const evaluated = evaluatePayrollRuleFormula(rule.formula_json, {
    currency: "VND",
    currencyScale: 0,
    baseSalaryMinor: 30_000_000,
    grossEarningsMinor: 50_000_000,
    preRuleDeductionsMinor: 0,
    workingDays: 22,
    paymentHalfUnits: 44,
    statutoryInputs: {
      dependent_count: 1,
      insurance_salary: 30_000_000,
      bhxh_bhyt_ceiling: 50_600_000,
      bhtn_salary: 30_000_000,
      bhtn_ceiling: 100_000_000,
      pit_exempt_income: 0,
      other_pit_deductions: 0,
    },
  });

  assert.equal(evaluated.outputs.employee_bhxh, 2_400_000);
  assert.equal(evaluated.outputs.employee_bhyt, 450_000);
  assert.equal(evaluated.outputs.employee_bhtn, 300_000);
  assert.equal(evaluated.outputs.dependent_deduction, 6_200_000);
  assert.equal(evaluated.outputs.taxable_income, 25_150_000);
  assert.equal(evaluated.outputs.pit, 2_015_000);
});

test("Vietnam 2026 reference caps BHXH/BHYT at the effective-dated statutory input", () => {
  const evaluated = evaluatePayrollRuleFormula(rule.formula_json, {
    currency: "VND",
    currencyScale: 0,
    baseSalaryMinor: 100_000_000,
    grossEarningsMinor: 100_000_000,
    preRuleDeductionsMinor: 0,
    workingDays: 22,
    paymentHalfUnits: 44,
    statutoryInputs: {
      dependent_count: 0,
      insurance_salary: 100_000_000,
      bhxh_bhyt_ceiling: 50_600_000,
      bhtn_salary: 100_000_000,
      bhtn_ceiling: 80_000_000,
      pit_exempt_income: 0,
      other_pit_deductions: 0,
    },
  });

  assert.equal(evaluated.outputs.employee_bhxh, 4_048_000);
  assert.equal(evaluated.outputs.employee_bhyt, 759_000);
  assert.equal(evaluated.outputs.employee_bhtn, 800_000);
});
