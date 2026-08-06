import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, percentOfMinor, toScaledInt } from "../../money/src/index.js";
import { calculateSalesTotals } from "./totals.js";
import type { SalesItem, SalesOrderData, TaxRow } from "./types.js";
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

function applyOperatorLineDiscounts(
  pricedItems: SalesItem[],
  inputItems: SalesItem[],
  currencyScale: number,
): SalesItem[] {
  const discounts = new Map(inputItems.map((item) => [item.row_id, item.discount_percentage]));
  return pricedItems.map((item, index) => {
    const raw = discounts.get(item.row_id);
    if (raw == null || raw === "") return item;
    const percentage = Number(raw);
    if (!Number.isFinite(percentage) || percentage <= 0) return item;
    if (percentage > 100) throw new Error(`discount_percentage must be from 0 to 100 at row ${index + 1}`);
    const rateMinor = toScaledInt(item.rate, currencyScale, `items[${index}].rate`);
    const discountMinor = percentOfMinor(rateMinor, raw, 6, `items[${index}].discount_percentage`);
    return {
      ...item,
      discount_percentage: raw,
      rate: fromScaledInt(rateMinor - discountMinor, currencyScale),
    };
  });
}

/**
 * Alumdoor can operate Sales Order + stock + production without installing accounting.
 * VAT on a Sales Order is therefore a commercial amount, not a ledger instruction.
 *
 * We still execute canonical normalization first with account-less commercial tax rows removed,
 * so Company/Customer/Currency/Item/price-list validation stays authoritative. The selected Price
 * List resolves the authoritative list rate; the operator line discount is then applied to that
 * resolved rate before totals are persisted. Finally all commercial VAT rows are restored and the
 * exact totals are recomputed. Sales Invoice remains unchanged and account-gated for ledger posting.
 */
export class SalesOrderController extends CoreSalesOrderController {
  async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const input = context.command.document;
    const taxes = (Array.isArray(input.taxes) ? input.taxes : []) as TaxRow[];
    const hasAccountlessCommercialTax = taxes.some((tax) => !hasAccount(tax));
    const hasOperatorDiscount = input.company === "ALUMDOOR" && input.items.some((item) => Number(item.discount_percentage ?? 0) > 0);

    if (context.command.action !== "submit" || input.company !== "ALUMDOOR" || (!hasAccountlessCommercialTax && !hasOperatorDiscount)) {
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
    const discountedItems = applyOperatorLineDiscounts(normalized.items, input.items, currencyScale);
    const totals = calculateSalesTotals(discountedItems, taxes, currencyScale, {
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
