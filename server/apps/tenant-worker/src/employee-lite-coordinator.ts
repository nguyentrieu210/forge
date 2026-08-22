import type { Actor, JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";
import { commandPayloadHash, errors } from "../../../packages/core/src/index.js";
import type { DocumentKernel, MutationStore } from "../../../packages/document-kernel/src/index.js";

const SETTINGS = "AlumDoor HR Lite Settings";
const POLICY = "AlumDoor Attendance Policy";
const PAY_PROFILE = "AlumDoor Pay Profile";
const POLICY_NAME = "ATP-HR-LITE-ALUMDOOR";
const LITE_ROLE = "AlumDoor HR Lite System";
const PAYROLL_ROLE = "AlumDoor Payroll System";
const FIXED_OVERTIME_RATE = 50_000;

type Services = { kernel: Pick<DocumentKernel, "execute" | "executeBundle">; store: MutationStore; now?: () => string };

export interface AlumDoorEmployeeLiteInput {
  tenantId: string; actor: Actor; employeeName: string; employeeFullName: string; mobile: string;
  dateOfJoining: string; idempotencyKey: string;
}
export interface AlumDoorHrLiteSettingsInput {
  tenantId: string; actor: Actor; company: string; workplace: string; currency: string;
  morningStart: string; morningEnd: string; afternoonStart: string; afternoonEnd: string; overtimeStart: string;
  payDayOfMonth: number; idempotencyKey: string;
}
export interface AlumDoorPayProfileLiteInput {
  tenantId: string; actor: Actor; profileName: string; employee: string; payMode: string;
  baseSalaryVnd: number; fixedAllowanceVnd: number; effectiveFrom: string; idempotencyKey: string;
}
export interface AlumDoorAttendanceStationLiteInput {
  tenantId: string; actor: Actor; stationCode: string; stationName: string; latitude: number; longitude: number;
  allowedRadiusM: number; idempotencyKey: string;
}

export async function commitAlumDoorEmployeeLite(input: AlumDoorEmployeeLiteInput, services: Services): Promise<JsonObject> {
  assertHrOwner(input.actor);
  const code = required(input.employeeName, "Mã nhân viên");
  const name = required(input.employeeFullName, "Tên nhân viên").replace(/\s+/gu, " ");
  const date = isoDate(input.dateOfJoining, "Ngày vào làm");
  const mobile = vietnameseMobile(input.mobile);
  const idempotencyKey = key(input.idempotencyKey);
  const organization = await resolveOrganization(input.tenantId, services.store);
  const actor = withRoles(input.actor, LITE_ROLE, "HR Manager");
  const document: JsonObject = {
    employee_number: code,
    employee_name: name,
    company: organization.company,
    branch: organization.workplace,
    mobile,
    date_of_joining: date,
    employee_status: "Đang làm việc",
    alu_lite_managed: 1,
    alu_lite_idempotency_key: idempotencyKey,
  };
  await services.kernel.execute(await mutation({ tenantId: input.tenantId, actor, doctype: "Employee", name: code, action: "create", expectedVersion: null, document, commandId: `alu-hr-lite:employee:${idempotencyKey}`, now: nowOf(services) }));
  return { name: code, employee_name: name, mobile, company: organization.company, workplace: organization.workplace };
}

export async function commitAlumDoorHrLiteSettings(input: AlumDoorHrLiteSettingsInput, services: Services): Promise<JsonObject> {
  assertHrOwner(input.actor);
  const idempotencyKey = key(input.idempotencyKey);
  const company = required(input.company, "Công ty");
  const workplace = required(input.workplace, "Nơi làm việc");
  const currency = required(input.currency, "Tiền tệ");
  await assertOrganizationChoices(input.tenantId, services.store, company, workplace, currency);
  const morningStart = clock(input.morningStart, "Giờ sáng bắt đầu");
  const morningEnd = clock(input.morningEnd, "Giờ sáng kết thúc");
  const afternoonStart = clock(input.afternoonStart, "Giờ chiều bắt đầu");
  const afternoonEnd = clock(input.afternoonEnd, "Giờ chiều kết thúc");
  const overtimeStart = clock(input.overtimeStart, "Giờ tăng ca bắt đầu");
  const starts = [minute(morningStart), minute(morningEnd), minute(afternoonStart), minute(afternoonEnd), minute(overtimeStart)];
  if (!(starts[0]! < starts[1]! && starts[1]! <= starts[2]! && starts[2]! < starts[3]! && starts[3]! <= starts[4]!)) {
    throw errors.validation("Các mốc giờ làm việc phải tăng dần và không chồng nhau.");
  }
  const payDay = integer(input.payDayOfMonth, "Ngày trả lương", 1, 28);
  const now = nowOf(services);
  const actor = withRoles(input.actor, LITE_ROLE, "AlumDoor Attendance Manager", "HR Manager", "System Manager");
  const commands: MutationCommand[] = [];
  const currentPolicy = await services.store.getDocument<JsonObject>(input.tenantId, POLICY, POLICY_NAME);
  const policyDocument: JsonObject = {
    policy_name: "Giờ làm AlumDoor Lite",
    company,
    timezone: "Asia/Ho_Chi_Minh",
    shift1_start_minute: starts[0], shift1_end_minute: starts[1],
    shift2_start_minute: starts[2], shift2_end_minute: starts[3],
    shift3_start_minute: starts[4], shift3_latest_out_minute: 1439,
    regular_daily_cap_minutes: (starts[1]! - starts[0]!) + (starts[3]! - starts[2]!),
    duplicate_scan_window_seconds: 60,
    max_devices_per_employee: 2,
    effective_from: now.slice(0, 10),
    policy_status: "draft",
  };
  if (!currentPolicy) {
    commands.push(await mutation({ tenantId: input.tenantId, actor, doctype: POLICY, name: POLICY_NAME, action: "create", expectedVersion: null, document: policyDocument, commandId: `alu-hr-lite:settings:${idempotencyKey}:policy-create`, now }));
    commands.push(await mutation({ tenantId: input.tenantId, actor, doctype: POLICY, name: POLICY_NAME, action: "submit", expectedVersion: 1, document: { ...policyDocument, policy_status: "approved" }, commandId: `alu-hr-lite:settings:${idempotencyKey}:policy-submit`, now }));
  } else if (currentPolicy.docstatus !== 1 || text(currentPolicy.data.policy_status) !== "approved") {
    throw errors.lifecycle(`Chính sách ${POLICY_NAME} đã tồn tại nhưng chưa ở trạng thái approved.`);
  }
  const settingsDocument: JsonObject = {
    company, workplace, currency,
    morning_start: morningStart, morning_end: morningEnd,
    afternoon_start: afternoonStart, afternoon_end: afternoonEnd,
    overtime_start: overtimeStart,
    attendance_policy: POLICY_NAME,
    pay_day_of_month: payDay,
    owner_only_mode: 1,
    overtime_rate_vnd_per_hour: FIXED_OVERTIME_RATE,
  };
  const currentSettings = await services.store.getDocument<JsonObject>(input.tenantId, SETTINGS, SETTINGS);
  commands.push(await mutation({
    tenantId: input.tenantId, actor, doctype: SETTINGS, name: SETTINGS,
    action: currentSettings ? "save" : "create", expectedVersion: currentSettings?.version ?? null,
    document: settingsDocument, commandId: `alu-hr-lite:settings:${idempotencyKey}:save`, now,
  }));
  await services.kernel.executeBundle({ commands });
  return { ready: true, configured: true, company, workplace, currency, attendance_policy: POLICY_NAME, overtime_rate_vnd_per_hour: FIXED_OVERTIME_RATE };
}

export async function commitAlumDoorPayProfileLite(input: AlumDoorPayProfileLiteInput, services: Services): Promise<JsonObject> {
  assertPayrollOwner(input.actor);
  const name = required(input.profileName, "Mã hồ sơ lương");
  const employeeName = required(input.employee, "Nhân viên");
  const payMode = required(input.payMode, "Cách trả lương");
  if (!["MONTHLY", "DAILY"].includes(payMode)) throw errors.validation("Cách trả lương phải là MONTHLY hoặc DAILY.");
  const effectiveFrom = isoDate(input.effectiveFrom, "Ngày hiệu lực");
  const baseSalary = integer(input.baseSalaryVnd, "Lương cơ bản", 0, 999_999_999_999);
  const allowance = integer(input.fixedAllowanceVnd, "Phụ cấp", 0, 999_999_999_999);
  const idempotencyKey = key(input.idempotencyKey);
  const employee = await services.store.getDocument<JsonObject>(input.tenantId, "Employee", employeeName);
  if (!employee || employee.docstatus === 2) throw errors.reference(`Employee ${employeeName} không tồn tại.`);
  const company = required(employee.data.company, "Công ty nhân viên");
  const branch = required(employee.data.branch, "Nơi làm việc nhân viên");
  const actor = withRoles(input.actor, PAYROLL_ROLE, "AlumDoor Payroll Approver", "HR Manager");
  const now = nowOf(services);
  const commands: MutationCommand[] = [];
  const active = (await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, PAY_PROFILE))
    .filter((profile) => profile.docstatus === 1 && text(profile.data.employee) === employeeName
      && (!text(profile.data.effective_to) || text(profile.data.effective_to) >= effectiveFrom));
  if (active.length > 1) throw errors.reference(`Employee ${employeeName} có nhiều hơn một hồ sơ lương đang hiệu lực.`);
  const old = active[0];
  if (old) {
    const effectiveTo = previousDate(effectiveFrom);
    if (effectiveTo < required(old.data.effective_from, "Ngày hiệu lực hồ sơ cũ")) throw errors.validation("Ngày hiệu lực mới phải sau hồ sơ lương hiện hành.");
    commands.push(await mutation({ tenantId: input.tenantId, actor, doctype: PAY_PROFILE, name: old.name, action: "save", expectedVersion: old.version, document: { ...old.data, effective_to: effectiveTo, status: "approved" }, commandId: `alu-hr-lite:pay-profile:${idempotencyKey}:close`, now }));
  }
  const document: JsonObject = {
    employee: employeeName, company, branch, pay_mode: payMode,
    base_salary_vnd: baseSalary, overtime_multiplier_bp: 10_000,
    fixed_allowance_vnd: allowance, effective_from: effectiveFrom,
    status: "draft", alu_lite_idempotency_key: idempotencyKey,
  };
  commands.push(await mutation({ tenantId: input.tenantId, actor, doctype: PAY_PROFILE, name, action: "create", expectedVersion: null, document, commandId: `alu-hr-lite:pay-profile:${idempotencyKey}:create`, now }));
  commands.push(await mutation({ tenantId: input.tenantId, actor, doctype: PAY_PROFILE, name, action: "submit", expectedVersion: 1, document: { ...document, status: "approved" }, commandId: `alu-hr-lite:pay-profile:${idempotencyKey}:submit`, now }));
  await services.kernel.executeBundle({ commands });
  return { name, employee: employeeName, status: "approved", effective_from: effectiveFrom };
}

