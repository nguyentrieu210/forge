import type { Actor, JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";
import { commandPayloadHash, errors } from "../../../packages/core/src/index.js";
import type { DocumentKernel, MutationStore } from "../../../packages/document-kernel/src/index.js";

const EMPLOYEE = "Employee";
const HR_LITE_SETTINGS = "AlumDoor HR Lite Settings";
const ATTENDANCE_POLICY = "AlumDoor Attendance Policy";
const QR_STATION = "AlumDoor QR Station";
const INTERNAL_HR_LITE_ROLE = "AlumDoor HR Lite System";

export interface AlumDoorEmployeeLiteInput {
  tenantId: string;
  actor: Actor;
  employeeName: string;
  employeeFullName: string;
  mobile: string;
  dateOfJoining: string;
  idempotencyKey: string;
}

export interface AlumDoorPayProfileLiteInput {
  tenantId: string;
  actor: Actor;
  profileName: string;
  employee: string;
  payMode: "MONTHLY" | "DAILY";
  baseSalaryVnd: number;
  fixedAllowanceVnd: number;
  effectiveFrom: string;
  idempotencyKey: string;
}

export interface AlumDoorHrLiteSettingsInput {
  tenantId: string;
  actor: Actor;
  company: string;
  workplace: string;
  currency: string;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  overtimeStart: string;
  payDayOfMonth: number;
  idempotencyKey: string;
}

export interface AlumDoorAttendanceStationLiteInput {
  tenantId: string;
  actor: Actor;
  stationCode: string;
  stationName: string;
  latitude: number;
  longitude: number;
  allowedRadiusM: number;
  idempotencyKey: string;
}

export async function commitAlumDoorEmployeeLite(
  input: AlumDoorEmployeeLiteInput,
  services: { kernel: DocumentKernel; store: MutationStore; now?: () => string },
): Promise<JsonObject> {
  assertOwner(input.actor);
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 128);
  const prior = (await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, EMPLOYEE))
    .find((entry) => text(entry.data.alu_lite_idempotency_key) === idempotencyKey);
  if (prior) return projection(prior.name, prior.data, true);

  const { company, workplace: branch } = await configuredOrganization(services.store, input.tenantId);
  const now = services.now?.() ?? new Date().toISOString();
  const systemActor: Actor = { ...input.actor, roles: [...new Set([...input.actor.roles, INTERNAL_HR_LITE_ROLE, "HR Manager"])] };
  const document: JsonObject = {
    employee_name: requiredText(input.employeeFullName, "Họ và tên", 120),
    mobile: normalizePhone(input.mobile),
    date_of_joining: requiredDate(input.dateOfJoining, "Ngày bắt đầu"),
    employee_number: requiredText(input.employeeName, "Mã nhân viên", 160),
    company,
    branch,
    employee_status: "Đang làm việc",
    alu_lite_managed: 1,
    alu_lite_idempotency_key: idempotencyKey,
  };
  const command = await buildCommand({
    commandId: `alu-hr-lite:${idempotencyKey}`,
    tenantId: input.tenantId,
    actor: systemActor,
    name: input.employeeName,
    document,
    submittedAt: now,
  });
  await services.kernel.execute(command);
  return projection(input.employeeName, document, false);
}

