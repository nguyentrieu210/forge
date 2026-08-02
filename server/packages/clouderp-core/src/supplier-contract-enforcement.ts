import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import type { PurchaseItem, PurchaseOrderData } from "./types.js";
import type { SupplierContractData } from "./supplier-lifecycle-controllers.js";
import { evaluateBlanketRelease, validateSupplierContractPolicy } from "./supplier-policy.js";

export interface SupplierContractReleaseResult {
  contract: string;
  release_qty_micros: number;
  release_value_minor: number;
  released_qty_before_micros: number;
  released_value_before_minor: number;
  released_qty_after_micros: number;
  released_value_after_minor: number;
  remaining_qty_micros: number | null;
  remaining_value_minor: number | null;
}

/**
 * Enforces one submitted Purchase Order as a release against one submitted Supplier Contract.
 * Quantity ceilings are only meaningful when every line shares the contract quantity UOM.
 * Value ceilings use PO transaction currency, which must equal the contract currency.
 */
export function evaluatePurchaseOrderSupplierContract(
  purchaseOrderName: string,
  purchaseOrder: PurchaseOrderData,
  contractName: string,
  contract: SupplierContractData,
  existingOrders: Array<CanonicalDocument<PurchaseOrderData>>,
): SupplierContractReleaseResult {
  if (!purchaseOrderName.trim()) throw errors.validation("Purchase Order name is required");
  if (!contractName.trim()) throw errors.validation("Supplier Contract name is required");
  if (purchaseOrder.supplier !== contract.supplier
    || purchaseOrder.company !== contract.company
    || purchaseOrder.currency !== contract.currency) {
    throw errors.reference(`Purchase Order commercial context does not match Supplier Contract ${contractName}`);
  }

  const contractPolicy = validateSupplierContractPolicy({
    supplier: contract.supplier,
    company: contract.company,
    currency: contract.currency,
    valid_from: contract.valid_from,
    valid_until: contract.valid_until,
    ...(contract.maximum_qty_micros === undefined ? {} : { maximum_qty_micros: contract.maximum_qty_micros }),
    ...(contract.maximum_value_minor === undefined ? {} : { maximum_value_minor: contract.maximum_value_minor }),
  });
  const orderDate = isoDate(purchaseOrder.transaction_date, "purchase_order.transaction_date");
  if (orderDate < contractPolicy.valid_from || orderDate > contractPolicy.valid_until) {
    throw errors.reference(`Purchase Order date ${orderDate} is outside Supplier Contract ${contractName}`);
  }

  const contractRaw = contract as JsonObject;
  const quantityUom = typeof contractRaw.quantity_uom === "string" ? contractRaw.quantity_uom.trim() : "";
  const quantityCeilingEnabled = contract.maximum_qty_micros !== undefined;
  if (quantityCeilingEnabled && !quantityUom) {
    throw errors.validation(`Supplier Contract ${contractName} quantity ceiling has no UOM`);
  }

  const releaseQty = quantityCeilingEnabled
    ? sumOrderQuantity(purchaseOrder, quantityUom, purchaseOrderName)
    : 0;
  const releaseValue = orderGrandTotalMinor(purchaseOrder, purchaseOrderName);

  let releasedQtyBefore = 0;
  let releasedValueBefore = 0;
  for (const document of existingOrders) {
    if (document.docstatus !== 1 || document.name === purchaseOrderName) continue;
    const raw = document.data as JsonObject;
    if (raw.supplier_contract !== contractName) continue;
    if (document.data.supplier !== contract.supplier
      || document.data.company !== contract.company
      || document.data.currency !== contract.currency) {
      throw errors.reference(`Purchase Order ${document.name} linked to ${contractName} has incompatible commercial context`);
    }
    if (quantityCeilingEnabled) {
      releasedQtyBefore = safeAdd(
        releasedQtyBefore,
        sumOrderQuantity(document.data, quantityUom, document.name),
        "supplier contract released quantity",
      );
    }
    releasedValueBefore = safeAdd(
      releasedValueBefore,
      orderGrandTotalMinor(document.data, document.name),
      "supplier contract released value",
    );
  }

  const evaluated = evaluateBlanketRelease(contractPolicy, {
    release_qty_micros: releaseQty,
    release_value_minor: releaseValue,
    released_qty_before_micros: releasedQtyBefore,
    released_value_before_minor: releasedValueBefore,
  });
  return {
    contract: contractName,
    release_qty_micros: releaseQty,
    release_value_minor: releaseValue,
    released_qty_before_micros: releasedQtyBefore,
    released_value_before_minor: releasedValueBefore,
    ...evaluated,
  };
}

function sumOrderQuantity(order: PurchaseOrderData, expectedUom: string, orderName: string): number {
  let total = 0;
  for (const [index, item] of order.items.entries()) {
    const uom = lineUom(item);
    if (!uom || normalizeUom(uom) !== normalizeUom(expectedUom)) {
      throw errors.validation(`Purchase Order ${orderName} row ${index + 1} must use contract UOM ${expectedUom}`);
    }
    const qty = item.qty_micros ?? toScaledInt(item.qty, 6, `${orderName}.items[${index}].qty`);
    if (!Number.isSafeInteger(qty) || qty <= 0) {
      throw errors.validation(`Purchase Order ${orderName} row ${index + 1} quantity must be positive`);
    }
    total = safeAdd(total, qty, "supplier contract order quantity");
  }
  return total;
}

function orderGrandTotalMinor(order: PurchaseOrderData, orderName: string): number {
  const total = order.grand_total_minor;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw errors.validation(`Purchase Order ${orderName} grand_total_minor must be a non-negative safe integer`);
  }
  return total;
}

function lineUom(item: PurchaseItem): string {
  return item.uom?.trim() || item.stock_uom?.trim() || "";
}

function normalizeUom(value: string): string {
  return value.trim().toLocaleLowerCase("vi");
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function isoDate(value: string, field: string): string {
  const text = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must be a valid ISO date`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw errors.validation(`${field} must be a valid ISO date`);
  }
  return text;
}
