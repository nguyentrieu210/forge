import { errors, sha256Hex } from "../../core/src/index.js";
import type { Actor, JsonObject } from "../../contracts/src/index.js";
import type { FrappeArgs } from "./args.js";
import { buildCommand } from "./command.js";
import type { FrappeRouterContext } from "./router.js";

// Method riêng của vertical AlumDoor (chấm công, bảng lương, QR trạm).
//
// Chúng từng nằm thẳng trong switch của router dùng chung, khiến lõi nền tảng phải biết
// tên một khách hàng cụ thể. Ở đây chúng là một bảng đăng ký; router chỉ tra bảng.
// Cửa vào vẫn y nguyên: mọi handler đòi callback đã xác minh của đúng app "alumdoor".

/**
 * Cửa mà tenant Worker cắm vào cho vertical AlumDoor.
 *
 * Bốn hook này từng nằm ngay trong `FrappeRouterContext`, nên kiểu context của nền tảng
 * mang theo chữ "Alumdoor" bốn lần. Khai ở đây rồi cho context lõi kế thừa: nơi cắm và nơi
 * dùng nằm cạnh nhau, còn lõi không phải biết vertical nào tồn tại.
 */
export interface AlumdoorRouterHooks {
  /** Giao dịch quẹt chấm công gốc, chỉ AlumDoor dùng. */
  commitAlumdoorAttendanceScan?: (input: {
    station: string;
    stationTokenHash: string;
    requestId: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    deviceId?: string;
    credentialHash?: string;
    employeeCode?: string;
    newCredentialHash?: string;
    deviceLabel?: string;
  }) => Promise<JsonObject>;
  submitAlumdoorAttendanceCorrection?: (input: {
    workDate: string; segmentCode: string; requestedIn?: string; requestedOut?: string;
    reason: string; attachment?: string;
  }) => Promise<JsonObject>;
  reviewAlumdoorAttendanceCorrection?: (input: {
    request: string; action: "approve" | "reject"; note?: string;
  }) => Promise<JsonObject>;
  approveAlumdoorPayroll?: (input: { payrollEntry: string }) => Promise<JsonObject>;
  commitAlumdoorEmployeeLite?: (input: {
    employeeName: string; employeeFullName: string; mobile: string;
    dateOfJoining: string; idempotencyKey: string;
  }) => Promise<JsonObject>;
  commitAlumdoorPayProfileLite?: (input: {
    profileName: string; employee: string; payMode: string; baseSalaryVnd: number;
    fixedAllowanceVnd: number; effectiveFrom: string; idempotencyKey: string;
  }) => Promise<JsonObject>;
  commitAlumdoorHrLiteSettings?: (input: {
    company: string; workplace: string; currency: string;
    morningStart: string; morningEnd: string; afternoonStart: string; afternoonEnd: string;
    overtimeStart: string; payDayOfMonth: number; idempotencyKey: string;
  }) => Promise<JsonObject>;
  commitAlumdoorAttendanceStationLite?: (input: {
    stationCode: string; stationName: string; latitude: number; longitude: number;
    allowedRadiusM: number; idempotencyKey: string;
  }) => Promise<JsonObject>;
}

const HR_LITE_ALLOWED_ROLES = new Set([
  "Administrator", "System Manager", "HR Manager",
  "AlumDoor Payroll Approver", "AlumDoor Attendance Manager",
]);
const HR_LITE_SETTINGS = "AlumDoor HR Lite Settings";
const FIXED_OVERTIME_RATE = 50_000;

function assertVerifiedAlumdoorCallback(context: FrappeRouterContext, purpose: string): void {
  if (context.appCallbackAppId !== "alumdoor") {
    throw errors.permission(`${purpose} accepts only the verified AlumDoor app callback.`);
  }
}

function assertHrLiteManager(context: FrappeRouterContext): void {
  if (context.actor.user_id !== "Administrator" && !context.actor.roles.some((role) => HR_LITE_ALLOWED_ROLES.has(role))) {
    throw errors.permission("AlumDoor HR Lite manager permission is required.");
  }
}

async function generatedName(prefix: string, idempotencyKey: string): Promise<string> {
  return `${prefix}-${(await sha256Hex(idempotencyKey)).slice(0, 10).toUpperCase()}`;
}

function finiteArg(args: FrappeArgs, name: string): number {
  const value = Number(args.get(name));
  if (!Number.isFinite(value)) throw errors.validation(`${name} must be a finite number`);
  return value;
}