export async function commitAlumDoorPayProfileLite(
  input: AlumDoorPayProfileLiteInput,
  services: { kernel: DocumentKernel; store: MutationStore; now?: () => string },
): Promise<JsonObject> {
  assertOwner(input.actor);
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 128);
  const employeeName = requiredText(input.employee, "Nhân viên", 160);
  const profileName = requiredText(input.profileName, "Mã mức lương", 160);
  const effectiveFrom = requiredDate(input.effectiveFrom, "Ngày hiệu lực");
  const prior = (await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, "AlumDoor Pay Profile"))
    .find((entry) => text(entry.data.alu_lite_idempotency_key) === idempotencyKey);
  if (prior) return { name: prior.name, ...prior.data, replayed: true };

  const employee = await services.store.getDocument<JsonObject>(input.tenantId, EMPLOYEE, employeeName);
  if (!employee || employee.docstatus === 2) throw errors.reference(`Employee ${employeeName} does not exist`);
  const company = requiredText(employee.data.company, "Công ty", 160);
  const branch = requiredText(employee.data.branch, "Nơi làm việc", 160);
  const active = (await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, "AlumDoor Pay Profile"))
    .filter((entry) => entry.docstatus === 1 && text(entry.data.employee) === employeeName)
    .filter((entry) => text(entry.data.effective_from) <= effectiveFrom && (!text(entry.data.effective_to) || text(entry.data.effective_to) >= effectiveFrom));
  if (active.length > 1) throw errors.validation(`Employee ${employeeName} has overlapping Pay Profiles`);

  const now = services.now?.() ?? new Date().toISOString();
  const systemActor: Actor = { ...input.actor, roles: [...new Set([...input.actor.roles, "AlumDoor Payroll System", "Payroll Manager", "HR Manager"])] };
  const commands: MutationCommand[] = [];
  const current = active[0];
  if (current) {
    const closeDate = previousIsoDate(effectiveFrom);
    if (closeDate < requiredDate(current.data.effective_from, "Ngày hiệu lực mức lương hiện tại")) {
      throw errors.validation("Ngày hiệu lực mới phải sau ngày bắt đầu của mức lương hiện tại");
    }
    commands.push(await buildProfileCommand({
      commandId: `alu-pay-lite:${employeeName}:${idempotencyKey}:close`, tenantId: input.tenantId,
      actor: systemActor, name: current.name, action: "save", expectedVersion: current.version,
      document: { ...current.data, effective_to: closeDate }, submittedAt: now,
    }));
  }

  const document: JsonObject = {
    employee: employeeName, company, branch, pay_mode: input.payMode,
    base_salary_vnd: requiredInteger(input.baseSalaryVnd, "Mức lương", 1),
    overtime_multiplier_bp: 10_000,
    fixed_allowance_vnd: requiredInteger(input.fixedAllowanceVnd, "Phụ cấp", 0),
    effective_from: effectiveFrom,
    alu_lite_idempotency_key: idempotencyKey,
  };
  commands.push(await buildProfileCommand({
    commandId: `alu-pay-lite:${employeeName}:${idempotencyKey}:create`, tenantId: input.tenantId,
    actor: systemActor, name: profileName, action: "create", expectedVersion: null, document, submittedAt: now,
  }));
  commands.push(await buildProfileCommand({
    commandId: `alu-pay-lite:${employeeName}:${idempotencyKey}:submit`, tenantId: input.tenantId,
    actor: systemActor, name: profileName, action: "submit", expectedVersion: 1, document, submittedAt: now,
  }));
  await services.kernel.executeBundle({ commands });
  const saved = await services.store.getDocument<JsonObject>(input.tenantId, "AlumDoor Pay Profile", profileName);
  return { name: profileName, ...(saved?.data ?? document), replayed: false };
}

