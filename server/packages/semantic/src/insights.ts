import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  SemanticFilter,
  SemanticModelDefinition,
  SemanticModelRegistry,
  SemanticOrder,
  SemanticQueryRequest,
} from "./index.js";

export type InsightKind = "kpi" | "chart" | "pivot" | "table";

export interface SemanticInsightDefinition {
  id: string;
  label: string;
  description?: string;
  kind: InsightKind;
  model: string;
  dimensions?: string[];
  metrics?: string[];
  /** Fixed business filters owned by the insight definition. */
  filters?: SemanticFilter[];
  order_by?: SemanticOrder[];
  limit?: number;
  /** Runtime/global filters may only bind these semantic dimensions. */
  scopeDimensions?: string[];
  /** Required for KPI; optional for other insight kinds. */
  primaryMetric?: string;
  drillThrough?: SemanticDrillThroughDefinition[];
}

export interface SemanticDrillBinding {
  sourceDimension: string;
  targetDimension: string;
}

export interface SemanticDrillThroughDefinition {
  id: string;
  label: string;
  /** Another registered insight supplies target projection/model. */
  targetInsight: string;
  bindings: SemanticDrillBinding[];
}

export interface SemanticInsightSummary {
  id: string;
  label: string;
  description?: string;
  kind: InsightKind;
  model: string;
  dimensions: string[];
  metrics: string[];
  primaryMetric?: string;
  scopeDimensions: string[];
  drillThrough: Array<{ id: string; label: string; targetInsight: string }>;
}

const STABLE_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER_ID = /^[a-z][a-z0-9_]{0,79}$/;
const KINDS = new Set<InsightKind>(["kpi", "chart", "pivot", "table"]);

function requireId(value: string, field: string, member = false): void {
  const pattern = member ? MEMBER_ID : STABLE_ID;
  if (!pattern.test(value)) throw errors.validation(`${field} is not a valid stable id`);
}

