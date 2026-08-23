import type { PlatformCall } from "./platform-call.js";

type Json = Record<string, unknown>;
type Input = { call: PlatformCall; args?: Json };
const OVERTIME_RATE = 50_000;

export async function employeeLiteCreate({ call, args = {} }: Input): Promise<Response> {
  try {
    const body = {
      employee_name: required(args.employee_name, "Tên nhân viên"),
      mobile: mobile(args.mobile),
      date_of_joining: date(args.date_of_joining, "Ngày vào làm"),
      idempotency_key: idempotency(args.idempotency_key),
    };
    return unwrap(await call("method/metaforge.api.commit_alumdoor_employee_lite", { method: "POST", body: JSON.stringify(body) }));
  } catch (error) { return failure(error); }
}

export async function payProfileLiteSave({ call, args = {} }: Input): Promise<Response> {
  try {
    const mode = required(args.pay_mode, "Cách trả lương");
    if (!["MONTHLY", "DAILY"].includes(mode)) throw new Error("Cách trả lương không hợp lệ.");
    return unwrap(await call("method/metaforge.api.commit_alumdoor_pay_profile_lite", { method: "POST", body: JSON.stringify({
      employee: required(args.employee, "Nhân viên"), pay_mode: mode,
      base_salary_vnd: integer(args.base_salary_vnd, "Lương cơ bản", 0, 999_999_999_999),
      fixed_allowance_vnd: integer(args.fixed_allowance_vnd ?? 0, "Phụ cấp", 0, 999_999_999_999),
      effective_from: date(args.effective_from, "Ngày hiệu lực"),
      idempotency_key: idempotency(args.idempotency_key),
    }) }));
  } catch (error) { return failure(error); }
}

export async function payrollLiteSettingsGet({ call }: Input): Promise<Response> {
  const response = await call("method/metaforge.api.get_alumdoor_hr_lite_organization", { method: "POST", body: "{}" });
  if (!response.ok) return response;
  const data = await payload(response);
  return Response.json({ ...data, overtime_rate_vnd_per_hour: OVERTIME_RATE });
}

export async function payrollLiteSettingsSave({ call, args = {} }: Input): Promise<Response> {
  try {
    const currentResponse = await call("method/metaforge.api.get_alumdoor_hr_lite_organization", { method: "POST", body: "{}" });
    if (!currentResponse.ok) return currentResponse;
    const current = await payload(currentResponse);
    const company = required(args.company, "Công ty");
    const workplace = required(args.workplace, "Nơi làm việc");
    const currency = required(args.currency, "Tiền tệ");
    assertChoice(current.companies, company, "Công ty");
    assertChoice(current.workplaces, workplace, "Nơi làm việc");
    assertChoice(current.currencies, currency, "Tiền tệ");
    const body = {
      company, workplace, currency,
      morning_start: clock(args.morning_start, "Giờ sáng bắt đầu"), morning_end: clock(args.morning_end, "Giờ sáng kết thúc"),
      afternoon_start: clock(args.afternoon_start, "Giờ chiều bắt đầu"), afternoon_end: clock(args.afternoon_end, "Giờ chiều kết thúc"),
      overtime_start: clock(args.overtime_start, "Giờ tăng ca bắt đầu"),
      pay_day_of_month: integer(args.pay_day_of_month, "Ngày trả lương", 1, 28),
      idempotency_key: idempotency(args.idempotency_key),
    };
    const saved = await call("method/metaforge.api.commit_alumdoor_hr_lite_settings", { method: "POST", body: JSON.stringify(body) });
    if (!saved.ok) return saved;
    return payrollLiteSettingsGet({ call });
  } catch (error) { return failure(error); }
}

function assertChoice(value: unknown, selected: string, label: string): void { if (!Array.isArray(value) || !value.some((row) => row && typeof row === "object" && String((row as Json).value ?? "") === selected)) throw new Error(`${label} không nằm trong danh sách được phép.`); }
async function unwrap(response: Response): Promise<Response> { if (!response.ok) return response; return Response.json(await payload(response)); }
async function payload(response: Response): Promise<Json> { const value = await response.json() as Json; const result = value.message ?? value.data ?? value; if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Phản hồi nền tảng không hợp lệ."); return result as Json; }
function required(value: unknown, label: string): string { const result = typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; if (!result) throw new Error(`${label} là bắt buộc.`); return result; }
function mobile(value: unknown): string { let digits = required(value, "Điện thoại").replace(/\D/gu, ""); if (digits.startsWith("84")) digits = `0${digits.slice(2)}`; if (!/^0\d{9}$/u.test(digits)) throw new Error("Số điện thoại Việt Nam không hợp lệ."); return digits; }
function idempotency(value: unknown): string { const result = required(value, "Khóa chống ghi trùng"); if (!/^[A-Za-z0-9._:-]{12,128}$/u.test(result)) throw new Error("Khóa chống ghi trùng không hợp lệ."); return result; }
function date(value: unknown, label: string): string { const result = required(value, label); if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw new Error(`${label} phải theo YYYY-MM-DD.`); return result; }
function clock(value: unknown, label: string): string { const result = required(value, label); if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(result)) throw new Error(`${label} phải theo HH:mm.`); return result; }
function integer(value: unknown, label: string, min: number, max: number): number { const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label} không hợp lệ.`); return result; }
/**
 * Khoá phải là `message`, KHÔNG phải `error`.
 *
 * Tầng điều phối method chỉ đọc `body.message` (app-registry/method-dispatch.ts §!response.ok);
 * trả khoá khác là mọi câu tiếng Việt ở nhóm route này bị vứt và thay bằng "App alumdoor
 * returned 422" — người dùng thấy một mã lỗi trần, không biết thiếu ô nào. Đúng thứ bản review
 * tổng mục #20 bắt được ở màn Cài đặt nhân sự.
 */
function failure(error: unknown): Response {
  const message = error instanceof Error && error.message ? error.message : "Dữ liệu không hợp lệ.";
  return Response.json({ message, error: message }, { status: 422 });
}
