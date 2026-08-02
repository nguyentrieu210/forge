import { errors } from "../../core/src/index.js";

export interface AgingLayer { qty_micros: number; value_minor: number; received_at: string; }
export interface AgingBucket { min_age_days: number; max_age_days?: number; qty_micros: number; value_minor: number; }
export interface AbcInput { key: string; annual_consumption_value_minor: number; }
export interface AbcResult extends AbcInput { cumulative_value_minor: number; cumulative_ratio: number; class: "A" | "B" | "C"; }
export interface MovementAgeInput { key: string; last_movement_at?: string; on_hand_qty_micros: number; }
export interface MovementAgeResult extends MovementAgeInput { age_days: number | null; status: "No Stock" | "Active" | "Slow" | "Dead" | "Never Moved"; }

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be a valid timestamp`);
  return parsed;
}
function safeNonNegative(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(`${field} must be a non-negative safe integer`);
  return value;
}
function dayAge(asOf: number, event: number): number {
  if (event > asOf) throw errors.validation("Inventory analytics event cannot be in the future relative to as_of");
  return Math.floor((asOf - event) / 86_400_000);
}

export function ageInventory(layers: AgingLayer[], asOf: string, bucketUpperDays: number[]): AgingBucket[] {
  const asOfTime = timestamp(asOf, "as_of");
  const uppers = [...bucketUpperDays];
  let previous = -1;
  for (const [index, upper] of uppers.entries()) {
    if (!Number.isSafeInteger(upper) || upper < 0 || upper <= previous) throw errors.validation(`bucketUpperDays[${index}] must be an increasing non-negative integer`);
    previous = upper;
  }
  const buckets: AgingBucket[] = uppers.map((upper, index) => ({ min_age_days: index === 0 ? 0 : uppers[index - 1]! + 1, max_age_days: upper, qty_micros: 0, value_minor: 0 }));
  buckets.push({ min_age_days: uppers.length ? uppers[uppers.length - 1]! + 1 : 0, qty_micros: 0, value_minor: 0 });
  for (const [index, layer] of layers.entries()) {
    const qty = safeNonNegative(layer.qty_micros, `layers[${index}].qty_micros`);
    const value = safeNonNegative(layer.value_minor, `layers[${index}].value_minor`);
    if (qty === 0 && value !== 0) throw errors.validation(`layers[${index}] has value without quantity`);
    if (qty === 0) continue;
    const age = dayAge(asOfTime, timestamp(layer.received_at, `layers[${index}].received_at`));
    const bucket = buckets.find((row) => row.max_age_days === undefined || age <= row.max_age_days)!;
    bucket.qty_micros += qty;
    bucket.value_minor += value;
    if (!Number.isSafeInteger(bucket.qty_micros) || !Number.isSafeInteger(bucket.value_minor)) throw errors.validation("Inventory aging total exceeds safe integer bounds");
  }
  return buckets;
}

/** Explicit policy cutoffs; when one dominant item itself crosses A, it remains A. */
export function classifyAbc(inputs: AbcInput[], aCutoff: number, bCutoff: number): AbcResult[] {
  if (!(aCutoff > 0 && aCutoff < bCutoff && bCutoff < 1)) throw errors.validation("ABC cutoffs must satisfy 0 < A < B < 1");
  const seen = new Set<string>();
  const rows = inputs.map((input, index) => {
    const key = String(input.key ?? "").normalize("NFC").trim();
    if (!key) throw errors.validation(`inputs[${index}].key is required`);
    if (seen.has(key)) throw errors.validation(`Duplicate ABC key ${key}`);
    seen.add(key);
    return { key, annual_consumption_value_minor: safeNonNegative(input.annual_consumption_value_minor, `inputs[${index}].annual_consumption_value_minor`) };
  }).sort((left, right) => right.annual_consumption_value_minor - left.annual_consumption_value_minor || left.key.localeCompare(right.key));
  const total = rows.reduce((sum, row) => {
    const next = sum + row.annual_consumption_value_minor;
    if (!Number.isSafeInteger(next)) throw errors.validation("ABC total exceeds safe integer bounds");
    return next;
  }, 0);
  let cumulative = 0;
  return rows.map((row, index) => {
    cumulative += row.annual_consumption_value_minor;
    const ratio = total === 0 ? 0 : cumulative / total;
    const klass: "A" | "B" | "C" = total === 0 ? "C" : index === 0 || ratio <= aCutoff ? "A" : ratio <= bCutoff ? "B" : "C";
    return { ...row, cumulative_value_minor: cumulative, cumulative_ratio: ratio, class: klass };
  });
}

export function classifyMovementAge(inputs: MovementAgeInput[], asOf: string, slowAfterDays: number, deadAfterDays: number): MovementAgeResult[] {
  if (!Number.isSafeInteger(slowAfterDays) || !Number.isSafeInteger(deadAfterDays) || slowAfterDays < 0 || deadAfterDays <= slowAfterDays) throw errors.validation("Movement thresholds must satisfy 0 <= slow < dead");
  const asOfTime = timestamp(asOf, "as_of");
  return inputs.map((input, index) => {
    const qty = safeNonNegative(input.on_hand_qty_micros, `inputs[${index}].on_hand_qty_micros`);
    if (qty === 0) return { ...input, on_hand_qty_micros: qty, age_days: null, status: "No Stock" };
    if (!input.last_movement_at) return { ...input, on_hand_qty_micros: qty, age_days: null, status: "Never Moved" };
    const age = dayAge(asOfTime, timestamp(input.last_movement_at, `inputs[${index}].last_movement_at`));
    const status = age >= deadAfterDays ? "Dead" : age >= slowAfterDays ? "Slow" : "Active";
    return { ...input, on_hand_qty_micros: qty, age_days: age, status };
  });
}
