import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled } from "../../money/src/index.js";
import { calculateSalesTotals } from "./totals.js";
import type { SalesOrderData, TaxRow } from "./types.js";
import {
  SalesOrderController as CoreSalesOrderController,
  DeliveryNoteController,
  SalesInvoiceController,
  PaymentEntryController,
} from "./controllers-core.js";

export { DeliveryNoteController, SalesInvoiceController, PaymentEntryController };

function hasAccount(row: TaxRow): boolean {
  return Boolean(String((row as TaxRow & { account?: unknown }).account ?? "").trim());
}

function convertMinor(
  amountMinor: number,
  sourceScale: number,
  rateMicros: number,
  targetScale: number,
  field: string,
): number {
  return multiplyScaled(
    fromScaledInt(amountMinor, sourceScale), sourceScale,
    fromScaledInt(rateMicros, 6), 6,
    targetScale,
    field,
  );
}

/**
 * Alumdoor can operate Sales Order + stock + production without installing accounting.
 * VAT on a Sales Order is therefore a commercial amount, not a ledger instruction.
 *
 * We still execute the canonical submit normalization first with any account-less commercial
 * tax rows removed, so Company/Customer/Currency/Item/price-list validation stays authoritative.
 * We then recompute the exact totals with every commercial tax row and persist those totals.
 * Sales Invoice is deliberately re-exported unchanged from controllers-core.ts and still requires
 * real tax accounts before it can post to the ledger.
 */
export class SalesOrderController extends CoreSalesOrderController {
  async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const input = context.command.document;
    const taxes = (Array.isArray(input.taxes) ? input.taxes : []) as TaxRow[];
    const hasAccountlessCommercialTax = taxes.some((tax) => !hasAccount(tax));

    if (context.command.action !== "submit" || input.company !== "ALUMDOOR" || !hasAccountlessCommercialTax) {
      return super.normalize(context);
    }

    const validationContext = {
      ...context,
      command: {
        ...context.command,
        document: {
          ...input,
          taxes: taxes.filter(hasAccount),
        },
      },
    } as ControllerContext<SalesOrderData>;

    const normalized = await super.normalize(validationContext);
    const currencyScale = normalized.currency_scale ?? 2;
    const totals = calculateSalesTotals(normalized.items, taxes, currencyScale, {
      apply_discount_on: "Net Total",
      additional_discount_percentage: input.additional_discount_percentage ?? 0,
    });

    const companyScale = normalized.company_currency_scale ?? currencyScale;
    const rateMicros = normalized.conversion_rate_micros ?? 1_000_000;
    const baseNet = convertMinor(totals.net_total_minor, currencyScale, rateMicros, companyScale, "base net total");
    const baseTax = convertMinor(totals.total_taxes_and_charges_minor, currencyScale, rateMicros, companyScale, "base tax total");
    const baseGrand = convertMinor(totals.grand_total_minor, currencyScale, rateMicros, companyScale, "base grand total");

    return {
      ...normalized,
      ...totals,
      base_net_total_minor: baseNet,
      base_net_total: fromScaledInt(baseNet, companyScale),
      base_total_taxes_and_charges_minor: baseTax,
      base_total_taxes_and_charges: fromScaledInt(baseTax, companyScale),
      base_grand_total_minor: baseGrand,
      base_grand_total: fromScaledInt(baseGrand, companyScale),
    };
  }
}
