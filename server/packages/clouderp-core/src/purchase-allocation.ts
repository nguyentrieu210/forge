import type { JsonObject } from "../../contracts/src/index.js";
import type { PurchaseMaterialSnapshot } from "../../contracts/src/purchase-allocation.js";
import { errors, sha256Hex } from "../../core/src/index.js";
import type { DecimalInput } from "../../money/src/index.js";
import { toScaledInt } from "../../money/src/index.js";

const MICROS_SCALE = 6;
const BASIS_POINTS = 10_000n;

export interface PurchaseMaterialIdentityInput {
  item_code: string;
  length_m?: DecimalInput | null | undefined;
  theoretical_kg_per_m?: DecimalInput | null | undefined;
  color?: string | null | undefined;
  is_stamped?: boolean | number | string | null | undefined;
  measurement_profile?: string | null | undefined;
  stock_uom: string;
}

export interface CanonicalPurchaseMaterial {
  material_match_key: string;
  snapshot: PurchaseMaterialSnapshot;
}

/**
 * Builds the server-authoritative material identity used by PO obligation queues.
 * Decimal fields are fixed-point micros and null/empty text has one representation,
 * so equivalent documents cannot accidentally open different queues.
 */
export async function canonicalizePurchaseMaterial(
  input: PurchaseMaterialIdentityInput,
): Promise<CanonicalPurchaseMaterial> {
  const itemCode = requiredText(input.item_code, "item_code");
  const stockUom = requiredText(input.stock_uom, "stock_uom");
  const lengthMicros = optionalNonNegativeMicros(input.length_m, "length_m");
  const theoreticalKgPerM = optionalNonNegativeMicros(
    input.theoretical_kg_per_m,
    "theoretical_kg_per_m",
  );
  const snapshot: PurchaseMaterialSnapshot = {
    schema_version: 1,
    item_code: itemCode,
    length_m_micros: lengthMicros,
    theoretical_kg_per_m_micros: theoreticalKgPerM,
    color: optionalText(input.color),
    is_stamped: normalizeStamped(input.is_stamped),
    measurement_profile: optionalText(input.measurement_profile),
    stock_uom: stockUom,
  };
  return {
    material_match_key: await sha256Hex(snapshot),
    snapshot,
  };
}

export interface PurchaseQueueIdentityInput {
  tenant_id: string;
  company: string;
  supplier: string;
  material_match_key: string;
}

/** Queue identity includes the tenant and commercial parties, not only the material. */
export async function purchaseObligationQueueKey(input: PurchaseQueueIdentityInput): Promise<string> {
  const materialKey = input.material_match_key.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(materialKey)) {
    throw errors.validation("material_match_key must be a lowercase SHA-256 value");
  }
  return sha256Hex({
    schema_version: 1,
    tenant_id: requiredText(input.tenant_id, "tenant_id"),
    company: requiredText(input.company, "company"),
    supplier: requiredText(input.supplier, "supplier"),
    material_match_key: materialKey,
  });
}

export interface PurchaseSettlementBounds {
  minimum_qty_micros: number;
  maximum_qty_micros: number;
}

/** Integer-only tolerance boundaries. 500 bps means 5%. */
export function purchaseSettlementBounds(
  nominalQtyMicros: number,
  toleranceBps: number,
): PurchaseSettlementBounds {
  assertNonNegativeSafeInteger(nominalQtyMicros, "nominal_qty_micros");
  if (!Number.isSafeInteger(toleranceBps) || toleranceBps < 0 || toleranceBps > 10_000) {
    throw errors.validation("tolerance_bps must be an integer between 0 and 10000");
  }
  const nominal = BigInt(nominalQtyMicros);
  const tolerance = BigInt(toleranceBps);
  const minimum = ceilDivide(nominal * (BASIS_POINTS - tolerance), BASIS_POINTS);
  const maximum = nominal * (BASIS_POINTS + tolerance) / BASIS_POINTS;
  return {
    minimum_qty_micros: checkedBigInt(minimum, "minimum_qty_micros"),
    maximum_qty_micros: checkedBigInt(maximum, "maximum_qty_micros"),
  };
}

