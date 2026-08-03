import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  commitItemPriceMatrix,
  type ItemPriceMatrixCommitResult,
  type PricingMatrixAuthorityContext,
} from "./matrix.js";

export const PRICING_ITEM_UOM_ADD_ACTION = "pricing.item_uom.add";

export interface AddItemUomInput extends JsonObject {
  requestId: string;
  itemCode: string;
  itemVersion?: number;
  uom: string;
  conversionFactor: string | number;
}

/**
 * Row-member creation stays a pricing-domain action but deliberately delegates to the
 * same compound Matrix commit authority. It therefore inherits stock-UOM rules,
 * permission checks, OCC and idempotent canonical writes instead of growing a second UOM
 * mutation implementation just to satisfy one button in the generic renderer.
 */
export async function addItemUom(
  context: PricingMatrixAuthorityContext,
  input: AddItemUomInput,
): Promise<ItemPriceMatrixCommitResult> {
  const uom = String(input.uom ?? "").normalize("NFC").trim();
  if (!uom) throw errors.validation("uom is required");
  return await commitItemPriceMatrix(context, {
    requestId: input.requestId,
    itemCode: input.itemCode,
    ...(input.itemVersion === undefined ? {} : { itemVersion: input.itemVersion }),
    upsertUoms: [{ uom, conversionFactor: input.conversionFactor }],
  });
}
