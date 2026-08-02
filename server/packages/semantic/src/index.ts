import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type SemanticFilterOperator = "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "like" | "is_null";
export type SemanticAggregation = "count" | "count_distinct" | "sum" | "avg" | "min" | "max";
export type SemanticValueKind = "integer" | "number" | "currency" | "quantity" | "percent" | "duration";
export type SemanticDimensionKind = "category" | "date" | "datetime" | "link" | "currency" | "uom";
export type SemanticDocumentState = "draft" | "submitted" | "non_cancelled";

export interface SemanticPermissionRequirement {
  doctype: string;
  action: "report";
}

export interface SemanticViewSource {
  kind: "view";
  name: string;
  tenantField: string;
}

export interface SemanticDoctypeSource {
  kind: "doctype";
  doctype: string;
  /** Explicitly prevents a KPI from accidentally counting draft transactions. */
  state: SemanticDocumentState;
}

export type SemanticSource = SemanticViewSource | SemanticDoctypeSource;

export interface SemanticDimensionDefinition {
  id: string;
  label: string;
  field: string;
  kind: SemanticDimensionKind;
  description?: string;
  options?: string;
}

/**
 * `scale` describes exact integer storage.
 *
 * Example: VND minor units stored as 12345 with scale=100 means 123.45 for display.
 * The semantic compiler never divides or casts those integers to REAL. The exact raw
 * integer remains the query result and the scale travels with the column metadata.
 */
export interface SemanticValueDefinition {
  kind: SemanticValueKind;
  scale?: number;
  currencyDimension?: string;
  unit?: string;
  exact?: boolean;
}

export interface SemanticMetricDefinition {
  id: string;
  label: string;
  aggregation: SemanticAggregation;
  /** Not required for COUNT(*); required for every other aggregation. */
  field?: string;
  value: SemanticValueDefinition;
  description?: string;
  additive?: "full" | "semi" | "non";
}

export interface SemanticModelDefinition {
  id: string;
  label: string;
  description?: string;
  source: SemanticSource;
  /** Human-readable grain, e.g. `one GL entry line` or `one submitted invoice`. */
  grain: string;
  permission: SemanticPermissionRequirement;
  dimensions: SemanticDimensionDefinition[];
  metrics: SemanticMetricDefinition[];
  maxRows: number;
}

export interface SemanticFilter {
  dimension: string;
  operator: SemanticFilterOperator;
  value?: JsonValue;
}

export interface SemanticOrder {
  id: string;
  direction: "asc" | "desc";
}

export interface SemanticQueryRequest {
  model: string;
  tenant_id: string;
  dimensions?: string[];
  metrics?: string[];
  filters?: SemanticFilter[];
  order_by?: SemanticOrder[];
  limit?: number;
  offset?: number;
}

export interface SemanticResultColumn {
  id: string;
  label: string;
  role: "dimension" | "metric";
  valueKind: SemanticValueKind | SemanticDimensionKind;
  options?: string;
  scale?: number;
  currencyDimension?: string;
  unit?: string;
  exact?: boolean;
}

export interface CompiledSemanticQuery {
  model: string;
  grain: string;
  sql: string;
  params: unknown[];
  columns: SemanticResultColumn[];
  permission: SemanticPermissionRequirement;
}

export interface SemanticModelSummary {
  id: string;
  label: string;
  description?: string;
  grain: string;
  dimensions: Array<Pick<SemanticDimensionDefinition, "id" | "label" | "kind" | "description" | "options">>;
  metrics: Array<{
    id: string;
    label: string;
    aggregation: SemanticAggregation;
    value: SemanticValueDefinition;
    description?: string;
    additive?: "full" | "semi" | "non";
  }>;
}