export interface PurchaseAllocationObligation {
  queue_key: string;
  window_id: string;
  purchase_order: string;
  purchase_order_item_row_id: string;
  remaining_qty_micros: number;
  transaction_date: string;
  purchase_order_created_at: string;
  item_idx: number;
}

export interface PurchaseReceiptAllocationRequest {
  queue_key: string;
  window_id: string;
  receipt_qty_micros: number;
  receipt_barem_weight_micros: number;
  actual_weight_micros?: number;
  window_nominal_qty_micros: number;
  window_received_before_micros: number;
  tolerance_bps: number;
}

export interface PlannedPurchaseAllocation {
  purchase_order: string;
  purchase_order_item_row_id: string;
  qty_micros: number;
  barem_weight_micros: number;
  projected_actual_weight_micros?: number;
  allocation_sequence: number;
}

export interface PurchaseReceiptAllocationPlan {
  allocations: PlannedPurchaseAllocation[];
  unapplied_qty_micros: number;
  unapplied_barem_weight_micros: number;
  unapplied_projected_actual_weight_micros?: number;
  received_after_micros: number;
  minimum_qty_micros: number;
  maximum_qty_micros: number;
}

/**
 * Pure FIFO planner. It does not generate ids or mutate documents; the controller
 * supplies immutable queue state and turns this result into append-only plan rows.
 */
export function planPurchaseReceiptAllocation(
  request: PurchaseReceiptAllocationRequest,
  obligations: readonly PurchaseAllocationObligation[],
): PurchaseReceiptAllocationPlan {
  const queueKey = requiredText(request.queue_key, "queue_key");
  const windowId = requiredText(request.window_id, "window_id");
  assertPositiveSafeInteger(request.receipt_qty_micros, "receipt_qty_micros");
  assertNonNegativeSafeInteger(request.receipt_barem_weight_micros, "receipt_barem_weight_micros");
  assertNonNegativeSafeInteger(request.window_nominal_qty_micros, "window_nominal_qty_micros");
  assertNonNegativeSafeInteger(request.window_received_before_micros, "window_received_before_micros");
  if (request.actual_weight_micros !== undefined) {
    assertNonNegativeSafeInteger(request.actual_weight_micros, "actual_weight_micros");
    if (request.actual_weight_micros > 0 && request.receipt_barem_weight_micros === 0) {
      throw errors.validation("actual_weight_micros requires a positive receipt barem weight");
    }
  }

  const bounds = purchaseSettlementBounds(
    request.window_nominal_qty_micros,
    request.tolerance_bps,
  );
  const receivedAfter = checkedAdd(
    request.window_received_before_micros,
    request.receipt_qty_micros,
    "received_after_micros",
  );
  if (receivedAfter > bounds.maximum_qty_micros) {
    throw errors.reference("Purchase Receipt exceeds the settlement tolerance maximum", {
      received_after_micros: receivedAfter,
      maximum_qty_micros: bounds.maximum_qty_micros,
    });
  }

  const candidates = obligations.map((obligation) => {
    if (requiredText(obligation.queue_key, "obligation.queue_key") !== queueKey) {
      throw errors.validation("Allocation obligation belongs to another queue");
    }
    if (requiredText(obligation.window_id, "obligation.window_id") !== windowId) {
      throw errors.validation("Allocation obligation belongs to another settlement window");
    }
    assertNonNegativeSafeInteger(obligation.remaining_qty_micros, "remaining_qty_micros");
    if (!Number.isSafeInteger(obligation.item_idx) || obligation.item_idx <= 0) {
      throw errors.validation("item_idx must be a positive integer");
    }
    return obligation;
  }).filter((obligation) => obligation.remaining_qty_micros > 0)
    .sort(comparePurchaseObligationFifo);

  let remainingReceipt = request.receipt_qty_micros;
  const drafts: Array<{
    purchase_order: string;
    purchase_order_item_row_id: string;
    qty_micros: number;
  }> = [];
  for (const obligation of candidates) {
    if (remainingReceipt === 0) break;
    const qty = Math.min(remainingReceipt, obligation.remaining_qty_micros);
    drafts.push({
      purchase_order: requiredText(obligation.purchase_order, "purchase_order"),
      purchase_order_item_row_id: requiredText(
        obligation.purchase_order_item_row_id,
        "purchase_order_item_row_id",
      ),
      qty_micros: qty,
    });
    remainingReceipt -= qty;
  }

  const partQuantities = drafts.map((draft) => draft.qty_micros);
  if (remainingReceipt > 0) partQuantities.push(remainingReceipt);
  const baremParts = splitProportionally(
    request.receipt_barem_weight_micros,
    partQuantities,
    "receipt_barem_weight_micros",
  );
  const actualParts = request.actual_weight_micros === undefined
    ? undefined
    : splitProportionally(request.actual_weight_micros, baremParts, "actual_weight_micros");

  const allocations = drafts.map((draft, index): PlannedPurchaseAllocation => ({
    ...draft,
    barem_weight_micros: baremParts[index]!,
    ...(actualParts ? { projected_actual_weight_micros: actualParts[index]! } : {}),
    allocation_sequence: index + 1,
  }));
  const unappliedIndex = remainingReceipt > 0 ? partQuantities.length - 1 : -1;
  return {
    allocations,
    unapplied_qty_micros: remainingReceipt,
    unapplied_barem_weight_micros: unappliedIndex >= 0 ? baremParts[unappliedIndex]! : 0,
    ...(actualParts && unappliedIndex >= 0
      ? { unapplied_projected_actual_weight_micros: actualParts[unappliedIndex]! }
      : {}),
    received_after_micros: receivedAfter,
    ...bounds,
  };
}

