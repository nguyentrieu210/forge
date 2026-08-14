import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceChallenge,
  attendanceResolveStation,
  attendanceScan,
  attendanceStationLiteCreate,
  attendanceStationQr,
} from "../dist/apps-src/alumdoor-worker/src/attendance-routes.js";

const now = new Date("2026-08-10T01:00:05.000Z");
const env = { ALUMDOOR_ATTENDANCE_QR_SECRET: "attendance-route-secret-for-tests-only" };

function platformCall(observed) {
  return async (path, init = {}) => {
    if (path === "method/metaforge.api.get_alumdoor_attendance_qr_config") {
      assert.deepEqual(JSON.parse(String(init.body ?? "{}")), { station: "QR-XUONG-01" });
      return Response.json({ message: {
        station: {
          station_code: "QR-XUONG-01", station_name: "Cổng xưởng 01", company: "Demo", branch: "BR-A",
          policy: "ATP-2026-00001", secret_version: 1, is_active: 1,
          latitude: 10.7769, longitude: 106.7009, allowed_radius_m: 50, max_gps_accuracy_m: 50,
        },
        policy: {
          policy_status: "approved", timezone: "Asia/Ho_Chi_Minh",
          effective_from: "2026-01-01", effective_to: "2026-12-31",
          duplicate_scan_window_seconds: 60, max_devices_per_employee: 2,
        },
      } });
    }
    if (path === "method/metaforge.api.commit_alumdoor_attendance_scan") {
      const body = JSON.parse(String(init.body ?? "{}")); observed.push(body);
      if (!body.credential_hash && !body.employee_code) return Response.json({ message: { registration_required: true } });
      return Response.json({ message: {
        device_registered: Boolean(body.new_credential_hash),
        checkin: { name: "CHK-1", log_type: "IN" },
        employee: { name: "EMP-1", employee_name: "Nguyễn Văn A" },
        station: { name: "QR-XUONG-01", station_name: "Cổng xưởng 01" },
      } });
    }
    return Response.json({ message: "not found" }, { status: 404 });
  };
}

function identity(roles = []) {
  return Buffer.from(JSON.stringify({ actor: { user_id: roles.length ? "manager@test" : "Guest", roles } })).toString("base64url");
}

function request(method, tenant = "tenant-attendance-test", roles = []) {
  return new Request(`https://app.internal/api/method/${method}`, {
    method: "POST",
    headers: { "x-cloudforge-tenant": tenant, "x-cloudforge-identity": identity(roles) },
  });
}

async function printedToken(observed = []) {
  const response = await attendanceStationQr({
    request: request("alumdoor.attendance.station_qr", undefined, ["AlumDoor Attendance Manager"]),
    call: platformCall(observed), env, args: { station: "QR-XUONG-01" }, now,
  });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).token;
}

test("dynamic challenge is removed and static printable QR is stable", async () => {
  assert.equal((await attendanceChallenge()).status, 410);
  const first = await printedToken(); const second = await printedToken();
  assert.equal(first, second);
  assert.equal(first.includes(env.ALUMDOOR_ATTENDANCE_QR_SECRET), false);
});

test("manager creates a station with one simple payload through the trusted callback", async () => {
  const observed = [];
  const call = async (path, init = {}) => {
    observed.push({ path, body: JSON.parse(String(init.body ?? "{}")) });
    return Response.json({ message: { name: "ST-ABC123456789", station_code: "ST-ABC123456789", station_name: "Cửa xưởng" } });
  };
  const response = await attendanceStationLiteCreate({
    request: request("alumdoor.attendance.station_create_lite", undefined, ["AlumDoor Attendance Manager"]), call,
    args: { station_name: "Cửa xưởng", latitude: 10.7769, longitude: 106.7009, allowed_radius_m: 50, idempotency_key: "station-route-key-01" },
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(observed[0].path, "method/metaforge.api.commit_alumdoor_attendance_station_lite");
  assert.equal(observed[0].body.company, undefined);
  assert.equal(observed[0].body.policy, undefined);
});

test("public resolve reveals station policy limits but never station coordinates", async () => {
  const token = await printedToken();
  const response = await attendanceResolveStation({ request: request("alumdoor.attendance.resolve_station"), call: platformCall([]), env, args: { token }, now });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { station: "QR-XUONG-01", station_name: "Cổng xưởng 01", allowed_radius_m: 50, max_gps_accuracy_m: 50 });
  assert.equal(body.latitude, undefined); assert.equal(body.longitude, undefined);
});

test("scan delegates raw GPS and hashed credential without trusting client decisions", async () => {
  const observed = []; const token = await printedToken(observed);
  const first = await attendanceScan({
    request: request("alumdoor.attendance.scan"), call: platformCall(observed), env, now,
    args: { token, request_id: "12345678-1234-4234-9234-123456789012", location: { latitude: 10.77, longitude: 106.70, accuracy: 12 }, distance: 0, employee_id: "FORGED" },
  });
  assert.equal(first.status, 200); assert.equal((await first.json()).registration_required, true);
  assert.equal(observed[0].distance, undefined); assert.equal(observed[0].employee_id, undefined);

  const registered = await attendanceScan({
    request: request("alumdoor.attendance.scan"), call: platformCall(observed), env, now,
    args: { token, request_id: "12345678-1234-4234-9234-123456789012", location: { latitude: 10.77, longitude: 106.70, accuracy: 12 }, employee_code: "NV001" },
  });
  const result = await registered.json();
  assert.equal(result.device_registered, true);
  assert.match(result.device_registration.device_id, /^[A-Za-z0-9_-]{16,}$/);
  assert.ok(result.device_registration.credential);
  assert.match(observed[1].new_credential_hash, /^[a-f0-9]{64}$/);
  assert.equal(observed[1].employee_code, "NV001");
});

test("cross-tenant token never reaches the attendance transaction", async () => {
  const observed = []; const token = await printedToken(observed);
  const response = await attendanceScan({
    request: request("alumdoor.attendance.scan", "other-tenant"), call: platformCall(observed), env, now,
    args: { token, request_id: "12345678-1234-4234-9234-123456789012", location: { latitude: 10, longitude: 106, accuracy: 10 } },
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "QR_STATION_MISMATCH");
  assert.deepEqual(observed, []);
});
