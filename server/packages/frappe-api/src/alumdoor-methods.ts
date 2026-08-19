import { errors } from "../../core/src/index.js";
import type { Actor, JsonObject } from "../../contracts/src/index.js";
import type { FrappeArgs } from "./args.js";
import { buildCommand } from "./command.js";
import type { FrappeRouterContext } from "./router.js";

// Method riêng của vertical AlumDoor (chấm công, bảng lương, QR trạm).
//
// Chúng từng nằm thẳng trong switch của router dùng chung, khiến lõi nền tảng phải biết
// tên một khách hàng cụ thể. Ở đây chúng là một bảng đăng ký; router chỉ tra bảng.
// Cửa vào vẫn y nguyên: mọi handler đòi callback đã xác minh của đúng app "alumdoor".

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
  "metaforge.api.get_alumdoor_attendance_qr_config": alumdoorAttendanceQrConfig,
  "metaforge.api.rotate_alumdoor_attendance_station_qr": rotateAlumdoorAttendanceStationQr,
} as const;