export function comparePurchaseObligationFifo(
  left: PurchaseAllocationObligation,
  right: PurchaseAllocationObligation,
): number {
  return left.transaction_date.localeCompare(right.transaction_date)
    || left.purchase_order_created_at.localeCompare(right.purchase_order_created_at)
    || left.purchase_order.localeCompare(right.purchase_order)
    || left.item_idx - right.item_idx
    || left.purchase_order_item_row_id.localeCompare(right.purchase_order_item_row_id);
}

function optionalNonNegativeMicros(
  value: DecimalInput | null | undefined,
  field: string,
): number {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return 0;
  const result = toScaledInt(value, MICROS_SCALE, field);
  if (result < 0) throw errors.validation(`${field} must not be negative`);
  return result;
}

function requiredText(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}

function optionalText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStamped(value: boolean | number | string | null | undefined): 0 | 1 {
  if (value === undefined || value === null || value === "" || value === false || value === 0) return 0;
  if (value === true || value === 1) return 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase("vi");
    if (["1", "true", "yes", "y", "có", "co"].includes(normalized)) return 1;
    if (["0", "false", "no", "n", "không", "khong"].includes(normalized)) return 0;
  }
  throw errors.validation("is_stamped must be a boolean-like value");
}

function splitProportionally(total: number, weights: readonly number[], field: string): number[] {
  assertNonNegativeSafeInteger(total, field);
  for (const weight of weights) assertNonNegativeSafeInteger(weight, `${field}.weight`);
  if (weights.length === 0) {
    if (total === 0) return [];
    throw errors.validation(`${field} cannot be split without allocation parts`);
  }
  const totalWeight = weights.reduce((sum, value) => sum + BigInt(value), 0n);
  if (totalWeight === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw errors.validation(`${field} cannot be split across zero-weight parts`);
  }
  const result: number[] = [];
  let assigned = 0n;
  for (let index = 0; index < weights.length; index += 1) {
    const part = index === weights.length - 1
      ? BigInt(total) - assigned
      : BigInt(total) * BigInt(weights[index]!) / totalWeight;
    result.push(checkedBigInt(part, field));
    assigned += part;
  }
  return result;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw errors.validation("Invalid settlement boundary");
  return (numerator + denominator - 1n) / denominator;
}

function checkedAdd(left: number, right: number, field: string): number {
  assertNonNegativeSafeInteger(left, field);
  assertNonNegativeSafeInteger(right, field);
  return checkedBigInt(BigInt(left) + BigInt(right), field);
}

function checkedBigInt(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function assertPositiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw errors.validation(`${field} must be a positive integer`);
  }
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw errors.validation(`${field} must be a non-negative integer`);
  }
}
