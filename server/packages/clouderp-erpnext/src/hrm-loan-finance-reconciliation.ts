import type { JsonObject } from "../../contracts/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { EmployeeLoanDisbursementController } from "./hrm-loan-disbursement-controller.js";
import { EmployeeLoanRepaymentController } from "./hrm-workforce-finance-controllers.js";

/**
 * Cross-domain reconciliation guard for Employee Loan disbursement evidence.
 * HRM remains the loan authority; Payment Entry remains the cash/GL authority.
 */
export class ReconciledEmployeeLoanDisbursementController extends EmployeeLoanDisbursementController {
  override async normalize(context: ControllerContext<JsonObject>): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const paymentName = requiredText(normalized.payment_entry, "Employee Loan Disbursement payment_entry");
    const payment = await requireSubmittedPayment(context, paymentName);
    if (text(payment.payment_type) !== "Pay") {
      throw errors.reference(`Payment Entry ${paymentName} must be a Pay payment for Employee Loan Disbursement`);
    }

    const loanName = requiredText(normalized.employee_loan, "Employee Loan Disbursement employee_loan");
    const receivableAccount = await loanReceivableAccount(context, loanName);
    if (text(payment.paid_to) !== receivableAccount) {
      throw errors.reference(`Payment Entry ${paymentName} must debit Employee Loan receivable account ${receivableAccount}`);
    }
    await assertPaymentEvidenceUnique(context, paymentName, context.command.aggregate.name);
    return normalized;
  }
}

/**
 * Cross-domain reconciliation guard for manual Employee Loan repayments.
 * The repayment document may only consume one submitted employee receipt that
 * matches direction, amount, currency and the exact loan receivable account.
 */
export class ReconciledEmployeeLoanRepaymentController extends EmployeeLoanRepaymentController {
  override async normalize(context: ControllerContext<JsonObject>): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const paymentName = requiredText(normalized.payment_entry, "Employee Loan Repayment payment_entry");
    const payment = await requireSubmittedPayment(context, paymentName);
    if (text(payment.payment_type) !== "Receive") {
      throw errors.reference(`Payment Entry ${paymentName} must be a Receive payment for Employee Loan Repayment`);
    }

    const currency = requiredText(normalized.currency, "Employee Loan Repayment currency");
    const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const scale = currencyScale(currencyData, currency);
    const paymentCurrency = text(payment.currency) || text(payment.paid_from_account_currency) || text(payment.paid_to_account_currency);
    if (paymentCurrency && paymentCurrency !== currency) {
      throw errors.reference(`Payment Entry ${paymentName} currency does not match Employee Loan Repayment`);
    }
    const repaymentMinor = toScaledInt(normalized.amount as string | number, scale, "Employee Loan Repayment amount");
    const rawPaymentAmount = payment.received_amount ?? payment.paid_amount;
    if (rawPaymentAmount === undefined || rawPaymentAmount === null || rawPaymentAmount === "") {
      throw errors.reference(`Payment Entry ${paymentName} must contain an authoritative received amount`);
    }
    const paymentMinor = toScaledInt(rawPaymentAmount as string | number, scale, `Payment Entry ${paymentName} amount`);
    if (paymentMinor !== repaymentMinor) {
      throw errors.reference(`Payment Entry ${paymentName} amount does not equal Employee Loan Repayment amount`);
    }

    const loanName = requiredText(normalized.employee_loan, "Employee Loan Repayment employee_loan");
    const receivableAccount = await loanReceivableAccount(context, loanName);
    if (text(payment.paid_from) !== receivableAccount) {
      throw errors.reference(`Payment Entry ${paymentName} must credit Employee Loan receivable account ${receivableAccount}`);
    }
    await assertPaymentEvidenceUnique(context, paymentName, context.command.aggregate.name);
    return normalized;
  }
}

async function requireSubmittedPayment(context: ControllerContext<JsonObject>, paymentName: string): Promise<JsonObject> {
  const paymentDocument = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Payment Entry", paymentName);
  if (!paymentDocument || paymentDocument.docstatus !== 1) {
    throw errors.reference(`Payment Entry ${paymentName} must be submitted`);
  }
  return paymentDocument.data;
}

async function loanReceivableAccount(context: ControllerContext<JsonObject>, loanName: string): Promise<string> {
  const loan = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Employee Loan", loanName);
  if (!loan || loan.docstatus === 2) throw errors.reference(`Employee Loan ${loanName} does not exist or is cancelled`);
  const componentName = requiredText(loan.data.salary_component, `Employee Loan ${loanName} salary_component`);
  const component = await context.reader.getMasterRecordData(context.command.tenant_id, "Salary Component", componentName)
    ?? (await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Salary Component", componentName))?.data
    ?? null;
  return requiredText(component?.account, `Salary Component ${componentName} account`);
}

async function assertPaymentEvidenceUnique(
  context: ControllerContext<JsonObject>,
  paymentName: string,
  currentEvidenceName: string,
): Promise<void> {
  if (context.command.action !== "submit") return;
  for (const doctype of ["Employee Loan Disbursement", "Employee Loan Repayment"] as const) {
    const documents = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, doctype);
    const duplicate = documents.find((document) => document.docstatus === 1
      && document.name !== currentEvidenceName
      && text(document.data.payment_entry) === paymentName);
    if (duplicate) {
      throw errors.reference(`Payment Entry ${paymentName} is already consumed by submitted ${doctype} ${duplicate.name}`);
    }
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}

function currencyScale(data: JsonObject | null, currency: string): number {
  const value = data?.currency_scale;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6) return value;
  throw errors.reference(`Currency ${currency} must define currency_scale`);
}
