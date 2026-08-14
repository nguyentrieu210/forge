import type { Actor, JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";
import { commandPayloadHash, errors } from "../../../packages/core/src/index.js";
import type { DocumentKernel, MutationStore } from "../../../packages/document-kernel/src/index.js";

const EMPLOYEE = "Employee";
const HR_LITE_SETTINGS = "AlumDoor HR Lite Settings";
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
  payDayOfMonth: number;
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
  const payDayOfMonth = requiredInteger(input.payDayOfMonth, "Ngày trả lương", 1, 28);
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 128);
  const companies = (await services.store.listMasterRecordData(input.tenantId, "Company"))
    .filter((entry) => entry.data.disabled !== 1 && entry.data.enabled !== 0);
  if (!companies.some((entry) => entry.name === company)) throw errors.reference(`Công ty ${company} không tồn tại hoặc đã ngừng dùng.`);
  const workplaces = eligibleWorkplaces(await services.store.listMasterRecordData(input.tenantId, "Branch"), company);
  if (!workplaces.some((entry) => entry.name === workplace)) throw errors.reference(`Nơi làm việc ${workplace} không thuộc công ty ${company} hoặc đã ngừng dùng.`);

  const current = await services.store.getDocument<JsonObject>(input.tenantId, HR_LITE_SETTINGS, HR_LITE_SETTINGS);
  const now = services.now?.() ?? new Date().toISOString();
  const document: JsonObject = {
    company,
    workplace,
    pay_day_of_month: payDayOfMonth,
  };
  const systemActor: Actor = { ...input.actor, roles: [...new Set([...input.actor.roles, INTERNAL_HR_LITE_ROLE])] };
  const command: MutationCommand = {
    schema_version: 1,
    command_id: `alu-hr-lite-settings:${idempotencyKey}`,
    tenant_id: input.tenantId,
    actor: systemActor,
    aggregate: { doctype: HR_LITE_SETTINGS, name: HR_LITE_SETTINGS },
    action: current ? "save" : "create",
    expected_version: current?.version ?? null,
    payload_hash: "",
    document,
    submitted_at: now,
  };
  command.payload_hash = await commandPayloadHash(command as unknown as Record<string, unknown>);
  await services.kernel.execute(command);
  return { name: HR_LITE_SETTINGS, ...document, ready: true, replayed: false };
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

function projection(name: string, data: JsonObject, replayed: boolean): JsonObject {
  return { name, employee_number: data.employee_number ?? name, employee_name: data.employee_name ?? "", mobile: data.mobile ?? "", date_of_joining: data.date_of_joining ?? "", employee_status: data.employee_status ?? "Đang làm việc", replayed };
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function requiredText(value: unknown, label: string, max: number): string { const result = text(value); if (!result || result.length > max) throw errors.validation(`${label} is required`); return result; }
function requiredDate(value: unknown, label: string): string { const result = requiredText(value, label, 10); if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw errors.validation(`${label} must use YYYY-MM-DD`); return result; }
function normalizePhone(value: unknown): string { const raw = requiredText(value, "Số điện thoại", 40).replace(/[\s.()-]+/gu, ""); const phone = raw.startsWith("+84") ? `0${raw.slice(3)}` : raw; if (!/^0(?:3|5|7|8|9)\d{8}$/u.test(phone)) throw errors.validation("Số điện thoại Việt Nam chưa hợp lệ"); return phone; }
function assertOwner(actor: Actor): void { const allowed = new Set(["Administrator", "System Manager", "HR Manager", "AlumDoor Payroll Approver"]); if (actor.user_id !== "Administrator" && !actor.roles.some((role) => allowed.has(role))) throw errors.permission("Chỉ chủ doanh nghiệp hoặc người quản lý lương được dùng HR Lite."); }
function requiredInteger(value: unknown, label: string, min: number, max = 999_999_999_999): number { const number = typeof value === "number" ? value : Number(value); if (!Number.isSafeInteger(number) || number < min || number > max) throw errors.validation(`${label} không hợp lệ`); return number; }
function previousIsoDate(value: string): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }
