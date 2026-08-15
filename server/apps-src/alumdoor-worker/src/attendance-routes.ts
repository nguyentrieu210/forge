/** AlumDoor static-station QR, GPS and registered-device app methods. */
import {
  AttendanceQrError,
  inspectStaticAttendanceStationToken,
  issueStaticAttendanceStationToken,
  randomCredential,
  sha256Hex,
  verifyStaticAttendanceStationToken,
} from "./attendance-qr.js";

export type AttendancePlatformCall = (path: string, init?: RequestInit) => Promise<Response>;
export interface AttendanceRouteEnv { ALUMDOOR_ATTENDANCE_QR_SECRET?: string; }
type Json = Record<string, unknown>;

interface StationDocument extends Json {
  station_code?: unknown; station_name?: unknown; company?: unknown; branch?: unknown; policy?: unknown;
  secret_version?: unknown; is_active?: unknown; latitude?: unknown; longitude?: unknown;
  allowed_radius_m?: unknown; max_gps_accuracy_m?: unknown;
}
interface PolicyDocument extends Json {
  policy_status?: unknown; timezone?: unknown; effective_from?: unknown; effective_to?: unknown;
  duplicate_scan_window_seconds?: unknown; max_devices_per_employee?: unknown;
}

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const fail = (code: string, message: string, status = 422): Response => json({ code, message }, status);

class AttendanceRouteError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) { super(message); this.name = "AttendanceRouteError"; }
}

function text(value: unknown, label: string, max = 320): string {
  if (typeof value !== "string") throw new AttendanceRouteError("VALIDATION_ERROR", `${label} là bắt buộc.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f]/u.test(normalized)) {
    throw new AttendanceRouteError("VALIDATION_ERROR", `${label} không hợp lệ.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, max = 320): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, label, max);
}

function number(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new AttendanceRouteError("INVALID_LOCATION", `${label} không hợp lệ.`);
  }
  return parsed;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new AttendanceRouteError("VALIDATION_ERROR", "Cấu hình chính sách không hợp lệ.");
  return parsed;
}

function truthy(value: unknown): boolean { return value === true || value === 1 || value === "1" || String(value ?? "").toLowerCase() === "true"; }

function activeSecret(env: AttendanceRouteEnv): string {
  const value = env.ALUMDOOR_ATTENDANCE_QR_SECRET?.trim();
  if (!value) throw new AttendanceRouteError("ATTENDANCE_QR_MISCONFIGURED", "Chưa cấu hình khóa QR chấm công.", 503);
  return value;
}

function trustedTenant(request: Request): string {
  const tenant = request.headers.get("x-cloudforge-tenant")?.trim() ?? "";
  if (!tenant || tenant.length > 160 || /[\u0000-\u001f]/u.test(tenant)) throw new AttendanceRouteError("AUTH_REQUIRED", "Không nhận được tenant tin cậy.", 403);
  return tenant;
}

function actorRoles(request: Request): string[] {
  const encoded = request.headers.get("x-cloudforge-identity") ?? "";
  try {
    const raw = atob(encoded.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    const identity = JSON.parse(raw) as { actor?: { roles?: unknown } };
    return Array.isArray(identity.actor?.roles) ? identity.actor.roles.filter((role): role is string => typeof role === "string") : [];
  } catch { return []; }
}

function requireManager(request: Request): void {
  const allowed = new Set(["Administrator", "System Manager", "HR Manager", "AlumDoor Attendance Manager"]);
  if (!actorRoles(request).some((role) => allowed.has(role))) throw new AttendanceRouteError("PERMISSION_DENIED", "Bạn không có quyền quản lý mã QR trạm.", 403);
}

function isoDateFor(timezone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { throw new AttendanceRouteError("VALIDATION_ERROR", "Múi giờ chính sách không hợp lệ."); }
}

function date(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result)) throw new AttendanceRouteError("VALIDATION_ERROR", "Ngày hiệu lực không hợp lệ.");
  return result;
}

function object(value: unknown, label: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AttendanceRouteError("UPSTREAM_INVALID", `${label} trả dữ liệu không hợp lệ.`, 502);
  return value as Json;
}

