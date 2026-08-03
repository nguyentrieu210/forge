import { errors } from "../../core/src/index.js";

export type UomRoundingMode = "EXACT" | "HALF_UP";

export interface UomConversionResult {
  source_qty_micros: number;
  numerator: number;
  denominator: number;
  target_qty_micros: number;
  exact: boolean;
  remainder_numerator: number;
}

function safeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return value;
}

/**
 * Convert fixed-point quantity using an explicit rational factor:
 * target = source * numerator / denominator.
 *
 * There is deliberately no default rounding mode. Authoritative inventory must choose
 * whether a conversion must be exactly representable at the stock quantity scale or
 * whether HALF_UP is allowed by the domain contract.
 */
export function convertUomQuantity(
  sourceQtyMicros: number,
  numerator: number,
  denominator: number,
  rounding: UomRoundingMode,
): UomConversionResult {
  const source = safeInteger(sourceQtyMicros, "sourceQtyMicros");
  const num = safeInteger(numerator, "numerator");
  const den = safeInteger(denominator, "denominator");
  if (num <= 0 || den <= 0) throw errors.validation("UOM conversion numerator and denominator must be positive");
  if (rounding !== "EXACT" && rounding !== "HALF_UP") throw errors.validation(`Unsupported UOM rounding mode ${String(rounding)}`);

  const product = BigInt(source) * BigInt(num);
  const divisor = BigInt(den);
  let quotient = product / divisor;
  let remainder = product % divisor;

  // BigInt remainder follows the dividend sign. Normalize for rounding/evidence.
  const negative = product < 0n;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  const exact = absoluteRemainder === 0n;
  if (!exact && rounding === "EXACT") {
    throw errors.validation("UOM conversion is not exactly representable at the authoritative quantity scale", {
      source_qty_micros: source,
      numerator: num,
      denominator: den,
      remainder_numerator: Number(absoluteRemainder),
    });
  }
  if (!exact && rounding === "HALF_UP" && absoluteRemainder * 2n >= divisor) {
    quotient += negative ? -1n : 1n;
  }

  const target = Number(quotient);
  const remainderNumber = Number(absoluteRemainder);
  if (!Number.isSafeInteger(target) || !Number.isSafeInteger(remainderNumber)) {
    throw errors.validation("UOM conversion exceeds safe integer bounds");
  }
  return {
    source_qty_micros: source,
    numerator: num,
    denominator: den,
    target_qty_micros: target,
    exact,
    remainder_numerator: remainderNumber,
  };
}