function labelOf(data: JsonObject, fallback: string, fields: readonly string[]): string {
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function textOf(data: JsonObject | null, field: string): string {
  const value = data?.[field];
  return typeof value === "string" ? value.trim() : "";
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

async function commitAlumdoorAttendanceScan(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (context.appCallbackAppId !== "alumdoor" || !context.commitAlumdoorAttendanceScan) {
    throw errors.permission("AlumDoor attendance scan accepts only the verified AlumDoor app callback.");
  }
  const station = args.requireText("station", 160);
  const stationTokenHash = args.requireText("station_token_hash", 64);
  const credentialHash = args.text("credential_hash");
  const newCredentialHash = args.text("new_credential_hash");
  for (const [label, value] of [["station_token_hash", stationTokenHash], ["credential_hash", credentialHash], ["new_credential_hash", newCredentialHash]] as const) {
    if (value && !/^[a-f0-9]{64}$/i.test(value)) throw errors.validation(`${label} must be a SHA-256 hex value`);
  }
  const deviceId = args.text("device_id");
  const employeeCode = args.text("employee_code");
  const deviceLabel = args.text("device_label");
  const latitude = Number(args.get("latitude"));
  const longitude = Number(args.get("longitude"));
  const accuracy = Number(args.get("accuracy"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    throw errors.validation("latitude, longitude and accuracy must be finite numbers");
  }
  return context.commitAlumdoorAttendanceScan({
    station,
    stationTokenHash: stationTokenHash.toLowerCase(),
    requestId: args.requireText("request_id", 128),
    latitude,
    longitude,
    accuracy,
    ...(deviceId ? { deviceId } : {}),
    ...(credentialHash ? { credentialHash: credentialHash.toLowerCase() } : {}),
    ...(employeeCode ? { employeeCode } : {}),
    ...(newCredentialHash ? { newCredentialHash: newCredentialHash.toLowerCase() } : {}),
    ...(deviceLabel ? { deviceLabel } : {}),
  });
}

async function submitAlumdoorAttendanceCorrection(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (context.appCallbackAppId !== "alumdoor" || !context.submitAlumdoorAttendanceCorrection) {
    throw errors.permission("AlumDoor attendance correction accepts only the verified AlumDoor app callback.");
  }
  const requestedIn = args.text("requested_in");
  const requestedOut = args.text("requested_out");
  const attachment = args.text("attachment");
  return context.submitAlumdoorAttendanceCorrection({
    workDate: args.requireText("work_date", 10),
    segmentCode: args.requireText("segment_code", 16),
    ...(requestedIn ? { requestedIn } : {}),
    ...(requestedOut ? { requestedOut } : {}),
    reason: args.requireText("reason", 1000),
    ...(attachment ? { attachment } : {}),
  });
}

async function reviewAlumdoorAttendanceCorrection(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (context.appCallbackAppId !== "alumdoor" || !context.reviewAlumdoorAttendanceCorrection) {
    throw errors.permission("AlumDoor attendance correction review accepts only the verified AlumDoor app callback.");
  }
  const action = args.requireText("action", 16);
  if (action !== "approve" && action !== "reject") throw errors.validation("action must be approve or reject");
  const note = args.text("note");
  return context.reviewAlumdoorAttendanceCorrection({
    request: args.requireText("request", 320),
    action,
    ...(note ? { note } : {}),
  });
}

async function approveAlumdoorPayroll(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (context.appCallbackAppId !== "alumdoor" || !context.approveAlumdoorPayroll) {
    throw errors.permission("AlumDoor payroll approval accepts only the verified AlumDoor app callback.");
  }
  return context.approveAlumdoorPayroll({ payrollEntry: args.requireText("payroll_entry", 320) });
}

async function commitAlumdoorEmployeeLite(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  assertVerifiedAlumdoorCallback(context, "AlumDoor Employee Lite");
  assertHrLiteManager(context);
  if (!context.commitAlumdoorEmployeeLite) throw errors.misconfigured("AlumDoor Employee Lite coordinator is not configured.");
  const idempotencyKey = args.requireText("idempotency_key", 128);
  return context.commitAlumdoorEmployeeLite({
    employeeName: await generatedName("NV", idempotencyKey),
    employeeFullName: args.requireText("employee_name", 160),
    mobile: args.requireText("mobile", 32),
    dateOfJoining: args.requireText("date_of_joining", 10),
    idempotencyKey,
  });
}

async function commitAlumdoorPayProfileLite(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  assertVerifiedAlumdoorCallback(context, "AlumDoor Pay Profile Lite");
  assertHrLiteManager(context);
  if (!context.commitAlumdoorPayProfileLite) throw errors.misconfigured("AlumDoor Pay Profile Lite coordinator is not configured.");
  const idempotencyKey = args.requireText("idempotency_key", 128);
  return context.commitAlumdoorPayProfileLite({
    profileName: await generatedName("ALU-LUONG", idempotencyKey),
    employee: args.requireText("employee", 320),
    payMode: args.requireText("pay_mode", 16),
    baseSalaryVnd: finiteArg(args, "base_salary_vnd"),
    fixedAllowanceVnd: finiteArg(args, "fixed_allowance_vnd"),
    effectiveFrom: args.requireText("effective_from", 10),
    idempotencyKey,
  });
}

async function commitAlumdoorHrLiteSettings(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  assertVerifiedAlumdoorCallback(context, "AlumDoor HR Lite settings");
  assertHrLiteManager(context);
  if (!context.commitAlumdoorHrLiteSettings) throw errors.misconfigured("AlumDoor HR Lite settings coordinator is not configured.");
  return context.commitAlumdoorHrLiteSettings({
    company: args.requireText("company", 320),
    workplace: args.requireText("workplace", 320),
    currency: args.requireText("currency", 32),
    morningStart: args.requireText("morning_start", 5),
    morningEnd: args.requireText("morning_end", 5),
    afternoonStart: args.requireText("afternoon_start", 5),
    afternoonEnd: args.requireText("afternoon_end", 5),
    overtimeStart: args.requireText("overtime_start", 5),
    payDayOfMonth: args.int("pay_day_of_month", 0),
    idempotencyKey: args.requireText("idempotency_key", 128),
  });
}

async function commitAlumdoorAttendanceStationLite(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  assertVerifiedAlumdoorCallback(context, "AlumDoor attendance station Lite");
  assertHrLiteManager(context);
  if (!context.commitAlumdoorAttendanceStationLite) throw errors.misconfigured("AlumDoor attendance station Lite coordinator is not configured.");
  const idempotencyKey = args.requireText("idempotency_key", 128);
  return context.commitAlumdoorAttendanceStationLite({
    stationCode: await generatedName("ST", idempotencyKey),
    stationName: args.requireText("station_name", 120),
    latitude: finiteArg(args, "latitude"),
    longitude: finiteArg(args, "longitude"),
    allowedRadiusM: finiteArg(args, "allowed_radius_m"),
    idempotencyKey,
  });
}

async function getAlumdoorHrLiteOrganization(_args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  assertVerifiedAlumdoorCallback(context, "AlumDoor HR Lite organization");
  assertHrLiteManager(context);
  const [companyRows, workplaceRows, currencyRows, settings] = await Promise.all([
    context.documents.listMasterRecordData(context.tenantId, "Company"),
    context.documents.listMasterRecordData(context.tenantId, "Branch"),
    context.documents.listMasterRecordData(context.tenantId, "Currency"),
    context.documents.getMasterRecordData(context.tenantId, HR_LITE_SETTINGS, HR_LITE_SETTINGS),
  ]);
  const companies = companyRows.filter((row) => !truthy(row.data.disabled)).map((row) => ({
    value: row.name,
    label: labelOf(row.data, row.name, ["company_name", "title", "label"]),
    currency: textOf(row.data, "default_currency") || textOf(row.data, "currency") || "VND",
  }));
  const workplaces = workplaceRows.filter((row) => !truthy(row.data.disabled)).map((row) => ({
    value: row.name,
    label: labelOf(row.data, row.name, ["branch_name", "title", "label"]),
    company: textOf(row.data, "company"),
  }));
  const currencies = currencyRows.filter((row) => !truthy(row.data.disabled)).map((row) => ({
    value: row.name,
    label: labelOf(row.data, row.name, ["currency_name", "title", "label"]),
  }));
  if (!currencies.some((row) => row.value === "VND")) currencies.push({ value: "VND", label: "VND" });

  const configured = Boolean(settings
    && textOf(settings, "company")
    && textOf(settings, "workplace")
    && textOf(settings, "currency"));
  const soleCompany = companies.length === 1 ? companies[0] : undefined;
  const soleWorkplace = workplaces.length === 1 ? workplaces[0] : undefined;
  const company = textOf(settings, "company") || soleCompany?.value || "";
  const workplace = textOf(settings, "workplace") || soleWorkplace?.value || "";
  const currency = textOf(settings, "currency") || soleCompany?.currency || "VND";
  return {
    company,
    workplace,
    currency,
    ready: companies.length > 0 && workplaces.length > 0 && currencies.length > 0,
    configured,
    morning_start: textOf(settings, "morning_start") || "07:00",
    morning_end: textOf(settings, "morning_end") || "11:30",
    afternoon_start: textOf(settings, "afternoon_start") || "13:00",
    afternoon_end: textOf(settings, "afternoon_end") || "17:00",
    overtime_start: textOf(settings, "overtime_start") || "17:30",
    pay_day_of_month: Number(settings?.pay_day_of_month ?? 5),
    owner_only_mode: settings ? truthy(settings.owner_only_mode) : true,
    overtime_rate_vnd_per_hour: FIXED_OVERTIME_RATE,
    companies,
    workplaces,
    currencies,
  };
}

async function alumdoorAttendanceQrConfig(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (context.appCallbackAppId !== "alumdoor") {
    throw errors.permission("AlumDoor attendance QR configuration accepts only the verified AlumDoor app callback.");
  }
  const stationName = args.requireText("station", 160);
  const station = await context.documents.getMasterRecordData(context.tenantId, "AlumDoor QR Station", stationName);
  if (!station) throw errors.notFound(`AlumDoor QR Station ${stationName} was not found`);
  const policyName = typeof station.policy === "string" ? station.policy.trim() : "";
  if (!policyName) throw errors.reference(`AlumDoor QR Station ${stationName} has no attendance policy`);
  const policy = await context.documents.getMasterRecordData(context.tenantId, "AlumDoor Attendance Policy", policyName);
  if (!policy) throw errors.reference(`AlumDoor Attendance Policy ${policyName} was not found`);
  return {
    station: {
      station_code: typeof station.station_code === "string" && station.station_code.trim() ? station.station_code.trim() : stationName,
      station_name: typeof station.station_name === "string" ? station.station_name : "",
      policy: policyName,
      secret_version: station.secret_version ?? null,
      is_active: station.is_active ?? false,
      company: station.company ?? "",
      branch: station.branch ?? "",
      latitude: station.latitude ?? null,
      longitude: station.longitude ?? null,
      allowed_radius_m: station.allowed_radius_m ?? null,
      max_gps_accuracy_m: station.max_gps_accuracy_m ?? null,
    },
    policy: {
      policy_status: policy.policy_status ?? "",
      timezone: policy.timezone ?? "Asia/Ho_Chi_Minh",
      duplicate_scan_window_seconds: policy.duplicate_scan_window_seconds ?? 60,
      max_devices_per_employee: policy.max_devices_per_employee ?? 2,
      effective_from: policy.effective_from ?? null,
      effective_to: policy.effective_to ?? null,
    },
  };
}

async function rotateAlumdoorAttendanceStationQr(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  if (context.appCallbackAppId !== "alumdoor") throw errors.permission("Only the verified AlumDoor app can rotate station QR tokens.");
  const stationName = args.requireText("station", 160);
  const current = await context.documents.getDocument<JsonObject>(context.tenantId, "AlumDoor QR Station", stationName);
  if (!current || current.docstatus === 2) throw errors.notFound(`AlumDoor QR Station ${stationName} was not found`);
  const allowed = context.actor.user_id === "Administrator"
    || context.actor.roles.some((role) => ["Administrator", "System Manager", "HR Manager", "AlumDoor Attendance Manager"].includes(role));
  if (!allowed) throw errors.permission("Attendance station manager permission is required");
  const version = Number(current.data.secret_version ?? 1);
  if (!Number.isSafeInteger(version) || version < 1) throw errors.validation("Station QR version is invalid");
  const document: JsonObject = { ...current.data, secret_version: version + 1, qr_rotated_at: context.now() };
  const actor: Actor = { ...context.actor, roles: [...new Set([...context.actor.roles, "AlumDoor QR System"])] };
  await context.runCommand(await buildCommand({
    tenantId: context.tenantId,
    actor,
    doctype: "AlumDoor QR Station",
    name: stationName,
    action: "save",
    expectedVersion: current.version,
    document,
  }));
  return { station: stationName, secret_version: version + 1, rotated_at: document.qr_rotated_at };
}

export const ALUMDOOR_METHODS = {
  "metaforge.api.commit_alumdoor_attendance_scan": commitAlumdoorAttendanceScan,
  "metaforge.api.submit_alumdoor_attendance_correction": submitAlumdoorAttendanceCorrection,
  "metaforge.api.review_alumdoor_attendance_correction": reviewAlumdoorAttendanceCorrection,
  "metaforge.api.approve_alumdoor_payroll": approveAlumdoorPayroll,
  "metaforge.api.commit_alumdoor_employee_lite": commitAlumdoorEmployeeLite,
  "metaforge.api.commit_alumdoor_pay_profile_lite": commitAlumdoorPayProfileLite,
  "metaforge.api.commit_alumdoor_hr_lite_settings": commitAlumdoorHrLiteSettings,
  "metaforge.api.commit_alumdoor_attendance_station_lite": commitAlumdoorAttendanceStationLite,
  "metaforge.api.get_alumdoor_hr_lite_organization": getAlumdoorHrLiteOrganization,
  "metaforge.api.get_alumdoor_attendance_qr_config": alumdoorAttendanceQrConfig,
  "metaforge.api.rotate_alumdoor_attendance_station_qr": rotateAlumdoorAttendanceStationQr,
} as const;
