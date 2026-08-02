import { errors } from "../../core/src/index.js";
import type { SemanticValueDefinition, SemanticValueKind } from "./index.js";

export type PlanningRoundingMode = "half_away_from_zero" | "floor" | "ceil" | "truncate";
export type PlanningAdjustmentOperation = "set" | "delta" | "basis_points";

export interface PlanningMetricDefinition {
  id: string;
  label: string;
  value: SemanticValueDefinition;
}

export interface PlanningCell {
  metric: string;
  dimensions: Record<string, string>;
  value: number;
}

export interface PlanningAdjustment {
  id: string;
  metric: string;
  /** Empty selector means all baseline cells for the metric. */
  selector?: Record<string, string>;
  operation: PlanningAdjustmentOperation;
  /**
   * set/delta: metric storage units. basis_points: 100 = +1%, -100 = -1%.
   * Exact scaled metrics never pass through binary floating point for basis-point math.
   */
  value: number;
  rounding?: PlanningRoundingMode;
  reason?: string;
}

export interface PlanningScenario {
  id: string;
  label: string;
  /** Immutable business/source version of the baseline being planned from. */
  baselineVersion: string;
  adjustments: PlanningAdjustment[];
}

export interface PlanningAuditEntry {
  adjustmentId: string;
  metric: string;
  cellKey: string;
  operation: PlanningAdjustmentOperation;
  before: number;
  after: number;
  operand: number;
  rounding?: PlanningRoundingMode;
  reason?: string;
}

export interface PlanningProjection {
  scenarioId: string;
  baselineVersion: string;
  cells: PlanningCell[];
  audit: PlanningAuditEntry[];
}

const STABLE_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const DIMENSION_ID = /^[a-z][a-z0-9_]{0,79}$/;
const BASIS = 10_000n;
const VALUE_KINDS = new Set<SemanticValueKind>(["integer", "number", "currency", "quantity", "percent", "duration"]);
const ROUNDING = new Set<PlanningRoundingMode>(["half_away_from_zero", "floor", "ceil", "truncate"]);
const OPERATIONS = new Set<PlanningAdjustmentOperation>(["set", "delta", "basis_points"]);

function requireStableId(value: string, field: string): void {
  if (typeof value !== "string" || !STABLE_ID.test(value)) throw errors.validation(`${field} must be a stable lowercase id`);
}

function requireText(value: string, field: string, max = 240): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

function validatePlanningValue(value: SemanticValueDefinition, metricId: string): void {
  if (!VALUE_KINDS.has(value.kind)) throw errors.validation(`Planning metric ${metricId} value kind is unsupported`);
  if (value.exact !== undefined && typeof value.exact !== "boolean") throw errors.validation(`Planning metric ${metricId} exact must be boolean`);
  if (value.scale !== undefined) {
    if (!Number.isSafeInteger(value.scale) || value.scale < 1 || value.scale > 1_000_000_000) {
      throw errors.validation(`Planning metric ${metricId} scale must be a positive safe integer <= 1000000000`);
    }
    if (value.exact !== true) throw errors.validation(`Planning metric ${metricId} with scale must declare exact=true`);
  }
  if (value.unit !== undefined) requireText(value.unit, `Planning metric ${metricId} unit`, 40);
  if (value.currencyDimension !== undefined) {
    if (!DIMENSION_ID.test(value.currencyDimension)) throw errors.validation(`Planning metric ${metricId} currencyDimension is invalid`);
  }
}

function exactMetric(metric: PlanningMetricDefinition): boolean {
  return metric.value.exact === true;
}

function validateNumber(value: number, field: string, exact: boolean): void {
  if (!Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
  if (exact && !Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer for an exact metric`);
}

function normalizeDimensions(value: Record<string, string>, field: string): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be an object`);
  const output: Record<string, string> = {};
  const entries = Object.entries(value);
  if (entries.length > 20) throw errors.validation(`${field} has too many dimensions`);
  for (const [key, raw] of entries) {
    if (!DIMENSION_ID.test(key)) throw errors.validation(`${field} contains invalid dimension ${key}`);
    if (typeof raw !== "string" || !raw.trim() || raw.length > 200) throw errors.validation(`${field}.${key} must be non-empty and at most 200 characters`);
    output[key] = raw;
  }
  return output;
}

function cellKey(cell: Pick<PlanningCell, "metric" | "dimensions">): string {
  const dimensions = Object.entries(cell.dimensions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("|");
  return `${cell.metric}|${dimensions}`;
}

function matchesSelector(cell: PlanningCell, selector: Record<string, string>): boolean {
  return Object.entries(selector).every(([key, value]) => cell.dimensions[key] === value);
}

function divideRounded(numerator: bigint, denominator: bigint, mode: PlanningRoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || mode === "truncate") return quotient;
  if (mode === "floor") return numerator < 0n ? quotient - 1n : quotient;
  if (mode === "ceil") return numerator > 0n ? quotient + 1n : quotient;
  const magnitude = remainder < 0n ? -remainder : remainder;
  if (magnitude * 2n < denominator) return quotient;
  return quotient + (numerator < 0n ? -1n : 1n);
}

function safeBigIntNumber(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw errors.validation(`${field} exceeds safe integer range`);
  }
  return Number(value);
}

