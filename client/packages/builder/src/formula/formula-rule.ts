export type FormulaOperandKind = "field" | "const" | "formula";
export type FormulaStepOperator = "add" | "sub" | "mul" | "div";

export interface FormulaOperandModel {
  kind: FormulaOperandKind;
  value: string;
}

export interface FormulaStepModel {
  operator: FormulaStepOperator;
  operand: FormulaOperandModel;
}

export interface FormulaRuleModel {
  key: string;
  version: number;
  scale: number;
  active: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  start: FormulaOperandModel;
  steps: FormulaStepModel[];
}

export interface FormulaRuleSetModel {
  formulas: FormulaRuleModel[];
}

export interface FormulaBuilderIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface FormulaBuilderValidation {
  ok: boolean;
  issues: FormulaBuilderIssue[];
}

const KEY = /^[a-z][a-z0-9-]{0,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function blankFormulaRuleSet(): FormulaRuleSetModel {
  return { formulas: [] };
}

export function newFormulaRule(index: number): FormulaRuleModel {
  return {
    key: `formula-${index + 1}`,
    version: 1,
    scale: 2,
    active: true,
    start: { kind: "field", value: "" },
    steps: [],
  };
}

function validateOperand(
  operand: FormulaOperandModel,
  path: string,
  issues: FormulaBuilderIssue[],
  knownFields?: ReadonlySet<string>,
): void {
  const error = (code: string, message: string) => issues.push({ severity: "error", code, path, message });
  const value = operand.value.trim();
  if (!value) return error("operand_value", "Operand cần giá trị");
  if (operand.kind === "field") {
    if (!FIELD.test(value)) error("field", "Field không hợp lệ");
    else if (knownFields && !knownFields.has(value)) error("field_unknown", `Field không tồn tại: ${value}`);
  } else if (operand.kind === "formula") {
    if (!KEY.test(value)) error("formula_ref", "Formula reference phải là kebab-case");
  } else if (!DECIMAL.test(value)) {
    error("decimal", "Hằng số phải là decimal thuần, ví dụ 10.25");
  }
}

export function validateFormulaRuleSet(model: FormulaRuleSetModel, knownFields?: ReadonlySet<string>): FormulaBuilderValidation {
  const issues: FormulaBuilderIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ severity: "error" as const, code, path, message });
  const warning = (code: string, path: string, message: string) => issues.push({ severity: "warning" as const, code, path, message });
  if (model.formulas.length > 500) error("formulas_max", "formulas", "Tối đa 500 formula trong một set");
  const identities = new Set<string>();
  model.formulas.forEach((formula, formulaIndex) => {
    const path = `formulas[${formulaIndex}]`;
    if (!KEY.test(formula.key)) error("key", `${path}.key`, "Formula key phải là kebab-case");
    if (!Number.isInteger(formula.version) || formula.version < 1) error("version", `${path}.version`, "Version phải là số nguyên dương");
    const identity = `${formula.key}@${formula.version}`;
    if (identities.has(identity)) error("duplicate", path, `Formula trùng phiên bản: ${identity}`);
    identities.add(identity);
    if (!Number.isInteger(formula.scale) || formula.scale < 0 || formula.scale > 8) error("scale", `${path}.scale`, "Scale phải là số nguyên 0..8");
    if (formula.effectiveFrom && formula.effectiveTo && formula.effectiveTo < formula.effectiveFrom) error("effective", path, "Ngày hết hiệu lực không được trước ngày bắt đầu");
    validateOperand(formula.start, `${path}.start`, issues, knownFields);
    formula.steps.forEach((step, stepIndex) => validateOperand(step.operand, `${path}.steps[${stepIndex}].operand`, issues, knownFields));
    if (!formula.active) warning("inactive", path, "Formula đang tắt và evaluator sẽ bỏ qua");
  });
  return { ok: !issues.some((entry) => entry.severity === "error"), issues };
}

function operandPayload(operand: FormulaOperandModel): Record<string, unknown> {
  const value = operand.value.trim();
  if (operand.kind === "field") return { op: "field", field: value };
  if (operand.kind === "formula") return { op: "formula", formula: value };
  return { op: "const", value };
}

export function serializeFormulaRuleSet(model: FormulaRuleSetModel): { schema_version: 1; formulas: Array<Record<string, unknown>> } {
  const validation = validateFormulaRuleSet(model);
  if (!validation.ok) throw new Error(`Formula rule set invalid: ${validation.issues.filter((entry) => entry.severity === "error").map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
  return {
    schema_version: 1,
    formulas: model.formulas.map((formula) => {
      let expression: Record<string, unknown> = operandPayload(formula.start);
      for (const step of formula.steps) {
        expression = { op: step.operator, args: [expression, operandPayload(step.operand)] };
      }
      return {
        key: formula.key,
        version: formula.version,
        scale: formula.scale,
        active: formula.active,
        ...(formula.effectiveFrom ? { effective_from: formula.effectiveFrom } : {}),
        ...(formula.effectiveTo ? { effective_to: formula.effectiveTo } : {}),
        expression,
      };
    }),
  };
}