async function loadStation(input: { call: AttendancePlatformCall; station: string; now: Date }) {
  const response = await input.call("method/metaforge.api.get_alumdoor_attendance_qr_config", { method: "POST", body: JSON.stringify({ station: input.station }) });
  if (!response.ok) throw new AttendanceRouteError("STATION_NOT_FOUND", "Không tìm thấy trạm chấm công.", response.status === 404 ? 404 : 422);
  const payload = await response.json() as { message?: unknown; data?: unknown };
  const config = object(payload.message ?? payload.data ?? payload, "Cấu hình trạm");
  const station = object(config.station, "Trạm") as StationDocument;
  const policy = object(config.policy, "Chính sách") as PolicyDocument;
  const stationCode = text(station.station_code ?? input.station, "Trạm", 160);
  if (stationCode !== input.station || !truthy(station.is_active)) throw new AttendanceRouteError("STATION_INACTIVE", "Trạm chấm công đang ngừng hoạt động.", 410);
  if (String(policy.policy_status ?? "").trim().toLowerCase() !== "approved") throw new AttendanceRouteError("POLICY_INACTIVE", "Chính sách ca chưa được duyệt hoặc đã ngừng dùng.");
  const timezone = text(policy.timezone ?? "Asia/Ho_Chi_Minh", "Múi giờ", 100);
  const today = isoDateFor(timezone, input.now);
  const from = date(policy.effective_from);
  const to = date(policy.effective_to);
  if (!from || from > today || (to && to < today)) throw new AttendanceRouteError("POLICY_INACTIVE", "Chính sách ca chưa có hiệu lực.");
  return {
    station, policy, stationCode,
    stationName: typeof station.station_name === "string" && station.station_name.trim() ? station.station_name.trim() : stationCode,
    tokenVersion: text(String(station.secret_version ?? "1"), "Phiên bản QR", 64),
    allowedRadiusM: number(station.allowed_radius_m, "Bán kính trạm", 1, 100_000),
    maxGpsAccuracyM: number(station.max_gps_accuracy_m, "Sai số GPS tối đa", 1, 10_000),
  };
}

async function verifiedStation(input: { request: Request; call: AttendancePlatformCall; env: AttendanceRouteEnv; token: string; now: Date }) {
  const tenant = trustedTenant(input.request);
  const peek = inspectStaticAttendanceStationToken(input.token);
  if (peek.tenant !== tenant) throw new AttendanceRouteError("QR_STATION_MISMATCH", "Mã QR không thuộc doanh nghiệp này.");
  const loaded = await loadStation({ call: input.call, station: peek.station, now: input.now });
  const verified = await verifyStaticAttendanceStationToken({
    token: input.token, tenant, station: loaded.stationCode, tokenVersion: loaded.tokenVersion, secret: activeSecret(input.env),
  });
  return { tenant, ...loaded, tokenHash: verified.tokenHash };
}

function location(args: Json): { latitude: number; longitude: number; accuracy: number } {
  const raw = object(args.location, "Vị trí");
  return {
    latitude: number(raw.latitude, "Vĩ độ", -90, 90),
    longitude: number(raw.longitude, "Kinh độ", -180, 180),
    accuracy: number(raw.accuracy, "Sai số GPS", 0.01, 100_000),
  };
}

function attendanceError(error: unknown): Response {
  if (error instanceof AttendanceQrError) return fail(error.code, error.message, error.code === "QR_REVOKED" ? 410 : 422);
  if (error instanceof AttendanceRouteError) return fail(error.code, error.message, error.status);
  return fail("ATTENDANCE_ERROR", error instanceof Error ? error.message : "Không thể chấm công.");
}

/** Deprecated deliberately: static station QR has no challenge/countdown endpoint. */
export async function attendanceChallenge(): Promise<Response> {
  return fail("DYNAMIC_QR_REMOVED", "QR động đã ngừng sử dụng. Hãy in mã QR cố định của trạm.", 410);
}

export async function attendanceStationQr(input: { request: Request; call: AttendancePlatformCall; env: AttendanceRouteEnv; args: Json; now?: Date }): Promise<Response> {
  try {
    requireManager(input.request);
    const tenant = trustedTenant(input.request);
    const stationCode = text(input.args.station, "Trạm", 160);
    const loaded = await loadStation({ call: input.call, station: stationCode, now: input.now ?? new Date() });
    const issued = await issueStaticAttendanceStationToken({ tenant, station: loaded.stationCode, tokenVersion: loaded.tokenVersion, secret: activeSecret(input.env) });
    return json({ station: loaded.stationCode, station_name: loaded.stationName, token: issued.token, token_version: loaded.tokenVersion });
  } catch (error) { return attendanceError(error); }
}

