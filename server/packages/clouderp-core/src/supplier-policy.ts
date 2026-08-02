import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

const BPS = 10_000n;

export type SupplierProcurementStatus = "Pending" | "Approved" | "Suspended" | "Rejected";

export interface SupplierEligibilityResult {
  status: "LegacyUncontrolled" | "Approved";
  supplier: string;
  as_of_date: string;
  approved_from: string | null;
  approved_until: string | null;
  categories: string[];
}

export function assertSupplierEligible(
  supplier: string,
  master: JsonObject | null,
  asOfDate: string,
  category?: string,
): SupplierEligibilityResult {
  const name = requiredText(supplier, "supplier");
  const day = isoDate(asOfDate, "as_of_date");
  const rawStatus = text(master?.procurement_status);
  if (!rawStatus) {
    return {
      status: "LegacyUncontrolled",
      supplier: name,
      as_of_date: day,
      approved_from: null,
      approved_until: null,
      categories: [],
    };
  }
  if (!["Pending", "Approved", "Suspended", "Rejected"].includes(rawStatus)) {
    throw errors.validation(`Supplier ${name} has invalid procurement_status ${rawStatus}`);
  }
  if (rawStatus !== "Approved") throw errors.reference(`Supplier ${name} is not approved for procurement`);

  const approvedFrom = optionalDate(master?.approved_from, `Supplier ${name}.approved_from`);
  const approvedUntil = optionalDate(master?.approved_until, `Supplier ${name}.approved_until`);
  if (approvedFrom && approvedUntil && approvedFrom > approvedUntil) {
    throw errors.validation(`Supplier ${name} approval period is invalid`);
  }
  if (approvedFrom && day < approvedFrom) throw errors.reference(`Supplier ${name} approval is not effective on ${day}`);
  if (approvedUntil && day > approvedUntil) throw errors.reference(`Supplier ${name} approval expired on ${approvedUntil}`);

  const categories = normalizedCategories(master?.approved_categories);
  const requestedCategory = category?.trim() ?? "";
  if (categories.length && requestedCategory && !categories.includes(requestedCategory)) {
    throw errors.reference(`Supplier ${name} is not approved for category ${requestedCategory}`);
  }
  return {
    status: "Approved",
    supplier: name,
    as_of_date: day,
    approved_from: approvedFrom,
    approved_until: approvedUntil,
    categories,
  };
}

export interface SupplierRatingDimension {
  key: string;
  score_bps: number;
  weight_bps: number;
}

export interface SupplierRatingResult {
  score_bps: number;
  grade: "A" | "B" | "C" | "D";
  dimensions: SupplierRatingDimension[];
}

export function calculateSupplierRating(dimensions: SupplierRatingDimension[]): SupplierRatingResult {
  if (!Array.isArray(dimensions) || dimensions.length === 0) throw errors.validation("Supplier rating requires at least one dimension");
  const seen = new Set<string>();
  let weight = 0;
  let weighted = 0n;
  const normalized = dimensions.map((dimension, index) => {
    const key = requiredText(dimension.key, `dimensions[${index}].key`);
    if (seen.has(key)) throw errors.validation(`Supplier rating dimension ${key} appears twice`);
    seen.add(key);
    const score = basisPoints(dimension.score_bps, `dimensions[${index}].score_bps`);
    const dimensionWeight = basisPoints(dimension.weight_bps, `dimensions[${index}].weight_bps`);
    weight += dimensionWeight;
    weighted += BigInt(score) * BigInt(dimensionWeight);
    return { key, score_bps: score, weight_bps: dimensionWeight };
  });
  if (weight !== 10_000) throw errors.validation("Supplier rating weights must total 10000 bps");
  const score = Number(divideRounded(weighted, BPS));
  if (!Number.isSafeInteger(score)) throw errors.validation("Supplier rating exceeds safe integer range");
  return {
    score_bps: score,
    grade: score >= 9_000 ? "A" : score >= 8_000 ? "B" : score >= 7_000 ? "C" : "D",
    dimensions: normalized,
  };
}