export async function commitAlumDoorHrLiteSettings(
  input: AlumDoorHrLiteSettingsInput,
  services: { kernel: DocumentKernel; store: MutationStore; now?: () => string },
): Promise<JsonObject> {
  assertOwner(input.actor);
  const company = requiredText(input.company, "Công ty", 160);
  const workplace = requiredText(input.workplace, "Nơi làm việc", 160);
  const currency = requiredText(input.currency, "Tiền tệ", 3).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) throw errors.validation("Tiền tệ phải là mã 3 chữ cái.");
  const payDayOfMonth = requiredInteger(input.payDayOfMonth, "Ngày trả lương", 1, 28);
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 128);
  const morningStart = timeToMinute(input.morningStart, "Giờ sáng bắt đầu");
  const morningEnd = timeToMinute(input.morningEnd, "Giờ sáng kết thúc");
  const afternoonStart = timeToMinute(input.afternoonStart, "Giờ chiều bắt đầu");
  const afternoonEnd = timeToMinute(input.afternoonEnd, "Giờ chiều kết thúc");
  const overtimeStart = timeToMinute(input.overtimeStart, "Giờ bắt đầu tăng ca");
  if (!(morningStart < morningEnd && morningEnd < afternoonStart && afternoonStart < afternoonEnd && afternoonEnd <= overtimeStart)) {
    throw errors.validation("Giờ làm việc phải theo thứ tự: sáng, nghỉ trưa, chiều, tăng ca.");
  }
  const companies = (await services.store.listMasterRecordData(input.tenantId, "Company"))
    .filter((entry) => entry.data.disabled !== 1 && entry.data.enabled !== 0);
  if (!companies.some((entry) => entry.name === company)) throw errors.reference(`Công ty ${company} không tồn tại hoặc đã ngừng dùng.`);
  const workplaces = eligibleWorkplaces(await services.store.listMasterRecordData(input.tenantId, "Branch"), company);
  if (!workplaces.some((entry) => entry.name === workplace)) throw errors.reference(`Nơi làm việc ${workplace} không thuộc công ty ${company} hoặc đã ngừng dùng.`);
  const currencies = (await services.store.listMasterRecordData(input.tenantId, "Currency"))
    .filter((entry) => entry.data.disabled !== 1 && entry.data.enabled !== 0);
  if (currencies.length > 0 && !currencies.some((entry) => entry.name === currency)) throw errors.reference(`Tiền tệ ${currency} không còn hoạt động.`);
  if (currencies.length === 0 && currency !== "VND") throw errors.reference("Hệ thống hiện chỉ có tiền tệ mặc định VND.");

  const current = await services.store.getDocument<JsonObject>(input.tenantId, HR_LITE_SETTINGS, HR_LITE_SETTINGS);
  const policies = await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, ATTENDANCE_POLICY);
  const configuredPolicy = text(current?.data.attendance_policy);
  const policy = policies.find((entry) => entry.docstatus !== 2 && entry.name === configuredPolicy && text(entry.data.company) === company)
    ?? policies.find((entry) => entry.docstatus !== 2 && entry.name === litePolicyName(company) && text(entry.data.company) === company);
  const policyName = policy?.name ?? litePolicyName(company);
  const now = services.now?.() ?? new Date().toISOString();
  const policyDocument: JsonObject = {
    ...(policy?.data ?? {}),
    policy_name: "Giờ làm việc mặc định",
    company,
    timezone: "Asia/Ho_Chi_Minh",
    shift1_start_minute: morningStart,
    shift1_end_minute: morningEnd,
    shift2_start_minute: afternoonStart,
    shift2_end_minute: afternoonEnd,
    shift3_start_minute: overtimeStart,
    shift3_latest_out_minute: 1439,
    regular_daily_cap_minutes: 480,
    duplicate_scan_window_seconds: 60,
    max_devices_per_employee: 2,
    effective_from: text(policy?.data.effective_from) || dateInVietnam(now),
    policy_status: "approved",
  };
  const document: JsonObject = {
    company,
    workplace,
    currency,
    morning_start: minuteToTime(morningStart),
    morning_end: minuteToTime(morningEnd),
    afternoon_start: minuteToTime(afternoonStart),
    afternoon_end: minuteToTime(afternoonEnd),
    overtime_start: minuteToTime(overtimeStart),
    attendance_policy: policyName,
    pay_day_of_month: payDayOfMonth,
    owner_only_mode: 1,
    overtime_rate_vnd_per_hour: 50_000,
  };
  const systemActor: Actor = {
    ...input.actor,
    roles: [...new Set([...input.actor.roles, INTERNAL_HR_LITE_ROLE, "AlumDoor Attendance Manager", "HR Manager"])],
  };
  const commands: MutationCommand[] = [];
  if (policy) {
    commands.push(await genericCommand({
      commandId: `alu-hr-lite-policy:${idempotencyKey}:save`, tenantId: input.tenantId, actor: systemActor,
      doctype: ATTENDANCE_POLICY, name: policyName, action: "save", expectedVersion: policy.version,
      document: policyDocument, submittedAt: now,
    }));
  } else {
    commands.push(await genericCommand({
      commandId: `alu-hr-lite-policy:${idempotencyKey}:create`, tenantId: input.tenantId, actor: systemActor,
      doctype: ATTENDANCE_POLICY, name: policyName, action: "create", expectedVersion: null,
      document: { ...policyDocument, policy_status: "draft" }, submittedAt: now,
    }));
    commands.push(await genericCommand({
      commandId: `alu-hr-lite-policy:${idempotencyKey}:submit`, tenantId: input.tenantId, actor: systemActor,
      doctype: ATTENDANCE_POLICY, name: policyName, action: "submit", expectedVersion: 1,
      document: policyDocument, submittedAt: now,
    }));
  }
  commands.push(await genericCommand({
    commandId: `alu-hr-lite-settings:${idempotencyKey}`, tenantId: input.tenantId, actor: systemActor,
    doctype: HR_LITE_SETTINGS, name: HR_LITE_SETTINGS, action: current ? "save" : "create",
    expectedVersion: current?.version ?? null, document, submittedAt: now,
  }));
  await services.kernel.executeBundle({ commands });
  return { name: HR_LITE_SETTINGS, ...document, ready: true, replayed: false };
}