export async function attendanceRotateStationQr(input: { request: Request; call: AttendancePlatformCall; env: AttendanceRouteEnv; args: Json; now?: Date }): Promise<Response> {
  try {
    requireManager(input.request);
    const tenant = trustedTenant(input.request);
    const stationCode = text(input.args.station, "Trạm", 160);
    const rotated = await input.call("method/metaforge.api.rotate_alumdoor_attendance_station_qr", { method: "POST", body: JSON.stringify({ station: stationCode }) });
    if (!rotated.ok) return rotated;
    const loaded = await loadStation({ call: input.call, station: stationCode, now: input.now ?? new Date() });
    const issued = await issueStaticAttendanceStationToken({ tenant, station: loaded.stationCode, tokenVersion: loaded.tokenVersion, secret: activeSecret(input.env) });
    return json({ station: loaded.stationCode, station_name: loaded.stationName, token: issued.token, token_version: loaded.tokenVersion });
  } catch (error) { return attendanceError(error); }
}

export async function attendanceResolveStation(input: { request: Request; call: AttendancePlatformCall; env: AttendanceRouteEnv; args: Json; now?: Date }): Promise<Response> {
  try {
    const token = text(input.args.token, "Mã QR", 8_192);
    const station = await verifiedStation({ request: input.request, call: input.call, env: input.env, token, now: input.now ?? new Date() });
    return json({ station: station.stationCode, station_name: station.stationName, allowed_radius_m: station.allowedRadiusM, max_gps_accuracy_m: station.maxGpsAccuracyM });
  } catch (error) { return attendanceError(error); }
}

export async function attendanceScan(input: { request: Request; call: AttendancePlatformCall; env: AttendanceRouteEnv; args: Json; now?: Date }): Promise<Response> {
  try {
    const token = text(input.args.token, "Mã QR", 8_192);
    const station = await verifiedStation({ request: input.request, call: input.call, env: input.env, token, now: input.now ?? new Date() });
    const gps = location(input.args);
    const deviceId = optionalText(input.args.device_id, "Mã thiết bị", 128);
    const credential = optionalText(input.args.device_credential, "Credential thiết bị", 512);
    const employeeCode = optionalText(input.args.employee_code, "Mã nhân viên", 80);
    const requestId = text(input.args.request_id, "Mã yêu cầu", 128);
    if (!deviceId && credential) throw new AttendanceRouteError("DEVICE_CREDENTIAL_INVALID", "Thông tin thiết bị không hợp lệ.");

    let registrationCredential: string | undefined;
    let registrationDeviceId: string | undefined;
    if (employeeCode && !credential) {
      registrationCredential = randomCredential();
      registrationDeviceId = deviceId ?? randomCredential(18);
    }
    const response = await input.call("method/metaforge.api.commit_alumdoor_attendance_scan", {
      method: "POST",
      body: JSON.stringify({
        station: station.stationCode,
        station_token_hash: station.tokenHash,
        request_id: requestId,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: gps.accuracy,
        ...(deviceId && credential ? { device_id: deviceId, credential_hash: await sha256Hex(credential) } : {}),
        ...(employeeCode && registrationCredential && registrationDeviceId ? {
          employee_code: employeeCode,
          device_id: registrationDeviceId,
          new_credential_hash: await sha256Hex(registrationCredential),
          device_label: optionalText(input.args.device_label, "Tên thiết bị", 160) ?? "Điện thoại chấm công",
        } : {}),
      }),
    });
    if (!response.ok) return response;
    const payload = await response.json() as { message?: Json; data?: Json };
    const result = object(payload.message ?? payload.data ?? payload, "Kết quả chấm công");
    return json({
      ...result,
      ...(truthy(result.device_registered) && registrationCredential && registrationDeviceId
        ? { device_registration: { device_id: registrationDeviceId, credential: registrationCredential } }
        : {}),
    });
  } catch (error) { return attendanceError(error); }
}

export const attendancePolicyDefaults = {
  duplicateWindowSeconds(policy: PolicyDocument): number { return integer(policy.duplicate_scan_window_seconds, 60, 5, 900); },
  maxDevices(policy: PolicyDocument): number { return integer(policy.max_devices_per_employee, 2, 1, 20); },
};
