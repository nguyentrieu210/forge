import { errors } from "../../core/src/index.js";

export interface InventoryPositionInput {
  on_hand_qty_micros: number;
  inbound_qty_micros?: number;
  outbound_qty_micros?: number;
  reserved_qty_micros?: number;
}

export interface InventoryPosition {
  on_hand_qty_micros: number;
  inbound_qty_micros: number;
  outbound_qty_micros: number;
  reserved_qty_micros: number;
  projected_qty_micros: number;
}

export interface MinMaxPolicy {
  min_qty_micros: number;
  max_qty_micros: number;
  safety_stock_qty_micros?: number;
}

export interface ReplenishmentPlan extends InventoryPosition {
  min_qty_micros: number;
  max_qty_micros: number;
  safety_stock_qty_micros: number;
  below_safety_stock: boolean;
  reorder_required: boolean;
  suggested_qty_micros: number;
}

function nonNegative(value: number | undefined, field: string): number {
  const normalized = value ?? 0;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw errors.validation(`${field} must be a non-negative safe integer`);
  }
  return normalized;
}

function safeAdd(values: number[]): number {
  let result = 0;
  for (const value of values) {
    result += value;
    if (!Number.isSafeInteger(result)) throw errors.validation("Inventory position exceeds safe integer bounds");
  }
  return result;
}

/**
 * Computes an availability-oriented inventory position without reading or writing a ledger.
 * Inbound/outbound are already-approved or policy-selected open quantities supplied by the caller;
 * reservations are subtracted separately so ATP promises do not become physical stock movements.
 */
export function inventoryPosition(input: InventoryPositionInput): InventoryPosition {
  const onHand = nonNegative(input.on_hand_qty_micros, "on_hand_qty_micros");
  const inbound = nonNegative(input.inbound_qty_micros, "inbound_qty_micros");
  const outbound = nonNegative(input.outbound_qty_micros, "outbound_qty_micros");
  const reserved = nonNegative(input.reserved_qty_micros, "reserved_qty_micros");
  const projected = safeAdd([onHand, inbound, -outbound, -reserved]);
  return {
    on_hand_qty_micros: onHand,
    inbound_qty_micros: inbound,
    outbound_qty_micros: outbound,
    reserved_qty_micros: reserved,
    projected_qty_micros: projected,
  };
}

/**
 * Classic min/max replenishment: trigger only when projected quantity falls below min,
 * then replenish exactly back to max. Safety stock is diagnostic evidence, not silently
 * folded into the trigger, so policy meaning stays explicit in metadata/configuration.
 */
export function planMinMaxReplenishment(
  input: InventoryPositionInput,
  policy: MinMaxPolicy,
): ReplenishmentPlan {
  const position = inventoryPosition(input);
  const min = nonNegative(policy.min_qty_micros, "min_qty_micros");
  const max = nonNegative(policy.max_qty_micros, "max_qty_micros");
  const safety = nonNegative(policy.safety_stock_qty_micros, "safety_stock_qty_micros");
  if (max < min) throw errors.validation("max_qty_micros must be greater than or equal to min_qty_micros");
  if (safety > max) throw errors.validation("safety_stock_qty_micros cannot exceed max_qty_micros");

  const reorder = position.projected_qty_micros < min;
  const suggested = reorder ? Math.max(0, max - position.projected_qty_micros) : 0;
  if (!Number.isSafeInteger(suggested)) throw errors.validation("Suggested replenishment exceeds safe integer bounds");

  return {
    ...position,
    min_qty_micros: min,
    max_qty_micros: max,
    safety_stock_qty_micros: safety,
    below_safety_stock: position.projected_qty_micros < safety,
    reorder_required: reorder,
    suggested_qty_micros: suggested,
  };
}
