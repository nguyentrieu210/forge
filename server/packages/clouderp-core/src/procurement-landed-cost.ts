import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { allocateLandedCost } from "../../clouderp-stock/src/landed-cost.js";
import type { PurchaseItem, PurchaseReceiptData } from "./types.js";
import { stockQtyMicros } from "./uom.js";

export type ProcurementLandedCostBasis = "amount" | "quantity" | "weight";

export interface ProcurementLandedCostLine extends JsonObject {
  line_key: string;
  purchase_receipt: string;
  row_id: string;
  item_code: string;
  warehouse: string;
  basis_units: number;
  allocated_cost_minor: number;
}

interface ProcurementLandedCostSourceLine {
  line_key: string;
  purchase_receipt: string;
  row_id: string;
  item_code: string;
  warehouse: string;
  basis_units: number;
}

export interface ProcurementLandedCostPlan extends JsonObject {
  company: string;
  currency: string;
  currency_scale: number;
  basis: ProcurementLandedCostBasis;
  total_cost_minor: number;
  basis_total_units: number;
  allocations: ProcurementLandedCostLine[];
}

/**
 * Procurement-side landed-cost orchestration.
 *
 * This function deliberately stops at deterministic allocation evidence. Purchase Receipt remains
 * the source document and clouderp-stock owns the exact allocator. Applying the resulting cost to
 * authoritative stock valuation requires the Inventory-owned valuation/repost contract; this
 * helper never emits a Stock Ledger or GL entry and therefore cannot become a shadow valuation
 * source.
 */
export function planProcurementLandedCost(
  totalCostMinor: number,
  basis: ProcurementLandedCostBasis,
  receipts: Array<CanonicalDocument<PurchaseReceiptData>>,
): ProcurementLandedCostPlan {
  if (!Number.isSafeInteger(totalCostMinor)) throw errors.validation("Landed cost must use integer minor units");
  if (!Array.isArray(receipts) || receipts.length === 0) throw errors.validation("Landed cost requires at least one Purchase Receipt");
  if (!["amount", "quantity", "weight"].includes(basis)) throw errors.validation("Unsupported landed-cost allocation basis");

  const first = receipts[0]!;
  if (first.doctype !== "Purchase Receipt" || first.docstatus !== 1) throw errors.reference(`Submitted Purchase Receipt ${first.name} is required`);
  const company = requiredText(first.data.company, "purchase_receipt.company");
  const currency = requiredText(first.data.currency, "purchase_receipt.currency");
  const currencyScale = safeScale(first.data.currency_scale ?? 2);
  const source = new Map<string, ProcurementLandedCostSourceLine>();

  for (const receipt of receipts) {
    if (receipt.doctype !== "Purchase Receipt" || receipt.docstatus !== 1) {
      throw errors.reference(`Submitted Purchase Receipt ${receipt.name} is required`);
    }
    if (receipt.data.company !== company || receipt.data.currency !== currency || safeScale(receipt.data.currency_scale ?? 2) !== currencyScale) {
      throw errors.reference("Landed-cost source receipts must share Company, Currency and currency scale");
    }
    if (!Array.isArray(receipt.data.items) || receipt.data.items.length === 0) {
      throw errors.validation(`Purchase Receipt ${receipt.name} has no allocation lines`);
    }
    for (const [index, item] of receipt.data.items.entries()) {
      const rowId = requiredText(item.row_id || `ROW-${index + 1}`, `Purchase Receipt ${receipt.name} row_id`);
      const itemCode = requiredText(item.item_code, `Purchase Receipt ${receipt.name} item_code`);
      const warehouse = requiredText(item.warehouse, `Purchase Receipt ${receipt.name} warehouse`);
      const lineKey = `${receipt.name}:${rowId}`;
      if (source.has(lineKey)) throw errors.validation(`Duplicate landed-cost source line ${lineKey}`);
      const basisUnits = landedCostBasisUnits(item, basis, currencyScale, lineKey);
      source.set(lineKey, {
        line_key: lineKey,
        purchase_receipt: receipt.name,
        row_id: rowId,
        item_code: itemCode,
        warehouse,
        basis_units: basisUnits,
      });
    }
  }

  const allocations = allocateLandedCost(totalCostMinor, [...source.values()].map((line) => ({
    line_key: line.line_key,
    basis_units: line.basis_units,
  })));
  const lines = allocations.map((allocation): ProcurementLandedCostLine => {
    const line = source.get(allocation.line_key)!;
    return { ...line, allocated_cost_minor: allocation.allocated_cost_minor };
  });
  const basisTotal = lines.reduce((sum, line) => safeAdd(sum, line.basis_units, "landed-cost basis"), 0);
  const allocatedTotal = lines.reduce((sum, line) => safeAdd(sum, line.allocated_cost_minor, "landed-cost allocation"), 0);
  if (allocatedTotal !== totalCostMinor) throw errors.validation("Landed-cost allocation does not reconcile to source total");

  return {
    company,
    currency,
    currency_scale: currencyScale,
    basis,
    total_cost_minor: totalCostMinor,
    basis_total_units: basisTotal,
    allocations: lines,
  };
}

function landedCostBasisUnits(
  item: PurchaseItem,
  basis: ProcurementLandedCostBasis,
  currencyScale: number,
  lineKey: string,
): number {
  if (basis === "quantity") {
    const qty = stockQtyMicros(item);
    if (!Number.isSafeInteger(qty) || qty <= 0) throw errors.validation(`Landed-cost quantity basis must be positive for ${lineKey}`);
    return qty;
  }
  if (basis === "weight") {
    const value = item.actual_weight_micros ?? item.weight_micros;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw errors.validation(`Landed-cost weight basis requires measured weight for ${lineKey}`);
    }
    return value;
  }
  const amount = item.net_amount_minor ?? item.amount_minor;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    throw errors.validation(`Landed-cost amount basis requires normalized net amount for ${lineKey}`);
  }
  // Zero-value lines are valid when another line carries the allocation basis. The stock allocator
  // rejects an all-zero basis for non-zero cost, preserving exact reconciliation.
  void currencyScale;
  return amount;
}

function requiredText(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.normalize("NFC").trim() : "";
  if (!text) throw errors.validation(`${field} is required`);
  return text;
}

function safeScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
    throw errors.validation("Purchase Receipt currency scale is invalid");
  }
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}