export async function commitAlumDoorAttendanceStationLite(input: AlumDoorAttendanceStationLiteInput, services: Services): Promise<JsonObject> {
  assertStationManager(input.actor);
  const stationCode = required(input.stationCode, "Mã trạm");
  const stationName = required(input.stationName, "Tên trạm");
  key(input.idempotencyKey);
  const latitude = finite(input.latitude, "Vĩ độ", -90, 90);
  const longitude = finite(input.longitude, "Kinh độ", -180, 180);
  const allowedRadiusM = finite(input.allowedRadiusM, "Bán kính", 10, 500);
  const organization = await resolveOrganization(input.tenantId, services.store);
  const policyName = organization.attendancePolicy || POLICY_NAME;
  const policy = await services.store.getDocument<JsonObject>(input.tenantId, POLICY, policyName);
  if (!policy || policy.docstatus !== 1 || text(policy.data.policy_status) !== "approved") throw errors.reference(`Chính sách chấm công ${policyName} chưa được duyệt.`);
  const actor = withRoles(input.actor, "AlumDoor QR System", "AlumDoor Attendance Manager");
  const document: JsonObject = {
    station_code: stationCode, station_name: stationName,
    company: organization.company, branch: organization.workplace, policy: policyName,
    latitude, longitude, allowed_radius_m: allowedRadiusM,
    max_gps_accuracy_m: 50, secret_version: 1, is_active: 1,
  };
  await services.kernel.execute(await mutation({ tenantId: input.tenantId, actor, doctype: "AlumDoor QR Station", name: stationCode, action: "create", expectedVersion: null, document, commandId: `alu-hr-lite:station:${input.idempotencyKey}`, now: nowOf(services) }));
  return { name: stationCode, policy: policyName, is_active: 1, company: organization.company, workplace: organization.workplace };
}

