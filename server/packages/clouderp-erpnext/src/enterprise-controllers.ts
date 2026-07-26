import type {
  BankReconciliationEntry, CanonicalDocument, GeneralLedgerEntry, JsonObject, PaymentLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type {
  BankReconciliationData, BankReconciliationItem, BankTransactionData, EInvoiceSubmissionData,
  PayrollEntryData, SalarySlipComponentRow, SalarySlipData, SubscriptionData,
} from "./enterprise-types.js";

export class BankTransactionController extends SuiteController<BankTransactionData> {
  readonly doctype = "Bank Transaction";

  async normalize(context: ControllerContext<BankTransactionData>): Promise<BankTransactionData> {
    const input = context.command.document;
    if (!input.bank_account || !input.posting_at || !["Deposit", "Withdrawal"].includes(input.transaction_type)) {
      throw errors.validation("Bank account, posting_at and transaction type are required");
    }
    const bank = await context.reader.getMasterRecordData(context.command.tenant_id, "Bank Account", input.bank_account);
    if (!bank) throw errors.reference(`Bank Account ${input.bank_account} does not exist`);
    const company = stringField(bank.company, "Bank Account company");
    const currency = stringField(bank.currency, "Bank Account currency");
    const glAccount = stringField(bank.account, "Bank Account ledger account");
    const scale = await currencyScale(context, currency);
    const amount = toScaledInt(input.amount, scale, "amount");
    if (amount <= 0) throw errors.validation("Bank transaction amount must be positive");
    if (context.command.action === "submit") {
      await assertUnlocked(context, company, input.posting_at);
      await assertMasters(context, [["Company", company], ["Account", glAccount]]);
    }
    return {
      ...input,
      company,
      currency,
      currency_scale: scale,
      gl_account: glAccount,
      amount: fromScaledInt(amount, scale),
      amount_minor: amount,
      signed_amount_minor: input.transaction_type === "Deposit" ? amount : -amount,
    };
  }

  status(context: ControllerContext<BankTransactionData>, data: BankTransactionData): string {
    if (nextDocStatus(context.command.action) !== 1) return super.status(context, data);
    return "Unreconciled";
  }
}

export class BankReconciliationController extends SuiteController<BankReconciliationData> {
  readonly doctype = "Bank Reconciliation";

  async normalize(context: ControllerContext<BankReconciliationData>): Promise<BankReconciliationData> {
    const input = context.command.document;
    if (!input.bank_account || !input.posting_at || !Array.isArray(input.entries) || input.entries.length === 0) {
      throw errors.validation("Bank account, posting_at and reconciliation entries are required");
    }
    const bank = await context.reader.getMasterRecordData(context.command.tenant_id, "Bank Account", input.bank_account);
    if (!bank) throw errors.reference(`Bank Account ${input.bank_account} does not exist`);
    const company = stringField(bank.company, "Bank Account company");
    const currency = stringField(bank.currency, "Bank Account currency");
    const scale = await currencyScale(context, currency);
    const entries: BankReconciliationItem[] = [];
    let total = 0;
    const pending = new Map<string, number>();
    for (const [index, raw] of input.entries.entries()) {
      if (!raw.bank_transaction || !raw.voucher_type || !raw.voucher_no) {
        throw errors.validation(`Bank transaction and voucher are required at row ${index + 1}`);
      }
      const bankTransaction = await requireSubmitted<BankTransactionData>(context, "Bank Transaction", raw.bank_transaction);
      if (bankTransaction.data.bank_account !== input.bank_account || bankTransaction.data.currency !== currency) {
        throw errors.reference(`Bank Transaction ${raw.bank_transaction} belongs to another bank account or currency`);
      }
      const voucher = await requireSubmitted<JsonObject>(context, raw.voucher_type, raw.voucher_no);
      if (typeof voucher.data.company === "string" && voucher.data.company !== company) {
        throw errors.reference(`Voucher ${raw.voucher_type} ${raw.voucher_no} belongs to another company`);
      }
      const amount = toScaledInt(raw.amount, scale, `entries[${index}].amount`);
      if (amount <= 0) throw errors.validation(`Reconciled amount must be positive at row ${index + 1}`);
      const maximum = bankTransaction.data.amount_minor ?? toScaledInt(bankTransaction.data.amount, scale, "bank transaction amount");
      const existing = await context.reader.getBankReconciledMinor(context.command.tenant_id, raw.bank_transaction);
      const next = existing + (pending.get(raw.bank_transaction) ?? 0) + amount;
      if (context.command.action === "submit" && next > maximum) throw errors.reference(`Reconciliation exceeds Bank Transaction ${raw.bank_transaction}`);
      pending.set(raw.bank_transaction, (pending.get(raw.bank_transaction) ?? 0) + amount);
      total = safeAdd(total, amount);
      entries.push({ ...raw, row_id: raw.row_id || `ROW-${index + 1}`, amount: fromScaledInt(amount, scale), amount_minor: amount });
    }
    if (context.command.action === "submit") await assertUnlocked(context, company, input.posting_at);
    return { ...input, company, currency, currency_scale: scale, entries, total_reconciled: fromScaledInt(total, scale), total_reconciled_minor: total };
  }

  async ledgers(context: ControllerContext<BankReconciliationData>, data: BankReconciliationData) {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    const direction = context.command.action === "cancel" ? -1 : 1;
    const entries: BankReconciliationEntry[] = data.entries.map((row, index) => ({
      line_key: `${direction < 0 ? "REV-" : ""}MATCH-${row.row_id || index + 1}`,
      bank_account: data.bank_account,
      bank_transaction: row.bank_transaction,
      voucher_type: row.voucher_type,
      voucher_no: row.voucher_no,
      amount_minor: direction * (row.amount_minor ?? 0),
      currency: data.currency ?? "USD",
      currency_scale: data.currency_scale ?? 2,
      posting_at: data.posting_at,
    }));
    return { bankReconciliation: entries };
  }

  status(context: ControllerContext<BankReconciliationData>, data: BankReconciliationData): string {
    return nextDocStatus(context.command.action) === 1 ? "Reconciled" : super.status(context, data);
  }
}

export class SalarySlipController extends SuiteController<SalarySlipData> {
  readonly doctype = "Salary Slip";

  async normalize(context: ControllerContext<SalarySlipData>): Promise<SalarySlipData> {
    const input = context.command.document;
    if (!input.employee || !input.company || !input.posting_at || !input.start_date || !input.end_date || !input.payroll_payable_account || !Array.isArray(input.earnings) || input.earnings.length === 0) {
      throw errors.validation("Employee, company, payroll dates, payable account and earnings are required");
    }
    if (input.end_date < input.start_date) throw errors.validation("Salary Slip end_date must not precede start_date");
    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
    const currency = stringField(company?.default_currency, `Company ${input.company} default currency`);
    const scale = await currencyScale(context, currency);
    const earnings = await normalizeSalaryRows(context, input.earnings, "Earning", scale, "earnings");
    const deductions = await normalizeSalaryRows(context, input.deductions ?? [], "Deduction", scale, "deductions");
    const gross = earnings.reduce((sum, row) => safeAdd(sum, row.amount_minor ?? 0), 0);
    const deduction = deductions.reduce((sum, row) => safeAdd(sum, row.amount_minor ?? 0), 0);
    const net = gross - deduction;
    if (net < 0) throw errors.validation("Salary deductions cannot exceed earnings");
    if (context.command.action === "submit") {
      await assertUnlocked(context, input.company, input.posting_at);
      await assertMasters(context, [["Company", input.company], ["Employee", input.employee], ["Account", input.payroll_payable_account],
        ...earnings.map((row): [string, string] => ["Account", row.account!]),
        ...deductions.map((row): [string, string] => ["Account", row.account!])]);
    }
    return {
      ...input,
      currency,
      currency_scale: scale,
      earnings,
      deductions,
      gross_pay: fromScaledInt(gross, scale), gross_pay_minor: gross,
      total_deduction: fromScaledInt(deduction, scale), total_deduction_minor: deduction,
      net_pay: fromScaledInt(net, scale), net_pay_minor: net,
    };
  }

  async ledgers(context: ControllerContext<SalarySlipData>, data: SalarySlipData) {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    await assertUnlocked(context, data.company, data.posting_at);
    const currency = data.currency ?? "USD";
    const scale = data.currency_scale ?? 2;
    const gl: GeneralLedgerEntry[] = [];
    for (const [index, row] of data.earnings.entries()) {
      gl.push({ line_key: `EARNING-${row.row_id || index + 1}`, account: row.account!, debit_minor: row.amount_minor ?? 0, credit_minor: 0, currency, currency_scale: scale, ...(row.cost_center ? { cost_center: row.cost_center } : {}), posting_at: data.posting_at });
    }
    for (const [index, row] of (data.deductions ?? []).entries()) {
      gl.push({ line_key: `DEDUCTION-${row.row_id || index + 1}`, account: row.account!, debit_minor: 0, credit_minor: row.amount_minor ?? 0, currency, currency_scale: scale, ...(row.cost_center ? { cost_center: row.cost_center } : {}), posting_at: data.posting_at });
    }
    gl.push({ line_key: "PAYROLL-PAYABLE", account: data.payroll_payable_account, party_type: "Employee", party: data.employee, debit_minor: 0, credit_minor: data.net_pay_minor ?? 0, currency, currency_scale: scale, posting_at: data.posting_at });
    const payment: PaymentLedgerEntry[] = [{ line_key: "PAYROLL-PAYABLE", account_type: "Payable", party_type: "Employee", party: data.employee, account: data.payroll_payable_account, amount_minor: data.net_pay_minor ?? 0, base_amount_minor: data.net_pay_minor ?? 0, currency, currency_scale: scale, against_voucher_type: "Salary Slip", against_voucher_no: context.command.aggregate.name, posting_at: data.posting_at }];
    return context.command.action === "cancel" ? { gl: reverseGl(gl), payment: reversePayment(payment) } : { gl, payment };
  }

  status(context: ControllerContext<SalarySlipData>, data: SalarySlipData): string {
    return nextDocStatus(context.command.action) === 1 ? "Unpaid" : super.status(context, data);
  }
}

export class PayrollEntryController extends SuiteController<PayrollEntryData> {
  readonly doctype = "Payroll Entry";

  async normalize(context: ControllerContext<PayrollEntryData>): Promise<PayrollEntryData> {
    const input = context.command.document;
    if (!input.company || !input.posting_at || !input.start_date || !input.end_date || !Array.isArray(input.salary_slips) || input.salary_slips.length === 0) {
      throw errors.validation("Company, payroll dates and Salary Slips are required");
    }
    if (input.end_date < input.start_date) throw errors.validation("Payroll end_date must not precede start_date");
    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
    const currency = stringField(company?.default_currency, `Company ${input.company} default currency`);
    const scale = await currencyScale(context, currency);
    const seen = new Set<string>();
    let total = 0;
    const slips: PayrollEntryData["salary_slips"] = [];
    for (const [index, raw] of input.salary_slips.entries()) {
      if (!raw.salary_slip || seen.has(raw.salary_slip)) throw errors.validation(`Salary Slip must be unique at row ${index + 1}`);
      seen.add(raw.salary_slip);
      const slip = await requireSubmitted<SalarySlipData>(context, "Salary Slip", raw.salary_slip);
      if (slip.data.company !== input.company || slip.data.start_date < input.start_date || slip.data.end_date > input.end_date) {
        throw errors.reference(`Salary Slip ${raw.salary_slip} does not belong to this payroll period/company`);
      }
      const net = slip.data.net_pay_minor ?? toScaledInt(slip.data.net_pay ?? 0, scale, "Salary Slip net pay");
      total = safeAdd(total, net);
      slips.push({ row_id: raw.row_id || `ROW-${index + 1}`, salary_slip: raw.salary_slip, employee: slip.data.employee, net_pay_minor: net });
    }
    if (context.command.action === "submit") await assertUnlocked(context, input.company, input.posting_at);
    return { ...input, salary_slips: slips, employee_count: slips.length, total_net_pay_minor: total, total_net_pay: fromScaledInt(total, scale), currency, currency_scale: scale };
  }

  status(context: ControllerContext<PayrollEntryData>, data: PayrollEntryData): string {
    return nextDocStatus(context.command.action) === 1 ? "Processed" : super.status(context, data);
  }
}

export class SubscriptionController extends SuiteController<SubscriptionData> {
  readonly doctype = "Subscription";

  async normalize(context: ControllerContext<SubscriptionData>): Promise<SubscriptionData> {
    const input = context.command.document;
    if (!input.customer || !input.company || !input.subscription_plan || !input.start_date) {
      throw errors.validation("Customer, company, Subscription Plan and start_date are required");
    }
    const plan = await context.reader.getMasterRecordData(context.command.tenant_id, "Subscription Plan", input.subscription_plan);
    if (!plan) throw errors.reference(`Subscription Plan ${input.subscription_plan} does not exist`);
    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
    const currency = typeof plan.currency === "string" ? plan.currency : stringField(company?.default_currency, `Company ${input.company} default currency`);
    const scale = await currencyScale(context, currency);
    const interval = numberField(plan.interval_months, input.frequency === "Quarterly" ? 3 : input.frequency === "Yearly" ? 12 : 1, "Subscription Plan interval");
    if (interval < 1 || interval > 120) throw errors.validation("Subscription interval must be between 1 and 120 months");
    const itemCode = stringField(plan.item_code, "Subscription Plan item");
    const qty = toScaledInt(input.qty ?? 1, 6, "qty");
    const rate = toScaledInt(plan.rate as string | number, scale, "Subscription Plan rate");
    if (qty <= 0 || rate < 0) throw errors.validation("Subscription quantity and rate are invalid");
    const amount = multiplyMinor(qty, rate);
    const nextInvoice = addMonths(input.start_date, interval);
    if (input.end_date && input.end_date < input.start_date) throw errors.validation("Subscription end_date must not precede start_date");
    if (context.command.action === "submit") await assertMasters(context, [["Customer", input.customer], ["Company", input.company], ["Item", itemCode]]);
    return { ...input, frequency: interval === 12 ? "Yearly" : interval === 3 ? "Quarterly" : "Monthly", interval_months: interval, item_code: itemCode, qty: fromScaledInt(qty, 6), qty_micros: qty, rate: fromScaledInt(rate, scale), rate_minor: rate, amount: fromScaledInt(amount, scale), amount_minor: amount, currency, currency_scale: scale, next_invoice_date: nextInvoice };
  }

  status(context: ControllerContext<SubscriptionData>, data: SubscriptionData): string {
    return nextDocStatus(context.command.action) === 1 ? "Active" : super.status(context, data);
  }
}

export class EInvoiceSubmissionController extends SuiteController<EInvoiceSubmissionData> {
  readonly doctype = "E-Invoice Submission";

  async normalize(context: ControllerContext<EInvoiceSubmissionData>): Promise<EInvoiceSubmissionData> {
    const input = context.command.document;
    if (!["Sales Invoice", "Credit Note"].includes(input.source_doctype) || !input.source_name || !input.regional_profile || !input.posting_at) {
      throw errors.validation("A supported source invoice, Regional Profile and posting_at are required");
    }
    const source = await requireSubmitted<JsonObject>(context, input.source_doctype, input.source_name);
    const profile = await context.reader.getMasterRecordData(context.command.tenant_id, "Regional Profile", input.regional_profile);
    if (!profile) throw errors.reference(`Regional Profile ${input.regional_profile} does not exist`);
    const provider = stringField(profile.provider, "Regional Profile provider");
    const company = stringField(source.data.company, "Source invoice company");
    if (typeof profile.company === "string" && profile.company !== company) throw errors.reference("Regional Profile belongs to another company");
    const requestedStatus = input.submission_status;
    if (requestedStatus && requestedStatus !== "Queued" && !context.command.actor.roles.some((role) => ["System Manager", "Accounts Manager"].includes(role))) {
      throw errors.permission("Only an accounting manager may update e-invoice provider status");
    }
    return { ...input, company, source_version: source.version, provider, submission_status: requestedStatus ?? "Queued" };
  }

  status(context: ControllerContext<EInvoiceSubmissionData>, data: EInvoiceSubmissionData): string {
    if (nextDocStatus(context.command.action) === 2) return "Cancelled";
    return String(data.submission_status ?? (nextDocStatus(context.command.action) === 1 ? "Queued" : "Draft"));
  }
}

async function normalizeSalaryRows(context: ControllerContext<SalarySlipData>, rows: SalarySlipComponentRow[], expectedType: "Earning" | "Deduction", scale: number, field: string): Promise<SalarySlipComponentRow[]> {
  const result: SalarySlipComponentRow[] = [];
  for (const [index, raw] of rows.entries()) {
    if (!raw.salary_component) throw errors.validation(`Salary Component is required at ${field}[${index}]`);
    const component = await context.reader.getMasterRecordData(context.command.tenant_id, "Salary Component", raw.salary_component);
    if (!component || component.type !== expectedType) throw errors.reference(`Salary Component ${raw.salary_component} is not a valid ${expectedType}`);
    const account = stringField(component.account, `Salary Component ${raw.salary_component} account`);
    const amount = toScaledInt(raw.amount, scale, `${field}[${index}].amount`);
    if (amount < 0) throw errors.validation(`Salary amount cannot be negative at ${field}[${index}]`);
    result.push({ ...raw, row_id: raw.row_id || `ROW-${index + 1}`, account, amount: fromScaledInt(amount, scale), amount_minor: amount });
  }
  return result;
}

async function requireSubmitted<T extends JsonObject>(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

async function assertMasters(context: ControllerContext<JsonObject>, records: Array<[string, string]>): Promise<void> {
  for (const [type, name] of new Map(records.map((record) => [`${record[0]}:${record[1]}`, record])).values()) {
    if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) throw errors.reference(`${type} ${name} does not exist or is disabled`);
  }
}

async function assertUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`, { lock_date: lock });
}

async function currencyScale(context: ControllerContext<JsonObject>, currency: string): Promise<number> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = typeof data?.currency_scale === "number" ? data.currency_scale : 2;
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} has invalid precision`);
  return scale;
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.reference(`${field} is required`);
  return value.trim();
}

function numberField(value: unknown, fallback: number, field: string): number {
  const result = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} must be an integer`);
  return result;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Arithmetic exceeds safe integer bounds");
  return value;
}

function multiplyMinor(qtyMicros: number, rateMinor: number): number {
  const value = (BigInt(qtyMicros) * BigInt(rateMinor) + 500_000n) / 1_000_000n;
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw errors.validation("Subscription amount exceeds safe integer bounds");
  return result;
}

function addMonths(dateText: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) throw errors.validation("Subscription dates must use YYYY-MM-DD");
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear().toString().padStart(4, "0")}-${(first.getUTCMonth() + 1).toString().padStart(2, "0")}-${Math.min(day, lastDay).toString().padStart(2, "0")}`;
}
