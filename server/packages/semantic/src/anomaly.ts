import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter, SemanticModelRegistry, SemanticValueDefinition } from "./index.js";
import type { SemanticQueryExecutor } from "./service.js";

export interface SemanticAnomalyRequest {
  model: string;
  timeDimension: string;
  metric: string;
  filters?: SemanticFilter[];
  limit: number;
  sourceVersion: string;
}

export interface AnomalySeriesPoint {
  period: string;
  value: number;
}

export interface SemanticAnomalyProviderInput {
  series: AnomalySeriesPoint[];
  value: SemanticValueDefinition;
}

export interface SemanticAnomalyCandidate {
  period: string;
  /** Provider-defined normalized score; advisory, not a business threshold. */
  score: number;
  direction?: "high" | "low" | "other";
  explanation?: string;
}

export interface SemanticAnomalyProviderResult {
  provider: string;
  modelVersion: string;
  anomalies: SemanticAnomalyCandidate[];
  diagnostics?: Record<string, JsonValue>;
}

export interface SemanticAnomalyProvider {
  detect(input: SemanticAnomalyProviderInput): Promise<SemanticAnomalyProviderResult>;
}

export interface SemanticAnomalyFinding extends SemanticAnomalyCandidate {
  observed: number;
}

export interface SemanticAnomalyResult {
  model: string;
  metric: string;
  timeDimension: string;
  sourceVersion: string;
  provider: string;
  modelVersion: string;
  generatedAt: string;
  sourcePoints: number;
  findings: SemanticAnomalyFinding[];
  diagnostics?: Record<string, JsonValue>;
}

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER = /^[a-z][a-z0-9_]{0,79}$/;

function text(value: string, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return value;
}

function number(value: unknown, field: string, exact: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
  if (exact && !Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer for an exact metric`);
  return value;
}

/**
 * Advisory anomaly orchestration over permission-visible semantic data.
 * The provider never sees tenant/schema/raw documents and cannot invent the observed value:
 * findings are joined back to the authoritative source series by period.
 */
export class SemanticAnomalyService {
  constructor(
    private readonly registry: SemanticModelRegistry,
    private readonly executor: SemanticQueryExecutor,
    private readonly provider: SemanticAnomalyProvider,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(tenantId: string, request: SemanticAnomalyRequest): Promise<SemanticAnomalyResult> {
    text(tenantId, "tenantId", 200);
    if (!ID.test(request.model)) throw errors.validation("anomaly model is invalid");
    if (!MEMBER.test(request.timeDimension) || !MEMBER.test(request.metric)) throw errors.validation("anomaly semantic members are invalid");
    if (!Array.isArray(request.filters ?? []) || (request.filters?.length ?? 0) > 20) throw errors.validation("anomaly filters must contain at most 20 entries");
    if (!Number.isSafeInteger(request.limit) || request.limit < 3 || request.limit > 2_000) throw errors.validation("anomaly limit must be 3..2000");
    text(request.sourceVersion, "anomaly sourceVersion", 200);

    const model = this.registry.get(request.model);
    const time = model.dimensions.find((dimension) => dimension.id === request.timeDimension);
    if (!time || (time.kind !== "date" && time.kind !== "datetime")) throw errors.validation("anomaly timeDimension must be a date/datetime dimension");
    const metric = model.metrics.find((candidate) => candidate.id === request.metric);
    if (!metric) throw errors.validation(`Unknown anomaly metric ${request.metric}`);
    if (metric.additive === "non") throw errors.validation(`Anomaly metric ${request.metric} is non-additive and needs an explicit derived-series contract`);

    const source = await this.executor.run({
      tenant_id: tenantId,
      model: request.model,
      dimensions: [request.timeDimension],
      metrics: [request.metric],
      filters: [...(request.filters ?? [])],
      order_by: [{ id: request.timeDimension, direction: "asc" }],
      limit: request.limit,
    });
    const exact = metric.value.exact === true;
    const series: AnomalySeriesPoint[] = source.result.map((row, index) => {
      const period = row[request.timeDimension];
      if (typeof period !== "string" || !period.trim() || period.length > 80) throw errors.validation(`Anomaly source row ${index} has invalid period`);
      return { period, value: number(row[request.metric], `Anomaly source row ${index} metric`, exact) };
    });
    if (series.length < 3) throw errors.validation("Anomaly detection requires at least 3 permission-visible source points");
    const byPeriod = new Map<string, number>();
    for (const point of series) {
      if (byPeriod.has(point.period)) throw errors.validation(`Anomaly source contains duplicate period ${point.period}`);
      byPeriod.set(point.period, point.value);
    }

    const detected = await this.provider.detect({ series, value: { ...metric.value } });
    text(detected.provider, "anomaly provider", 120);
    text(detected.modelVersion, "anomaly modelVersion", 200);
    if (!Array.isArray(detected.anomalies) || detected.anomalies.length > series.length) throw errors.validation("anomaly provider returned an invalid finding count");
    const seen = new Set<string>();
    const findings = detected.anomalies.map((candidate, index): SemanticAnomalyFinding => {
      text(candidate.period, `anomaly[${index}].period`, 80);
      if (seen.has(candidate.period)) throw errors.validation(`anomaly provider repeated period ${candidate.period}`);
      seen.add(candidate.period);
      const observed = byPeriod.get(candidate.period);
      if (observed === undefined) throw errors.validation(`anomaly provider returned period outside source series: ${candidate.period}`);
      const score = number(candidate.score, `anomaly[${index}].score`, false);
      if (candidate.direction !== undefined && !["high", "low", "other"].includes(candidate.direction)) throw errors.validation(`anomaly[${index}].direction is invalid`);
      const explanation = candidate.explanation === undefined ? undefined : text(candidate.explanation, `anomaly[${index}].explanation`, 500);
      return {
        period: candidate.period,
        score,
        observed,
        ...(candidate.direction ? { direction: candidate.direction } : {}),
        ...(explanation ? { explanation } : {}),
      };
    });

    return {
      model: request.model,
      metric: request.metric,
      timeDimension: request.timeDimension,
      sourceVersion: request.sourceVersion,
      provider: detected.provider,
      modelVersion: detected.modelVersion,
      generatedAt: this.now(),
      sourcePoints: series.length,
      findings,
      ...(detected.diagnostics ? { diagnostics: detected.diagnostics } : {}),
    };
  }
}
