import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type { QualityInspectionData } from "./types.js";

const PLAN_TYPES = new Set(["Incoming", "In Process", "Final"]);
const PARAMETER_TYPES = new Set(["Numeric", "Pass/Fail", "Text"]);
const SAMPLING_METHODS = new Set(["100%", "Fixed", "Percentage"]);
const NCR_SEVERITIES = new Set(["Minor", "Major", "Critical"]);
const NCR_DISPOSITIONS = new Set(["Hold", "Rework", "Scrap", "Use As Is", "Return to Supplier", "Other"]);
const RCA_METHODS = new Set(["5 Why", "Fishbone", "Fault Tree", "Other"]);
const CAPA_TYPES = new Set(["Corrective", "Preventive"]);
const VERIFICATION_RESULTS = new Set(["Effective", "Ineffective"]);
const CALIBRATION_RESULTS = new Set(["Pass", "Fail"]);

export interface QualityPlanParameter extends JsonObject {
  row_id: string;
  specification: string;
  parameter_type: "Numeric" | "Pass/Fail" | "Text";
  minimum?: string | number;
  maximum?: string | number;
  accepted_value?: string;
  uom?: string;
  mandatory?: boolean | number;
}

export interface QualityPlanData extends JsonObject {
  company: string;
  plan_name: string;
  inspection_type: "Incoming" | "In Process" | "Final";
  item_code?: string;
  effective_from: string;
  effective_to?: string;
  sampling_method: "100%" | "Fixed" | "Percentage";
  sample_size?: number;
  sample_percentage?: string | number;
  is_active?: boolean | number;
  parameters: QualityPlanParameter[];
  note?: string;
}

export interface NonConformanceReportData extends JsonObject {
  company: string;
  posting_at: string;
  source_inspection?: string;
  reference_type?: string;
  reference_name?: string;
  item_code: string;
  severity: "Minor" | "Major" | "Critical";
  defect_category: string;
  description: string;
  quantity_affected?: string | number;
  disposition: "Hold" | "Rework" | "Scrap" | "Use As Is" | "Return to Supplier" | "Other";
  owner_user: string;
  target_close_date?: string;
}

export interface RootCauseAnalysisData extends JsonObject {
  company: string;
  ncr: string;
  analysis_method: "5 Why" | "Fishbone" | "Fault Tree" | "Other";
  root_cause: string;
  contributing_factors?: string;
  evidence?: string;
  analyzed_by: string;
  analyzed_at: string;
}

export interface CapaData extends JsonObject {
  company: string;
  ncr: string;
  root_cause_analysis?: string;
  action_type: "Corrective" | "Preventive";
  action_description: string;
  owner_user: string;
  opened_at: string;
  due_date: string;
  verification_criteria: string;
  implemented_at?: string;
  verified_at?: string;
  verification_result?: "Effective" | "Ineffective";
  closure_note?: string;
}

export interface CalibrationRecordData extends JsonObject {
  company: string;
  instrument_id: string;
  asset?: string;
  calibration_date: string;
  next_due_date: string;
  standard_reference: string;
  result: "Pass" | "Fail";
  certificate_no?: string;
  performed_by: string;
  findings?: string;
}

export interface QualityPlanEvaluationReading extends JsonObject {
  specification: string;
  value?: string | number;
  text_value?: string;
  accepted?: boolean | number;
}

export interface QualityPlanEvaluationRow extends JsonObject {
  specification: string;
  parameter_type: string;
  passed: boolean;
  reason: string;
}

export interface QualityPlanEvaluation extends JsonObject {
  plan_name: string;
  passed: boolean;
  total: number;
  failed: number;
  rows: QualityPlanEvaluationRow[];
}

export class QualityPlanController extends SuiteController<QualityPlanData> {
  readonly doctype = "Quality Plan";

