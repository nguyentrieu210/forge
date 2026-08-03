import type { Actor, CanonicalDocument, JsonObject } from "../../../packages/contracts/src/index.js";
import {
  evaluateQualityPlan,
  type CalibrationRecordData,
  type CapaData,
  type NonConformanceReportData,
  type QualityPlanData,
  type QualityPlanEvaluationReading,
  type RootCauseAnalysisData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const EVALUATE_PATH = "/api/method/metaforge.quality.evaluate_plan";
const KPI_PATH = "/api/method/metaforge.quality.get_qms_kpis";
const MAX_BODY_BYTES = 128_000;
const DAY_MS = 86_400_000;

export interface QmsApiContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  now(): string;
  permissions: Pick<MetadataPermissionService, "assert" | "canReadDocument">;
  loadQualityPlan(name: string): Promise<CanonicalDocument<QualityPlanData> | null>;
  listNcr(): Promise<Array<CanonicalDocument<NonConformanceReportData>>>;
  listRca(): Promise<Array<CanonicalDocument<RootCauseAnalysisData>>>;
  listCapa(): Promise<Array<CanonicalDocument<CapaData>>>;
  listCalibration(): Promise<Array<CanonicalDocument<CalibrationRecordData>>>;
}

export function isQmsApiPath(pathname: string): boolean {
  return pathname === EVALUATE_PATH || pathname === KPI_PATH;
}

export function isQmsFrappePath(pathname: string): boolean {
  return isQmsApiPath(pathname);
}

