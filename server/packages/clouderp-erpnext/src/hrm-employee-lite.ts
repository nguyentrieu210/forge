import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

const LITE_ROLE = "AlumDoor HR Lite System";

/**
 * Narrow Employee normalization used by the trusted small-workshop setup path.
 * Ordinary HR writes still require Department; only the server-stamped Lite command may
 * omit it because AlumDoor currently operates one workplace without a department tree.
 */
export class AlumDoorAwareEmployeeController {
  readonly doctype = "Employee";

  async normalize(context: { command: { actor: { roles: string[] }; aggregate: { name: string }; document: JsonObject } }): Promise<JsonObject> {
    const input = context.command.document;
    const lite = truthy(input.alu_lite_managed);
    if (lite && !context.command.actor.roles.includes(LITE_ROLE)) {
      throw errors.permission("Hồ sơ Employee HR Lite chỉ được ghi qua điều phối viên tin cậy.");
    }
    const department = text(input.department);
    if (!lite && !department) throw errors.validation("Phòng ban là bắt buộc với hồ sơ nhân viên thông thường.");
    const employeeName = required(input.employee_name, "Tên nhân viên");
    const employeeNumber = text(input.employee_number) || text(context.command.aggregate.name);
    if (!employeeNumber) throw errors.validation("Mã nhân viên là bắt buộc.");
    const company = required(input.company, "Công ty");
    const branch = required(input.branch, "Nơi làm việc");
    const dateOfJoining = required(input.date_of_joining, "Ngày vào làm");
    const mobile = required(input.mobile, "Điện thoại");
    return {
      ...input,
      employee_number: employeeNumber,
      employee_name: employeeName.replace(/\s+/gu, " "),
      company,
      branch,
      ...(department ? { department } : {}),
      date_of_joining: dateOfJoining,
      mobile,
      employee_status: text(input.employee_status) || "Đang làm việc",
      ...(lite ? { alu_lite_managed: 1 } : {}),
    };
  }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function required(value: unknown, label: string): string { const result = text(value); if (!result) throw errors.validation(`${label} là bắt buộc.`); return result; }
function truthy(value: unknown): boolean { return value === true || value === 1 || value === "1"; }
