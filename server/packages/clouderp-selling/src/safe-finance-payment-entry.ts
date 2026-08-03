import type { GeneralLedgerEntry, JsonObject, PaymentLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { FinancePaymentEntryController } from "./finance-controllers.js";
import type { PaymentEntryData } from "./types.js";

const EMPLOYEE_PAYMENT_APPROVERS = new Set(["Chủ xưởng", "Accounts Manager", "System Manager", "Administrator"]);

/**
 * Makes creation of a customer/supplier advance an explicit operator decision.
 * It also closes the HRM contract already declared by Employee Advance: a Pay
 * Payment Entry may target an Employee when it represents an approved employee
 * advance. That branch never enters the supplier Payment Ledger because it is an
 * employee asset advance, not supplier accounts payable.
 */
export class SafeFinancePaymentEntryController extends FinancePaymentEntryController {
  override async normalize(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
    if (partyType(context.command.document) === "Employee") {
      return normalizeEmployeePayment(context);
    }

    const normalized = await super.normalize(context);
    const unallocated = normalized.unallocated_amount_minor ?? 0;
    const allowUnallocated = (context.command.document as JsonObject).allow_unallocated === true;
    if (unallocated > 0 && !allowUnallocated) {
      const allocated = (normalized.paid_amount_minor ?? 0) - unallocated;
      throw errors.validation("Unallocated payment requires explicit advance confirmation", {
        paid_minor: normalized.paid_amount_minor ?? 0,
        allocated_minor: allocated,
        unallocated_minor: unallocated,
        required_field: "allow_unallocated",
      });
    }
    return { ...normalized, allow_unallocated: allowUnallocated };
  }

  override ledger(
    context: ControllerContext<PaymentEntryData>,
    data: PaymentEntryData,
  ): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    if (partyType(data) === "Employee") return employeePaymentLedger(context, data);

    const result = super.ledger(context, data);
    const partyLineKey = data.payment_type === "Receive" ? "RECEIVABLE" : "PAYABLE";
    return {
      ...result,
      gl: result.gl.map((line) => line.line_key === "PARTY" ? { ...line, line_key: partyLineKey } : line),
    };
  }
}

async function normalizeEmployeePayment(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
  const input = context.command.document as unknown as JsonObject;
  if (input.payment_type !== "Pay") throw errors.validation("Employee Payment Entry only supports Pay");
  if (!hasApproverRole(context) && context.command.action === "submit") {
    throw errors.permission("Only Chủ xưởng may disburse an employee purchase advance");
  }

  const company = requiredText(input.company, "company");
  const employeeName = requiredText(input.party, "party");
  const paidFrom = requiredText(input.paid_from, "paid_from");
  const paidTo = requiredText(input.paid_to, "paid_to");
  const currency = requiredText(input.currency, "currency");
  const postingAt = requiredText(input.posting_at, "posting_at");
  if (paidFrom === paidTo) throw errors.validation("Employee payment bank and advance accounts must differ");
  if (Array.isArray(input.references) && input.references.length) {
    throw errors.validation("Employee advance payment must not allocate supplier/customer invoices");
  }

  const employee = await requireRecord(context, "Employee", employeeName);
  assertActiveEmployee(employee, employeeName);
  if (text(employee.company) && text(employee.company) !== company) {
    throw errors.reference("Employee payment belongs to another company");
  }
  requiredText(employee.bank_name, "Employee.bank_name");
  requiredText(employee.bank_account_no, "Employee.bank_account_no");

  const companyData = await requireRecord(context, "Company", company);
  const companyCurrency = requiredText(companyData.default_currency ?? currency, "Company.default_currency");
  if (currency !== companyCurrency) {
    throw errors.validation("Employee purchase advances must use the company currency");
  }
  const currencyData = await requireRecord(context, "Currency", currency);
  const scale = currencyScale(currencyData);
  await requireRecord(context, "Account", paidFrom);
  await requireRecord(context, "Account", paidTo);

  if (context.command.action === "submit") {
    const lockDate = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
    if (lockDate && postingAt.slice(0, 10) <= lockDate) {
      throw errors.reference(`Posting date ${postingAt.slice(0, 10)} is locked through ${lockDate}`);
    }
  }

  const paidMinor = toScaledInt(input.paid_amount as string | number, scale, "paid_amount");
  if (paidMinor <= 0) throw errors.validation("Payment amount must be positive");
  const receivedMinor = toScaledInt(input.received_amount as string | number, scale, "received_amount");
  if (receivedMinor !== paidMinor) {
    throw errors.validation("received_amount must equal paid_amount for employee advances");
  }

  return {
    ...(input as unknown as PaymentEntryData),
    payment_type: "Pay",
    party_type: "Employee" as unknown as PaymentEntryData["party_type"],
    party: employeeName,
    company,
    paid_from: paidFrom,
    paid_to: paidTo,
    currency,
    posting_at: postingAt,
    references: [],
    company_currency: currency,
    company_currency_scale: scale,
    currency_scale: scale,
    source_exchange_rate: "1",
    source_exchange_rate_micros: 1_000_000,
    paid_amount: fromScaledInt(paidMinor, scale),
    paid_amount_minor: paidMinor,
    received_amount: fromScaledInt(receivedMinor, scale),
    received_amount_minor: receivedMinor,
    base_paid_amount: fromScaledInt(paidMinor, scale),
    base_paid_amount_minor: paidMinor,
    base_party_amount: fromScaledInt(paidMinor, scale),
    base_party_amount_minor: paidMinor,
    base_payable_amount: fromScaledInt(paidMinor, scale),
    base_payable_amount_minor: paidMinor,
    unallocated_amount: "0",
    unallocated_amount_minor: 0,
    difference_amount: "0",
    difference_amount_minor: 0,
  };
}