  async normalize(context: ControllerContext<QualityPlanData>): Promise<QualityPlanData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const planName = requiredText(input.plan_name, "plan_name");
    const inspectionType = requiredChoice(input.inspection_type, PLAN_TYPES, "inspection_type") as QualityPlanData["inspection_type"];
    const effectiveFrom = validDate(input.effective_from, "effective_from");
    const effectiveTo = input.effective_to ? validDate(input.effective_to, "effective_to") : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom) throw errors.validation("effective_to must be on or after effective_from");
    const samplingMethod = requiredChoice(input.sampling_method, SAMPLING_METHODS, "sampling_method") as QualityPlanData["sampling_method"];
    const itemCode = optionalText(input.item_code);
    const isActive = input.is_active === undefined ? true : input.is_active === true || input.is_active === 1;

    let sampleSize: number | undefined;
    let samplePercentage: string | undefined;
    if (samplingMethod === "Fixed") sampleSize = positiveInteger(input.sample_size, "sample_size");
    if (samplingMethod === "Percentage") {
      const micros = positiveDecimalMicros(input.sample_percentage, "sample_percentage");
      if (micros > 100_000_000) throw errors.validation("sample_percentage cannot exceed 100");
      samplePercentage = fromScaledInt(micros, 6);
    }

    if (!Array.isArray(input.parameters) || input.parameters.length === 0) {
      throw errors.validation("Quality Plan requires at least one parameter");
    }
    const seen = new Set<string>();
    const parameters = input.parameters.map((row, index) => normalizeParameter(row, index, seen));

    if (context.command.action === "submit") {
      await requireMaster(context, "Company", company);
      if (itemCode) await requireMaster(context, "Item", itemCode);
      if (isActive) await assertNoQualityPlanOverlap(context, {
        company,
        inspection_type: inspectionType,
        ...(itemCode ? { item_code: itemCode } : {}),
        effective_from: effectiveFrom,
        ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      });
    }

    return {
      ...input,
      company,
      plan_name: planName,
      inspection_type: inspectionType,
      ...(itemCode ? { item_code: itemCode } : {}),
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      sampling_method: samplingMethod,
      ...(sampleSize === undefined ? {} : { sample_size: sampleSize }),
      ...(samplePercentage === undefined ? {} : { sample_percentage: samplePercentage }),
      is_active: isActive,
      parameters,
    };
  }

  status(context: ControllerContext<QualityPlanData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Active";
  }
}

export class NonConformanceReportController extends SuiteController<NonConformanceReportData> {
  readonly doctype = "Non Conformance Report";

  async normalize(context: ControllerContext<NonConformanceReportData>): Promise<NonConformanceReportData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const postingAt = validDateTime(input.posting_at, "posting_at");
    const itemCode = requiredText(input.item_code, "item_code");
    const severity = requiredChoice(input.severity, NCR_SEVERITIES, "severity") as NonConformanceReportData["severity"];
    const disposition = requiredChoice(input.disposition, NCR_DISPOSITIONS, "disposition") as NonConformanceReportData["disposition"];
    const defectCategory = requiredText(input.defect_category, "defect_category");
    const description = requiredText(input.description, "description");
    const ownerUser = requiredText(input.owner_user, "owner_user");
    const sourceInspection = optionalText(input.source_inspection);
    const referenceType = optionalText(input.reference_type);
    const referenceName = optionalText(input.reference_name);
    if ((referenceType && !referenceName) || (!referenceType && referenceName)) {
      throw errors.validation("reference_type and reference_name must be provided together");
    }
    const targetCloseDate = input.target_close_date ? validDate(input.target_close_date, "target_close_date") : undefined;
    if (targetCloseDate && targetCloseDate < postingAt.slice(0, 10)) {
      throw errors.validation("target_close_date cannot be before posting_at");
    }
    const quantityAffected = input.quantity_affected === undefined
      ? undefined
      : positiveDecimalString(input.quantity_affected, "quantity_affected");

    if (context.command.action === "submit") {
      await requireMaster(context, "Company", company);
      await requireMaster(context, "Item", itemCode);
      if (sourceInspection) {
        const inspection = await requireSubmittedDocument<QualityInspectionData>(context, "Quality Inspection", sourceInspection);
        if (inspection.data.status !== "Rejected") throw errors.reference("NCR source Quality Inspection must be Rejected");
        if (inspection.data.item_code !== itemCode) throw errors.reference("NCR item does not match source Quality Inspection");
      }
    }

    return {
      ...input,
      company,
      posting_at: postingAt,
      ...(sourceInspection ? { source_inspection: sourceInspection } : {}),
      ...(referenceType ? { reference_type: referenceType, reference_name: referenceName } : {}),
      item_code: itemCode,
      severity,
      defect_category: defectCategory,
      description,
      ...(quantityAffected ? { quantity_affected: quantityAffected } : {}),
      disposition,
      owner_user: ownerUser,
      ...(targetCloseDate ? { target_close_date: targetCloseDate } : {}),
    };
  }

  async ledgers(context: ControllerContext<NonConformanceReportData>): Promise<{}> {
    if (context.command.action === "cancel") {
      await assertNoSubmittedDependents(context, "Root Cause Analysis", "ncr", context.command.aggregate.name,
        "Cancel submitted Root Cause Analysis records before cancelling this NCR");
      await assertNoSubmittedDependents(context, "CAPA", "ncr", context.command.aggregate.name,
        "Cancel submitted CAPA records before cancelling this NCR");
    }
    return {};
  }

  status(context: ControllerContext<NonConformanceReportData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Open";
  }
}

