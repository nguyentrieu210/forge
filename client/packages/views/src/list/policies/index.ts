import type { ListRuntimePolicy } from "./contract.js";
import { billOfMaterialsListPolicy } from "./bill-of-materials.js";
import { itemPriceListPolicy } from "./item-price.js";
import { salesOrderListPolicy } from "./sales-order.js";

const POLICIES: Record<string, ListRuntimePolicy> = {
  "Sales Order": salesOrderListPolicy,
  "Item Price": itemPriceListPolicy,
  "Bill of Materials": billOfMaterialsListPolicy,
};

/** Compatibility registry for mature list semantics; generic ListContainer remains DocType-agnostic. */
export function builtinListPolicy(doctype: string): ListRuntimePolicy | undefined {
  return POLICIES[doctype];
}

export type { ListRuntimePolicy, ListPolicySearchResolution } from "./contract.js";