function employeePaymentLedger(
  context: ControllerContext<PaymentEntryData>,
  data: PaymentEntryData,
): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
  if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [] };
  const scale = data.company_currency_scale ?? data.currency_scale ?? 2;
  const amount = data.received_amount_minor ?? toScaledInt(data.received_amount, scale, "received_amount");
  const currency = data.company_currency ?? data.currency;
  const normal: GeneralLedgerEntry[] = [
    {
      line_key: "EMPLOYEE-ADVANCE",
      account: data.paid_to,
      party_type: "Employee",
      party: data.party,
      debit_minor: amount,
      credit_minor: 0,
      currency,
      currency_scale: scale,
      posting_at: data.posting_at,
      ...(typeof data.note === "string" && data.note ? { remarks: data.note } : {}),
    },
    {
      line_key: "BANK",
      account: data.paid_from,
      debit_minor: 0,
      credit_minor: amount,
      currency,
      currency_scale: scale,
      posting_at: data.posting_at,
      ...(typeof data.note === "string" && data.note ? { remarks: data.note } : {}),
    },
  ];
  return { gl: context.command.action === "cancel" ? reverseGl(normal) : normal, payment: [] };
}

async function requireRecord(context: ControllerContext<PaymentEntryData>, doctype: string, name: string): Promise<JsonObject> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (document && document.docstatus !== 2) return document.data;
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, doctype, name);
  if (master) return master;
  throw errors.reference(`${doctype} ${name} does not exist`);
}

function hasApproverRole(context: ControllerContext<PaymentEntryData>): boolean {
  return context.command.actor.user_id === "Administrator"
    || context.command.actor.roles.some((role) => EMPLOYEE_PAYMENT_APPROVERS.has(role));
}

function partyType(data: JsonObject): string {
  return text(data.party_type);
}

function assertActiveEmployee(employee: JsonObject, name: string): void {
  const status = text(employee.employee_status);
  if (Boolean(employee.has_left) || status === "Nghỉ việc" || status === "Ngừng sử dụng") {
    throw errors.reference(`Employee ${name} is not active`);
  }
}

function currencyScale(data: JsonObject): number {
  const value = data.currency_scale;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6 ? value : 2;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string): string {
  const valueText = text(value);
  if (!valueText) throw errors.validation(`${field} is required`);
  return valueText;
}
