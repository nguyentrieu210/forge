import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import type { QualityPlanData } from "./qms-controllers.js";

export interface QualitySamplingRequirement extends JsonObject {
  schema_version: 1;
  sampling_method: QualityPlanData["sampling_method"];
  lot_size: number;
  required_sample_size: number;
  sample_percentage?: string;
  capped_to_lot: boolean;
}

/** Deterministic sample count for one lot; always returns an integer count <= lot size. */
export function qualitySamplingRequirement(plan: QualityPlanData, lotSizeInput: unknown): QualitySamplingRequirement {
  const lotSize = positiveInteger(lotSizeInput, "lot_size");
  if (plan.sampling_method === "100%") {
    return { schema_version: 1, sampling_method: "100%", lot_size: lotSize, required_sample_size: lotSize, capped_to_lot: false };
  }
  if (plan.sampling_method === "Fixed") {
    const configured = positiveInteger(plan.sample_size, "Quality Plan sample_size");
    return {
      schema_version: 1,
      sampling_method: "Fixed",
      lot_size: lotSize,
      required_sample_size: Math.min(configured, lotSize),
      capped_to_lot: configured > lotSize,
    };
  }
  if (plan.sampling_method === "Percentage") {
    if (typeof plan.sample_percentage !== "string" && typeof plan.sample_percentage !== "number") {
      throw errors.validation("Quality Plan sample_percentage is required");
    }
    const percentMicros = toScaledInt(plan.sample_percentage, 6, "Quality Plan sample_percentage");
    if (percentMicros <= 0 || percentMicros > 100_000_000) throw errors.validation("Quality Plan sample_percentage must be > 0 and <= 100");
    const numerator = BigInt(lotSize) * BigInt(percentMicros);
    const denominator = 100_000_000n;
    const required = Number((numerator + denominator - 1n) / denominator);
    if (!Number.isSafeInteger(required) || required <= 0) throw errors.validation("Quality sample size exceeds safe integer range");
    return {
      schema_version: 1,
      sampling_method: "Percentage",
      lot_size: lotSize,
      required_sample_size: Math.min(required, lotSize),
      sample_percentage: String(plan.sample_percentage),
      capped_to_lot: required > lotSize,
    };
  }
  throw errors.validation(`Unsupported Quality Plan sampling_method ${String(plan.sampling_method)}`);
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw errors.validation(`${field} must be a positive integer`);
  return parsed;
}