export async function commitAlumDoorAttendanceStationLite(
  input: AlumDoorAttendanceStationLiteInput,
  services: { kernel: DocumentKernel; store: MutationStore; now?: () => string },
): Promise<JsonObject> {
  assertAttendanceManager(input.actor);
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 128);
  const stationCode = requiredText(input.stationCode, "Mã trạm", 80);
  const prior = (await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, QR_STATION))
    .find((entry) => entry.docstatus !== 2 && entry.name === stationCode);
  if (prior) return { name: prior.name, ...prior.data, replayed: true };
  const settings = await services.store.getDocument<JsonObject>(input.tenantId, HR_LITE_SETTINGS, HR_LITE_SETTINGS);
  if (!settings || settings.docstatus === 2) throw errors.validation("Hãy hoàn tất Cài đặt mặc định trước khi tạo trạm chấm công.");
  const company = requiredText(settings.data.company, "Công ty", 160);
  const branch = requiredText(settings.data.workplace, "Nơi làm việc", 160);
  const policyName = requiredText(settings.data.attendance_policy, "Giờ làm việc", 160);
  const policy = await services.store.getDocument<JsonObject>(input.tenantId, ATTENDANCE_POLICY, policyName);
  if (!policy || policy.docstatus !== 1 || text(policy.data.policy_status) !== "approved") {
    throw errors.reference("Giờ làm việc mặc định chưa sẵn sàng; hãy lưu lại Cài đặt mặc định.");
  }
  const document: JsonObject = {
    station_code: stationCode,
    station_name: requiredText(input.stationName, "Tên trạm", 120),
    company,
    branch,
    policy: policyName,
    latitude: requiredNumber(input.latitude, "Vĩ độ", -90, 90),
    longitude: requiredNumber(input.longitude, "Kinh độ", -180, 180),
    allowed_radius_m: requiredNumber(input.allowedRadiusM, "Bán kính", 10, 500),
    max_gps_accuracy_m: 50,
    secret_version: 1,
    is_active: 1,
  };
  const actor: Actor = { ...input.actor, roles: [...new Set([...input.actor.roles, "AlumDoor QR System", "AlumDoor Attendance Manager", "HR Manager"])] };
  await services.kernel.execute(await genericCommand({
    commandId: `alu-hr-lite-station:${idempotencyKey}`, tenantId: input.tenantId, actor,
    doctype: QR_STATION, name: stationCode, action: "create", expectedVersion: null,
    document, submittedAt: services.now?.() ?? new Date().toISOString(),
  }));
  return { name: stationCode, ...document, replayed: false };
}

async function configuredOrganization(store: MutationStore, tenantId: string): Promise<{ company: string; workplace: string }> {
  const settings = await store.getDocument<JsonObject>(tenantId, HR_LITE_SETTINGS, HR_LITE_SETTINGS);
  if (settings && settings.docstatus !== 2) {
    const company = requiredText(settings.data.company, "Công ty HR Lite", 160);
    const workplace = requiredText(settings.data.workplace, "Nơi làm việc HR Lite", 160);
    const companies = (await store.listMasterRecordData(tenantId, "Company"))
      .filter((entry) => entry.data.disabled !== 1 && entry.data.enabled !== 0);
    if (!companies.some((entry) => entry.name === company)) throw errors.reference(`Công ty HR Lite ${company} không còn hoạt động.`);
    const workplaces = eligibleWorkplaces(await store.listMasterRecordData(tenantId, "Branch"), company);
    if (!workplaces.some((entry) => entry.name === workplace)) throw errors.reference(`Nơi làm việc HR Lite ${workplace} không còn thuộc công ty ${company}.`);
    return { company, workplace };
  }
  const company = await uniqueMaster(store, tenantId, "Company", undefined, "công ty");
  const workplace = await uniqueMaster(store, tenantId, "Branch", company, "nơi làm việc");
  return { company, workplace };
}

async function uniqueMaster(store: MutationStore, tenantId: string, type: string, company: string | undefined, label: string): Promise<string> {
  const candidates = await store.listMasterRecordData(tenantId, type);
  const rows = type === "Branch" && company
    ? eligibleWorkplaces(candidates, company)
    : candidates.filter((entry) => entry.data.disabled !== 1 && entry.data.enabled !== 0);
  if (rows.length !== 1) throw errors.validation(`HR Lite cần xác định duy nhất một ${label}; hãy hoàn tất Cài đặt Nhân viên & Lương.`);
  const row = rows[0];
  if (!row) throw errors.validation(`Không tìm thấy ${label}.`);
  return row.name;
}

function eligibleWorkplaces<T extends { data: JsonObject }>(rows: T[], company: string): T[] {
  const active = rows.filter((entry) => entry.data.disabled !== 1 && entry.data.enabled !== 0);
  const matching = active.filter((entry) => !text(entry.data.company) || text(entry.data.company) === company);
  return matching.length > 0 ? matching : active;
}