export interface SupplierContractPolicyInput {
  supplier: string;
  company: string;
  currency: string;
  valid_from: string;
  valid_until: string;
  maximum_qty_micros?: number;
  maximum_value_minor?: number;
}

export interface BlanketReleaseInput {
  release_qty_micros: number;
  release_value_minor: number;
  released_qty_before_micros: number;
  released_value_before_minor: number;
}

export interface BlanketReleaseResult {
  released_qty_after_micros: number;
  released_value_after_minor: number;
  remaining_qty_micros: number | null;
  remaining_value_minor: number | null;
}

export function validateSupplierContractPolicy(input: SupplierContractPolicyInput): SupplierContractPolicyInput {
  requiredText(input.supplier, "supplier");
  requiredText(input.company, "company");
  requiredText(input.currency, "currency");
  const from = isoDate(input.valid_from, "valid_from");
  const until = isoDate(input.valid_until, "valid_until");
  if (from > until) throw errors.validation("Supplier contract valid_from must not be after valid_until");
  const maximumQty = optionalNonNegative(input.maximum_qty_micros, "maximum_qty_micros");
  const maximumValue = optionalNonNegative(input.maximum_value_minor, "maximum_value_minor");
  if (maximumQty === undefined && maximumValue === undefined) {
    throw errors.validation("Supplier contract must declare a quantity or value ceiling");
  }
  return {
    ...input,
    valid_from: from,
    valid_until: until,
    ...(maximumQty === undefined ? {} : { maximum_qty_micros: maximumQty }),
    ...(maximumValue === undefined ? {} : { maximum_value_minor: maximumValue }),
  };
}

export function evaluateBlanketRelease(
  contract: SupplierContractPolicyInput,
  release: BlanketReleaseInput,
): BlanketReleaseResult {
  const validated = validateSupplierContractPolicy(contract);
  const releaseQty = nonNegative(release.release_qty_micros, "release_qty_micros");
  const releaseValue = nonNegative(release.release_value_minor, "release_value_minor");
  const priorQty = nonNegative(release.released_qty_before_micros, "released_qty_before_micros");
  const priorValue = nonNegative(release.released_value_before_minor, "released_value_before_minor");
  const afterQty = safeAdd(priorQty, releaseQty, "released quantity");
  const afterValue = safeAdd(priorValue, releaseValue, "released value");
  if (validated.maximum_qty_micros !== undefined && afterQty > validated.maximum_qty_micros) {
    throw errors.reference("Blanket release exceeds supplier contract quantity ceiling");
  }
  if (validated.maximum_value_minor !== undefined && afterValue > validated.maximum_value_minor) {
    throw errors.reference("Blanket release exceeds supplier contract value ceiling");
  }
  return {
    released_qty_after_micros: afterQty,
    released_value_after_minor: afterValue,
    remaining_qty_micros: validated.maximum_qty_micros === undefined ? null : validated.maximum_qty_micros - afterQty,
    remaining_value_minor: validated.maximum_value_minor === undefined ? null : validated.maximum_value_minor - afterValue,
  };
}

function normalizedCategories(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" ? value.split(",") : [];
  const result = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    result.add(entry.trim());
  }
  return [...result].sort((a, b) => a.localeCompare(b, "vi"));
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw errors.validation(`${field} must be an ISO date`);
  return isoDate(value, field);
}

function isoDate(value: string, field: string): string {
  const textValue = requiredText(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(textValue)) throw errors.validation(`${field} must be a valid ISO date`);
  const date = new Date(`${textValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== textValue) {
    throw errors.validation(`${field} must be a valid ISO date`);
  }
  return textValue;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function basisPoints(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw errors.validation(`${field} must be an integer between 0 and 10000`);
  }
  return value;
}

function optionalNonNegative(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return nonNegative(value, field);
}

function nonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw errors.validation(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}