export class RootCauseAnalysisController extends SuiteController<RootCauseAnalysisData> {
  readonly doctype = "Root Cause Analysis";

  async normalize(context: ControllerContext<RootCauseAnalysisData>): Promise<RootCauseAnalysisData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const ncr = requiredText(input.ncr, "ncr");
    const method = requiredChoice(input.analysis_method, RCA_METHODS, "analysis_method") as RootCauseAnalysisData["analysis_method"];
    const rootCause = requiredText(input.root_cause, "root_cause");
    const analyzedBy = requiredText(input.analyzed_by, "analyzed_by");
    const analyzedAt = validDateTime(input.analyzed_at, "analyzed_at");
    if (context.command.action === "submit") {
      const ncrDoc = await requireSubmittedDocument<NonConformanceReportData>(context, "Non Conformance Report", ncr);
      if (ncrDoc.data.company !== company) throw errors.reference("RCA company does not match NCR");
    }
    return {
      ...input,
      company,
      ncr,
      analysis_method: method,
      root_cause: rootCause,
      analyzed_by: analyzedBy,
      analyzed_at: analyzedAt,
    };
  }

  async ledgers(context: ControllerContext<RootCauseAnalysisData>): Promise<{}> {
    if (context.command.action === "cancel") {
      await assertNoSubmittedDependents(context, "CAPA", "root_cause_analysis", context.command.aggregate.name,
        "Cancel submitted CAPA records before cancelling this RCA");
    }
    return {};
  }

  status(context: ControllerContext<RootCauseAnalysisData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Analyzed";
  }
}

export class CapaController extends SuiteController<CapaData> {
  readonly doctype = "CAPA";

  async normalize(context: ControllerContext<CapaData>): Promise<CapaData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const ncr = requiredText(input.ncr, "ncr");
    const rca = optionalText(input.root_cause_analysis);
    const actionType = requiredChoice(input.action_type, CAPA_TYPES, "action_type") as CapaData["action_type"];
    const actionDescription = requiredText(input.action_description, "action_description");
    const ownerUser = requiredText(input.owner_user, "owner_user");
    const openedAt = validDateTime(input.opened_at, "opened_at");
    const dueDate = validDate(input.due_date, "due_date");
    if (dueDate < openedAt.slice(0, 10)) throw errors.validation("due_date cannot be before opened_at");
    const verificationCriteria = requiredText(input.verification_criteria, "verification_criteria");
    const implementedAt = input.implemented_at ? validDateTime(input.implemented_at, "implemented_at") : undefined;
    const verifiedAt = input.verified_at ? validDateTime(input.verified_at, "verified_at") : undefined;
    const verificationResult = input.verification_result
      ? requiredChoice(input.verification_result, VERIFICATION_RESULTS, "verification_result") as CapaData["verification_result"]
      : undefined;
    if (verifiedAt && !implementedAt) throw errors.validation("verified_at requires implemented_at");
    if (implementedAt && implementedAt < openedAt) throw errors.validation("implemented_at cannot be before opened_at");
    if (verifiedAt && implementedAt && verifiedAt < implementedAt) throw errors.validation("verified_at cannot be before implemented_at");
    if (verificationResult && !verifiedAt) throw errors.validation("verification_result requires verified_at");

    if (context.command.action === "submit") {
      const ncrDoc = await requireSubmittedDocument<NonConformanceReportData>(context, "Non Conformance Report", ncr);
      if (ncrDoc.data.company !== company) throw errors.reference("CAPA company does not match NCR");
      if (rca) {
        const rcaDoc = await requireSubmittedDocument<RootCauseAnalysisData>(context, "Root Cause Analysis", rca);
        if (rcaDoc.data.ncr !== ncr || rcaDoc.data.company !== company) throw errors.reference("CAPA RCA does not match NCR/company");
      }
      if (!implementedAt || !verifiedAt || verificationResult !== "Effective" || !requiredText(input.closure_note, "closure_note")) {
        throw errors.lifecycle("CAPA can close only after implementation, verification Effective, and closure note");
      }
    }

