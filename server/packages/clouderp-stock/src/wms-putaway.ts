import { errors } from "../../core/src/index.js";

export interface PutawayCandidate {
  warehouse: string;
  priority: number;
  capacity_qty_micros: number;
  current_qty_micros: number;
}

export interface PutawayAllocation {
  warehouse: string;
  qty_micros: number;
  priority: number;
  free_before_micros: number;
  free_after_micros: number;
}

export interface PutawayPlan {
  requested_qty_micros: number;
  allocated_qty_micros: number;
  unallocated_qty_micros: number;
  allocations: PutawayAllocation[];
}

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw errors.validation(`${field} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw errors.validation(`${field} must be a non-negative safe integer`);
  }
  return value;
}

/**
 * Deterministic putaway allocator for one item/UOM stock quantity.
 *
 * It deliberately does not write stock. The result is a plan that an inbound flow
 * can turn into canonical target-warehouse rows; the authoritative movement still
 * happens through Purchase Receipt / Stock Entry. Priority is ascending and ties
 * use warehouse name, so retries produce the same allocation independent of input order.
 */
export function planPutaway(qtyMicros: number, candidates: PutawayCandidate[]): PutawayPlan {
  const requested = positiveSafeInteger(qtyMicros, "qtyMicros");
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      requested_qty_micros: requested,
      allocated_qty_micros: 0,
      unallocated_qty_micros: requested,
      allocations: [],
    };
  }

  const seen = new Set<string>();
  const normalized = candidates.map((candidate, index) => {
    const warehouse = String(candidate.warehouse ?? "").normalize("NFC").trim();
    if (!warehouse) throw errors.validation(`candidates[${index}].warehouse is required`);
    if (seen.has(warehouse)) throw errors.validation(`Duplicate putaway warehouse ${warehouse}`);
    seen.add(warehouse);
    const priority = positiveSafeInteger(candidate.priority, `candidates[${index}].priority`);
    const capacity = nonNegativeSafeInteger(candidate.capacity_qty_micros, `candidates[${index}].capacity_qty_micros`);
    const current = nonNegativeSafeInteger(candidate.current_qty_micros, `candidates[${index}].current_qty_micros`);
    if (current > capacity) {
      throw errors.validation(`Putaway warehouse ${warehouse} current quantity exceeds configured capacity`);
    }
    return { warehouse, priority, capacity, current };
  }).sort((left, right) => left.priority - right.priority || left.warehouse.localeCompare(right.warehouse));

  let remaining = requested;
  const allocations: PutawayAllocation[] = [];
  for (const candidate of normalized) {
    if (remaining === 0) break;
    const free = candidate.capacity - candidate.current;
    if (free <= 0) continue;
    const allocated = Math.min(free, remaining);
    allocations.push({
      warehouse: candidate.warehouse,
      qty_micros: allocated,
      priority: candidate.priority,
      free_before_micros: free,
      free_after_micros: free - allocated,
    });
    remaining -= allocated;
  }

  return {
    requested_qty_micros: requested,
    allocated_qty_micros: requested - remaining,
    unallocated_qty_micros: remaining,
    allocations,
  };
}
