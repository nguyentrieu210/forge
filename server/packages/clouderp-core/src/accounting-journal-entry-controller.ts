import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { JournalEntryController } from "./controllers.js";
import type { JournalEntryData, JournalEntryLine } from "./types.js";

/** Journal Entry with first-class account-currency snapshots. */
export class AccountingJournalEntryController extends JournalEntryController {
  override async normalize(context: ControllerContext<JournalEntryData>): Promise<JournalEntryData> {
    const input = context.command.document;
    if (!input.company || !input.posting_at) throw errors.validation("Company and posting_at are required");
    if (!Array.isArray(input.accounts) || input.accounts.length < 2) throw errors.validation("Journal Entry requires at least two account rows");

    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
    if (!company) throw errors.reference(`Company ${input.company} does not exist or is disabled`);
    const companyCurrency = requiredText(company.default_currency, `Company ${input.company}.default_currency`);
    const companyScale = await currencyScale(context, companyCurrency);
    const postingDate = input.posting_at.slice(0, 10);

    const lines: JournalEntryLine[] = [];
    for (const [index, source] of input.accounts.entries()) {
      if (!source.account) throw errors.validation(`Account is required at row ${index + 1}`);
      const account = await context.reader.getMasterRecordData(context.command.tenant_id, "Account", source.account);
      if (!account) throw errors.reference(`Account ${source.account} does not exist or is disabled`);
      if (typeof account.company === "string" && account.company && account.company !== input.company) {
        throw errors.reference(`Account ${source.account} does not belong to ${input.company}`);
      }

      const accountCurrency = typeof account.account_currency === "string" && account.account_currency.trim()
        ? account.account_currency.trim()
        : companyCurrency;
      const accountScale = await currencyScale(context, accountCurrency);
      const rateMicros = accountCurrency === companyCurrency
        ? 1_000_000
        : await resolveExchangeRate(context, accountCurrency, companyCurrency, postingDate);
      const hasAccountCurrencyInput = source.debit_in_account_currency !== undefined || source.credit_in_account_currency !== undefined;
      let accountDebitMinor: number;
      let accountCreditMinor: number;
      let debitMinor: number;
      let creditMinor: number;

      if (hasAccountCurrencyInput) {
        accountDebitMinor = toScaledInt(source.debit_in_account_currency ?? 0, accountScale, `accounts[${index}].debit_in_account_currency`);
        accountCreditMinor = toScaledInt(source.credit_in_account_currency ?? 0, accountScale, `accounts[${index}].credit_in_account_currency`);
        assertOneSide(accountDebitMinor, accountCreditMinor, index);
        debitMinor = accountDebitMinor > 0 ? convertToCompany(accountDebitMinor, accountScale, rateMicros, companyScale, index, "debit") : 0;
        creditMinor = accountCreditMinor > 0 ? convertToCompany(accountCreditMinor, accountScale, rateMicros, companyScale, index, "credit") : 0;
      } else {
        if (accountCurrency !== companyCurrency) throw errors.validation(`Account-currency amount is required at row ${index + 1} for ${accountCurrency}`);
        debitMinor = toScaledInt(source.debit ?? 0, companyScale, `accounts[${index}].debit`);
        creditMinor = toScaledInt(source.credit ?? 0, companyScale, `accounts[${index}].credit`);
        assertOneSide(debitMinor, creditMinor, index);
        accountDebitMinor = debitMinor;
        accountCreditMinor = creditMinor;
      }

      lines.push({
        ...source,
        row_id: source.row_id || `ROW-${index + 1}`,
        account_currency: accountCurrency,
        account_currency_scale: accountScale,
        exchange_rate: fromScaledInt(rateMicros, 6),
        exchange_rate_micros: rateMicros,
        debit_in_account_currency: fromScaledInt(accountDebitMinor, accountScale),
        credit_in_account_currency: fromScaledInt(accountCreditMinor, accountScale),
        debit_in_account_currency_minor: accountDebitMinor,
        credit_in_account_currency_minor: accountCreditMinor,
        debit: fromScaledInt(debitMinor, companyScale),
        credit: fromScaledInt(creditMinor, companyScale),
        debit_minor: debitMinor,
        credit_minor: creditMinor,
      });
    }

    const debit = addMinor(lines.map((line) => line.debit_minor ?? 0), "Journal Entry total debit");
    const credit = addMinor(lines.map((line) => line.credit_minor ?? 0), "Journal Entry total credit");
    if (debit <= 0 || debit !== credit) throw errors.validation("Journal Entry debits and credits must be equal and positive", { total_debit_minor: debit, total_credit_minor: credit });

    if (context.command.action === "submit") {
      const policies = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "VN Accounting Policy");
      const usesVnPeriod = policies.some((document) => document.docstatus === 1 && document.data.company === input.company);
      if (!usesVnPeriod) {
        const legacyLock = await context.reader.getPeriodLockDate(context.command.tenant_id, input.company);
        if (legacyLock && postingDate <= legacyLock) throw errors.validation(`Posting date ${postingDate} is locked for ${input.company}`);
      }
    }

    return {
      ...input,
      company_currency: companyCurrency,
      company_currency_scale: companyScale,
      accounts: lines,
      total_debit_minor: debit,
      total_credit_minor: credit,
      total_debit: fromScaledInt(debit, companyScale),
      total_credit: fromScaledInt(credit, companyScale),
    };
  }
}

function assertOneSide(debit: number, credit: number, index: number): void {
  if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) throw errors.validation(`Row ${index + 1} must contain either debit or credit`);
}
function convertToCompany(amountMinor: number, accountScale: number, rateMicros: number, companyScale: number, index: number, side: string): number {
  return multiplyScaled(fromScaledInt(amountMinor, accountScale), accountScale, fromScaledInt(rateMicros, 6), 6, companyScale, `accounts[${index}].${side}_base`);
}
async function currencyScale<T extends JsonObject>(context: ControllerContext<T>, currency: string): Promise<number> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  if (!data) throw errors.reference(`Currency ${currency} does not exist or is disabled`);
  const scale = data.currency_scale;
  if (typeof scale !== "number" || !Number.isSafeInteger(scale) || scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} must define currency_scale from 0 to 6`);
  return scale;
}
async function resolveExchangeRate<T extends JsonObject>(context: ControllerContext<T>, fromCurrency: string, toCurrency: string, postingDate: string): Promise<number> {
  for (const name of [`${fromCurrency}:${toCurrency}:${postingDate}`, `${fromCurrency}:${toCurrency}`]) {
    const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    const raw = data?.rate;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const rate = toScaledInt(raw, 6, `Exchange Rate ${name}`);
    if (rate <= 0) throw errors.reference(`Exchange Rate ${name} must be positive`);
    return rate;
  }
  throw errors.reference(`Exchange Rate ${fromCurrency}:${toCurrency} does not exist or is disabled`);
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.reference(`${field} is required`);
  return value.trim();
}
