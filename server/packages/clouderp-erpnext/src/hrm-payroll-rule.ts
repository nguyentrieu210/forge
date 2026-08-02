import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  evaluatePayrollRuleFormula as evaluateStrictPayrollRuleFormula,
  inspectPayrollRuleFormula,
  payrollRuleInputRowsToObject,
  type PayrollRuleEvaluationContext,
  type PayrollRuleFormulaMetadata,
  type PayrollRuleValueType,
} from "./hrm-payroll-rule-engine.js";

export type { PayrollRuleEvaluationContext, PayrollRuleFormulaMetadata, PayrollRuleValueType };
export { inspectPayrollRuleFormula, payrollRuleInputRowsToObject };

export interface PayrollRuleEvaluationResult {
  schemaVersion: 0 | 1;
  canonicalFormulaJson: string;
  inputs: JsonObject;
  outputs: Record<string, number>;
}

export function evaluatePayrollRuleFormula(
  formulaJson: string,
  context: PayrollRuleEvaluationContext,
): PayrollRuleEvaluationResult {
  const parsed = parseFormula(formulaJson);
  if (parsed.schema_version === undefined || parsed.schema_version === null) {
    if (context.statutoryInputs && Object.keys(context.statutoryInputs).length > 0) {
      throw errors.reference("Legacy payroll rule cannot consume statutory inputs; create a schema_version 1 rule");
    }
    return {
      schemaVersion: 0,
      canonicalFormulaJson: JSON.stringify(parsed),
      inputs: {},
      outputs: {},
    };
  }
  return evaluateStrictPayrollRuleFormula(formulaJson, context);
}

function parseFormula(value: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw errors.reference("Payroll rule formula_json must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw errors.reference("Payroll rule formula_json must be a JSON object");
  }
  return parsed as JsonObject;
}
