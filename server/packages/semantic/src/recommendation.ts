import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  SemanticFilter,
  SemanticModelRegistry,
  SemanticOrder,
  SemanticValueDefinition,
} from "./index.js";
import type { SemanticQueryExecutor } from "./service.js";
import { assertSemanticFilterRuntimeInput } from "./validation.js";

export interface SemanticRecommendationRequest {
  model: string;
  objective: string;
  dimensions?: string[];
  metrics: string[];
  filters?: SemanticFilter[];
  order_by?: SemanticOrder[];
  limit: number;
  sourceVersion: string;
}

export interface SemanticRecommendationProviderInput {
  objective: string;
  model: string;
  dimensions: Array<{ id: string; label: string; kind: string }>;
  metrics: Array<{ id: string; label: string; value: SemanticValueDefinition }>;
  rows: Array<Record<string, JsonValue>>;
}

export interface SemanticRecommendationEvidencePointer {
  row: number;
  member: string;
}

export interface SemanticRecommendationCandidate {
  id: string;
  title: string;
  rationale: string;
  confidence?: number;
  evidence: SemanticRecommendationEvidencePointer[];
}

export interface SemanticRecommendationProviderResult {
  provider: string;
  modelVersion: string;
  recommendations: SemanticRecommendationCandidate[];
}

export interface SemanticRecommendationProvider {
  recommend(input: SemanticRecommendationProviderInput): Promise<SemanticRecommendationProviderResult>;
}

export interface SemanticRecommendationEvidence extends SemanticRecommendationEvidencePointer {
  observed: JsonValue;
}

export interface SemanticRecommendation extends Omit<SemanticRecommendationCandidate, "evidence"> {
  evidence: SemanticRecommendationEvidence[];
}

export interface SemanticRecommendationResult {
  model: string;
  objective: string;
  sourceVersion: string;
  provider: string;
  modelVersion: string;
  generatedAt: string;
  sourceRows: number;
  recommendations: SemanticRecommendation[];
}

const STABLE_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER_ID = /^[a-z][a-z0-9_]{0,79}$/;

function requireStableId(value: string, field: string): void {
  if (typeof value !== "string" || !STABLE_ID.test(value)) throw errors.validation(`${field} is not a valid stable id`);
}

function requireMemberId(value: string, field: string): void {
  if (typeof value !== "string" || !MEMBER_ID.test(value)) throw errors.validation(`${field} is not a valid member id`);
}

function requireText(value: string, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return value;
}

function requireFinite(value: number, field: string, min?: number, max?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
  if (min !== undefined && value < min) throw errors.validation(`${field} must be >= ${min}`);
  if (max !== undefined && value > max) throw errors.validation(`${field} must be <= ${max}`);
  return value;
}

function onlyKeys(value: object, allowed: string[], field: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) if (!set.has(key)) throw errors.validation(`${field} contains unsupported key ${key}`);
}

function uniqueMembers(values: string[] | undefined, field: string, max: number): string[] {
  const result = values ?? [];
  if (!Array.isArray(result) || result.length > max) throw errors.validation(`${field} has too many entries`);
  const seen = new Set<string>();
  for (const member of result) {
    requireMemberId(member, field);
    if (seen.has(member)) throw errors.validation(`${field} repeats member ${member}`);
    seen.add(member);
  }
  return result;
}

/**
 * Advisory recommendation orchestration over permission-visible semantic rows.
 * The provider receives no tenant id, SQL/view/physical field names or write/action contract.
 * Every returned recommendation must cite concrete source cells; observed values are joined
 * back by Forge instead of trusting provider-supplied evidence values.
 */