export async function routeQmsApi(request: Request, url: URL, context: QmsApiContext): Promise<Response | null> {
  if (!isQmsApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "QMS methods require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }
  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const body = unwrapArgs(raw);
  rejectTenantSelector(body);

  if (url.pathname === EVALUATE_PATH) return evaluatePlan(body, context);
  return qmsKpis(body, context);
}

async function evaluatePlan(body: JsonObject, context: QmsApiContext): Promise<Response> {
  const name = requiredText(body.quality_plan, "quality_plan");
  const plan = await context.loadQualityPlan(name);
  if (!plan || !await context.permissions.canReadDocument(context.actor, context.tenantId, plan as unknown as CanonicalDocument<JsonObject>)) {
    throw errors.permission(`Quality Plan ${name} is not readable`);
  }
  if (plan.docstatus !== 1 || plan.data.is_active === false || plan.data.is_active === 0) {
    throw errors.lifecycle("Quality Plan must be submitted and active before evaluation");
  }
  const evaluationDate = validDate(body.evaluation_date ?? context.now().slice(0, 10), "evaluation_date");
  if (plan.data.effective_from > evaluationDate || (plan.data.effective_to && plan.data.effective_to < evaluationDate)) {
    throw errors.lifecycle(`Quality Plan ${name} is not effective on ${evaluationDate}`);
  }
  const readings = parseReadings(body.readings);
  return jsonResponse(
    { message: { schema_version: 1, evaluation_date: evaluationDate, ...evaluateQualityPlan(plan.data, readings) } },
    200,
    { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
  );
}

async function qmsKpis(body: JsonObject, context: QmsApiContext): Promise<Response> {
  const company = requiredText(body.company, "company");
  const asOf = validDate(body.as_of ?? context.now().slice(0, 10), "as_of");
  const fromDate = body.from_date ? validDate(body.from_date, "from_date") : undefined;
  if (fromDate && fromDate > asOf) throw errors.validation("from_date cannot be after as_of");

  for (const doctype of ["Non Conformance Report", "Root Cause Analysis", "CAPA", "Calibration Record"]) {
    await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "report" });
  }

  const [ncrDocs, rcaDocs, capaDocs, calibrationDocs] = await Promise.all([
    readable(context, await context.listNcr()),
    readable(context, await context.listRca()),
    readable(context, await context.listCapa()),
    readable(context, await context.listCalibration()),
  ]);

  const ncr = ncrDocs.filter((doc) => doc.docstatus === 1 && doc.data.company === company && inRange(doc.data.posting_at, fromDate, asOf));
  const rca = rcaDocs.filter((doc) => doc.docstatus === 1 && doc.data.company === company && inRange(doc.data.analyzed_at, fromDate, asOf));
  const capaAll = capaDocs.filter((doc) => doc.docstatus !== 2 && doc.data.company === company);
  const capaOpened = capaAll.filter((doc) => inRange(doc.data.opened_at, fromDate, asOf));
  const closedCapa = capaAll.filter((doc) => doc.docstatus === 1 && doc.data.verification_result === "Effective" && inRange(doc.data.verified_at, fromDate, asOf));
  const ineffectiveCapa = capaAll.filter((doc) => doc.data.verification_result === "Ineffective" && inRange(doc.data.verified_at, fromDate, asOf));
  const overdueCapa = capaAll.filter((doc) => doc.docstatus === 0 && doc.data.due_date < asOf);
  const calibration = calibrationDocs.filter((doc) => doc.docstatus === 1 && doc.data.company === company && inRange(doc.data.calibration_date, fromDate, asOf));
  const latestCalibration = latestCalibrationByInstrument(calibrationDocs.filter((doc) => doc.docstatus === 1 && doc.data.company === company));
  const calibrationDue = latestCalibration.filter((doc) => doc.data.next_due_date <= asOf);
  const calibrationDueSoon = latestCalibration.filter((doc) => {
    const delta = dateEpoch(doc.data.next_due_date) - dateEpoch(asOf);
    return delta > 0 && delta <= 30 * DAY_MS;
  });
  const verifiedTotal = closedCapa.length + ineffectiveCapa.length;
  const effectivenessPct = verifiedTotal === 0 ? null : round2(closedCapa.length * 100 / verifiedTotal);
  const averageCloseDays = closedCapa.length === 0 ? null : round2(closedCapa.reduce((sum, doc) => {
    return sum + Math.max(0, (dateTimeEpoch(doc.data.verified_at) - dateTimeEpoch(doc.data.opened_at)) / DAY_MS);
  }, 0) / closedCapa.length);

  return jsonResponse(
    {
      message: {
        schema_version: 1,
        scope: "ACTOR_VISIBLE",
        company,
        ...(fromDate ? { from_date: fromDate } : {}),
        as_of: asOf,
        submitted_ncr_count: ncr.length,
        ncr_by_severity: {
          Minor: ncr.filter((doc) => doc.data.severity === "Minor").length,
          Major: ncr.filter((doc) => doc.data.severity === "Major").length,
          Critical: ncr.filter((doc) => doc.data.severity === "Critical").length,
        },
        submitted_rca_count: rca.length,
        opened_capa_count: capaOpened.length,
        open_capa_count: capaAll.filter((doc) => doc.docstatus === 0).length,
        overdue_capa_count: overdueCapa.length,
        closed_capa_count: closedCapa.length,
        ineffective_verification_count: ineffectiveCapa.length,
        capa_effectiveness_pct: effectivenessPct,
        average_capa_close_days: averageCloseDays,
        calibration_count: calibration.length,
        calibration_fail_count: calibration.filter((doc) => doc.data.result === "Fail").length,
        calibration_due_count: calibrationDue.length,
        calibration_due_within_30_days_count: calibrationDueSoon.length,
      },
    },
    200,
    { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
  );
}

async function readable<T extends JsonObject>(context: QmsApiContext, documents: Array<CanonicalDocument<T>>): Promise<Array<CanonicalDocument<T>>> {
  const output: Array<CanonicalDocument<T>> = [];
  for (const document of documents) {
    if (await context.permissions.canReadDocument(context.actor, context.tenantId, document as unknown as CanonicalDocument<JsonObject>)) output.push(document);
  }
  return output;
}

function latestCalibrationByInstrument(documents: Array<CanonicalDocument<CalibrationRecordData>>): Array<CanonicalDocument<CalibrationRecordData>> {
  const latest = new Map<string, CanonicalDocument<CalibrationRecordData>>();
  for (const document of documents) {
    const key = document.data.instrument_id.trim();
    const current = latest.get(key);
    if (!current || document.data.calibration_date > current.data.calibration_date
      || (document.data.calibration_date === current.data.calibration_date && document.version > current.version)) {
      latest.set(key, document);
    }
  }
  return [...latest.values()];
}

function parseReadings(value: unknown): QualityPlanEvaluationReading[] {
  const parsed = typeof value === "string" ? parseJson(value, "readings") : value;
  if (!Array.isArray(parsed)) throw errors.validation("readings must be an array");
  return parsed.map((row, index) => {
    if (!isObject(row)) throw errors.validation(`readings[${index}] must be an object`);
    return {
      specification: requiredText(row.specification, `readings[${index}].specification`),
      ...(row.value === undefined ? {} : { value: decimalInput(row.value, `readings[${index}].value`) }),
      ...(row.text_value === undefined ? {} : { text_value: requiredText(row.text_value, `readings[${index}].text_value`) }),
      ...(row.accepted === undefined ? {} : { accepted: row.accepted === true || row.accepted === 1 }),
    };
  });
}

function inRange(value: unknown, fromDate: string | undefined, toDate: string): boolean {
  if (typeof value !== "string" || !value) return false;
  const date = value.slice(0, 10);
  return (!fromDate || date >= fromDate) && date <= toDate;
}

function dateEpoch(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function dateTimeEpoch(value: unknown): number {
  if (typeof value !== "string") return NaN;
  return Date.parse(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("QMS args must be an object");
  return parsed;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("QMS tenant scope is controlled by the authenticated server context");
  }
}

function decimalInput(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be a decimal value`);
  return value;
}

function validDate(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) throw errors.validation(`${field} must be a valid calendar date`);
  return normalized;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const normalized = String(value).trim();
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function parseJson(value: string, field: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw errors.validation(`${field} must contain valid JSON`); }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
