export type PayrollPlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

type Json = Record<string, unknown>;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function fail(code: string, message: string, status = 422): Response { return json({ code, message }, status); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function requiredText(value: unknown, label: string, max = 320): string {
  const result = text(value);
  if (!result || result.length > max) throw new Error(`${label} là bắt buộc.`);
  return result;
}
function integer(value: unknown, label: string, fallback?: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label} không hợp lệ.`);
  return result;
}
function date(value: unknown, label: string): string {
  const result = requiredText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw new Error(`${label} không hợp lệ.`);
  return result;
}
function asObject(value: unknown, label: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} trả về dữ liệu không hợp lệ.`);
  return value as Json;
}
function asArray(value: unknown): Json[] { return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; }

async function method(call: PayrollPlatformCall, name: string, body: Json): Promise<unknown> {
  const response = await call(`method/${name}`, { method: "POST", body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const message = text(payload.message) || text((payload.error as Json | undefined)?.message) || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload.message ?? payload.data ?? payload;
}
async function getDoc(call: PayrollPlatformCall, doctype: string, name: string): Promise<Json> {
  return asObject(await method(call, "frappe.client.get", { doctype, name }), `${doctype} ${name}`);
}
async function listDocs(call: PayrollPlatformCall, doctype: string, filters: Json, fields: string[] = ["*"]): Promise<Json[]> {
  return asArray(await method(call, "frappe.client.get_list", { doctype, fields, filters, order_by: "modified desc", limit_page_length: 1000 }));
}
async function insertDoc(call: PayrollPlatformCall, doc: Json): Promise<Json> {
  return asObject(await method(call, "frappe.client.insert", { doc }), "Bản ghi mới");
}
async function saveDoc(call: PayrollPlatformCall, doc: Json): Promise<Json> {
  return asObject(await method(call, "frappe.client.save", { doc }), "Bản ghi cập nhật");
}

/** Conservative minimum for overtime on a normal working day: 150% of normal hourly pay. */
export function minimumRegularDayOvertimeRateVnd(input: { payMode: string; baseSalaryVnd: number; standardWorkDaysBp: number }): number {
  const baseSalary = integer(input.baseSalaryVnd, "Mức lương", undefined, 1);
  const workDaysBp = input.payMode === "DAILY" ? 10_000 : integer(input.standardWorkDaysBp, "Ngày công chuẩn", undefined, 1, 310_000);
  const numerator = BigInt(baseSalary) * 15_000n;
  const denominator = BigInt(workDaysBp) * 8n;
  return Number((numerator + denominator - 1n) / denominator);
}

export async function payrollCreatePeriod(input: { call: PayrollPlatformCall; args: Json; now?: Date }): Promise<Response> {
  try {
    const startDate = date(input.args.start_date, "Ngày bắt đầu");
    const endDate = date(input.args.end_date, "Ngày kết thúc");
    if (endDate < startDate) throw new Error("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
    const company = requiredText(input.args.company, "Công ty");
    const branch = text(input.args.branch);
    const standard = integer(input.args.standard_work_days_bp, "Ngày công chuẩn", 260_000, 1, 310_000);
    const created = await insertDoc(input.call, {
      doctype: "Payroll Entry", company, ...(branch ? { branch } : {}),
      posting_at: (input.now ?? new Date()).toISOString(), start_date: startDate, end_date: endDate,
      salary_slips: [], alu_standard_work_days_bp: standard, alu_state: "draft",
    });
    return json(created);
  } catch (error) { return fail("PAYROLL_CREATE_FAILED", error instanceof Error ? error.message : "Không tạo được kỳ lương."); }
}

export async function payrollCalculatePeriod(input: { call: PayrollPlatformCall; args: Json; now?: Date; calculationVersion?: 1 | 2 }): Promise<Response> {
  try {
    const periodName = requiredText(input.args.period, "Kỳ lương");
    const period = await getDoc(input.call, "Payroll Entry", periodName);
    const currentState = text(period.alu_state) || "draft";
    if (!["draft", "calculated", "invalidated"].includes(currentState)) throw new Error("Kỳ lương không ở trạng thái cho phép tính hoặc tính lại.");
    const company = requiredText(period.company, "Công ty kỳ lương");
    const branch = text(period.branch);
    const startDate = date(period.start_date, "Ngày bắt đầu kỳ");
    const endDate = date(period.end_date, "Ngày kết thúc kỳ");
    const standardWorkDaysBp = integer(period.alu_standard_work_days_bp, "Ngày công chuẩn", undefined, 1, 310_000);
    const profiles = (await listDocs(input.call, "AlumDoor Pay Profile", { company, ...(branch ? { branch } : {}), status: "approved" }))
      .filter((profile) => text(profile.effective_from) <= endDate && (!text(profile.effective_to) || text(profile.effective_to) >= startDate));
    if (!profiles.length) throw new Error("Không có hồ sơ lương đã duyệt trong kỳ.");

    const slipRows: Json[] = [];
    for (const profile of profiles) {
      const employee = requiredText(profile.employee, "Nhân viên hồ sơ lương");
      const existing = (await listDocs(input.call, "Salary Slip", { alu_payroll_entry: periodName, employee }))[0];
      if (existing && Number(existing.docstatus ?? 0) !== 0) throw new Error(`Phiếu lương ${text(existing.name)} đã submit, không thể tính lại.`);
      const base: Json = {
        ...(existing ?? {}), doctype: "Salary Slip", employee, company,
        posting_at: (input.now ?? new Date()).toISOString(), start_date: startDate, end_date: endDate,
        earnings: [], deductions: [], alu_payroll_entry: periodName,
        alu_pay_profile: requiredText(profile.name, "Hồ sơ lương"),
        alu_standard_work_days_bp: standardWorkDaysBp,
        alu_state: "draft",
        alu_calculation_version: input.calculationVersion === 2 ? 2 : integer(existing?.alu_calculation_version, "Phiên bản tính", 0, 0, 1_000_000) + 1,
        ...(input.calculationVersion === 2 ? {
          alu_overtime_rate_vnd_per_hour: 50_000,
          alu_overtime_legal_floor_vnd: minimumRegularDayOvertimeRateVnd({
            payMode: text(profile.pay_mode) || "MONTHLY",
            baseSalaryVnd: integer(profile.base_salary_vnd, "Mức lương", undefined, 1),
            standardWorkDaysBp,
          }),
          alu_lite_version: 2,
        } : {}),
      };
      const saved = existing ? await saveDoc(input.call, base) : await insertDoc(input.call, base);
      slipRows.push({ row_id: `ALU-${employee}`, salary_slip: requiredText(saved.name, "Phiếu lương"), employee });
    }
    const calculated = await saveDoc(input.call, { ...period, salary_slips: slipRows, alu_state: "calculated", alu_calculated_at: (input.now ?? new Date()).toISOString() });
    return json({ period: calculated, employee_count: slipRows.length });
  } catch (error) { return fail("PAYROLL_CALCULATE_FAILED", error instanceof Error ? error.message : "Không tính được lương."); }
}

export async function payrollSubmitPeriod(input: { call: PayrollPlatformCall; args: Json; now?: Date }): Promise<Response> {
  try {
    const periodName = requiredText(input.args.period, "Kỳ lương");
    const period = await getDoc(input.call, "Payroll Entry", periodName);
    if (text(period.alu_state) !== "calculated") throw new Error("Chỉ kỳ đã tính mới được gửi duyệt.");
    const rows = asArray(period.salary_slips);
    if (!rows.length) throw new Error("Kỳ lương chưa có phiếu lương.");
    for (const row of rows) {
      const slipName = requiredText(row.salary_slip, "Phiếu lương");
      const slip = await getDoc(input.call, "Salary Slip", slipName);
      if (Number(slip.docstatus ?? 0) !== 0) continue;
      await saveDoc(input.call, { ...slip, alu_state: "pending_approval" });
    }
    const saved = await saveDoc(input.call, { ...period, alu_state: "pending_approval" });
    return json(saved);
  } catch (error) { return fail("PAYROLL_SUBMIT_FAILED", error instanceof Error ? error.message : "Không gửi duyệt được kỳ lương."); }
}

export async function payrollApprovePeriod(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  try {
    const period = requiredText(input.args.period, "Kỳ lương");
    return json(await method(input.call, "metaforge.api.approve_alumdoor_payroll", { payroll_entry: period }));
  } catch (error) { return fail("PAYROLL_APPROVAL_FAILED", error instanceof Error ? error.message : "Không duyệt được kỳ lương."); }
}

export async function payrollMarkPaid(input: { call: PayrollPlatformCall; args: Json; now?: Date }): Promise<Response> {
  try {
    const periodName = requiredText(input.args.period, "Kỳ lương");
    const period = await getDoc(input.call, "Payroll Entry", periodName);
    if (Number(period.docstatus ?? 0) !== 1 || text(period.alu_state) !== "approved") throw new Error("Chỉ kỳ lương đã duyệt mới được xác nhận đã trả.");
    return json(await saveDoc(input.call, { ...period, alu_state: "paid", alu_paid_at: (input.now ?? new Date()).toISOString() }));
  } catch (error) { return fail("PAYROLL_MARK_PAID_FAILED", error instanceof Error ? error.message : "Không thể xác nhận trả lương."); }
}

export async function payrollPeriodList(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  try { return json(await listDocs(input.call, "Payroll Entry", { ...(text(input.args.company) ? { company: text(input.args.company) } : {}), ...(text(input.args.branch) ? { branch: text(input.args.branch) } : {}) })); }
  catch (error) { return fail("PAYROLL_LIST_FAILED", error instanceof Error ? error.message : "Không đọc được kỳ lương."); }
}

export async function payrollPeriodSlips(input: { call: PayrollPlatformCall; args: Json }): Promise<Response> {
  try {
    const period = requiredText(input.args.period, "Kỳ lương");
    return json(await listDocs(input.call, "Salary Slip", { alu_payroll_entry: period }));
  } catch (error) { return fail("PAYROLL_PERIOD_SLIPS_FAILED", error instanceof Error ? error.message : "Không đọc được phiếu lương của kỳ."); }
}

export async function payrollMySlips(input: { call: PayrollPlatformCall; args: Json; actorUser: string }): Promise<Response> {
  try {
    const actorUser = requiredText(input.actorUser, "Tài khoản đăng nhập");
    const employees = await listDocs(input.call, "Employee", { user_id: actorUser }, ["name", "user_id"]);
    if (employees.length !== 1) throw new Error("Tài khoản phải được gắn duy nhất một Employee để xem phiếu lương.");
    const employee = requiredText(employees[0]?.name, "Nhân viên");
    const slips = await listDocs(input.call, "Salary Slip", {
      employee,
      ...(text(input.args.period) ? { alu_payroll_entry: text(input.args.period) } : {}),
    });
    return json(slips.filter((slip) => Number(slip.docstatus ?? 0) === 1 && ["approved", "paid"].includes(text(slip.alu_state))));
  } catch (error) { return fail("PAYROLL_SLIP_LIST_FAILED", error instanceof Error ? error.message : "Không đọc được phiếu lương."); }
}
