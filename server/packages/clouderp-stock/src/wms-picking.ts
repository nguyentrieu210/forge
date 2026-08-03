import { errors } from "../../core/src/index.js";

export interface PickCandidate {
  warehouse: string;
  available_qty_micros: number;
  sequence: number;
  batch_no?: string;
  serial_no?: string;
}

export interface PickAllocation {
  warehouse: string;
  qty_micros: number;
  sequence: number;
  batch_no?: string;
  serial_no?: string;
}

export interface PickPlan {
  requested_qty_micros: number;
  allocated_qty_micros: number;
  shortage_qty_micros: number;
  allocations: PickAllocation[];
}

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw errors.validation(`${field} must be a positive safe integer`);
  return value;
}

function nonNegativeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(`${field} must be a non-negative safe integer`);
  return value;
}

function key(candidate: PickCandidate): string {
  return [candidate.warehouse, candidate.batch_no ?? "", candidate.serial_no ?? ""].join("\u0000");
}

/**
 * Deterministic quantity allocation for an already policy-ordered candidate set.
 *
 * The caller resolves business policy such as FEFO/FIFO, reservation ownership,
 * quality status and warehouse permissions into `sequence`. This primitive only
 * guarantees that allocation never exceeds the authoritative available quantity,
 * never double-consumes the same physical candidate and reports shortage explicitly.
 * It does not post stock or mark a reservation consumed.
 */
export function planPicking(qtyMicros: number, candidates: PickCandidate[]): PickPlan {
  const requested = positiveSafeInteger(qtyMicros, "qtyMicros");
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { requested_qty_micros: requested, allocated_qty_micros: 0, shortage_qty_micros: requested, allocations: [] };
  }

  const seen = new Set<string>();
  const normalized = candidates.map((candidate, index) => {
    const warehouse = String(candidate.warehouse ?? "").normalize("NFC").trim();
    if (!warehouse) throw errors.validation(`candidates[${index}].warehouse is required`);
    const available = nonNegativeSafeInteger(candidate.available_qty_micros, `candidates[${index}].available_qty_micros`);
    const sequence = positiveSafeInteger(candidate.sequence, `candidates[${index}].sequence`);
    if (candidate.serial_no && available !== 1_000_000) {
      throw errors.validation(`Serial ${candidate.serial_no} must expose exactly one unit of available quantity`);
    }
    const identity = key({ ...candidate, warehouse });
    if (seen.has(identity)) throw errors.validation(`Duplicate pick candidate ${identity.replaceAll("\u0000", "/")}`);
    seen.add(identity);
    return { ...candidate, warehouse, available_qty_micros: available, sequence };
  }).sort((left, right) => left.sequence - right.sequence || key(left).localeCompare(key(right)));

  let remaining = requested;
  const allocations: PickAllocation[] = [];
  for (const candidate of normalized) {
    if (remaining === 0) break;
    if (candidate.available_qty_micros === 0) continue;
    const qty = Math.min(candidate.available_qty_micros, remaining);
    allocations.push({
      warehouse: candidate.warehouse,
      qty_micros: qty,
      sequence: candidate.sequence,
      ...(candidate.batch_no ? { batch_no: candidate.batch_no } : {}),
      ...(candidate.serial_no ? { serial_no: candidate.serial_no } : {}),
    });
    remaining -= qty;
  }

  return {
    requested_qty_micros: requested,
    allocated_qty_micros: requested - remaining,
    shortage_qty_micros: remaining,
    allocations,
  };
}