const MODEL_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER_ID = /^[a-z][a-z0-9_]{0,79}$/;
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DOCUMENT_FIELD = /^[a-z_][a-z0-9_]*$/;
const OPERATORS = new Set<SemanticFilterOperator>(["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"]);
const AGGREGATIONS = new Set<SemanticAggregation>(["count", "count_distinct", "sum", "avg", "min", "max"]);
const VALUE_KINDS = new Set<SemanticValueKind>(["integer", "number", "currency", "quantity", "percent", "duration"]);
const DIMENSION_KINDS = new Set<SemanticDimensionKind>(["category", "date", "datetime", "link", "currency", "uom"]);
const ADDITIVITY = new Set(["full", "semi", "non"]);
const DOCUMENT_STATES = new Set<SemanticDocumentState>(["draft", "submitted", "non_cancelled"]);
const DOCUMENT_COLUMNS = new Set(["name", "owner", "status", "docstatus", "created_at", "modified_at"]);

function requireModelId(value: string, field: string): void {
  if (!MODEL_ID.test(value)) throw errors.validation(`${field} must be a stable semantic id`);
}

function requireMemberId(value: string, field: string): void {
  if (!MEMBER_ID.test(value)) throw errors.validation(`${field} must use lowercase letters, numbers and underscores`);
}

function requireSqlIdentifier(value: string, field: string): void {
  if (!SQL_IDENTIFIER.test(value)) throw errors.validation(`${field} contains an unsafe SQL identifier`);
}

function requireDocumentField(value: string, field: string): void {
  if (!DOCUMENT_FIELD.test(value)) throw errors.validation(`${field} contains an unsafe document field`);
}

