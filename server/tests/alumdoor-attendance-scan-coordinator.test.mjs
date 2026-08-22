import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { commitAlumDoorAttendanceScan } from "../dist/apps/tenant-worker/src/attendance-scan-coordinator.js";

function setup() {
  let current = "2026-08-10T00:00:00.000Z"; // 07:00, Ca 1, Asia/Ho_Chi_Minh
  const store = new InMemoryMutationStore();
  store.seedMaster("Employee", "EMP-1", "demo", {
    user_id: "worker@example.test",
    employee_number: "NV001",
    employee_name: "Nguyễn Văn A",
    employee_status: "Äang lÃ m viá»‡c",
    company: "Demo",
    branch: "BR-A",
    department: "OPS",
  });
  store.seedMaster("AlumDoor Attendance Policy", "CA-1", "demo", {
    policy_status: "approved",
    company: "Demo",
    branch: "BR-A",
    timezone: "Asia/Ho_Chi_Minh",
    shift1_start_minute: 420,
    shift1_end_minute: 690,
    shift2_start_minute: 780,
    shift2_end_minute: 1020,
    shift3_start_minute: 1050,
    shift3_latest_out_minute: 1439,
    regular_daily_cap_minutes: 480,
    effective_from: "2026-01-01",
    duplicate_scan_window_seconds: 60,
    max_devices_per_employee: 2,
  });
  store.seedMaster("AlumDoor QR Station", "GATE-A", "demo", {
    station_code: "GATE-A",
    station_name: "Cá»•ng A",
    policy: "CA-1",
    branch: "BR-A",
    company: "Demo",
    latitude: 10.7769,
    longitude: 106.7009,
    allowed_radius_m: 50,
    max_gps_accuracy_m: 50,
    secret_version: 1,
    is_active: 1,
  });
  store.seedMaster("Shift Type", "DAY", "demo", {
    start_time: "07:00", end_time: "17:00", working_minutes: 480, disabled: 0,
  });
  store.seedDocument("Shift Assignment", "SHIFT-EMP-1", "demo", {
    employee: "EMP-1", company: "Demo", branch: "BR-A", shift_type: "DAY", start_date: "2026-01-01",
  }, 1);
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  const kernel = new DocumentKernel(registry, store, { assert() {} }, () => current);
  let registered = false;
  const credentialHash = "c".repeat(64);
  const scan = async (requestId, roles = ["Employee"], overrides = {}) => {
    const result = await commitAlumDoorAttendanceScan({
      tenantId: "demo",
      actor: { user_id: "Guest", roles },
      station: "GATE-A",
      stationTokenHash: "f".repeat(64),
      requestId,
      latitude: 10.7769,
      longitude: 106.7009,
      accuracy: 10,
      deviceId: "device_installation_0001",
      ...(registered ? { credentialHash } : { employeeCode: "NV001", newCredentialHash: credentialHash, deviceLabel: "Điện thoại test" }),
      ...overrides,
    }, { kernel, store, now: () => current });
    if (result.device_registered) registered = true;
    return result;
  };
  return {
    store,
    scan,
    setTime(value) { current = value; },
  };
}

const nonceA = "a".repeat(64);
const nonceB = "b".repeat(64);
const nonceC = "d".repeat(64);

test("QR scan creates immutable standard checkin and one three-segment day atomically", async () => {
  const { store, scan } = setup();
  const first = await scan(nonceA);
  assert.equal(first.replayed, false);
  assert.equal(first.checkin.log_type, "IN");
  assert.equal(first.day.segment_code, "SHIFT1");

  const checkin = await store.getDocument("demo", "Employee Checkin", first.checkin.name);
  const day = await store.getDocument("demo", "AlumDoor Attendance Day", first.day.name);
  assert.equal(checkin.docstatus, 1);
  assert.equal(checkin.data.source, "Device");
  assert.equal(checkin.data.alu_segment_code, "SHIFT1");
  assert.equal(checkin.data.alu_verification_method, "GPS");
  assert.equal(checkin.data.alu_attendance_device, "device_installation_0001");
  assert.equal(checkin.data.geofence_passed, 1);
  assert.equal(first.employee.employee_name, "Nguyễn Văn A");
  assert.equal(day.version, 1);
  assert.equal(day.data.segments[0].state, "open");
  assert.equal(day.data.segments.length, 3);
});

