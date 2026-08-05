import type { JsonObject } from "../../contracts/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled } from "../../money/src/index.js";
import { calculateSalesTotals } from "../../clouderp-selling/src/totals.js";
import { PurchaseOrderController } from "./controllers.js";
import { AllocatingPurchaseOrderController } from "./purchase-allocation-controllers.js";
import type { PurchaseOrderData } from "./types.js";

/**
 * Purchase-side commercial totals use the same canonical calculation engine as Sales Order.
 *
 * The historical purchase controller already delegated item/tax arithmetic to
 * `calculateSalesTotals`, but did not pass the document-level discount options. This wrapper
 * deliberately runs AFTER the base normalizer so pricing, UOM conversion, currency context and
 * master validation stay single-owned; it only recomputes the commercial summary with the
 * canonical discount inputs that are already fields of Purchase Order.
 */
export class CommercialPurchaseOrderController extends PurchaseOrderController {
  override async normalize(context: ControllerContext<PurchaseOrderData>): Promise<PurchaseOrderData> {
    return applyPurchaseOrderCommercialTotals(await super.normalize(context));
  }
}

/** Allocation-enabled tenants need the same commercial normalization before obligation planning. */
export class CommercialAllocatingPurchaseOrderController extends AllocatingPurchaseOrderController {
  override async normalize(context: ControllerContext<PurchaseOrderData>): Promise<PurchaseOrderData> {
    return applyPurchaseOrderCommercialTotals(await super.normalize(context));
  }
}

export function applyPurchaseOrderCommercialTotals(input: PurchaseOrderData): PurchaseOrderData {
  const transactionScale = Number.isSafeInteger(input.currency_scale) ? Number(input.currency_scale) : 2;
  const totals = calculateSalesTotals(input.items as never, input.taxes ?? [], transactionScale, {
    ...(input.apply_discount_on ? { apply_discount_on: input.apply_discount_on } : {}),
    ...(input.additional_discount_percentage !== undefined
      ? { additional_discount_percentage: input.additional_discount_percentage }
      : {}),
    ...(input.discount_amount !== undefined ? { discount_amount: input.discount_amount } : {}),
  });
  return {
    ...input,
    ...(totals as unknown as JsonObject),
    items: totals.items as unknown as PurchaseOrderData["items"],
    ...baseTotals(totals, input, transactionScale),
  };
}

function baseTotals(
  totals: { net_total_minor: number; total_taxes_and_charges_minor: number; grand_total_minor: number },
  input: PurchaseOrderData,
  transactionScale: number,
): JsonObject {
  const companyScale = Number.isSafeInteger(input.company_currency_scale) ? Number(input.company_currency_scale) : transactionScale;
  const rateMicros = Number.isSafeInteger(input.conversion_rate_micros) ? Number(input.conversion_rate_micros) : 1_000_000;
  const convert = (amount: number) => multiplyScaled(
    fromScaledInt(amount, transactionScale),
    transactionScale,
    fromScaledInt(rateMicros, 6),
    6,
    companyScale,
  );
  const net = convert(totals.net_total_minor);
  const tax = convert(totals.total_taxes_and_charges_minor);
  const grand = convert(totals.grand_total_minor);
  return {
    base_net_total_minor: net,
    base_net_total: fromScaledInt(net, companyScale),
    base_total_taxes_and_charges_minor: tax,
    base_total_taxes_and_charges: fromScaledInt(tax, companyScale),
    base_grand_total_minor: grand,
    base_grand_total: fromScaledInt(grand, companyScale),
  };
}