export class SemanticRecommendationService {
  constructor(
    private readonly registry: SemanticModelRegistry,
    private readonly executor: SemanticQueryExecutor,
    private readonly provider: SemanticRecommendationProvider,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(tenantId: string, request: SemanticRecommendationRequest): Promise<SemanticRecommendationResult> {
    requireText(tenantId, "tenantId", 200);
    requireStableId(request.model, "recommendation model");
    const objective = requireText(request.objective, "recommendation objective", 1_000);
    const sourceVersion = requireText(request.sourceVersion, "recommendation sourceVersion", 200);
    if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 200) throw errors.validation("recommendation limit must be an integer from 1 to 200");

    const model = this.registry.get(request.model);
    const dimensions = uniqueMembers(request.dimensions, "recommendation dimensions", 20);
    const metrics = uniqueMembers(request.metrics, "recommendation metrics", 20);
    if (metrics.length === 0) throw errors.validation("recommendation requires at least one metric");
    const dimensionById = new Map(model.dimensions.map((dimension) => [dimension.id, dimension]));
    const metricById = new Map(model.metrics.map((metric) => [metric.id, metric]));
    for (const dimension of dimensions) if (!dimensionById.has(dimension)) throw errors.validation(`Unknown recommendation dimension ${dimension}`);
    for (const metric of metrics) if (!metricById.has(metric)) throw errors.validation(`Unknown recommendation metric ${metric}`);

    if (!Array.isArray(request.filters ?? []) || (request.filters?.length ?? 0) > 20) throw errors.validation("recommendation filters must contain at most 20 entries");
    for (const [index, filter] of (request.filters ?? []).entries()) {
      if (!dimensionById.has(filter.dimension)) throw errors.validation(`Unknown recommendation filter dimension ${filter.dimension}`);
      assertSemanticFilterRuntimeInput(filter, `recommendation filters[${index}]`);
    }

    const selected = new Set([...dimensions, ...metrics]);
    if (!Array.isArray(request.order_by ?? []) || (request.order_by?.length ?? 0) > 20) throw errors.validation("recommendation order_by must contain at most 20 entries");
    for (const order of request.order_by ?? []) {
      requireMemberId(order.id, "recommendation order member");
      if (!selected.has(order.id)) throw errors.validation(`Recommendation order member must be selected: ${order.id}`);
      if (order.direction !== "asc" && order.direction !== "desc") throw errors.validation("recommendation order direction is invalid");
    }

    const source = await this.executor.run({
      tenant_id: tenantId,
      model: request.model,
      dimensions,
      metrics,
      filters: [...(request.filters ?? [])],
      order_by: [...(request.order_by ?? [])],
      limit: request.limit,
    });
    if (source.row_count !== source.result.length) throw errors.validation("recommendation source row_count does not match result length");
    for (const [rowIndex, row] of source.result.entries()) {
      for (const metricId of metrics) {
        if (!(metricId in row)) throw errors.validation(`recommendation source row ${rowIndex} is missing metric ${metricId}`);
        const definition = metricById.get(metricId);
        if (!definition) throw errors.validation(`Unknown recommendation metric ${metricId}`);
        const value = row[metricId];
        if (definition.value.exact === true && (typeof value !== "number" || !Number.isSafeInteger(value))) {
          throw errors.validation(`recommendation source row ${rowIndex} metric ${metricId} must be a safe integer for an exact metric`);
        }
      }
    }

    const providerInput: SemanticRecommendationProviderInput = {
      objective,
      model: request.model,
      dimensions: dimensions.map((id) => {
        const definition = dimensionById.get(id);
        if (!definition) throw errors.validation(`Unknown recommendation dimension ${id}`);
        return { id, label: definition.label, kind: definition.kind };
      }),
      metrics: metrics.map((id) => {
        const definition = metricById.get(id);
        if (!definition) throw errors.validation(`Unknown recommendation metric ${id}`);
        return { id, label: definition.label, value: structuredClone(definition.value) };
      }),
      rows: structuredClone(source.result),
    };

    const proposed = await this.provider.recommend(providerInput);
    if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) throw errors.validation("recommendation provider result must be an object");
    onlyKeys(proposed, ["provider", "modelVersion", "recommendations"], "recommendation provider result");
    const provider = requireText(proposed.provider, "recommendation provider", 120);
    const modelVersion = requireText(proposed.modelVersion, "recommendation modelVersion", 200);
    if (!Array.isArray(proposed.recommendations) || proposed.recommendations.length > 20) throw errors.validation("recommendation provider returned too many recommendations");

    const ids = new Set<string>();
    const recommendations = proposed.recommendations.map((candidate, index): SemanticRecommendation => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw errors.validation(`recommendation[${index}] must be an object`);
      onlyKeys(candidate, ["id", "title", "rationale", "confidence", "evidence"], `recommendation[${index}]`);
      requireStableId(candidate.id, `recommendation[${index}].id`);
      if (ids.has(candidate.id)) throw errors.validation(`recommendation provider repeated id ${candidate.id}`);
      ids.add(candidate.id);
      const title = requireText(candidate.title, `recommendation[${index}].title`, 200);
      const rationale = requireText(candidate.rationale, `recommendation[${index}].rationale`, 1_000);
      const confidence = candidate.confidence === undefined ? undefined : requireFinite(candidate.confidence, `recommendation[${index}].confidence`, 0, 1);
      if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0 || candidate.evidence.length > 10) {
        throw errors.validation(`recommendation[${index}] must cite 1-10 source cells`);
      }
      const evidence: SemanticRecommendationEvidence[] = candidate.evidence.map((pointer, evidenceIndex) => {
        if (!pointer || typeof pointer !== "object" || Array.isArray(pointer)) throw errors.validation(`recommendation[${index}].evidence[${evidenceIndex}] must be an object`);
        onlyKeys(pointer, ["row", "member"], `recommendation[${index}].evidence[${evidenceIndex}]`);
        if (!Number.isSafeInteger(pointer.row) || pointer.row < 0 || pointer.row >= source.result.length) {
          throw errors.validation(`recommendation[${index}].evidence[${evidenceIndex}].row is outside the permission-visible source`);
        }
        requireMemberId(pointer.member, `recommendation[${index}].evidence[${evidenceIndex}].member`);
        if (!selected.has(pointer.member)) throw errors.validation(`recommendation[${index}] cites unselected member ${pointer.member}`);
        const row = source.result[pointer.row];
        if (!row) throw errors.validation(`recommendation[${index}] evidence row ${pointer.row} is outside the permission-visible source`);
        const observed = row[pointer.member];
        if (observed === undefined) throw errors.validation(`recommendation[${index}] evidence member ${pointer.member} is absent from source row ${pointer.row}`);
        return { row: pointer.row, member: pointer.member, observed: structuredClone(observed) };
      });
      return {
        id: candidate.id,
        title,
        rationale,
        ...(confidence !== undefined ? { confidence } : {}),
        evidence,
      };
    });

    return {
      model: request.model,
      objective,
      sourceVersion,
      provider,
      modelVersion,
      generatedAt: this.now(),
      sourceRows: source.row_count,
      recommendations,
    };
  }
}
