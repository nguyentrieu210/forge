import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";

const INTERNAL_HR_LITE_ROLE = "AlumDoor HR Lite System";

/** Employee keeps its full HRM rules unless the signed AlumDoor Lite coordinator writes it. */
export class AlumDoorAwareEmployeeController extends SuiteController<JsonObject> {
  readonly doctype = "Employee";

  async normalize(context: ControllerContext<JsonObject>): Promise<JsonObject> {
    if (context.command.action !== "create" && context.command.action !== "save") {
      throw errors.lifecycle("Employee chỉ hỗ trợ tạo hoặc cập nhật; nghỉ việc dùng luồng chuyên biệt.");
    }
    const input = context.command.document;
    const lite = input.alu_lite_managed === 1 || input.alu_lite_managed === true;
    const trustedLite = lite && context.command.actor.roles.includes(INTERNAL_HR_LITE_ROLE);
    if (lite && !trustedLite) throw errors.permission("Employee Lite chỉ được ghi qua điều phối AlumDoor đã xác thực.");

    const employeeName = requiredText(input.employee_name, "Họ và tên", 120);
    if (employeeName.length < 2) throw errors.validation("Nhập họ và tên từ 2 đến 120 ký tự");
    const company = requiredText(input.company, "Công ty", 160);
    const branch = requiredText(input.branch, "Nơi làm việc", 160);
    const employeeNumber = requiredText(input.employee_number || context.command.aggregate.name, "Mã nhân viên", 160);
    if (employeeNumber !== context.command.aggregate.name) throw errors.validation("Mã nhân viên không khớp mã hệ thống đã cấp.");

    if (!trustedLite) {
      for (const [field, label] of [
        ["department", "Phòng ban"],
        ["designation", "Chức danh"],
        ["employment_type", "Loại lao động"],
        ["cost_center", "Trung tâm chi phí"],
      ] as const) requiredText(input[field], label, 160);
    }

    return {
      ...input,
      employee_name: collapseSpaces(employeeName),
      mobile: normalizePhone(input.mobile),
      date_of_joining: requiredDate(input.date_of_joining, "Ngày bắt đầu"),
      company,
      branch,
      employee_number: employeeNumber,
      employee_status: text(input.employee_status) || "Đang làm việc",
      ...(trustedLite ? { alu_lite_managed: 1 } : {}),
    };
  }

  status(_context: ControllerContext<JsonObject>, data: JsonObject): string {
    return text(data.employee_status) || "Đang làm việc";
  }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function collapseSpaces(value: string): string { return value.trim().replace(/\s+/gu, " "); }
function requiredText(value: unknown, label: string, max: number): string {
  const result = text(value);
  if (!result || result.length > max) throw errors.validation(`${label} là bắt buộc.`);
  return result;
}
function requiredDate(value: unknown, label: string): string {
  const result = requiredText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw errors.validation(`${label} chưa hợp lệ.`);
  }
  return result;
}
function normalizePhone(value: unknown): string {
  const raw = requiredText(value, "Số điện thoại", 40).replace(/[\s.()-]+/gu, "");
  const phone = raw.startsWith("+84") ? `0${raw.slice(3)}` : raw;
  if (!/^0(?:3|5|7|8|9)\d{8}$/u.test(phone)) throw errors.validation("SĐT phải 10 số, bắt đầu 03/05/07/08/09");
  return phone;
}