async function buildCommand(input: { commandId: string; tenantId: string; actor: Actor; name: string; document: JsonObject; submittedAt: string }): Promise<MutationCommand> {
  const command: MutationCommand = {
    schema_version: 1,
    command_id: input.commandId,
    tenant_id: input.tenantId,
    actor: input.actor,
    aggregate: { doctype: EMPLOYEE, name: input.name },
    action: "create",
    expected_version: null,
    payload_hash: "",
    document: input.document,
    submitted_at: input.submittedAt,
  };
  command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
  return command;
}

async function buildProfileCommand(input: { commandId: string; tenantId: string; actor: Actor; name: string; action: MutationCommand["action"]; expectedVersion: number | null; document: JsonObject; submittedAt: string }): Promise<MutationCommand> {
  const command: MutationCommand = {
    schema_version: 1, command_id: input.commandId, tenant_id: input.tenantId, actor: input.actor,
    aggregate: { doctype: "AlumDoor Pay Profile", name: input.name }, action: input.action,
    expected_version: input.expectedVersion, payload_hash: "", document: input.document, submitted_at: input.submittedAt,
  };
  command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
  return command;
}

async function genericCommand(input: {
  commandId: string; tenantId: string; actor: Actor; doctype: string; name: string;
  action: MutationCommand["action"]; expectedVersion: number | null; document: JsonObject; submittedAt: string;
}): Promise<MutationCommand> {
  const command: MutationCommand = {
    schema_version: 1, command_id: input.commandId, tenant_id: input.tenantId, actor: input.actor,
    aggregate: { doctype: input.doctype, name: input.name }, action: input.action,
    expected_version: input.expectedVersion, payload_hash: "", document: input.document, submitted_at: input.submittedAt,
  };
  command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
  return command;
}

function projection(name: string, data: JsonObject, replayed: boolean): JsonObject {
  return { name, employee_number: data.employee_number ?? name, employee_name: data.employee_name ?? "", mobile: data.mobile ?? "", date_of_joining: data.date_of_joining ?? "", employee_status: data.employee_status ?? "Đang làm việc", replayed };
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function requiredText(value: unknown, label: string, max: number): string { const result = text(value); if (!result || result.length > max) throw errors.validation(`${label} is required`); return result; }
function requiredDate(value: unknown, label: string): string { const result = requiredText(value, label, 10); if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw errors.validation(`${label} must use YYYY-MM-DD`); return result; }
function normalizePhone(value: unknown): string { const raw = requiredText(value, "Số điện thoại", 40).replace(/[\s.()-]+/gu, ""); const phone = raw.startsWith("+84") ? `0${raw.slice(3)}` : raw; if (!/^0(?:3|5|7|8|9)\d{8}$/u.test(phone)) throw errors.validation("Số điện thoại Việt Nam chưa hợp lệ"); return phone; }
function assertOwner(actor: Actor): void { const allowed = new Set(["Administrator", "System Manager", "HR Manager", "AlumDoor Payroll Approver"]); if (actor.user_id !== "Administrator" && !actor.roles.some((role) => allowed.has(role))) throw errors.permission("Chỉ chủ doanh nghiệp hoặc người quản lý lương được dùng HR Lite."); }
function assertAttendanceManager(actor: Actor): void { const allowed = new Set(["Administrator", "System Manager", "HR Manager", "AlumDoor Attendance Manager", "AlumDoor Payroll Approver"]); if (actor.user_id !== "Administrator" && !actor.roles.some((role) => allowed.has(role))) throw errors.permission("Bạn không có quyền tạo trạm chấm công."); }
function requiredInteger(value: unknown, label: string, min: number, max = 999_999_999_999): number { const number = typeof value === "number" ? value : Number(value); if (!Number.isSafeInteger(number) || number < min || number > max) throw errors.validation(`${label} không hợp lệ`); return number; }
function requiredNumber(value: unknown, label: string, min: number, max: number): number { const number = typeof value === "number" ? value : Number(value); if (!Number.isFinite(number) || number < min || number > max) throw errors.validation(`${label} không hợp lệ`); return number; }
function timeToMinute(value: unknown, label: string): number { const time = requiredText(value, label, 5); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) throw errors.validation(`${label} không hợp lệ`); return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)); }
function minuteToTime(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function litePolicyName(company: string): string { const suffix = company.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toUpperCase().replace(/[^A-Z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 48) || "DEFAULT"; return `ATP-HR-LITE-${suffix}`; }
function dateInVietnam(value: string): string { const date = new Date(value); const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ""; return `${part("year")}-${part("month")}-${part("day")}`; }
function previousIsoDate(value: string): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }
