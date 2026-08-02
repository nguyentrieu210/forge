import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter, SemanticModelRegistry, SemanticValueDefinition } from "./index.js";
import type { SemanticQueryExecutor } from "./service.js";

export type ForecastFrequency = "day" | "week" | "month";

export interface SemanticForecastRequest {
  model: string;
  timeDimension: string;
  metric: string;
  filters?: SemanticFilter[];
  frequency: ForecastFrequency;
  horizon: number;
  trainingLimit: number;
  /** Immutable snapshot/fingerprint of the source series used for this run. */
  sourceVersion: string;
}

export interface ForecastSeriesPoint {
  period: string;
  value: number;
}

export interface ForecastProviderInput {
  series: ForecastSeriesPoint[];
  frequency: ForecastFrequency;
  horizon: number;
  value: SemanticValueDefinition;
}

export interface ForecastProviderPoint {
  period: string;
  value: number;
  lower?: number;
  upper?: number;
}

export interface ForecastProviderResult {
  provider: string;
  modelVersion: string;
  points: ForecastProviderPoint[];
  diagnostics?: Record<string, JsonValue>;
}

/** Provider may be deterministic statistics, Workers AI, or an external model. */
export interface SemanticForecastProvider {
  forecast(input: ForecastProviderInput): Promise<ForecastProviderResult>;
}

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
const FREQUENCIES = new Set<ForecastFrequency>(["day", "week", "month"]);

function text(value: string, field: string, max: number): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

function exactValue(value: SemanticValueDefinition): boolean {
  return value.exact === true;
}

function numeric(value: unknown, field: string, exact: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw errors.validation(`${field} must be finite numeric data`);
  if (exact && !Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer for an exact metric`);
  return value;
}

function validateProviderResult(result: ForecastProviderResult, request: SemanticForecastRequest, value: SemanticValueDefinition): void {
  text(result.provider, "forecast provider", 120);
  text(result.modelVersion, "forecast modelVersion", 200);
  if (!Array.isArray(result.points) || result.points.length !== request.horizon) {
    throw errors.validation(`Forecast provider must return exactly ${request.horizon} points`);
  }
  const exact = exactValue(value);
  const periods = new Set<string>();
  for (const [index, point] of result.points.entries()) {
    text(point.period, `forecast point[${index}].period`, 80);
    if (periods.has(point.period)) throw errors.validation(`Forecast provider returned duplicate period ${point.period}`);
    periods.add(point.period);
    numeric(point.value, `forecast point[${index}].value`, exact);
    if (point.lower !== undefined) numeric(point.lower, `forecast point[${index}].lower`, exact);
    if (point.upper !== undefined) numeric(point.upper, `forecast point[${index}].upper`, exact);
    if (point.lower !== undefined && point.upper !== undefined && point.lower > point.upper) {
      throw errors.validation(`Forecast point[${index}] lower must not exceed upper`);
    }
  }
}

/**
 * Permission-aware forecast orchestration.
 *
 * Source data is obtained only through the semantic executor, so a provider never receives
 * tenant ids, SQL/view names, unauthorized rows, or raw document payloads. Provider output is
 * advisory only and carries immutable sourceVersion + provider/model provenance.
 */
export class SemanticForecastService {
  constructor(
    private readonly registry: SemanticModelRegistry,
    private readonly executor: SemanticQueryExecutor,
    private readonly provider: SemanticForecastProvider,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(tenantId: string, request: SemanticForecastRequest): Promise<SemanticForecastResult> {
    if (!tenantId.trim()) throw errors.validation("tenantId is required");
    if (!ID.test(request.model)) throw errors.validation("forecast model is invalid");
    if (!MEMBER.test(request.timeDimension) || !MEMBER.test(request.metric)) throw errors.validation("forecast semantic members are invalid");
    if (!FREQUENCIES.has(request.frequency)) throw errors.validation("forecast frequency is unsupported");
    if (!Number.isSafeInteger(request.horizon) || request.horizon < 1 || request.horizon > 60) throw errors.validation("forecast horizon must be 1..60");
    if (!Number.isSafeInteger(request.trainingLimit) || request.trainingLimit < 3 || request.trainingLimit > 2_000) throw errors.validation("forecast trainingLimit must be 3..2000");
    text(request.sourceVersion, "forecast sourceVersion", 200);
    if ((request.filters?.length ?? 0) > 20) throw errors.validation("forecast has too many filters");

    const model = this.registry.get(request.model);
    const time = model.dimensions.find((dimension) => dimension.id === request.timeDimension);
    if (!time || (time.kind !== "date" && time.kind !== "datetime")) throw errors.validation("forecast timeDimension must be a date/datetime dimension");
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

    const exact = exactValue(metric.value);
    const series: ForecastSeriesPoint[] = semantic.result.map((row, index) => {
      const period = row[request.timeDimension];
      if (typeof period !== "string" || !period.trim() || period.length > 80) throw errors.validation(`Forecast source row ${index} has invalid period`);
      return { period, value: numeric(row[request.metric], `Forecast source row ${index} metric`, exact) };
    });
    if (series.length < 3) throw errors.validation("Forecast requires at least 3 permission-visible source points");
    for (let index = 1; index < series.length; index += 1) {
      if (series[index - 1]!.period >= series[index]!.period) {
        throw errors.validation("Forecast source periods must be unique and ascending");
      }
    }

    const forecast = await this.provider.forecast({
      series,
      frequency: request.frequency,
      horizon: request.horizon,
      value: { ...metric.value },
    });
    validateProviderResult(forecast, request, metric.value);

    return {
      model: request.model,
      metric: request.metric,
      timeDimension: request.timeDimension,
      frequency: request.frequency,
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
