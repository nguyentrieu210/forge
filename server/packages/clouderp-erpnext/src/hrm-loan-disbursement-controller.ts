import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class EmployeeLoanDisbursementController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Loan Disbursement";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const loanName = H.requiredText(input.employee_loan, "Employee Loan Disbursement employee_loan");
    const loan = await H.requireRecord(context, "Employee Loan", loanName);
    const employeeName = H.requiredText(loan.employee, `Employee Loan ${loanName} employee`);
    const companyName = H.requiredText(loan.company, `Employee Loan ${loanName} company`);
    const loanDate = H.requiredDate(loan.loan_date, `Employee Loan ${loanName} loan_date`);
    const disbursementDate = H.requiredDate(input.disbursement_date, "Employee Loan Disbursement disbursement_date");
    if (disbursementDate < loanDate) throw errors.validation("Employee Loan Disbursement date must not precede loan_date");
    const currency = H.requiredText(loan.currency, `Employee Loan ${loanName} currency`);
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = Number.isInteger(currencyData.currency_scale) ? Number(currencyData.currency_scale) : 2;
    if (scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} has invalid precision`);
    const principalMinor = toScaledInt(loan.principal_amount as string | number, scale, `Employee Loan ${loanName} principal_amount`);
    if (principalMinor <= 0) throw errors.reference(`Employee Loan ${loanName} principal_amount must be positive`);

    const paymentEntry = H.requiredText(input.payment_entry, "Employee Loan Disbursement payment_entry");
    const payment = await H.requireSubmitted(context, "Payment Entry", paymentEntry);
    if (H.text(payment.company) && H.text(payment.company) !== companyName) throw errors.reference(`Payment Entry ${paymentEntry} belongs to another company`);
    if (H.text(payment.party_type) && H.text(payment.party_type) !== "Employee") throw errors.reference(`Payment Entry ${paymentEntry} is not an Employee payment`);
    if (H.text(payment.party) && H.text(payment.party) !== employeeName) throw errors.reference(`Payment Entry ${paymentEntry} belongs to another employee`);
    const paymentCurrency = H.text(payment.currency) || H.text(payment.paid_from_account_currency) || H.text(payment.paid_to_account_currency);
    if (paymentCurrency && paymentCurrency !== currency) throw errors.reference(`Payment Entry ${paymentEntry} currency does not match Employee Loan ${loanName}`);
    const rawPaymentAmount = payment.paid_amount ?? payment.received_amount;
    if (rawPaymentAmount !== undefined && rawPaymentAmount !== null && rawPaymentAmount !== "") {
      const paymentMinor = toScaledInt(rawPaymentAmount as string | number, scale, `Payment Entry ${paymentEntry} amount`);
      if (paymentMinor !== principalMinor) throw errors.reference(`Payment Entry ${paymentEntry} amount does not equal Employee Loan ${loanName} principal`);
    }

    if (context.command.action === "submit") {
      const existing = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (existing.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1 && H.text(item.data.employee_loan) === loanName)) {
        throw errors.exists(`Employee Loan ${loanName} already has a submitted disbursement`);
      }
    }

    return {
      ...input,
      employee_loan: loanName,
      employee: employeeName,
      company: companyName,
      disbursement_date: disbursementDate,
      amount: fromScaledInt(principalMinor, scale),
      currency,
      payment_entry: paymentEntry,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Disbursed" : super.status(context, context.command.document);
  }
}