    return {
      ...input,
      company,
      ncr,
      ...(rca ? { root_cause_analysis: rca } : {}),
      action_type: actionType,
      action_description: actionDescription,
      owner_user: ownerUser,
      opened_at: openedAt,
      due_date: dueDate,
      verification_criteria: verificationCriteria,
      ...(implementedAt ? { implemented_at: implementedAt } : {}),
      ...(verifiedAt ? { verified_at: verifiedAt } : {}),
      ...(verificationResult ? { verification_result: verificationResult } : {}),
      ...(optionalText(input.closure_note) ? { closure_note: optionalText(input.closure_note) } : {}),
    };
  }

  status(context: ControllerContext<CapaData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Open" : ds === 2 ? "Cancelled" : "Closed";
  }
}

export class CalibrationRecordController extends SuiteController<CalibrationRecordData> {
  readonly doctype = "Calibration Record";

  async normalize(context: ControllerContext<CalibrationRecordData>): Promise<CalibrationRecordData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const instrumentId = requiredText(input.instrument_id, "instrument_id");
    const asset = optionalText(input.asset);
    const calibrationDate = validDate(input.calibration_date, "calibration_date");
    const nextDueDate = validDate(input.next_due_date, "next_due_date");
    if (nextDueDate <= calibrationDate) throw errors.validation("next_due_date must be after calibration_date");
    const standardReference = requiredText(input.standard_reference, "standard_reference");
    const result = requiredChoice(input.result, CALIBRATION_RESULTS, "result") as CalibrationRecordData["result"];
    const performedBy = requiredText(input.performed_by, "performed_by");
    if (context.command.action === "submit") {
      await requireMaster(context, "Company", company);
      if (asset) await requireMaster(context, "Asset", asset);
    }
    return {
      ...input,
      company,
      instrument_id: instrumentId,
      ...(asset ? { asset } : {}),
      calibration_date: calibrationDate,
      next_due_date: nextDueDate,
      standard_reference: standardReference,
      result,
      performed_by: performedBy,
    };
  }

  status(context: ControllerContext<CalibrationRecordData>, data: CalibrationRecordData): string {
    const ds = nextDocStatus(context.command.action);
    if (ds === 0) return "Draft";
    if (ds === 2) return "Cancelled";
    return data.result === "Pass" ? "Calibrated" : "Failed";
  }
}

export function evaluateQualityPlan(
  plan: QualityPlanData,
  readings: QualityPlanEvaluationReading[],
): QualityPlanEvaluation {
  if (!Array.isArray(plan.parameters) || plan.parameters.length === 0) throw errors.validation("Quality Plan has no parameters");
  const bySpec = new Map(readings.map((reading) => [normalizeKey(reading.specification), reading]));
  const rows = plan.parameters.map((parameter): QualityPlanEvaluationRow => {
    const reading = bySpec.get(normalizeKey(parameter.specification));
    const mandatory = parameter.mandatory !== false && parameter.mandatory !== 0;
    if (!reading) return {
      specification: parameter.specification,
      parameter_type: parameter.parameter_type,
      passed: !mandatory,
      reason: mandatory ? "MISSING_REQUIRED_READING" : "OPTIONAL_NOT_RECORDED",
    };
    if (parameter.parameter_type === "Numeric") {
      if (reading.value === undefined) return { specification: parameter.specification, parameter_type: parameter.parameter_type, passed: false, reason: "NUMERIC_VALUE_REQUIRED" };
      const value = toScaledInt(reading.value, 6, parameter.specification);
      const minimum = parameter.minimum === undefined ? undefined : toScaledInt(parameter.minimum, 6, `${parameter.specification}.minimum`);
      const maximum = parameter.maximum === undefined ? undefined : toScaledInt(parameter.maximum, 6, `${parameter.specification}.maximum`);
      const passed = (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum);
      return { specification: parameter.specification, parameter_type: parameter.parameter_type, passed, reason: passed ? "WITHIN_LIMITS" : "OUT_OF_LIMITS" };
    }
    if (parameter.parameter_type === "Pass/Fail") {
      const passed = reading.accepted === true || reading.accepted === 1;
      return { specification: parameter.specification, parameter_type: parameter.parameter_type, passed, reason: passed ? "ACCEPTED" : "REJECTED" };
    }
    const expected = normalizeKey(parameter.accepted_value ?? "");
    const actual = normalizeKey(reading.text_value ?? "");
    const passed = expected ? actual === expected : Boolean(actual);
    return { specification: parameter.specification, parameter_type: parameter.parameter_type, passed, reason: passed ? "TEXT_ACCEPTED" : "TEXT_REJECTED" };
  });
  const failed = rows.filter((row) => !row.passed).length;
  return { plan_name: plan.plan_name, passed: failed === 0, total: rows.length, failed, rows };
}