async function resolveOrganization(tenantId: string, store: MutationStore): Promise<{ company: string; workplace: string; currency: string; attendancePolicy?: string }> {
  const settings = await store.getDocument<JsonObject>(tenantId, SETTINGS, SETTINGS);
  if (settings && settings.docstatus !== 2) return {
    company: required(settings.data.company, "Công ty đã cấu hình"),
    workplace: required(settings.data.workplace, "Nơi làm việc đã cấu hình"),
    currency: text(settings.data.currency) || "VND",
    ...(text(settings.data.attendance_policy) ? { attendancePolicy: text(settings.data.attendance_policy) } : {}),
  };
  const companies = active(await store.listMasterRecordData(tenantId, "Company"));
  const workplaces = active(await store.listMasterRecordData(tenantId, "Branch"));
  if (companies.length !== 1 || workplaces.length !== 1) throw errors.validation("Hãy lưu cấu hình công ty và nơi làm việc HR Lite trước.");
  const company = companies[0]!.name;
  const workplace = workplaces[0]!.name;
  const declaredCompany = text(workplaces[0]!.data.company);
  if (declaredCompany && declaredCompany !== company) throw errors.reference(`Nơi làm việc ${workplace} không thuộc công ty ${company}.`);
  return { company, workplace, currency: "VND" };
}

