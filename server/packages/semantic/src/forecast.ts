import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter, SemanticModelRegistry, SemanticValueDefinition } from "./index.js";
import type { SemanticQueryExecutor } from "./service.js";
import { assertSemanticFilterRuntimeInput } from "./validation.js";

/** Week/month bucketing needs a timezone-aware semantic date-bucket contract; not faked here. */
export type ForecastFrequency = "day";

export interface SemanticForecastRequest {
  model: string;
  timeDimension: string;
  metric: string;
  filters?: SemanticFilter[];
  frequency: ForecastFrequency;
  horizon: number;
  trainingLimit: number;
  sourceVersion: string;
}

export interface ForecastSeriesPoint { period: string; value: number }
export interface ForecastProviderInput {
  series: ForecastSeriesPoint[];
  frequency: ForecastFrequency;
  horizon: number;
  value: SemanticValueDefinition;
}
export interface ForecastProviderPoint { period: string; value: number; lower?: number; upper?: number }
export interface ForecastProviderResult {
  provider: string;
  modelVersion: string;
  points: ForecastProviderPoint[];
  diagnostics?: Record<string, JsonValue>;
}
export interface SemanticForecastProvider { forecast(input: ForecastProviderInput): Promise<ForecastProviderResult> }
export interface SemanticForecastResult {
  model: string;
  metric: string;
  timeDimension: string;
  frequency: ForecastFrequency;
  sourceVersion: string;
  provider: string;
  modelVersion: string;
  generatedAt: string;
  trainingPoints: number;
  points: ForecastProviderPoint[];
  diagnostics?: Record<string, JsonValue>;
}

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER = /^[a-z][a-z0-9_]{0,79}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(value: string, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return value;
}
function exactValue(value: SemanticValueDefinition): boolean { return value.exact === true }
function numeric(value: unknown, field: string, exact: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw errors.validation(`${field} must be finite numeric data`);
  if (exact && !Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer for an exact metric`);
  return value;
}
function day(value: unknown, field: string): string {
  if (typeof value !== "string" || !DAY.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw errors.validation(`${field} must be YYYY-MM-DD`);
  return value;
}

function validateProviderResult(result: ForecastProviderResult, request: SemanticForecastRequest, value: SemanticValueDefinition, lastSourcePeriod: string): void {
  if (!result || typeof result !== "object") throw errors.validation("forecast provider result is invalid");
  text(result.provider, "forecast provider", 120);
  text(result.modelVersion, "forecast modelVersion", 200);
  if (!Array.isArray(result.points) || result.points.length !== request.horizon) throw errors.validation(`Forecast provider must return exactly ${request.horizon} points`);
  const exact = exactValue(value);
  let previous = lastSourcePeriod;
  for (const [index, point] of result.points.entries()) {
    const period = day(point.period, `forecast point[${index}].period`);
    if (period <= previous) throw errors.validation(`Forecast point[${index}] must be strictly after the source series and previous forecast point`);
    previous = period;
    numeric(point.value, `forecast point[${index}].value`, exact);
    if (point.lower !== undefined) numeric(point.lower, `forecast point[${index}].lower`, exact);
    if (point.upper !== undefined) numeric(point.upper, `forecast point[${index}].upper`, exact);
    if (point.lower !== undefined && point.upper !== undefined && point.lower > point.upper) throw errors.validation(`Forecast point[${index}] lower must not exceed upper`);
  }
}

export class SemanticForecastService {
  constructor(
    private readonly registry: SemanticModelRegistry,
    private readonly executor: SemanticQueryExecutor,
    private readonly provider: SemanticForecastProvider,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(tenantId: string, request: SemanticForecastRequest): Promise<SemanticForecastResult> {
    text(tenantId, "tenantId", 200);
    if (!request || typeof request !== "object") throw errors.validation("forecast request is required");
    if (!ID.test(request.model)) throw errors.validation("forecast model is invalid");
    if (!MEMBER.test(request.timeDimension) || !MEMBER.test(request.metric)) throw errors.validation("forecast semantic members are invalid");
    if (request.frequency !== "day") throw errors.validation("forecast currently supports only daily source series; week/month need timezone-aware bucketing");
    if (!Number.isSafeInteger(request.horizon) || request.horizon < 1 || request.horizon > 60) throw errors.validation("forecast horizon must be 1..60");
    if (!Number.isSafeInteger(request.trainingLimit) || request.trainingLimit < 3 || request.trainingLimit > 2_000) throw errors.validation("forecast trainingLimit must be 3..2000");
    text(request.sourceVersion, "forecast sourceVersion", 200);
    if (!Array.isArray(request.filters ?? []) || (request.filters?.length ?? 0) > 20) throw errors.validation("forecast filters must contain at most 20 entries");
    request.filters?.forEach((filter, index) => assertSemanticFilterRuntimeInput(filter, `forecast filters[${index}]`));

    const model = this.registry.get(request.model);
    const time = model.dimensions.find((dimension) => dimension.id === request.timeDimension);
    if (!time || time.kind !== "date") throw errors.validation("daily forecast timeDimension must be a Date dimension");
    const metric = model.metrics.find((candidate) => candidate.id === request.metric);
    if (!metric) throw errors.validation(`Unknown forecast metric ${request.metric}`);
    if (metric.additive === "non") throw errors.validation(`Forecast metric ${request.metric} is non-additive and needs an explicit derived-series contract`);

    const semantic = await this.executor.run({
      model: request.model,
      tenant_id: tenantId,
      dimensions: [request.timeDimension],
      metrics: [request.metric],
      filters: [...(request.filters ?? [])],
      order_by: [{ id: request.timeDimension, direction: "asc" }],
      limit: request.trainingLimit,
    });
    if (semantic.model !== request.model) throw errors.validation("forecast executor returned the wrong semantic model");

    const exact = exactValue(metric.value);
    const series: ForecastSeriesPoint[] = semantic.result.map((row, index) => ({
      period: day(row[request.timeDimension], `Forecast source row ${index} period`),
      value: numeric(row[request.metric], `Forecast source row ${index} metric`, exact),
    }));
    if (series.length < 3) throw errors.validation("Forecast requires at least 3 permission-visible source points");
    for (let index = 1; index < series.length; index += 1) {
      if (series[index - 1]!.period >= series[index]!.period) throw errors.validation("Forecast source periods must be unique and ascending");
    }

    const forecast = await this.provider.forecast({ series, frequency: "day", horizon: request.horizon, value: { ...metric.value } });
    validateProviderResult(forecast, request, metric.value, series.at(-1)!.period);

    return {
      model: request.model,
      metric: request.metric,
      timeDimension: request.timeDimension,
      frequency: "day",
      sourceVersion: request.sourceVersion,
      provider: forecast.provider,
      modelVersion: forecast.modelVersion,
      generatedAt: this.now(),
      trainingPoints: series.length,
      points: forecast.points,
      ...(forecast.diagnostics ? { diagnostics: forecast.diagnostics } : {}),
    };
  }
}
