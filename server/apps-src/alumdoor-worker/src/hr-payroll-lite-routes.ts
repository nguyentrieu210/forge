import {
  ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
  employeeLiteCreateSchema,
  formatZodMessage,
  hrLiteSettingsSaveSchema,
  payProfileLiteSaveSchema,
  payrollMonthSchema,
} from "@cloudforge/alumdoor-hr-payroll-contract";
import {
  payrollApprovePeriod,
  payrollCalculatePeriod,
  payrollMarkPaid,
  payrollMySlips,
  payrollPeriodList,
  payrollPeriodSlips,
  type PayrollPlatformCall,
} from "./payroll-routes.js";

type Json = Record<string, unknown>;

function json(value: unknown, status = 200): Response { return Response.json(value, { status }); }
function fail(code: string, message: string, status = 422): Response { return json({ code, message }, status); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function asObject(value: unknown, label: string): Json { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} trả về dữ liệu không hợp lệ.`); return value as Json; }
function asArray(value: unknown): Json[] { return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; }

async function method(call: PayrollPlatformCall, name: string, body: Json): Promise<unknown> {
  const response = await call(`method/${name}`, { method: "POST", body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(text(payload.message) || text((payload.error as Json | undefined)?.message) || `HTTP ${response.status}`);
  return payload.message ?? payload.data ?? payload;
}

async function listDocs(call: PayrollPlatformCall, doctype: string, filters: Json, fields: string[] = ["*"]): Promise<Json[]> {
  return asArray(await method(call, "frappe.client.get_list", { doctype, fields, filters, order_by: "modified desc", limit_page_length: 1000 }));
}

interface OrganizationOption { value: string; label: string; company?: string; currency?: string }
interface LiteOrganization {
  company: string; workplace: string; currency: string; ready: boolean; configured: boolean;
  morningStart: string; morningEnd: string; afternoonStart: string; afternoonEnd: string; overtimeStart: string;
  attendancePolicy: string;
  payDayOfMonth: number; ownerOnlyMode: boolean;
  companies: OrganizationOption[]; workplaces: OrganizationOption[]; currencies: OrganizationOption[];
}
async function liteOrganization(call: PayrollPlatformCall): Promise<LiteOrganization> {
  const value = asObject(await method(call, "metaforge.api.get_alumdoor_hr_lite_organization", {}), "Cài đặt tổ chức HR Lite");
  const options = (input: unknown): OrganizationOption[] => asArray(input).map((row) => ({
    value: text(row.value), label: text(row.label) || text(row.value),
    ...(text(row.company) ? { company: text(row.company) } : {}),
    ...(text(row.currency) ? { currency: text(row.currency) } : {}),
  })).filter((row) => row.value);
  return {
    company: text(value.company), workplace: text(value.workplace), currency: text(value.currency) || "VND", ready: value.ready === true,
    configured: value.configured === true,
    morningStart: text(value.morning_start) || "07:00", morningEnd: text(value.morning_end) || "11:30",
    afternoonStart: text(value.afternoon_start) || "13:00", afternoonEnd: text(value.afternoon_end) || "17:00",
    overtimeStart: text(value.overtime_start) || "17:30", attendancePolicy: text(value.attendance_policy),
    payDayOfMonth: typeof value.pay_day_of_month === "number" ? value.pay_day_of_month : 5,
    ownerOnlyMode: value.owner_only_mode !== false,
    companies: options(value.companies), workplaces: options(value.workplaces), currencies: options(value.currencies),
  };
}

export async function employeeLiteList(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  try {
    const rows = await listDocs(input.call, "Employee", text(input.args.status) ? { employee_status: text(input.args.status) } : {}, [
      "name", "employee_number", "employee_name", "mobile", "date_of_joining", "employee_status",
    ]);
    const profiles = await listDocs(input.call, "AlumDoor Pay Profile", { status: "approved" }, ["employee", "status", "effective_from", "effective_to"]);
    const profileEmployees = new Set(profiles.map((profile) => text(profile.employee)).filter(Boolean));
    const query = text(input.args.query).toLocaleLowerCase("vi");
    const filtered = query ? rows.filter((row) => `${text(row.employee_name)}\n${text(row.employee_number)}\n${text(row.mobile)}`.toLocaleLowerCase("vi").includes(query) || text(row.mobile).endsWith(query)) : rows;
    return json(filtered.map((row) => ({ ...row, has_pay_profile: profileEmployees.has(text(row.name)) })));
  } catch (error) { return fail("EMPLOYEE_LITE_LIST_FAILED", error instanceof Error ? error.message : "Không đọc được danh sách nhân viên."); }
}

export async function employeeLiteCreate(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  const parsed = employeeLiteCreateSchema.safeParse(input.args);
  if (!parsed.success) return fail("EMPLOYEE_LITE_INPUT_INVALID", formatZodMessage(parsed.error));
  try {
    return json(asObject(await method(input.call, "metaforge.api.commit_alumdoor_employee_lite", parsed.data), "Nhân viên"));
  } catch (error) { return fail("EMPLOYEE_LITE_CREATE_FAILED", error instanceof Error ? error.message : "Không tạo được nhân viên."); }
}

export async function payProfileLiteGet(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  try {
    const employee = text(input.args.employee);
    if (!employee) throw new Error("Chọn nhân viên.");
    const rows = await listDocs(input.call, "AlumDoor Pay Profile", { employee }, ["*"]);
    return json(rows.sort((a, b) => text(b.effective_from).localeCompare(text(a.effective_from))));
  } catch (error) { return fail("PAY_PROFILE_LITE_GET_FAILED", error instanceof Error ? error.message : "Không đọc được mức lương."); }
}

export async function payProfileLiteSave(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  const parsed = payProfileLiteSaveSchema.safeParse(input.args);
  if (!parsed.success) return fail("PAY_PROFILE_LITE_INPUT_INVALID", formatZodMessage(parsed.error));
  try {
    return json(asObject(await method(input.call, "metaforge.api.commit_alumdoor_pay_profile_lite", parsed.data), "Mức lương đã duyệt"));
  } catch (error) { return fail("PAY_PROFILE_LITE_SAVE_FAILED", error instanceof Error ? error.message : "Không lưu được mức lương."); }
}

export async function payrollLitePeriodList(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  return payrollPeriodList(input);
}

export async function payrollLitePreview(input: { call: PayrollPlatformCall; args: Json; now?: Date }): Promise<Response> {
  const month = payrollMonthSchema.safeParse(input.args.month);
  if (!month.success) return fail("PAYROLL_LITE_MONTH_INVALID", formatZodMessage(month.error));
  try {
    const organization = await liteOrganization(input.call);
    if (!organization.ready) throw new Error("Cài đặt cần xác định duy nhất một công ty và một nơi làm việc.");
    const [year, rawMonth] = month.data.split("-").map(Number);
    const startDate = `${month.data}-01`;
    const endDate = new Date(Date.UTC(year!, rawMonth!, 0)).toISOString().slice(0, 10);
    const existing = (await listDocs(input.call, "Payroll Entry", { company: organization.company, start_date: startDate, end_date: endDate }, ["*"]))[0];
    let period = existing;
    if (!period) {
      period = asObject(await method(input.call, "frappe.client.insert", { doc: {
        doctype: "Payroll Entry", company: organization.company, branch: organization.workplace,
        posting_at: (input.now ?? new Date()).toISOString(), start_date: startDate, end_date: endDate,
        salary_slips: [], alu_standard_work_days_bp: 260_000, alu_state: "draft",
        alu_overtime_rate_vnd_per_hour: ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
        alu_lite_version: 2,
      } }), "Kỳ lương");
    }
    const calculated = await payrollCalculatePeriod({
      call: input.call,
      args: { period: period.name },
      ...(input.now ? { now: input.now } : {}),
      calculationVersion: 2,
    });
    return calculated;
  } catch (error) { return fail("PAYROLL_LITE_PREVIEW_FAILED", error instanceof Error ? error.message : "Không tính thử được kỳ lương."); }
}

export async function payrollLiteFinalize(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  return payrollApprovePeriod(input);
}
export async function payrollLiteMarkPaid(input: { call: PayrollPlatformCall; args: Json; now?: Date }): Promise<Response> {
  return payrollMarkPaid(input);
}
export async function payrollLitePeriodSlips(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> { return payrollPeriodSlips(input); }
export async function payrollLiteMySlips(input: { call: PayrollPlatformCall; args: Json; actorUser: string }): Promise<Response> { return payrollMySlips(input); }

export async function payrollLiteSettingsGet(input: { call: PayrollPlatformCall }): Promise<Response> {
  try {
    const organization = await liteOrganization(input.call);
    return json({
      company: organization.company || null,
      workplace: organization.workplace || null,
      currency: organization.currency,
      morning_start: organization.morningStart,
      morning_end: organization.morningEnd,
      afternoon_start: organization.afternoonStart,
      afternoon_end: organization.afternoonEnd,
      overtime_start: organization.overtimeStart,
      attendance_policy: organization.attendancePolicy || null,
      overtime_rate_vnd_per_hour: ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
      pay_day_of_month: organization.payDayOfMonth,
      owner_only_mode: organization.ownerOnlyMode,
      ready: organization.ready,
      configured: organization.configured,
      companies: organization.companies,
      workplaces: organization.workplaces,
      currencies: organization.currencies,
      need_legal_check: true,
    });
  } catch (error) { return fail("PAYROLL_LITE_SETTINGS_FAILED", error instanceof Error ? error.message : "Không đọc được cài đặt lương."); }
}

export async function payrollLiteSettingsSave(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  const parsed = hrLiteSettingsSaveSchema.safeParse(input.args);
  if (!parsed.success) return fail("PAYROLL_LITE_SETTINGS_INPUT_INVALID", formatZodMessage(parsed.error));
  try {
    const available = await liteOrganization(input.call);
    const company = available.companies.find((entry) => entry.value === parsed.data.company);
    if (!company) throw new Error("Công ty đã chọn không còn hoạt động.");
    const workplace = available.workplaces.find((entry) => entry.value === parsed.data.workplace);
    const mappedWorkplaces = available.workplaces.filter((entry) => !entry.company || entry.company === parsed.data.company);
    if (!workplace || (mappedWorkplaces.length > 0 && workplace.company && workplace.company !== parsed.data.company)) {
      throw new Error("Nơi làm việc không thuộc công ty đã chọn hoặc đã ngừng dùng.");
    }
    if (!available.currencies.some((entry) => entry.value === parsed.data.currency)) throw new Error("Tiền tệ đã chọn không còn hoạt động.");
    await method(input.call, "metaforge.api.commit_alumdoor_hr_lite_settings", parsed.data);
    return payrollLiteSettingsGet({ call: input.call });
  } catch (error) { return fail("PAYROLL_LITE_SETTINGS_SAVE_FAILED", error instanceof Error ? error.message : "Không lưu được Cài đặt Nhân viên & Lương."); }
}