test("first QR scan succeeds for an administrator carrying all attendance system roles", async () => {
  const { store, scan } = setup();
  const result = await scan(nonceA, ["Administrator", "AlumDoor Attendance System", "AlumDoor Payroll System"]);
  assert.equal(result.replayed, false);
  const day = await store.getDocument("demo", "AlumDoor Attendance Day", result.day.name);
  assert.equal(day.version, 1);
  assert.equal(day.data.segments[0].state, "open");
});

test("same QR replay does not toggle the segment a second time", async () => {
  const { store, scan } = setup();
  const first = await scan(nonceA);
  const replay = await scan(nonceA);
  assert.equal(replay.replayed, true);
  assert.equal(replay.checkin.name, first.checkin.name);
  const day = await store.getDocument("demo", "AlumDoor Attendance Day", first.day.name);
  assert.equal(day.version, 1);
  assert.equal(day.data.segments[0].state, "open");
});

test("a new request outside the duplicate window closes only its own shift and recalculates the day", async () => {
  const { store, scan, setTime } = setup();
  const first = await scan(nonceA);
  setTime("2026-08-10T02:00:00.000Z"); // 09:00 local
  const second = await scan(nonceB);
  assert.equal(second.checkin.log_type, "OUT");
  const day = await store.getDocument("demo", "AlumDoor Attendance Day", first.day.name);
  assert.equal(day.version, 2);
  assert.equal(day.data.segments[0].state, "complete");
  assert.equal(day.data.regular_minutes, 120);
  assert.equal(day.data.overtime_minutes, 0);
});

test("a completed segment refuses another scan without leaving a stray checkin", async () => {
  const { store, scan, setTime } = setup();
  const first = await scan(nonceA);
  setTime("2026-08-10T02:00:00.000Z");
  await scan(nonceB);
  setTime("2026-08-10T02:01:01.000Z");
  await assert.rejects(scan(nonceC), (error) => {
    assert.equal(error.code, "INVALID_LIFECYCLE_TRANSITION");
    return true;
  });
  const checkins = await store.listDocumentsByDoctype("demo", "Employee Checkin");
  assert.equal(checkins.length, 2);
  const day = await store.getDocument("demo", "AlumDoor Attendance Day", first.day.name);
  assert.equal(day.version, 2);
});

test("GPS accuracy and geofence are enforced before device registration", async () => {
  const { scan } = setup();
  await assert.rejects(scan(nonceA, ["Employee"], { accuracy: 800 }), (error) => {
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.match(error.message, /chưa đủ chính xác/i);
    return true;
  });
  await assert.rejects(scan(nonceB, ["Employee"], { latitude: 10.7869 }), (error) => {
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.match(error.message, /ngoài khu vực/i);
    return true;
  });
});

test("unknown device receives registration-required only after valid GPS", async () => {
  const { store } = setup();
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  const kernel = new DocumentKernel(registry, store, { assert() {} }, () => "2026-08-10T00:00:00.000Z");
  const result = await commitAlumDoorAttendanceScan({
    tenantId: "demo", actor: { user_id: "Guest", roles: [] }, station: "GATE-A",
    stationTokenHash: "f".repeat(64), requestId: nonceA,
    latitude: 10.7769, longitude: 106.7009, accuracy: 10,
  }, { kernel, store, now: () => "2026-08-10T00:00:00.000Z" });
  assert.equal(result.registration_required, true);
  assert.equal((await store.listDocumentsByDoctype("demo", "Employee Checkin")).length, 0);
});