function normalizeParameter(row: QualityPlanParameter, index: number, seen: Set<string>): QualityPlanParameter {
  const specification = requiredText(row.specification, `parameters[${index}].specification`);
  const key = normalizeKey(specification);
  if (seen.has(key)) throw errors.validation(`Duplicate Quality Plan specification: ${specification}`);
  seen.add(key);
  const parameterType = requiredChoice(row.parameter_type, PARAMETER_TYPES, `parameters[${index}].parameter_type`) as QualityPlanParameter["parameter_type"];
  const minimum = row.minimum === undefined ? undefined : decimalString(row.minimum, `parameters[${index}].minimum`);
  const maximum = row.maximum === undefined ? undefined : decimalString(row.maximum, `parameters[${index}].maximum`);
  if (minimum !== undefined && maximum !== undefined && toScaledInt(minimum, 6) > toScaledInt(maximum, 6)) {
    throw errors.validation(`Minimum exceeds maximum at Quality Plan parameter ${index + 1}`);
  }
  const acceptedValue = optionalText(row.accepted_value);
  if (parameterType === "Numeric" && minimum === undefined && maximum === undefined) {
    throw errors.validation(`Numeric Quality Plan parameter ${index + 1} requires minimum or maximum`);
  }
  if (parameterType === "Text" && !acceptedValue) {
    throw errors.validation(`Text Quality Plan parameter ${index + 1} requires accepted_value`);
  }
  return {
    ...row,
    row_id: row.row_id || `ROW-${index + 1}`,
    specification,
    parameter_type: parameterType,
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(acceptedValue ? { accepted_value: acceptedValue } : {}),
    mandatory: row.mandatory === undefined ? true : row.mandatory === true || row.mandatory === 1,
  };
}

async function assertNoQualityPlanOverlap(
  context: ControllerContext<QualityPlanData>,
  candidate: Pick<QualityPlanData, "company" | "inspection_type" | "item_code" | "effective_from" | "effective_to">,
): Promise<void> {
  const documents = await context.reader.listDocumentsByDoctype<QualityPlanData>(context.command.tenant_id, "Quality Plan");
  for (const document of documents) {
    if (document.name === context.command.aggregate.name || document.docstatus !== 1) continue;
    const data = document.data;
    if (data.is_active === false || data.is_active === 0) continue;
    if (data.company !== candidate.company || data.inspection_type !== candidate.inspection_type || optionalText(data.item_code) !== optionalText(candidate.item_code)) continue;
    if (intervalsOverlap(data.effective_from, data.effective_to, candidate.effective_from, candidate.effective_to)) {
      throw errors.reference("Quality Plan overlaps an Active plan for the same company/inspection/item scope", { conflicting_plan: document.name });
    }
  }
}

async function assertNoSubmittedDependents<T extends JsonObject>(
  context: ControllerContext<T>,
  doctype: string,
  field: string,
  name: string,
  message: string,
): Promise<void> {
  const documents = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, doctype);
  if (documents.some((document) => document.docstatus === 1 && document.data[field] === name)) throw errors.lifecycle(message);
}

async function requireSubmittedDocument<T extends JsonObject>(context: ControllerContext<JsonObject> | ControllerContext<any>, doctype: string, name: string) {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`${doctype} ${name} must be submitted`);
  return document;
}

async function requireMaster<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) throw errors.reference(`${doctype} ${name} does not exist or is disabled`);
}

function requiredChoice(value: unknown, choices: Set<string>, field: string): string {
  const normalized = requiredText(value, field);
  if (!choices.has(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw errors.validation(`${field} must be a positive integer`);
  return parsed;
}

function positiveDecimalMicros(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const micros = toScaledInt(value, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function positiveDecimalString(value: unknown, field: string): string {
  return fromScaledInt(positiveDecimalMicros(value, field), 6);
}

function decimalString(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be decimal`);
  return fromScaledInt(toScaledInt(value, 6, field), 6);
}

function validDate(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) throw errors.validation(`${field} must be a valid calendar date`);
  return normalized;
}

function validDateTime(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf())) throw errors.validation(`${field} must be a valid date-time`);
  return parsed.toISOString();
}

function intervalsOverlap(aFrom: string, aTo: string | undefined, bFrom: string, bTo: string | undefined): boolean {
  return (!aTo || bFrom <= aTo) && (!bTo || aFrom <= bTo);
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("vi").replace(/\s+/g, " ");
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
