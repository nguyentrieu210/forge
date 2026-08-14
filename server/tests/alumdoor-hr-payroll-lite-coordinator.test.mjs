import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  commitAlumDoorAttendanceStationLite,
  commitAlumDoorEmployeeLite,
  commitAlumDoorHrLiteSettings,
  commitAlumDoorPayProfileLite,
} from "../dist/apps/tenant-worker/src/employee-lite-coordinator.js";
import { AlumDoorAwareEmployeeController } from "../dist/packages/clouderp-erpnext/src/hrm-employee-lite.js";
import { ControllerRegistry, DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { GenericMetadataController, InMemoryMetadataStore, MetadataPermissionService } from "../dist/packages/frappe-model/src/index.js";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const owner = { user_id: "owner@example.test", roles: ["AlumDoor Payroll Approver"] };

function storeFixture() {
  const employee = {
    name: "EMP-1", docstatus: 0, version: 1,
    data: { employee_name: "Nguyễn Văn A", company: "ALUMDOOR", branch: "XUONG", employee_status: "Đang làm việc" },
  };
  const currentProfile = {
    name: "PP-OLD", docstatus: 1, version: 2,
    data: {
      employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG", pay_mode: "MONTHLY",
      base_salary_vnd: 8_000_000, overtime_multiplier_bp: 10_000, fixed_allowance_vnd: 0,
      effective_from: "2026-01-01", status: "approved", alu_lite_idempotency_key: "old-key-000000",
    },
  };
  return {
    async getDocument(_tenant, doctype, name) {
      if (doctype === "Employee" && name === "EMP-1") return employee;
      if (doctype === "AlumDoor Pay Profile" && name === "PP-OLD") return currentProfile;
      return null;
    },
    async listDocumentsByDoctype(_tenant, doctype) {
      if (doctype === "Employee") return [employee];
      if (doctype === "AlumDoor Pay Profile") return [currentProfile];
      return [];
    },
    async listMasterRecordData(_tenant, type) {
      if (type === "Company") return [{ name: "ALUMDOOR", data: { disabled: 0 } }];
      if (type === "Branch") return [{ name: "XUONG", data: { company: "ALUMDOOR", disabled: 0 } }];
      if (type === "Currency") return [{ name: "VND", data: { disabled: 0 } }];
      return [];
    },
  };
}

test("Employee Lite creates through the kernel with three user fields and trusted defaults", async () => {
  let command;
  const result = await commitAlumDoorEmployeeLite({
    tenantId: "alu", actor: owner, employeeName: "EMP-2", employeeFullName: "  Trần   Thị B  ",
    mobile: "+84 912 345 678", dateOfJoining: "2026-08-15", idempotencyKey: "employee-key-0001",
  }, {
    store: storeFixture(),
    kernel: { async execute(value) { command = value; return {}; } },
    now: () => "2026-08-14T12:00:00.000Z",
  });
  assert.equal(result.name, "EMP-2");
  assert.equal(command.document.mobile, "0912345678");
  assert.equal(command.document.company, "ALUMDOOR");
  assert.equal(command.document.branch, "XUONG");
  assert.equal(command.document.department, undefined);
  assert.equal(command.document.alu_lite_managed, 1);
  assert.ok(command.actor.roles.includes("AlumDoor HR Lite System"));
});

test("HR Lite settings select one company and workplace without deleting other masters", async () => {
  let commands;
  const fixture = storeFixture();
  fixture.listMasterRecordData = async (_tenant, type) => type === "Company"
    ? [{ name: "ALUMDOOR", data: { disabled: 0 } }, { name: "OTHER", data: { disabled: 0 } }]
    : type === "Currency" ? [{ name: "VND", data: { disabled: 0 } }]
      : [{ name: "XUONG", data: { company: "ALUMDOOR", disabled: 0 } }, { name: "OTHER-BR", data: { company: "OTHER", disabled: 0 } }];
  const result = await commitAlumDoorHrLiteSettings({
    tenantId: "alu", actor: owner, company: "ALUMDOOR", workplace: "XUONG",
    currency: "VND", morningStart: "07:00", morningEnd: "11:30", afternoonStart: "13:00", afternoonEnd: "17:00", overtimeStart: "17:30",
    payDayOfMonth: 5, idempotencyKey: "settings-key-0001",
  }, {
    store: fixture,
    kernel: { async executeBundle(value) { commands = value.commands; return []; } },
    now: () => "2026-08-14T12:00:00.000Z",
  });
  assert.equal(result.ready, true);
  const command = commands.at(-1);
  assert.equal(command.aggregate.doctype, "AlumDoor HR Lite Settings");
  assert.equal(command.document.company, "ALUMDOOR");
  assert.equal(command.document.workplace, "XUONG");
  assert.equal(command.document.currency, "VND");
  assert.equal(command.document.overtime_rate_vnd_per_hour, 50_000);
  assert.equal(command.document.attendance_policy, "ATP-HR-LITE-ALUMDOOR");
  assert.deepEqual(commands.slice(0, 2).map((entry) => `${entry.aggregate.doctype}:${entry.action}`), ["AlumDoor Attendance Policy:create", "AlumDoor Attendance Policy:submit"]);
  assert.ok(command.actor.roles.includes("AlumDoor HR Lite System"));
});

test("HR Lite keeps a legacy sole workplace usable when it has no current Company mapping", async () => {
  let commands;
  const fixture = storeFixture();
  fixture.listMasterRecordData = async (_tenant, type) => type === "Company"
    ? [{ name: "ALUMDOOR", data: { disabled: 0 } }, { name: "Demo", data: { disabled: 0 } }]
    : type === "Currency" ? [{ name: "VND", data: { disabled: 0 } }]
      : [{ name: "HQ", data: { company: "Legacy Company", disabled: 0 } }];
  const result = await commitAlumDoorHrLiteSettings({
    tenantId: "alu", actor: owner, company: "ALUMDOOR", workplace: "HQ",
    currency: "VND", morningStart: "07:00", morningEnd: "11:30", afternoonStart: "13:00", afternoonEnd: "17:00", overtimeStart: "17:30",
    payDayOfMonth: 5, idempotencyKey: "settings-key-legacy-0001",
  }, {
    store: fixture,
    kernel: { async executeBundle(value) { commands = value.commands; return []; } },
  });
  const command = commands.at(-1);
  assert.equal(result.ready, true);
  assert.equal(command.document.company, "ALUMDOOR");
  assert.equal(command.document.workplace, "HQ");
});

test("Employee Lite uses saved organization when multiple companies exist", async () => {
  let command;
  const fixture = storeFixture();
  const originalGet = fixture.getDocument;
  fixture.getDocument = async (tenant, doctype, name) => doctype === "AlumDoor HR Lite Settings"
    ? { name, docstatus: 0, version: 1, data: { company: "ALUMDOOR", workplace: "XUONG" } }
    : originalGet(tenant, doctype, name);
  fixture.listMasterRecordData = async (_tenant, type) => type === "Company"
    ? [{ name: "ALUMDOOR", data: { disabled: 0 } }, { name: "OTHER", data: { disabled: 0 } }]
    : [{ name: "XUONG", data: { company: "ALUMDOOR", disabled: 0 } }, { name: "OTHER-BR", data: { company: "OTHER", disabled: 0 } }];
  await commitAlumDoorEmployeeLite({
    tenantId: "alu", actor: owner, employeeName: "EMP-2", employeeFullName: "Trần Thị B",
    mobile: "0912345678", dateOfJoining: "2026-08-15", idempotencyKey: "employee-key-0002",
  }, { store: fixture, kernel: { async execute(value) { command = value; return {}; } } });
  assert.equal(command.document.company, "ALUMDOOR");
  assert.equal(command.document.branch, "XUONG");
});

test("changing Lite salary atomically closes the old profile then creates and submits the new one", async () => {
  let commands;
  const result = await commitAlumDoorPayProfileLite({
    tenantId: "alu", actor: owner, profileName: "PP-NEW", employee: "EMP-1", payMode: "MONTHLY",
    baseSalaryVnd: 9_000_000, fixedAllowanceVnd: 500_000, effectiveFrom: "2026-09-01",
    idempotencyKey: "pay-profile-key-0001",
  }, {
    store: storeFixture(),
    kernel: { async executeBundle(bundle) { commands = bundle.commands; return bundle.commands.map(() => ({})); } },
    now: () => "2026-08-14T12:00:00.000Z",
  });
  assert.equal(result.name, "PP-NEW");
  assert.deepEqual(commands.map((command) => `${command.aggregate.name}:${command.action}`), ["PP-OLD:save", "PP-NEW:create", "PP-NEW:submit"]);
  assert.equal(commands[0].document.effective_to, "2026-08-31");
  assert.equal(commands[1].document.overtime_multiplier_bp, 10_000);
  assert.equal(commands[1].document.base_salary_vnd, 9_000_000);
  assert.equal(commands[1].document.alu_lite_idempotency_key, "pay-profile-key-0001");
  assert.ok(commands.every((command) => command.actor.roles.includes("AlumDoor Payroll System")));
});

test("Station Lite uses saved defaults and keeps technical fields server-managed", async () => {
  let command;
  const fixture = storeFixture();
  const originalGet = fixture.getDocument;
  fixture.getDocument = async (tenant, doctype, name) => {
    if (doctype === "AlumDoor HR Lite Settings") return { name, docstatus: 0, version: 1, data: { company: "ALUMDOOR", workplace: "XUONG", attendance_policy: "ATP-HR-LITE-ALUMDOOR" } };
    if (doctype === "AlumDoor Attendance Policy") return { name, docstatus: 1, version: 2, data: { company: "ALUMDOOR", policy_status: "approved" } };
    return originalGet(tenant, doctype, name);
  };
  const result = await commitAlumDoorAttendanceStationLite({
    tenantId: "alu", actor: { user_id: "attendance@example.test", roles: ["AlumDoor Attendance Manager"] }, stationCode: "ST-ABC123456789", stationName: "Cửa xưởng",
    latitude: 10.7626, longitude: 106.6601, allowedRadiusM: 50, idempotencyKey: "station-key-0001",
  }, { store: fixture, kernel: { async execute(value) { command = value; return {}; } } });
  assert.equal(result.name, "ST-ABC123456789");
  assert.equal(command.document.company, "ALUMDOOR");
  assert.equal(command.document.branch, "XUONG");
  assert.equal(command.document.policy, "ATP-HR-LITE-ALUMDOOR");
  assert.equal(command.document.max_gps_accuracy_m, 50);
  assert.equal(command.document.secret_version, 1);
  assert.ok(command.actor.roles.includes("AlumDoor QR System"));
});

test("a normal employee cannot use the owner HR Lite coordinator", async () => {
  await assert.rejects(() => commitAlumDoorPayProfileLite({
    tenantId: "alu", actor: { user_id: "worker@example.test", roles: ["Employee"] }, profileName: "PP-X",
    employee: "EMP-1", payMode: "DAILY", baseSalaryVnd: 400_000, fixedAllowanceVnd: 0,
    effectiveFrom: "2026-09-01", idempotencyKey: "pay-profile-key-0002",
  }, { store: storeFixture(), kernel: { async executeBundle() { return []; } } }), /quản lý lương/);
});

test("Employee may omit Department only on the trusted Lite command path", async () => {
  const controller = new AlumDoorAwareEmployeeController();
  const context = (roles, lite = true) => ({
    command: {
      action: "create", actor: { user_id: "owner@example.test", roles }, aggregate: { name: "EMP-2" },
      document: {
        employee_name: "Trần Thị B", mobile: "0912345678", date_of_joining: "2026-08-15",
        employee_number: "EMP-2", company: "ALUMDOOR", branch: "XUONG", ...(lite ? { alu_lite_managed: 1 } : {}),
      },
    },
  });
  const normalized = await controller.normalize(context(["AlumDoor HR Lite System"]));
  assert.equal(normalized.department, undefined);
  await assert.rejects(() => controller.normalize(context(["HR Manager"])), /chỉ được ghi qua/i);
  await assert.rejects(() => controller.normalize(context(["HR Manager"], false)), /Phòng ban/i);
});

test("real metadata atomically provisions approved work hours then creates a ready QR station", async () => {
  const tenantId = "hr-lite-real-metadata";
  const manifest = parseAppManifest(await readAppSource(path.resolve(import.meta.dirname, "..", "apps-src", "alumdoor-attendance")));
  const metadata = new InMemoryMetadataStore();
  for (const meta of manifest.doctypes) await metadata.putDocType(tenantId, meta, "Administrator", "2026-08-14T02:00:00.000Z");
  for (const workflow of manifest.workflows) await metadata.putWorkflow(tenantId, workflow, "Administrator", "2026-08-14T02:00:00.000Z");
  const store = new InMemoryMutationStore();
  store.seedMaster("Company", "ALUMDOOR", tenantId, { company_name: "AlumDoor", default_currency: "VND" });
  store.seedMaster("Branch", "XUONG", tenantId, { branch_name: "Xưởng", company: "ALUMDOOR" });
  store.seedMaster("Currency", "VND", tenantId, { enabled: 1 });
  const kernel = new DocumentKernel(new ControllerRegistry().setFallback(new GenericMetadataController(metadata)), store, new MetadataPermissionService(metadata), () => "2026-08-14T02:00:00.000Z");
  const configured = await commitAlumDoorHrLiteSettings({
    tenantId, actor: owner, company: "ALUMDOOR", workplace: "XUONG", currency: "VND",
    morningStart: "07:00", morningEnd: "11:30", afternoonStart: "13:00", afternoonEnd: "17:00", overtimeStart: "17:30",
    payDayOfMonth: 5, idempotencyKey: "settings-real-metadata-01",
  }, { store, kernel, now: () => "2026-08-14T02:00:00.000Z" });
  const policy = await store.getDocument(tenantId, "AlumDoor Attendance Policy", configured.attendance_policy);
  assert.equal(policy.docstatus, 1);
  assert.equal(policy.data.policy_status, "approved");
  assert.equal(policy.data.shift3_start_minute, 1050);
  const station = await commitAlumDoorAttendanceStationLite({
    tenantId, actor: { user_id: "attendance@example.test", roles: ["AlumDoor Attendance Manager"] },
    stationCode: "ST-REALMETADATA", stationName: "Cửa xưởng", latitude: 10.7769, longitude: 106.7009,
    allowedRadiusM: 50, idempotencyKey: "station-real-metadata-01",
  }, { store, kernel, now: () => "2026-08-14T02:00:00.000Z" });
  assert.equal(station.policy, policy.name);
  assert.equal(station.is_active, 1);
});