async function assertOrganizationChoices(tenantId: string, store: MutationStore, company: string, workplace: string, currency: string): Promise<void> {
  const companies = active(await store.listMasterRecordData(tenantId, "Company"));
  const workplaces = active(await store.listMasterRecordData(tenantId, "Branch"));
  const currencies = active(await store.listMasterRecordData(tenantId, "Currency"));
  if (!companies.some((row) => row.name === company)) throw errors.reference(`Công ty ${company} không tồn tại.`);
  const workplaceRow = workplaces.find((row) => row.name === workplace);
  if (!workplaceRow) throw errors.reference(`Nơi làm việc ${workplace} không tồn tại.`);
  const mapped = text(workplaceRow.data.company);
  if (mapped && mapped !== company && workplaces.length !== 1) throw errors.reference(`Nơi làm việc ${workplace} không thuộc công ty ${company}.`);
  if (currencies.length && !currencies.some((row) => row.name === currency)) throw errors.reference(`Tiền tệ ${currency} không tồn tại.`);
}

function active(rows: Array<{ name: string; data: JsonObject }>): Array<{ name: string; data: JsonObject }> { return rows.filter((row) => !truthy(row.data.disabled)); }
function assertHrOwner(actor: Actor): void { if (actor.user_id !== "Administrator" && !actor.roles.some((role) => ["AlumDoor Payroll Approver", "HR Manager", "System Manager", "Administrator"].includes(role))) throw errors.permission("Chỉ quản lý nhân sự/lương được dùng HR Lite."); }
function assertPayrollOwner(actor: Actor): void { if (actor.user_id !== "Administrator" && !actor.roles.some((role) => ["AlumDoor Payroll Approver", "HR Manager", "System Manager", "Administrator"].includes(role))) throw errors.permission("Chỉ quản lý lương được thay đổi hồ sơ lương."); }
function assertStationManager(actor: Actor): void { if (actor.user_id !== "Administrator" && !actor.roles.some((role) => ["AlumDoor Attendance Manager", "HR Manager", "System Manager", "Administrator"].includes(role))) throw errors.permission("Chỉ quản lý chấm công được tạo trạm."); }
function withRoles(actor: Actor, ...roles: string[]): Actor { return { ...actor, roles: [...new Set([...actor.roles, ...roles])] }; }
function nowOf(services: Services): string { return services.now?.() ?? new Date().toISOString(); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function required(value: unknown, label: string): string { const result = text(value); if (!result) throw errors.validation(`${label} là bắt buộc.`); return result; }
function truthy(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
function key(value: unknown): string { const result = required(value, "Khóa chống ghi trùng"); if (!/^[A-Za-z0-9._:-]{12,128}$/u.test(result)) throw errors.validation("Khóa chống ghi trùng không hợp lệ."); return result; }
function clock(value: unknown, label: string): string { const result = required(value, label); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(result)) throw errors.validation(`${label} phải theo HH:mm.`); return result; }
function minute(value: string): number { return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)); }
function isoDate(value: unknown, label: string): string { const result = required(value, label); if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw errors.validation(`${label} phải theo YYYY-MM-DD.`); return result; }
function previousDate(value: string): string { return new Date(Date.parse(`${value}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10); }
function integer(value: unknown, label: string, min: number, max: number): number { const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw errors.validation(`${label} không hợp lệ.`); return result; }
function finite(value: unknown, label: string, min: number, max: number): number { const result = Number(value); if (!Number.isFinite(result) || result < min || result > max) throw errors.validation(`${label} không hợp lệ.`); return result; }
function vietnameseMobile(value: unknown): string { let digits = required(value, "Điện thoại").replace(/\D/gu, ""); if (digits.startsWith("84")) digits = `0${digits.slice(2)}`; if (!/^0\d{9}$/u.test(digits)) throw errors.validation("Số điện thoại Việt Nam không hợp lệ."); return digits; }
async function mutation(input: { tenantId: string; actor: Actor; doctype: string; name: string; action: MutationCommand["action"]; expectedVersion: number | null; document: JsonObject; commandId: string; now: string }): Promise<MutationCommand> { const command: MutationCommand = { schema_version: 1, command_id: input.commandId, tenant_id: input.tenantId, actor: input.actor, aggregate: { doctype: input.doctype, name: input.name }, action: input.action, expected_version: input.expectedVersion, payload_hash: "", document: input.document, submitted_at: input.now }; command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>); return command; }