function requireText(value: string, field: string, max = 200): void {
  if (!value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

function uniqueMembers(values: string[] | undefined, field: string, max = 40): string[] {
  const output = values ?? [];
  if (output.length > max) throw errors.validation(`${field} has too many entries`);
  const seen = new Set<string>();
  for (const value of output) {
    requireId(value, field, true);
    if (seen.has(value)) throw errors.validation(`${field} contains duplicate member ${value}`);
    seen.add(value);
  }
  return output;
}

function modelMembers(model: SemanticModelDefinition) {
  return {
    dimensions: new Set(model.dimensions.map((dimension) => dimension.id)),
    metrics: new Set(model.metrics.map((metric) => metric.id)),
  };
}

function validateFilter(filter: SemanticFilter, dimensions: Set<string>, field: string): void {
  requireId(filter.dimension, `${field}.dimension`, true);
  if (!dimensions.has(filter.dimension)) throw errors.validation(`${field} uses unknown dimension ${filter.dimension}`);
}

function validateDefinition(semantic: SemanticModelRegistry, definition: SemanticInsightDefinition): void {
  requireId(definition.id, "insight.id");
  requireText(definition.label, `Insight ${definition.id} label`, 160);
  if (definition.description !== undefined) requireText(definition.description, `Insight ${definition.id} description`, 500);
  if (!KINDS.has(definition.kind)) throw errors.validation(`Insight ${definition.id} kind is unsupported`);

  const model = semantic.get(definition.model);
  const members = modelMembers(model);
  const dimensions = uniqueMembers(definition.dimensions, `Insight ${definition.id} dimensions`);
  const metrics = uniqueMembers(definition.metrics, `Insight ${definition.id} metrics`);
  if (dimensions.length === 0 && metrics.length === 0) throw errors.validation(`Insight ${definition.id} must select at least one member`);
  for (const dimension of dimensions) if (!members.dimensions.has(dimension)) throw errors.validation(`Insight ${definition.id} uses unknown dimension ${dimension}`);
  for (const metric of metrics) if (!members.metrics.has(metric)) throw errors.validation(`Insight ${definition.id} uses unknown metric ${metric}`);

  for (const [index, filter] of (definition.filters ?? []).entries()) validateFilter(filter, members.dimensions, `Insight ${definition.id} filters[${index}]`);
  const selected = new Set([...dimensions, ...metrics]);
  for (const order of definition.order_by ?? []) {
    if (!selected.has(order.id)) throw errors.validation(`Insight ${definition.id} order member must be selected: ${order.id}`);
    if (order.direction !== "asc" && order.direction !== "desc") throw errors.validation(`Insight ${definition.id} order direction is invalid`);
  }

  const scope = uniqueMembers(definition.scopeDimensions, `Insight ${definition.id} scopeDimensions`, 20);
  for (const dimension of scope) if (!members.dimensions.has(dimension)) throw errors.validation(`Insight ${definition.id} scope uses unknown dimension ${dimension}`);

  if (definition.limit !== undefined && (!Number.isSafeInteger(definition.limit) || definition.limit < 1 || definition.limit > model.maxRows)) {
    throw errors.validation(`Insight ${definition.id} limit must be within model maxRows`);
  }

  if (definition.kind === "kpi") {
    if (metrics.length !== 1) throw errors.validation(`KPI ${definition.id} must select exactly one metric`);
    if (dimensions.length > 1) throw errors.validation(`KPI ${definition.id} may use at most one trend dimension`);
    if (!definition.primaryMetric) throw errors.validation(`KPI ${definition.id} requires primaryMetric`);
  }
  if (definition.kind === "chart" && metrics.length === 0) throw errors.validation(`Chart ${definition.id} requires at least one metric`);
  if (definition.kind === "pivot" && (dimensions.length === 0 || metrics.length === 0)) {
    throw errors.validation(`Pivot ${definition.id} requires dimensions and metrics`);
  }
  if (definition.primaryMetric && !metrics.includes(definition.primaryMetric)) {
    throw errors.validation(`Insight ${definition.id} primaryMetric must be selected`);
  }

  const drillIds = new Set<string>();
  for (const drill of definition.drillThrough ?? []) {
    requireId(drill.id, `Insight ${definition.id} drill id`);
    requireText(drill.label, `Insight ${definition.id} drill ${drill.id} label`, 160);
    requireId(drill.targetInsight, `Insight ${definition.id} drill ${drill.id} targetInsight`);
    if (drillIds.has(drill.id)) throw errors.validation(`Insight ${definition.id} has duplicate drill ${drill.id}`);
    drillIds.add(drill.id);
    if (drill.bindings.length === 0 || drill.bindings.length > 10) throw errors.validation(`Insight ${definition.id} drill ${drill.id} requires 1-10 bindings`);
    const bindingSources = new Set<string>();
    for (const binding of drill.bindings) {
      requireId(binding.sourceDimension, `Insight ${definition.id} drill sourceDimension`, true);
      requireId(binding.targetDimension, `Insight ${definition.id} drill targetDimension`, true);
      if (!dimensions.includes(binding.sourceDimension)) {
        throw errors.validation(`Insight ${definition.id} drill source must be a selected dimension: ${binding.sourceDimension}`);
      }
      if (bindingSources.has(binding.sourceDimension)) throw errors.validation(`Insight ${definition.id} drill repeats source dimension ${binding.sourceDimension}`);
      bindingSources.add(binding.sourceDimension);
    }
  }
}

function scopeFilterAllowed(definition: SemanticInsightDefinition, filter: SemanticFilter): boolean {
  return (definition.scopeDimensions ?? []).includes(filter.dimension);
}

export class SemanticInsightRegistry {
  private readonly insights = new Map<string, SemanticInsightDefinition>();

  constructor(private readonly semantic: SemanticModelRegistry, definitions: SemanticInsightDefinition[]) {
    for (const definition of definitions) {
      validateDefinition(semantic, definition);
      if (this.insights.has(definition.id)) throw errors.validation(`Duplicate insight ${definition.id}`);
      this.insights.set(definition.id, definition);
    }

    // Resolve cross-insight drill contracts only after every insight has been registered.
    for (const definition of this.insights.values()) {
      const sourceModel = semantic.get(definition.model);
      const sourceMembers = modelMembers(sourceModel);
      for (const drill of definition.drillThrough ?? []) {
        const target = this.insights.get(drill.targetInsight);
        if (!target) throw errors.validation(`Insight ${definition.id} drill ${drill.id} targets unknown insight ${drill.targetInsight}`);
        const targetModel = semantic.get(target.model);
        const targetMembers = modelMembers(targetModel);
        for (const binding of drill.bindings) {
          if (!sourceMembers.dimensions.has(binding.sourceDimension)) throw errors.validation(`Unknown source drill dimension ${binding.sourceDimension}`);
          if (!targetMembers.dimensions.has(binding.targetDimension)) throw errors.validation(`Unknown target drill dimension ${binding.targetDimension}`);
          if (!(target.scopeDimensions ?? []).includes(binding.targetDimension)) {
            throw errors.validation(`Target insight ${target.id} must expose ${binding.targetDimension} as a scope dimension for drill-through`);
          }
        }
      }
    }
  }

  get(id: string): SemanticInsightDefinition {
    const insight = this.insights.get(id);
    if (!insight) throw errors.validation(`Unknown insight ${id}`);
    return insight;
  }

  list(): SemanticInsightSummary[] {
    return [...this.insights.values()].sort((a, b) => a.id.localeCompare(b.id)).map((definition) => ({
      id: definition.id,
      label: definition.label,
      ...(definition.description ? { description: definition.description } : {}),
      kind: definition.kind,
      model: definition.model,
      dimensions: [...(definition.dimensions ?? [])],
      metrics: [...(definition.metrics ?? [])],
      ...(definition.primaryMetric ? { primaryMetric: definition.primaryMetric } : {}),
      scopeDimensions: [...(definition.scopeDimensions ?? [])],
      drillThrough: (definition.drillThrough ?? []).map((drill) => ({ id: drill.id, label: drill.label, targetInsight: drill.targetInsight })),
    }));
  }

  query(id: string, tenantId: string, scopeFilters: SemanticFilter[] = []): SemanticQueryRequest {
    if (!tenantId.trim()) throw errors.validation("tenantId is required");
    const definition = this.get(id);
    if (scopeFilters.length > 20) throw errors.validation(`Insight ${id} has too many runtime scope filters`);
    for (const filter of scopeFilters) {
      if (!scopeFilterAllowed(definition, filter)) throw errors.validation(`Insight ${id} does not allow runtime scope filter ${filter.dimension}`);
    }
    return {
      model: definition.model,
      tenant_id: tenantId,
      dimensions: [...(definition.dimensions ?? [])],
      metrics: [...(definition.metrics ?? [])],
      filters: [...(definition.filters ?? []), ...scopeFilters],
      order_by: [...(definition.order_by ?? [])],
      ...(definition.limit !== undefined ? { limit: definition.limit } : {}),
    };
  }

  drill(input: {
    insight: string;
    drill: string;
    tenantId: string;
    sourceValues: Record<string, JsonValue>;
  }): SemanticQueryRequest {
    const source = this.get(input.insight);
    const drill = (source.drillThrough ?? []).find((candidate) => candidate.id === input.drill);
    if (!drill) throw errors.validation(`Unknown drill ${input.drill} on insight ${input.insight}`);
    const target = this.get(drill.targetInsight);
    const filters: SemanticFilter[] = [];
    for (const binding of drill.bindings) {
      const value = input.sourceValues[binding.sourceDimension];
      if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
        throw errors.validation(`Drill ${drill.id} requires source value ${binding.sourceDimension}`);
      }
      filters.push({ dimension: binding.targetDimension, operator: "=", value });
    }
    return this.query(target.id, input.tenantId, filters);
  }
}
