import type { GeneralLedgerEntry, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { addMinor } from "../../money/src/index.js";
import { RolloutPurchaseReceiptController } from "./purchase-allocation-rollout-controllers.js";
import type { PurchaseReceiptData } from "./types.js";

interface EffectiveAccountingPolicy extends JsonObject {
  company: string;
  effective_from: string;
  effective_to?: string;
  inventory_account?: string;
  stock_received_but_not_billed_account?: string;
}

/**
 * Reuses the canonical receipt controller for stock/procurement and adds the
 * accounting side from the effective VN Accounting Policy.
 */
export class AccountingPurchaseReceiptController implements DocumentController<PurchaseReceiptData> {
  readonly doctype = "Purchase Receipt";
  private readonly delegate = new RolloutPurchaseReceiptController();

  async buildPlan(context: ControllerContext<PurchaseReceiptData>): Promise<MutationPlan<PurchaseReceiptData>> {
    const plan = await this.delegate.buildPlan(context);
    if (context.command.action !== "submit") return plan;

    const value = addMinor(
      plan.stock_entries.map((line) => Math.max(0, line.stock_value_difference_minor)),
      "Purchase Receipt stock value",
    );
    if (value === 0) return plan;

    const policies = await context.reader.listDocumentsByDoctype<EffectiveAccountingPolicy>(
      context.command.tenant_id,
      "VN Accounting Policy",
    );
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
        company: plan.document.data.company,
        posting_date: postingDate,
        matching_policies: effective.length,
      });
    }

    const policy = effective[0]!.data;
    const stockAccount = requiredText(policy.inventory_account, "VN Accounting Policy.inventory_account");
    const receivedNotBilled = requiredText(
      policy.stock_received_but_not_billed_account,
      "VN Accounting Policy.stock_received_but_not_billed_account",
    );
    await Promise.all([
      assertAccountCompany(context, stockAccount, plan.document.data.company),
      assertAccountCompany(context, receivedNotBilled, plan.document.data.company),
    ]);
    if (stockAccount === receivedNotBilled) throw errors.validation("Inventory and received-not-billed accounts must be different");

    const scale = typeof plan.document.data.currency_scale === "number" ? plan.document.data.currency_scale : 2;
    const currency = requiredText(plan.document.data.currency, "Purchase Receipt.currency");
    const gl: GeneralLedgerEntry[] = [];
    for (const line of plan.stock_entries) {
      const lineValue = Math.max(0, line.stock_value_difference_minor);
      if (lineValue === 0) continue;
      const key = line.line_key;
      gl.push(
        { line_key: `STOCK-${key}`, account: stockAccount, debit_minor: lineValue, credit_minor: 0, currency, currency_scale: scale, posting_at: plan.document.data.posting_at },
        { line_key: `SRBNB-${key}`, account: receivedNotBilled, debit_minor: 0, credit_minor: lineValue, currency, currency_scale: scale, posting_at: plan.document.data.posting_at },
      );
    }

    plan.document.data = {
      ...plan.document.data,
      stock_account: stockAccount,
      stock_received_but_not_billed: receivedNotBilled,
    };
    plan.gl_entries = gl;
    return plan;
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.reference(`${field} is required`);
  return value.trim();
}

async function assertAccountCompany(context: ControllerContext<PurchaseReceiptData>, account: string, company: string): Promise<void> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, "Account", account);
  if (!data) throw errors.reference(`Account ${account} does not exist or is disabled`);
  if (typeof data.company !== "string" || data.company !== company) throw errors.reference(`Account ${account} does not belong to ${company}`);
}