function applyAdjustment(before: number, adjustment: PlanningAdjustment, metric: PlanningMetricDefinition): number {
  const exact = exactMetric(metric);
  validateNumber(adjustment.value, `Adjustment ${adjustment.id} value`, exact || adjustment.operation === "basis_points");
  if (adjustment.rounding !== undefined && !ROUNDING.has(adjustment.rounding)) throw errors.validation(`Adjustment ${adjustment.id} rounding is unsupported`);
  if (adjustment.operation !== "basis_points" && adjustment.rounding !== undefined) {
    throw errors.validation(`Adjustment ${adjustment.id} rounding is only valid for basis_points`);
  }

  if (adjustment.operation === "set") return adjustment.value;
  if (adjustment.operation === "delta") {
    const result = before + adjustment.value;
    validateNumber(result, `Adjustment ${adjustment.id} result`, exact);
    return result;
  }

  if (!Number.isSafeInteger(adjustment.value) || adjustment.value < -10_000 || adjustment.value > 1_000_000) {
    throw errors.validation(`Adjustment ${adjustment.id} basis points must be an integer from -10000 to 1000000`);
  }
  const factor = BASIS + BigInt(adjustment.value);
  if (exact) {
    const rounding = adjustment.rounding;
    if (!rounding) throw errors.validation(`Adjustment ${adjustment.id} requires explicit rounding for exact basis-point math`);
    const numerator = BigInt(before) * factor;
    return safeBigIntNumber(divideRounded(numerator, BASIS, rounding), `Adjustment ${adjustment.id} result`);
  }
  const result = before * (1 + adjustment.value / 10_000);
  validateNumber(result, `Adjustment ${adjustment.id} result`, false);
  return result;
}

export class PlanningMetricRegistry {
  private readonly metrics = new Map<string, PlanningMetricDefinition>();

  constructor(definitions: PlanningMetricDefinition[]) {
    if (!Array.isArray(definitions) || definitions.length > 200) throw errors.validation("Planning metric definitions must contain at most 200 entries");
    for (const definition of definitions) {
      requireStableId(definition.id, "planning metric id");
      requireText(definition.label, `Planning metric ${definition.id} label`, 160);
      if (this.metrics.has(definition.id)) throw errors.validation(`Duplicate planning metric ${definition.id}`);
      validatePlanningValue(definition.value, definition.id);
      this.metrics.set(definition.id, definition);
    }
  }

  get(id: string): PlanningMetricDefinition {
    const metric = this.metrics.get(id);
    if (!metric) throw errors.validation(`Unknown planning metric ${id}`);
    return metric;
  }
}

/**
 * Applies a scenario to an immutable baseline. This is deliberately a pure projection:
 * no ledger/document is mutated, no scenario result silently becomes authoritative data.
 */
export class ScenarioPlanningEngine {
  constructor(private readonly metrics: PlanningMetricRegistry) {}

  project(baseline: PlanningCell[], scenario: PlanningScenario): PlanningProjection {
    if (!Array.isArray(baseline) || baseline.length > 100_000) throw errors.validation("Planning baseline must contain at most 100000 cells");
    requireStableId(scenario.id, "scenario.id");
    requireText(scenario.label, `Scenario ${scenario.id} label`, 160);
    requireText(scenario.baselineVersion, `Scenario ${scenario.id} baselineVersion`, 200);
    if (!Array.isArray(scenario.adjustments) || scenario.adjustments.length > 500) throw errors.validation(`Scenario ${scenario.id} has too many adjustments`);

    const seenCells = new Set<string>();
    const cells = baseline.map((cell, index) => {
      requireStableId(cell.metric, `baseline[${index}].metric`);
      const metric = this.metrics.get(cell.metric);
      const dimensions = normalizeDimensions(cell.dimensions, `baseline[${index}].dimensions`);
      validateNumber(cell.value, `baseline[${index}].value`, exactMetric(metric));
      const copy = { metric: cell.metric, dimensions, value: cell.value };
      const key = cellKey(copy);
      if (seenCells.has(key)) throw errors.validation(`Duplicate planning baseline cell ${key}`);
      seenCells.add(key);
      return copy;
    });

    const audit: PlanningAuditEntry[] = [];
    const adjustmentIds = new Set<string>();
    for (const adjustment of scenario.adjustments) {
      requireStableId(adjustment.id, "adjustment.id");
      requireStableId(adjustment.metric, `Adjustment ${adjustment.id} metric`);
      if (adjustmentIds.has(adjustment.id)) throw errors.validation(`Duplicate adjustment ${adjustment.id}`);
      adjustmentIds.add(adjustment.id);
      const metric = this.metrics.get(adjustment.metric);
      const selector = normalizeDimensions(adjustment.selector ?? {}, `Adjustment ${adjustment.id} selector`);
      if (!OPERATIONS.has(adjustment.operation)) throw errors.validation(`Adjustment ${adjustment.id} has unsupported operation`);
      if (adjustment.reason !== undefined) requireText(adjustment.reason, `Adjustment ${adjustment.id} reason`, 500);

      const matches = cells.filter((cell) => cell.metric === adjustment.metric && matchesSelector(cell, selector));
      if (matches.length === 0) throw errors.validation(`Adjustment ${adjustment.id} matches no baseline cell`);
      for (const cell of matches) {
        const before = cell.value;
        const after = applyAdjustment(before, adjustment, metric);
        cell.value = after;
        audit.push({
          adjustmentId: adjustment.id,
          metric: adjustment.metric,
          cellKey: cellKey(cell),
          operation: adjustment.operation,
          before,
          after,
          operand: adjustment.value,
          ...(adjustment.rounding ? { rounding: adjustment.rounding } : {}),
          ...(adjustment.reason ? { reason: adjustment.reason } : {}),
        });
      }
    }

    return {
      scenarioId: scenario.id,
      baselineVersion: scenario.baselineVersion,
      cells,
      audit,
    };
  }
}
