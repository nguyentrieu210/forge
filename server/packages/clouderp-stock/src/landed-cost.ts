import { errors } from "../../core/src/index.js";

export interface LandedCostBasisLine {
  line_key: string;
  basis_units: number;
}

export interface LandedCostAllocation {
  line_key: string;
  basis_units: number;
  allocated_cost_minor: number;
}

function safeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return value;
}

/**
 * Allocate a signed landed-cost total across caller-selected receipt lines using an
 * integer basis. The caller owns the business choice of basis (value, quantity,
 * weight, etc.); WS04 owns exact stock-value arithmetic.
 *
 * Largest-remainder allocation guarantees that line allocations sum exactly to the
 * source total. Ties are broken by line_key so retries are deterministic.
 */
export function allocateLandedCost(
  totalCostMinor: number,
  lines: LandedCostBasisLine[],
): LandedCostAllocation[] {
  const total = safeInteger(totalCostMinor, "totalCostMinor");
  if (!Array.isArray(lines) || lines.length === 0) {
    if (total === 0) return [];
    throw errors.validation("Landed cost requires at least one allocation line");
  }

  const seen = new Set<string>();
  const normalized = lines.map((line, index) => {
    const lineKey = String(line.line_key ?? "").normalize("NFC").trim();
    if (!lineKey) throw errors.validation(`lines[${index}].line_key is required`);
    if (seen.has(lineKey)) throw errors.validation(`Duplicate landed-cost line ${lineKey}`);
    seen.add(lineKey);
    const basis = safeInteger(line.basis_units, `lines[${index}].basis_units`);
    if (basis < 0) throw errors.validation(`lines[${index}].basis_units must be non-negative`);
    return { line_key: lineKey, basis_units: basis };
  });

  const totalBasis = normalized.reduce((sum, line) => {
    const next = sum + line.basis_units;
    if (!Number.isSafeInteger(next)) throw errors.validation("Landed-cost basis exceeds safe integer bounds");
    return next;
  }, 0);
  if (totalBasis === 0) {
    if (total === 0) return normalized.map((line) => ({ ...line, allocated_cost_minor: 0 }));
    throw errors.validation("Landed-cost allocation basis cannot be zero for a non-zero cost");
  }

  const sign = total < 0 ? -1 : 1;
  const absoluteTotal = BigInt(Math.abs(total));
  const denominator = BigInt(totalBasis);
  const working = normalized.map((line) => {
    const numerator = absoluteTotal * BigInt(line.basis_units);
    const floor = numerator / denominator;
    const remainder = numerator % denominator;
    return { ...line, floor, remainder };
  });

  const floorTotal = working.reduce((sum, line) => sum + line.floor, 0n);
  let undistributed = absoluteTotal - floorTotal;
  const remainderOrder = [...working].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.line_key.localeCompare(right.line_key);
  });
  const bonus = new Set<string>();
  for (const line of remainderOrder) {
    if (undistributed === 0n) break;
    bonus.add(line.line_key);
    undistributed -= 1n;
  }
  if (undistributed !== 0n) throw errors.validation("Landed-cost remainder allocation failed");

  const result = working.map((line) => {
    const absolute = line.floor + (bonus.has(line.line_key) ? 1n : 0n);
    const signed = sign < 0 ? -absolute : absolute;
    const allocated = Number(signed);
    if (!Number.isSafeInteger(allocated)) throw errors.validation("Landed-cost allocation exceeds safe integer bounds");
    return { line_key: line.line_key, basis_units: line.basis_units, allocated_cost_minor: allocated };
  });

  const check = result.reduce((sum, line) => sum + line.allocated_cost_minor, 0);
  if (!Number.isSafeInteger(check) || check !== total) {
    throw errors.validation("Landed-cost allocation does not reconcile to source total");
  }
  return result;
}
