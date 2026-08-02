import type { GeneralLedgerEntry, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { addMinor } from "../../money/src/index.js";
import { StockEntryController } from "./controllers.js";
import type { StockEntryData } from "./types.js";

interface EffectiveAccountingPolicy extends JsonObject {
  company: string;
  effective_from: string;
  effective_to?: string;
  inventory_account?: string;
  stock_adjustment_account?: string;
}

/**
 * Adds the accounting half that a physical Material Receipt/Issue must carry.
 *
 * The base StockEntryController remains authoritative for quantity, valuation and
 * reversal. This override consumes the exact stock_value_difference it produced,
 * so stock and GL cannot drift because two pieces of code recalculated value.
 *
 * Strict accounting activates only when the company has VN Accounting Policy
 * records. That keeps the shared ERP kernel backward-compatible for tenants that
 * do not install/use the Vietnamese accounting app.
 */
export class AccountingStockEntryController extends StockEntryController {
  override async normalize(context: ControllerContext<StockEntryData>): Promise<StockEntryData> {
    const data = await super.normalize(context);
    if (context.command.action !== "submit" || !isAccountingStockPurpose(data.purpose)) return data;

    const policies = await context.reader.listDocumentsByDoctype<EffectiveAccountingPolicy>(
      context.command.tenant_id,
      "VN Accounting Policy",
    );
    const companyPolicies = policies.filter((document) => document.docstatus !== 2 && document.data.company === data.company);
    if (companyPolicies.length === 0) return data;

    const postingDate = data.posting_at.slice(0, 10);
    const effective = companyPolicies.filter((document) => {
      if (document.docstatus !== 1) return false;
      const start = String(document.data.effective_from ?? "");
      const end = String(document.data.effective_to ?? "");
      return Boolean(start) && start <= postingDate && (!end || postingDate <= end);
    });
    if (effective.length !== 1) {
      throw errors.reference(`Exactly one approved VN Accounting Policy must be effective for ${data.company} on ${postingDate}`, {
        company: data.company,
        posting_date: postingDate,
        matching_policies: effective.length,
      });
    }

    const policy = effective[0]!.data;
    const stockAccount = requiredText(policy.inventory_account, "VN Accounting Policy.inventory_account");
    const differenceAccount = requiredText(policy.stock_adjustment_account, "VN Accounting Policy.stock_adjustment_account");
    await Promise.all([
      assertAccountCompany(context, stockAccount, data.company),
      assertAccountCompany(context, differenceAccount, data.company),
    ]);
    if (stockAccount === differenceAccount) throw errors.validation("Inventory and stock-adjustment accounts must be different");

    return { ...data, stock_account: stockAccount, difference_account: differenceAccount };
  }

  override ledger(context: ControllerContext<StockEntryData>, data: StockEntryData) {
    const base = super.ledger(context, data);
    if (!isAccountingStockPurpose(data.purpose) || !["submit", "cancel"].includes(context.command.action)) return base;

    const stockAccount = optionalText(data.stock_account);
    const differenceAccount = optionalText(data.difference_account);
    // Historical/non-VN Stock Entries did not persist accounting policy snapshots.
    if (!stockAccount || !differenceAccount) return base;

    const total = addMinor(
      (base.stock ?? []).map((line) => Math.abs(line.stock_value_difference_minor)),
      "Stock Entry accounting value",
    );
    if (total === 0) return base;

    const currency = requiredText(data.currency, "Stock Entry.currency");
    const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
    const receipt = data.purpose === "Material Receipt";
    const normal: GeneralLedgerEntry[] = receipt
      ? [
          { line_key: "STOCK-VALUE", account: stockAccount, debit_minor: total, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at },
          { line_key: "STOCK-OFFSET", account: differenceAccount, debit_minor: 0, credit_minor: total, currency, currency_scale: scale, posting_at: data.posting_at },
        ]
      : [
          { line_key: "STOCK-OFFSET", account: differenceAccount, debit_minor: total, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at },
          { line_key: "STOCK-VALUE", account: stockAccount, debit_minor: 0, credit_minor: total, currency, currency_scale: scale, posting_at: data.posting_at },
        ];

    return {
      ...base,
      gl: context.command.action === "cancel" ? reverseGl(normal) : normal,
    };
  }
}

function isAccountingStockPurpose(purpose: StockEntryData["purpose"]): boolean {
  return purpose === "Material Receipt" || purpose === "Material Issue";
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.reference(`${field} is required`);
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function assertAccountCompany(context: ControllerContext<StockEntryData>, account: string, company: string): Promise<void> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Account", account);
  if (!data) throw errors.reference(`Account ${account} does not exist or is disabled`);
  if (typeof data.company !== "string" || data.company !== company) {
    throw errors.reference(`Account ${account} does not belong to ${company}`);
  }
}
