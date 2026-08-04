import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluatePayrollRuleFormula } from "../dist/packages/clouderp-erpnext/src/hrm-payroll-rule.js";

const fixtureUrl = new URL("./fixtures/vn-pit-resident-wages-2026.json", import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

test("2026 VN resident wage PIT fixture is official-source-bound and explicitly VND scale 0", async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.status, "regression-only-not-production-seed");
  assert.equal(fixture.effective_from, "2026-01-01");
  assert.equal(fixture.effective_to, "2026-12-31");
  assert.equal(fixture.currency, "VND");
  assert.equal(fixture.currency_scale, 0);
  assert.equal(fixture.formula.schema_version, 1);
  assert.equal(fixture.formula.currency, "VND");

  const documents = new Set(fixture.legal_sources.map((source) => source.document_no));
  assert.ok(documents.has("109/2025/QH15"));
  assert.ok(documents.has("110/2025/UBTVQH15"));
  assert.ok(documents.has("09/2026/QH16"));
  for (const source of fixture.legal_sources) {
    const url = new URL(source.official_url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "vanban.chinhphu.vn");
    assert.ok(source.evidence.length > 20);
  }
});

test("2026 VN resident wage PIT vectors match statutory family deductions and five progressive bands", async () => {
  const fixture = await loadFixture();
  const formulaJson = JSON.stringify(fixture.formula);

  for (const [index, vector] of fixture.vectors.entries()) {
    const result = evaluatePayrollRuleFormula(formulaJson, {
      currency: fixture.currency,
      currencyScale: fixture.currency_scale,
      baseSalaryMinor: vector.gross_earnings,
      grossEarningsMinor: vector.gross_earnings,
      preRuleDeductionsMinor: 0,
      workingDays: 1,
      paymentHalfUnits: 2,
      statutoryInputs: {
        dependent_count: vector.dependent_count,
        mandatory_insurance_deduction: vector.mandatory_insurance_deduction,
        other_lawful_deductions: vector.other_lawful_deductions,
      },
    });

    assert.equal(result.outputs.family_deduction_self, 15_500_000, `vector ${index + 1} self deduction`);
    assert.equal(result.outputs.family_deduction_dependents, 6_200_000 * vector.dependent_count, `vector ${index + 1} dependent deduction`);
    assert.equal(result.outputs.taxable_income, vector.expected_taxable_income, `vector ${index + 1} taxable income`);
    assert.equal(result.outputs.pit, vector.expected_pit, `vector ${index + 1} PIT`);
  }
});

test("2026 VN PIT fixture remains data-driven for insurance and other lawful deductions", async () => {
  const fixture = await loadFixture();
  const formulaText = JSON.stringify(fixture.formula);
  assert.match(formulaText, /mandatory_insurance_deduction/);
  assert.match(formulaText, /other_lawful_deductions/);
  assert.doesNotMatch(formulaText, /bhxh_rate|bhyt_rate|bhtn_rate|insurance_ceiling/i);
});
