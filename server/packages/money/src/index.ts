import { errors } from "../../core/src/index.js";

export type DecimalInput = string | number;

const TEN = 10n;

export function toScaledInt(input: DecimalInput, scale: number, field = "decimal"): number {
  if (!Number.isInteger(scale) || scale < 0 || scale > 9) throw errors.validation(`Invalid scale for ${field}`);
  const text = normalizeInput(input, field);
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw errors.validation(`${field} must be a plain decimal number`);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2]!;
  const fraction = match[3] ?? "";
  const factor = TEN ** BigInt(scale);
  let value = BigInt(whole) * factor;
  const kept = fraction.slice(0, scale).padEnd(scale, "0");
  value += kept ? BigInt(kept) : 0n;
  const discarded = fraction.slice(scale);
  if (discarded && Number(discarded[0]) >= 5) value += 1n;
  value *= sign;
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) throw errors.validation(`${field} exceeds safe integer range`);
  return asNumber;
}

export function fromScaledInt(value: number, scale: number): string {
  if (!Number.isSafeInteger(value)) throw errors.validation("Scaled integer exceeds safe integer range");
  const sign = value < 0 ? "-" : "";
  const absolute = BigInt(Math.abs(value));
  const factor = TEN ** BigInt(scale);
  const whole = absolute / factor;
  if (scale === 0) return `${sign}${whole}`;
  const fraction = (absolute % factor).toString().padStart(scale, "0");
  return `${sign}${whole}.${fraction}`;
}

export function multiplyScaled(
  left: DecimalInput,
  leftScale: number,
  right: DecimalInput,
  rightScale: number,
  outputScale: number,
  field = "amount",
): number {
  const a = BigInt(toScaledInt(left, leftScale, `${field}.left`));
  const b = BigInt(toScaledInt(right, rightScale, `${field}.right`));
  const product = a * b;
  const divisor = TEN ** BigInt(leftScale + rightScale - outputScale);
  return checkedBigInt(divideRounded(product, divisor), field);
}

export function percentOfMinor(baseMinor: number, rate: DecimalInput, rateScale = 6, field = "tax rate"): number {
  if (!Number.isSafeInteger(baseMinor)) throw errors.validation("Base amount must be an integer minor amount");
  const rateScaled = BigInt(toScaledInt(rate, rateScale, field));
  const denominator = 100n * (TEN ** BigInt(rateScale));
  return checkedBigInt(divideRounded(BigInt(baseMinor) * rateScaled, denominator), field);
}

export function addMinor(values: readonly number[], field = "amount"): number {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must use integer minor units`);
    total += BigInt(value);
  }
  return checkedBigInt(total, field);
}

export function negateMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw errors.validation("Amount must use integer minor units");
  return -value;
}

export function assertNonNegativeMinor(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(`${field} must be a non-negative integer minor amount`);
}

export function compareDecimal(left: DecimalInput, right: DecimalInput, scale = 6): number {
  return Math.sign(toScaledInt(left, scale, "left") - toScaledInt(right, scale, "right"));
}

function normalizeInput(input: DecimalInput, field: string): string {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw errors.validation(`${field} must be finite`);
    const text = input.toString();
    if (/e/i.test(text)) return expandExponential(text);
    return text;
  }
  const text = input.trim();
  if (!text) throw errors.validation(`${field} is required`);
  return /e/i.test(text) ? expandExponential(text) : text;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw errors.validation("Decimal divisor must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function checkedBigInt(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function expandExponential(value: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(value);
  if (!match) throw errors.validation("Invalid exponential decimal");
  const sign = match[1] ?? "";
  const digits = `${match[2]}${match[3] ?? ""}`;
  const decimalPosition = match[2]!.length + Number(match[4]);
  if (decimalPosition <= 0) return `${sign}0.${"0".repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length) return `${sign}${digits}${"0".repeat(decimalPosition - digits.length)}`;
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}
