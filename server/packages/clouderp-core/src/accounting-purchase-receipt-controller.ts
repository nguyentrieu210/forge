import type { GeneralLedgerEntry, JsonObject, MutationPlan, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { RolloutPurchaseReceiptController } from "./purchase-allocation-rollout-controllers.js";
import type { PurchaseReceiptData } from "./types.js";

interface EffectiveAccountingPolicy extends JsonObject {
  company: string;
  effective_from: string;
  effective_to?: string;
  accounting_currency?: string;
  inventory_account?: string;
  stock_received_but_not_billed_account?: string;
}

/** Reuses the canonical receipt controller and adds VN-policy accounting. */
export class AccountingPurchaseReceiptController implements DocumentController<PurchaseReceiptData> {
  readonly doctype = "Purchase Receipt";
  private readonly delegate = new RolloutPurchaseReceiptController();

  async buildPlan(context: ControllerContext<PurchaseReceiptData>): Promise<MutationPlan<PurchaseReceiptData>> {
    const plan = await this.delegate.buildPlan(context);

    if (context.command.action === "cancel" && context.existing) {
      const originalRevision = context.existing.version;
      const [originalGl, originalStock] = await Promise.all([
        context.reader.getVoucherGlEntries(context.command.tenant_id, this.doctype, context.command.aggregate.name, originalRevision),
        context.reader.getVoucherStockEntries(context.command.tenant_id, this.doctype, context.command.aggregate.name, originalRevision),
      ]);
      if (originalGl.length) plan.gl_entries = reverseGl(originalGl);
      if (originalStock.length) plan.stock_entries = reverseStock(originalStock);
      return plan;
    }

    if (context.command.action !== "submit") return plan;
    const transactionValue = addMinor(plan.stock_entries.map((line) => Math.max(0, line.stock_value_difference_minor)), "Purchase Receipt stock value");
    if (transactionValue === 0) return plan;

    const policies = await context.reader.listDocumentsByDoctype<EffectiveAccountingPolicy>(context.command.tenant_id, "VN Accounting Policy");
    const companyPolicies = policies.filter((document) => document.docstatus !== 2 && document.data.company === plan.document.data.company);
    if (companyPolicies.length === 0) return plan;

    const postingDate = String(plan.document.data.posting_at).slice(0, 10);
    const effective = companyPolicies.filter((document) => {
      if (document.docstatus !== 1) return false;
      const start = String(document.data.effective_from ?? "");
      const end = String(document.data.effective_to ?? "");
      return Boolean(start) && start <= postingDate && (!end || postingDate <= end);
    });
    if (effective.length !== 1) {
      throw errors.reference(`Exactly one approved VN Accounting Policy must be effective for ${plan.document.data.company} on ${postingDate}`, {
        company: plan.document.data.company, posting_date: postingDate, matching_policies: effective.length,
      });
    }

    const policy = effective[0]!.data;
    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", plan.document.data.company);
    if (!company) throw errors.reference(`Company ${plan.document.data.company} does not exist or is disabled`);
    const companyCurrency = requiredText(company.default_currency, `Company ${plan.document.data.company}.default_currency`);
    const policyCurrency = requiredText(policy.accounting_currency, "VN Accounting Policy.accounting_currency");
    if (policyCurrency !== companyCurrency) {
      throw errors.validation(`VN Accounting Policy currency ${policyCurrency} must match Company.default_currency ${companyCurrency}`);
    }
    const companyScale = await currencyScale(context, companyCurrency);
    const transactionCurrency = requiredText(plan.document.data.currency, "Purchase Receipt.currency");
    const transactionScale = typeof plan.document.data.currency_scale === "number"
      ? plan.document.data.currency_scale
      : await currencyScale(context, transactionCurrency);
    const rateMicros = transactionCurrency === companyCurrency
      ? 1_000_000
      : await resolveExchangeRate(context, transactionCurrency, companyCurrency, postingDate);

    const stockAccount = requiredText(policy.inventory_account, "VN Accounting Policy.inventory_account");
    const receivedNotBilled = requiredText(policy.stock_received_but_not_billed_account, "VN Accounting Policy.stock_received_but_not_billed_account");
    await Promise.all([
      assertAccountCompany(context, stockAccount, plan.document.data.company),
      assertAccountCompany(context, receivedNotBilled, plan.document.data.company),
    ]);
    if (stockAccount === receivedNotBilled) throw errors.validation("Inventory and received-not-billed accounts must be different");

    const baseStock: StockLedgerEntry[] = plan.stock_entries.map((line, index) => ({
      ...line,
      valuation_rate_minor: convertMinor(line.valuation_rate_minor, transactionScale, rateMicros, companyScale, `stock[${index}].valuation_rate`),
      stock_value_difference_minor: convertMinor(line.stock_value_difference_minor, transactionScale, rateMicros, companyScale, `stock[${index}].stock_value`),
      currency: companyCurrency,
      currency_scale: companyScale,
    }));
    plan.stock_entries = baseStock;

    const gl: GeneralLedgerEntry[] = [];
    for (const line of baseStock) {
      const lineValue = Math.max(0, line.stock_value_difference_minor);
      if (lineValue === 0) continue;
      gl.push(
        { line_key: `STOCK-${line.line_key}`, account: stockAccount, debit_minor: lineValue, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: plan.document.data.posting_at },
        { line_key: `SRBNB-${line.line_key}`, account: receivedNotBilled, debit_minor: 0, credit_minor: lineValue, currency: companyCurrency, currency_scale: companyScale, posting_at: plan.document.data.posting_at },
      );
    }
    plan.document.data = {
      ...plan.document.data,
      company_currency: companyCurrency,
      company_currency_scale: companyScale,
      conversion_rate: fromScaledInt(rateMicros, 6),
      conversion_rate_micros: rateMicros,
      stock_account: stockAccount,
      stock_received_but_not_billed: receivedNotBilled,
    };
    plan.gl_entries = gl;
    return plan;
  }
}

function convertMinor(amount: number, sourceScale: number, rateMicros: number, targetScale: number, field: string): number {
  return multiplyScaled(fromScaledInt(amount, sourceScale), sourceScale, fromScaledInt(rateMicros, 6), 6, targetScale, field);
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.reference(`${field} is required`);
  return value.trim();
}
async function currencyScale(context: ControllerContext<PurchaseReceiptData>, currency: string): Promise<number> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = data?.currency_scale;
  if (typeof scale !== "number" || !Number.isSafeInteger(scale) || scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} must define currency_scale from 0 to 6`);
  return scale;
}
async function resolveExchangeRate(context: ControllerContext<PurchaseReceiptData>, fromCurrency: string, toCurrency: string, postingDate: string): Promise<number> {
  for (const name of [`${fromCurrency}:${toCurrency}:${postingDate}`, `${fromCurrency}:${toCurrency}`]) {
    const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Exchange Rate", name);
    const raw = data?.rate;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const rate = toScaledInt(raw, 6, `Exchange Rate ${name}`);
    if (rate > 0) return rate;
  }
  throw errors.reference(`Exchange Rate ${fromCurrency}:${toCurrency} does not exist or is disabled`);
}
async function assertAccountCompany(context: ControllerContext<PurchaseReceiptData>, account: string, company: string): Promise<void> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Account", account);
  if (!data) throw errors.reference(`Account ${account} does not exist or is disabled`);
  if (typeof data.company !== "string" || data.company !== company) throw errors.reference(`Account ${account} does not belong to ${company}`);
}
