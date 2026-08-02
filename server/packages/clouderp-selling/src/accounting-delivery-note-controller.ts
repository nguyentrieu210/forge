import type { GeneralLedgerEntry, JsonObject, MutationPlan, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import { DeliveryNoteController } from "./controllers.js";
import type { DeliveryNoteData } from "./types.js";

interface EffectiveAccountingPolicy extends JsonObject {
  company: string;
  effective_from: string;
  effective_to?: string;
  accounting_currency?: string;
  inventory_account?: string;
  cogs_account?: string;
  stock_adjustment_account?: string;
}

/** Makes stock valuation and COGS use one company-currency accounting policy. */
export class AccountingDeliveryNoteController implements DocumentController<DeliveryNoteData> {
  readonly doctype = "Delivery Note";
  private readonly delegate = new DeliveryNoteController();

  async buildPlan(context: ControllerContext<DeliveryNoteData>): Promise<MutationPlan<DeliveryNoteData>> {
    const plan = await this.delegate.buildPlan(context);
    if (context.command.action !== "submit") return plan;
    if (!plan.stock_entries.some((line) => line.stock_value_difference_minor !== 0)) return plan;

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
    if (policyCurrency !== companyCurrency) throw errors.validation(`VN Accounting Policy currency ${policyCurrency} must match Company.default_currency ${companyCurrency}`);
    const companyScale = await currencyScale(context, companyCurrency);

    const stockAccount = requiredText(policy.inventory_account, "VN Accounting Policy.inventory_account");
    const expenseAccount = plan.document.data.issue_purpose === "Bán hàng"
      ? requiredText(policy.cogs_account, "VN Accounting Policy.cogs_account")
      : requiredText(policy.stock_adjustment_account, "VN Accounting Policy.stock_adjustment_account");
    await Promise.all([
      assertAccountCompany(context, stockAccount, plan.document.data.company),
      assertAccountCompany(context, expenseAccount, plan.document.data.company),
    ]);
    if (stockAccount === expenseAccount) throw errors.validation("Inventory and issue expense accounts must be different");

    for (const item of plan.document.data.items) {
      const history = await context.reader.getStockLedgerHistory(
        context.command.tenant_id,
        item.item_code,
        item.warehouse!,
        plan.document.data.posting_at,
        item.batch_no,
      );
      const mismatched = history.find((line) => line.currency !== companyCurrency || line.currency_scale !== companyScale);
      if (mismatched) {
        throw errors.validation(`Stock valuation currency for ${item.item_code} in ${item.warehouse} must be ${companyCurrency}`, {
          found_currency: mismatched.currency,
          found_scale: mismatched.currency_scale,
          expected_currency: companyCurrency,
          expected_scale: companyScale,
        });
      }
    }

    const stock: StockLedgerEntry[] = plan.stock_entries.map((line) => ({ ...line, currency: companyCurrency, currency_scale: companyScale }));
    plan.stock_entries = stock;
    const gl: GeneralLedgerEntry[] = [];
    for (const line of stock) {
      const value = Math.abs(line.stock_value_difference_minor);
      if (value === 0) continue;
      gl.push(
        { line_key: `ISSUE-${line.line_key}`, account: expenseAccount, debit_minor: value, credit_minor: 0, currency: companyCurrency, currency_scale: companyScale, posting_at: line.posting_at },
        { line_key: `STOCK-${line.line_key}`, account: stockAccount, debit_minor: 0, credit_minor: value, currency: companyCurrency, currency_scale: companyScale, posting_at: line.posting_at },
      );
    }
    plan.gl_entries = gl;
    plan.document.data = {
      ...plan.document.data,
      company_currency: companyCurrency,
      company_currency_scale: companyScale,
      stock_currency: companyCurrency,
      inventory_account: stockAccount,
      issue_expense_account: expenseAccount,
      items: plan.document.data.items.map((item) => ({
        ...item,
        ...(typeof item.valuation_rate_minor === "number" ? { valuation_rate: fromScaledInt(item.valuation_rate_minor, companyScale) } : {}),
      })),
    };
    return plan;
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.reference(`${field} is required`);
  return value.trim();
}
async function currencyScale(context: ControllerContext<DeliveryNoteData>, currency: string): Promise<number> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = data?.currency_scale;
  if (typeof scale !== "number" || !Number.isSafeInteger(scale) || scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} must define currency_scale from 0 to 6`);
  return scale;
}
async function assertAccountCompany(context: ControllerContext<DeliveryNoteData>, account: string, company: string): Promise<void> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Account", account);
  if (!data) throw errors.reference(`Account ${account} does not exist or is disabled`);
  if (typeof data.company !== "string" || data.company !== company) throw errors.reference(`Account ${account} does not belong to ${company}`);
}
