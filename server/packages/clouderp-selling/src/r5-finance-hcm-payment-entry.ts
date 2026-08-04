import type { GeneralLedgerEntry, JsonObject, PaymentLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SafeFinancePaymentEntryController } from "./safe-finance-payment-entry.js";
import type { PaymentEntryData } from "./types.js";

const EMPLOYEE_PAYMENT_APPROVERS = new Set(["Chủ xưởng", "Accounts Manager", "System Manager", "Administrator"]);

/**
 * R5 Finance/HCM boundary for employee cash movements.
 *
 * Existing Employee Pay remains the canonical employee-advance/loan-disbursement
 * GL path. This extension adds the symmetric Employee Receive path required by
 * loan repayment and prevents cancelling a Payment Entry while submitted HRM
 * evidence still consumes it.
 */
export class R5FinanceHcmPaymentEntryController extends SafeFinancePaymentEntryController {
  override async buildPlan(context: ControllerContext<PaymentEntryData>) {
    if (context.command.action === "cancel") {
      await assertNoSubmittedLoanEvidence(context);
    }
    return super.buildPlan(context);
  }

  override async normalize(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
    const input = context.command.document as unknown as JsonObject;
    if (text(input.party_type) === "Employee" && text(input.payment_type) === "Receive") {
      return normalizeEmployeeReceipt(context);
    }
    return super.normalize(context);
  }

  override ledger(
    context: ControllerContext<PaymentEntryData>,
    data: PaymentEntryData,
  ): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    if (text((data as unknown as JsonObject).party_type) === "Employee" && data.payment_type === "Receive") {
      return employeeReceiptLedger(context, data);
    }
    return super.ledger(context, data);
  }
}

async function normalizeEmployeeReceipt(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
  const input = context.command.document as unknown as JsonObject;
  if (context.command.action === "submit" && !hasApproverRole(context)) {
    throw errors.permission("Only an authorized finance approver may receive an employee repayment");
  }

  const company = requiredText(input.company, "company");
  const employeeName = requiredText(input.party, "party");
  const paidFrom = requiredText(input.paid_from, "paid_from");
  const paidTo = requiredText(input.paid_to, "paid_to");
  const currency = requiredText(input.currency, "currency");
  const postingAt = requiredText(input.posting_at, "posting_at");
  if (paidFrom === paidTo) throw errors.validation("Employee receipt bank and receivable accounts must differ");
  if (Array.isArray(input.references) && input.references.length) {
    throw errors.validation("Employee repayment receipt must not allocate supplier/customer invoices");
  }

  const employee = await requireRecord(context, "Employee", employeeName);
  assertActiveEmployee(employee, employeeName);
  if (text(employee.company) && text(employee.company) !== company) {
    throw errors.reference("Employee receipt belongs to another company");
  }

  const companyData = await requireRecord(context, "Company", company);
  const companyCurrency = requiredText(companyData.default_currency ?? currency, "Company.default_currency");
  if (currency !== companyCurrency) {
    throw errors.validation("Employee repayments must use the company currency");
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
    throw errors.validation("received_amount must equal paid_amount for employee repayments");
  }

  return {
    ...(input as unknown as PaymentEntryData),
    payment_type: "Receive",
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
    base_receivable_amount: fromScaledInt(paidMinor, scale),
    base_receivable_amount_minor: paidMinor,
    unallocated_amount: "0",
    unallocated_amount_minor: 0,
    difference_amount: "0",
    difference_amount_minor: 0,
  };
}

function employeeReceiptLedger(
  context: ControllerContext<PaymentEntryData>,
  data: PaymentEntryData,
): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
  if (context.command.action !== "submit" && context.command.action !== "cancel") return { gl: [], payment: [] };
  const scale = data.company_currency_scale ?? data.currency_scale ?? 2;
  const amount = data.received_amount_minor ?? toScaledInt(data.received_amount, scale, "received_amount");
  const currency = data.company_currency ?? data.currency;
  const normal: GeneralLedgerEntry[] = [
    {
      line_key: "BANK",
      account: data.paid_to,
      debit_minor: amount,
      credit_minor: 0,
      currency,
      currency_scale: scale,
      posting_at: data.posting_at,
    },
    {
      line_key: "EMPLOYEE-RECEIVABLE",
      account: data.paid_from,
      party_type: "Employee",
      party: data.party,
      debit_minor: 0,
      credit_minor: amount,
      currency,
      currency_scale: scale,
      posting_at: data.posting_at,
    },
  ];
  return { gl: context.command.action === "cancel" ? reverseGl(normal) : normal, payment: [] };
}

async function assertNoSubmittedLoanEvidence(context: ControllerContext<PaymentEntryData>): Promise<void> {
  const paymentName = context.command.aggregate.name;
  for (const doctype of ["Employee Loan Disbursement", "Employee Loan Repayment"] as const) {
    const documents = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, doctype);
    const dependent = documents.find((document) => document.docstatus === 1 && text(document.data.payment_entry) === paymentName);
    if (dependent) {
      throw errors.reference(`Payment Entry ${paymentName} is referenced by submitted ${doctype} ${dependent.name}; cancel that evidence first`);
    }
  }
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

function assertActiveEmployee(employee: JsonObject, name: string): void {
  const status = text(employee.employee_status);
  if (Boolean(employee.has_left) || status === "Nghỉ việc" || status === "Ngừng sử dụng") {
    throw errors.reference(`Employee ${name} is not active`);
  }
}

function currencyScale(data: JsonObject): number {
  const value = data.currency_scale;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6) return value;
  throw errors.reference("Currency must define a valid currency_scale");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}