function requireNonEmpty(value: string, field: string, max = 240): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${field} is required and must be at most ${max} characters`);
  }
}

function validateValue(value: SemanticValueDefinition, metricId: string, aggregation: SemanticAggregation): void {
  if (!VALUE_KINDS.has(value.kind)) throw errors.validation(`Metric ${metricId} value kind is unsupported`);
  if (value.exact !== undefined && typeof value.exact !== "boolean") throw errors.validation(`Metric ${metricId} exact must be boolean`);
  if (value.scale !== undefined) {
    if (!Number.isSafeInteger(value.scale) || value.scale < 1 || value.scale > 1_000_000_000) {
      throw errors.validation(`Metric ${metricId} scale must be a positive safe integer <= 1,000,000,000`);
    }
    if (value.exact !== true) throw errors.validation(`Metric ${metricId} with scale must declare exact=true`);
  }
  if (value.currencyDimension !== undefined) requireMemberId(value.currencyDimension, `Metric ${metricId} currencyDimension`);
  if (value.unit !== undefined) requireNonEmpty(value.unit, `Metric ${metricId} unit`, 40);

  // AVG over an exact scaled integer forces a fractional database result. Returning it as
  // REAL would silently abandon the exact-money invariant. A later ratio contract can carry
  // numerator+denominator explicitly; until then exact AVG is intentionally refused.
  if (aggregation === "avg" && value.scale !== undefined && value.scale > 1) {
    throw errors.validation(`Metric ${metricId} cannot AVG exact scaled integers; define an explicit ratio metric instead`);
  }
}

function validateModel(model: SemanticModelDefinition): void {
  requireModelId(model.id, "model.id");
  requireNonEmpty(model.label, `Model ${model.id} label`, 160);
  requireNonEmpty(model.grain, `Model ${model.id} grain`, 240);
  requireNonEmpty(model.permission.doctype, `Model ${model.id} permission doctype`, 160);
  if (model.permission.action !== "report") throw errors.validation(`Model ${model.id} permission action must be report`);
  if (!Number.isSafeInteger(model.maxRows) || model.maxRows < 1 || model.maxRows > 10_000) {
    throw errors.validation(`Model ${model.id} maxRows must be an integer from 1 to 10000`);
  }

  if (model.source.kind === "view") {
    requireSqlIdentifier(model.source.name, `Model ${model.id} source view`);
    requireSqlIdentifier(model.source.tenantField, `Model ${model.id} tenant field`);
  } else {
    requireNonEmpty(model.source.doctype, `Model ${model.id} source doctype`, 160);
    if (!DOCUMENT_STATES.has(model.source.state)) throw errors.validation(`Model ${model.id} doctype source state is unsupported`);
  }

  if (!Array.isArray(model.dimensions) || !Array.isArray(model.metrics) || (model.dimensions.length === 0 && model.metrics.length === 0)) {
    throw errors.validation(`Model ${model.id} must define at least one dimension or metric`);
  }

  const ids = new Set<string>();
  for (const dimension of model.dimensions) {
    requireMemberId(dimension.id, `Model ${model.id} dimension id`);
    if (ids.has(dimension.id)) throw errors.validation(`Model ${model.id} has duplicate member id ${dimension.id}`);
    ids.add(dimension.id);
    requireNonEmpty(dimension.label, `Dimension ${dimension.id} label`, 160);
    if (!DIMENSION_KINDS.has(dimension.kind)) throw errors.validation(`Dimension ${dimension.id} kind is unsupported`);
    if (model.source.kind === "view") requireSqlIdentifier(dimension.field, `Dimension ${dimension.id} field`);
    else requireDocumentField(dimension.field, `Dimension ${dimension.id} field`);
    if (dimension.options !== undefined) requireNonEmpty(dimension.options, `Dimension ${dimension.id} options`, 160);
  }

  for (const metric of model.metrics) {
    requireMemberId(metric.id, `Model ${model.id} metric id`);
    if (ids.has(metric.id)) throw errors.validation(`Model ${model.id} has duplicate member id ${metric.id}`);
    ids.add(metric.id);
    requireNonEmpty(metric.label, `Metric ${metric.id} label`, 160);
    if (!AGGREGATIONS.has(metric.aggregation)) throw errors.validation(`Metric ${metric.id} uses an unsupported aggregation`);
    if (metric.aggregation === "count" && metric.field) throw errors.validation(`Metric ${metric.id} COUNT must not declare a field`);
    if (metric.aggregation !== "count" && !metric.field) throw errors.validation(`Metric ${metric.id} requires a field`);
    if (metric.field) {
      if (model.source.kind === "view") requireSqlIdentifier(metric.field, `Metric ${metric.id} field`);
      else requireDocumentField(metric.field, `Metric ${metric.id} field`);
    }
    if (metric.additive !== undefined && !ADDITIVITY.has(metric.additive)) throw errors.validation(`Metric ${metric.id} additive is unsupported`);
    validateValue(metric.value, metric.id, metric.aggregation);
  }

  const dimensionsById = new Map(model.dimensions.map((dimension) => [dimension.id, dimension]));
  for (const metric of model.metrics) {
    const currencyDimension = metric.value.currencyDimension;
    if (currencyDimension) {
      const dimension = dimensionsById.get(currencyDimension);
      if (!dimension) throw errors.validation(`Metric ${metric.id} references unknown currency dimension ${currencyDimension}`);
      if (dimension.kind !== "currency") throw errors.validation(`Metric ${metric.id} currencyDimension ${currencyDimension} must have kind=currency`);
    }
  }
}

export class SemanticModelRegistry {
  private readonly models: Map<string, SemanticModelDefinition>;

  constructor(definitions: SemanticModelDefinition[]) {
    this.models = new Map();
    for (const definition of definitions) {
      validateModel(definition);
      if (this.models.has(definition.id)) throw errors.validation(`Duplicate semantic model: ${definition.id}`);
      this.models.set(definition.id, definition);
    }
  }

  get(id: string): SemanticModelDefinition {
    const model = this.models.get(id);
    if (!model) throw errors.validation(`Unknown semantic model: ${id}`);
    return model;
  }

  /**
   * Safe catalog for AI/report discovery. It deliberately omits SQL view names, tenant
   * fields and physical document fields so a model can reason about business semantics
   * without being handed the raw schema as an invitation to bypass the semantic layer.
   */
  describe(id: string): SemanticModelSummary {
    const model = this.get(id);
    return {
      id: model.id,
      label: model.label,
      ...(model.description ? { description: model.description } : {}),
      grain: model.grain,
      dimensions: model.dimensions.map((dimension) => ({
        id: dimension.id,
        label: dimension.label,
        kind: dimension.kind,
        ...(dimension.description ? { description: dimension.description } : {}),
        ...(dimension.options ? { options: dimension.options } : {}),
      })),
      metrics: model.metrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        aggregation: metric.aggregation,
        value: { ...metric.value },
        ...(metric.description ? { description: metric.description } : {}),
        ...(metric.additive ? { additive: metric.additive } : {}),
      })),
    };
  }

  list(): SemanticModelSummary[] {
    return [...this.models.keys()].sort().map((id) => this.describe(id));
  }
}

function quoteIdentifier(value: string): string {
  requireSqlIdentifier(value, "SQL identifier");
  return `"${value}"`;
}

function documentExpression(field: string): string {
  requireDocumentField(field, "document field");
  if (DOCUMENT_COLUMNS.has(field)) return quoteIdentifier(field);
  return `json_extract(payload_json,'$.${field}')`;
}

function sourceFieldExpression(model: SemanticModelDefinition, field: string): string {
  return model.source.kind === "view" ? quoteIdentifier(field) : documentExpression(field);
}

function metricExpression(model: SemanticModelDefinition, metric: SemanticMetricDefinition): string {
  if (metric.aggregation === "count") return "COUNT(*)";
  const field = metric.field;
  if (!field) throw errors.validation(`Metric ${metric.id} requires a field`);
  const expression = sourceFieldExpression(model, field);
  switch (metric.aggregation) {
    case "count_distinct": return `COUNT(DISTINCT ${expression})`;
    case "sum": return `COALESCE(SUM(${expression}),0)`;
    case "avg": return `AVG(${expression})`;
    case "min": return `MIN(${expression})`;
    case "max": return `MAX(${expression})`;
    default: throw errors.validation(`Metric ${metric.id} uses an unsupported aggregation`);
  }
}

function normalizeRequestedIds(ids: string[] | undefined, field: string): string[] {
  const values = ids ?? [];
  if (!Array.isArray(values) || values.length > 40) throw errors.validation(`${field} has too many entries`);
  const seen = new Set<string>();
  for (const value of values) {
    requireMemberId(value, field);
    if (seen.has(value)) throw errors.validation(`${field} contains duplicate member ${value}`);
    seen.add(value);
  }
  return values;
}

function bindableScalar(value: JsonValue | undefined, field: string): string | number | boolean {
  if (typeof value === "string") {
    if (value.length > 2_000) throw errors.validation(`${field} is too long`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
    return value;
  }
  if (typeof value === "boolean") return value;
  throw errors.validation(`${field} must be a string, finite number or boolean`);
}

function doctypeStatePredicate(state: SemanticDocumentState): string {
  if (state === "draft") return "docstatus=0";
  if (state === "submitted") return "docstatus=1";
  return "docstatus<>2";
}

export class SemanticQueryCompiler {
  constructor(private readonly registry: SemanticModelRegistry) {}

  compile(request: SemanticQueryRequest): CompiledSemanticQuery {
    if (typeof request.tenant_id !== "string" || !request.tenant_id.trim()) throw errors.validation("tenant_id is required");
    const model = this.registry.get(request.model);
    const dimensionIds = normalizeRequestedIds(request.dimensions, "dimensions");
    const metricIds = normalizeRequestedIds(request.metrics, "metrics");
    if (dimensionIds.length === 0 && metricIds.length === 0) {
      throw errors.validation("Semantic query must select at least one dimension or metric");
    }

    const dimensionsById = new Map(model.dimensions.map((dimension) => [dimension.id, dimension]));
    const metricsById = new Map(model.metrics.map((metric) => [metric.id, metric]));
    const dimensions = dimensionIds.map((id) => {
      const dimension = dimensionsById.get(id);
      if (!dimension) throw errors.validation(`Unknown dimension ${id} on model ${model.id}`);
      return dimension;
    });
    const metrics = metricIds.map((id) => {
      const metric = metricsById.get(id);
      if (!metric) throw errors.validation(`Unknown metric ${id} on model ${model.id}`);
      return metric;
    });

    const params: unknown[] = [request.tenant_id];
    const where: string[] = [];
    let from: string;
    if (model.source.kind === "view") {
      from = quoteIdentifier(model.source.name);
      where.push(`${quoteIdentifier(model.source.tenantField)}=?1`);
    } else {
      from = "documents";
      params.push(model.source.doctype);
      where.push("tenant_id=?1", "doctype=?2", doctypeStatePredicate(model.source.state));
    }

    const filters = request.filters ?? [];
    if (!Array.isArray(filters) || filters.length > 20) throw errors.validation("filters must contain at most 20 entries");
    for (const filter of filters) {
      if (!OPERATORS.has(filter.operator)) throw errors.validation(`Unsupported semantic filter operator: ${String(filter.operator)}`);
      const dimension = dimensionsById.get(filter.dimension);
      if (!dimension) throw errors.validation(`Filters may only use declared dimensions: ${filter.dimension}`);
      const expression = sourceFieldExpression(model, dimension.field);
      if (filter.operator === "is_null") {
        if (filter.value !== undefined) throw errors.validation(`is_null filter must omit value: ${filter.dimension}`);
        where.push(`${expression} IS NULL`);
        continue;
      }
      if (filter.operator === "in") {
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          throw errors.validation(`IN filter requires a non-empty array: ${filter.dimension}`);
        }
        if (filter.value.length > 80) throw errors.validation("IN filter exceeds the parameter budget");
        const placeholders = filter.value.map((value, index) => {
          params.push(bindableScalar(value, `Filter ${filter.dimension} value[${index}]`));
          return `?${params.length}`;
        });
        where.push(`${expression} IN (${placeholders.join(",")})`);
        continue;
      }
      const value = bindableScalar(filter.value, `Filter ${filter.dimension} value`);
      if (filter.operator === "like" && typeof value !== "string") throw errors.validation(`LIKE filter requires a string: ${filter.dimension}`);
      params.push(value);
      where.push(`${expression} ${filter.operator === "like" ? "LIKE" : filter.operator} ?${params.length}`);
    }

    const selected: string[] = [];
    const columns: SemanticResultColumn[] = [];
    for (const dimension of dimensions) {
      selected.push(`${sourceFieldExpression(model, dimension.field)} AS ${quoteIdentifier(dimension.id)}`);
      columns.push({
        id: dimension.id,
        label: dimension.label,
        role: "dimension",
        valueKind: dimension.kind,
        ...(dimension.options ? { options: dimension.options } : {}),
      });
    }
    for (const metric of metrics) {
      selected.push(`${metricExpression(model, metric)} AS ${quoteIdentifier(metric.id)}`);
      columns.push({
        id: metric.id,
        label: metric.label,
        role: "metric",
        valueKind: metric.value.kind,
        ...(metric.value.scale !== undefined ? { scale: metric.value.scale } : {}),
        ...(metric.value.currencyDimension ? { currencyDimension: metric.value.currencyDimension } : {}),
        ...(metric.value.unit ? { unit: metric.value.unit } : {}),
        ...(metric.value.exact !== undefined ? { exact: metric.value.exact } : {}),
      });
    }

    const groupSql = metrics.length > 0 && dimensions.length > 0
      ? ` GROUP BY ${dimensions.map((dimension) => sourceFieldExpression(model, dimension.field)).join(", ")}`
      : "";

    const selectedIds = new Set([...dimensionIds, ...metricIds]);
    const order = request.order_by ?? [];
    if (!Array.isArray(order) || order.length > 8) throw errors.validation("order_by must contain at most 8 entries");
    const orderSql = order.length > 0
      ? ` ORDER BY ${order.map((item) => {
        if (!selectedIds.has(item.id)) throw errors.validation(`Order member must be selected: ${item.id}`);
        if (item.direction !== "asc" && item.direction !== "desc") throw errors.validation(`Invalid order direction for ${item.id}`);
        return `${quoteIdentifier(item.id)} ${item.direction.toUpperCase()}`;
      }).join(", ")}`
      : "";

    const limit = request.limit ?? Math.min(100, model.maxRows);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > model.maxRows) {
      throw errors.validation(`limit must be an integer from 1 to ${model.maxRows}`);
    }
    const offset = request.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
      throw errors.validation("offset must be an integer from 0 to 100000; use a feed/cursor path for larger extracts");
    }
    params.push(limit, offset);

    return {
      model: model.id,
      grain: model.grain,
      sql: `SELECT ${selected.join(", ")} FROM ${from} WHERE ${where.join(" AND ")}${groupSql}${orderSql} LIMIT ?${params.length - 1} OFFSET ?${params.length}`,
      params,
      columns,
      permission: { ...model.permission },
    };
  }
}
