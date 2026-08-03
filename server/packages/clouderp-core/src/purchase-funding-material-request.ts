import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { MaterialRequestController } from "./controllers.js";
import type { MaterialRequestData } from "./types.js";

const FUNDING_METHODS = new Set(["Tiền mặt", "Tài khoản ngân hàng"]);
const APPROVER_ROLES = new Set(["Chủ xưởng", "System Manager", "Administrator"]);

interface PurchaseFundingMaterialRequestData extends MaterialRequestData {
  purchase_funding_employee?: string;
  purchase_funding_amount?: string | number;
  purchase_funding_method?: string;
  purchase_funding_bank_name?: string;
  purchase_funding_bank_last4?: string;
}

/**
 * Keeps Material Request canonical for procurement while adding the Alumdoor funding gate.
 * The extra rules activate only when a purchase-funding field is present, so ordinary
 * Material Request flows stay byte-for-byte compatible with the ERP core controller.
 */
export class PurchaseFundingMaterialRequestController extends MaterialRequestController {
  override async normalize(context: ControllerContext<MaterialRequestData>): Promise<MaterialRequestData> {
    const input = context.command.document as PurchaseFundingMaterialRequestData;
    const fundingRequested = Boolean(
      input.purchase_funding_employee
      || input.purchase_funding_method
      || input.purchase_funding_amount !== undefined,
    );
    if (!fundingRequested) return super.normalize(context);

    if (input.material_request_type !== "Purchase") {
      throw errors.validation("Purchase funding is only available for Purchase material requests");
    }

    const employeeName = requiredText(input.purchase_funding_employee, "purchase_funding_employee");
    const employee = await requireRecord(context, "Employee", employeeName);
    assertActiveEmployee(employee, employeeName);

    const employeeUser = text(employee.user_id);
    const privileged = context.command.actor.user_id === "Administrator"
      || context.command.actor.roles.some((role) => APPROVER_ROLES.has(role));
    if (!privileged && employeeUser !== context.command.actor.user_id) {
      throw errors.permission("Purchase proposal must use the Employee linked to the signed-in user");
    }

    const company = requiredText(input.company, "company");
    if (text(employee.company) && text(employee.company) !== company) {
      throw errors.reference("Purchase proposal employee belongs to another company");
    }

    const amount = Number(input.purchase_funding_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw errors.validation("purchase_funding_amount must be positive");
    }

    const method = requiredText(input.purchase_funding_method, "purchase_funding_method");
    if (!FUNDING_METHODS.has(method)) {
      throw errors.validation("purchase_funding_method must be Tiền mặt or Tài khoản ngân hàng");
    }

    let bankName = "";
    let bankLast4 = "";
    if (method === "Tài khoản ngân hàng") {
      bankName = requiredText(employee.bank_name, "Employee.bank_name");
      const bankAccount = requiredText(employee.bank_account_no, "Employee.bank_account_no");
      bankLast4 = bankAccount.slice(-4);
    }

    if (context.command.action === "submit" && !privileged) {
      throw errors.permission("Only Chủ xưởng may approve a purchase funding proposal");
    }

    const normalized = await super.normalize({
      ...context,
      command: {
        ...context.command,
        document: {
          ...input,
          requested_by: employeeName,
        },
      },
    } as ControllerContext<MaterialRequestData>);

    return {
      ...normalized,
      purchase_funding_employee: employeeName,
      purchase_funding_amount: String(amount),
      purchase_funding_method: method,
      purchase_funding_bank_name: bankName,
      purchase_funding_bank_last4: bankLast4,
    } as MaterialRequestData;
  }
}

async function requireRecord<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<JsonObject> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (document && document.docstatus !== 2) return document.data;
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, doctype, name);
  if (master) return master;
  throw errors.reference(`${doctype} ${name} does not exist`);
}

function assertActiveEmployee(employee: JsonObject, name: string): void {
  const status = text(employee.employee_status);
  if (Boolean(employee.has_left) || status === "Nghỉ việc" || status === "Ngừng sử dụng") {
    throw errors.reference(`Employee ${name} is not active`);
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string): string {
  const valueText = text(value);
  if (!valueText) throw errors.validation(`${field} is required`);
  return valueText;
}
