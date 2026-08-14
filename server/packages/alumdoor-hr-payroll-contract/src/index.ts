import { z } from "zod";

export const ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR = 50_000 as const;

export const ALUMDOOR_HR_PAYROLL_METHODS = {
  employeeList: "alumdoor.hr_lite.employee_list",
  employeeCreate: "alumdoor.hr_lite.employee_create",
  payProfileGet: "alumdoor.hr_lite.pay_profile_get",
  payProfileSave: "alumdoor.hr_lite.pay_profile_save",
  payrollPeriodList: "alumdoor.payroll_lite.period_list",
  payrollPreview: "alumdoor.payroll_lite.period_preview",
  payrollFinalize: "alumdoor.payroll_lite.period_finalize",
  payrollMarkPaid: "alumdoor.payroll_lite.period_mark_paid",
  payrollPeriodSlips: "alumdoor.payroll_lite.period_slips",
  mySlips: "alumdoor.payroll_lite.my_slips",
  settingsGet: "alumdoor.payroll_lite.settings_get",
  settingsSave: "alumdoor.payroll_lite.settings_save",
} as const;

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeVietnamesePhone(value: string): string {
  const compact = value.trim().replace(/[\s.()-]+/gu, "");
  return compact.startsWith("+84") ? `0${compact.slice(3)}` : compact;
}

export const vietnamesePhoneSchema = z.string()
  .transform(normalizeVietnamesePhone)
  .pipe(z.string().regex(/^0(?:3|5|7|8|9)\d{8}$/u, "SĐT phải 10 số, bắt đầu 03/05/07/08/09"));

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Ngày chưa đúng định dạng").refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  "Ngày chưa hợp lệ",
);

export const employeeLiteCreateSchema = z.object({
  employee_name: z.string().transform(collapseSpaces).pipe(z.string().min(2, "Nhập họ và tên từ 2 đến 120 ký tự").max(120, "Nhập họ và tên từ 2 đến 120 ký tự")),
  mobile: vietnamesePhoneSchema,
  date_of_joining: isoDateSchema,
  idempotency_key: z.string().trim().min(12, "Mã chống tạo trùng chưa hợp lệ").max(128, "Mã chống tạo trùng chưa hợp lệ"),
}).strict();

export type EmployeeLiteCreateInput = z.infer<typeof employeeLiteCreateSchema>;

export const payProfileLiteSaveSchema = z.object({
  employee: z.string().trim().min(1, "Chọn nhân viên"),
  pay_mode: z.enum(["MONTHLY", "DAILY"], { message: "Chọn cách trả lương" }),
  base_salary_vnd: z.coerce.number().int("Mức lương phải là số nguyên VND").positive("Mức lương phải lớn hơn 0").max(999_999_999_999),
  fixed_allowance_vnd: z.coerce.number().int("Phụ cấp phải là số nguyên VND").min(0, "Phụ cấp không được âm").max(999_999_999_999).default(0),
  effective_from: isoDateSchema,
  idempotency_key: z.string().trim().min(12, "Mã chống tạo trùng chưa hợp lệ").max(128, "Mã chống tạo trùng chưa hợp lệ"),
}).strict();

export type PayProfileLiteSaveInput = z.infer<typeof payProfileLiteSaveSchema>;
export type PayProfileLiteSaveFormInput = z.input<typeof payProfileLiteSaveSchema>;

export const payrollMonthSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, "Tháng lương chưa hợp lệ");

export const hrLiteSettingsSaveSchema = z.object({
  company: z.string().trim().min(1, "Chọn công ty"),
  workplace: z.string().trim().min(1, "Chọn nơi làm việc"),
  pay_day_of_month: z.coerce.number().int("Ngày trả lương phải là số nguyên").min(1, "Ngày trả lương từ 1 đến 28").max(28, "Ngày trả lương từ 1 đến 28").default(5),
  idempotency_key: z.string().trim().min(12, "Mã chống lưu trùng chưa hợp lệ").max(128, "Mã chống lưu trùng chưa hợp lệ"),
}).strict();

export type HrLiteSettingsSaveInput = z.infer<typeof hrLiteSettingsSaveSchema>;

export const payrollPeriodActionSchema = z.object({
  period: z.string().trim().min(1, "Chọn kỳ lương"),
  idempotency_key: z.string().trim().min(12).max(128).optional(),
}).strict();

export function formatZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ";
}
