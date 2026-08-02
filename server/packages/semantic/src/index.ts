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

export interface SemanticViewAccessMapping {
  /** Required to serve actors whose read scope is owner/owner_or_shared. */
  ownerField?: string;
  /** Required to serve actors whose read scope is shared/owner_or_shared. */
  nameField?: string;
}

export interface SemanticViewSource {
  kind: "view";
  name: string;
  tenantField: string;
  access?: SemanticViewAccessMapping;
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
  /** COUNT(*) has no field; every other aggregation requires one. */
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

/** Mirrors Forge read-scope semantics without importing the WS11 package. */
export interface SemanticUserPermissionConstraint {
  allow_doctype: string;
  fields: string[];
  allowed_values: string[];
}

export interface SemanticReadAccessScope {
  mode: "all" | "owner" | "shared" | "owner_or_shared";
  actor_user_id: string;
  user_permissions: SemanticUserPermissionConstraint[];
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
const SOURCE_ALIAS = "s";

function requireModelId(value: string, field: string): void {
  if (typeof value !== "string" || !MODEL_ID.test(value)) throw errors.validation(`${field} must be a stable semantic id`);
}

function requireMemberId(value: string, field: string): void {
  if (typeof value !== "string" || !MEMBER_ID.test(value)) throw errors.validation(`${field} must use lowercase letters, numbers and underscores`);
}

function requireSqlIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || !SQL_IDENTIFIER.test(value)) throw errors.validation(`${field} contains an unsafe SQL identifier`);
}

function requireDocumentField(value: string, field: string): void {
  if (typeof value !== "string" || !DOCUMENT_FIELD.test(value)) throw errors.validation(`${field} contains an unsafe document field`);
}

function requireNonEmpty(value: string, field: string, max = 240): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

function validateValue(value: SemanticValueDefinition, metricId: string, aggregation: SemanticAggregation): void {
  if (!value || typeof value !== "object") throw errors.validation(`Metric ${metricId} value definition is required`);
  if (!VALUE_KINDS.has(value.kind)) throw errors.validation(`Metric ${metricId} value kind is unsupported`);
  if (value.exact !== undefined && typeof value.exact !== "boolean") throw errors.validation(`Metric ${metricId} exact must be boolean`);
  if (value.scale !== undefined) {
    if (!Number.isSafeInteger(value.scale) || value.scale < 1 || value.scale > 1_000_000_000) throw errors.validation(`Metric ${metricId} scale must be a positive safe integer <= 1000000000`);
    if (value.exact !== true) throw errors.validation(`Metric ${metricId} with scale must declare exact=true`);
  }
  if (value.currencyDimension !== undefined) {
    requireMemberId(value.currencyDimension, `Metric ${metricId} currencyDimension`);
    if (value.kind !== "currency") throw errors.validation(`Metric ${metricId} currencyDimension is only valid for currency metrics`);
  }
  if (value.unit !== undefined) requireNonEmpty(value.unit, `Metric ${metricId} unit`, 40);
  if (aggregation === "avg" && value.exact === true) throw errors.validation(`Metric ${metricId} cannot AVG exact values; define an explicit ratio metric instead`);
  if (aggregation === "count" || aggregation === "count_distinct") {
    if (value.kind !== "integer" || value.exact !== true || value.scale !== undefined || value.currencyDimension !== undefined || value.unit !== undefined) {
      throw errors.validation(`Metric ${metricId} ${aggregation} must be an exact unscaled integer`);
    }
  }
}

function validateModel(model: SemanticModelDefinition): void {
  requireModelId(model.id, "model.id");
  requireNonEmpty(model.label, `Model ${model.id} label`, 160);
  requireNonEmpty(model.grain, `Model ${model.id} grain`, 240);
  if (!model.permission || typeof model.permission !== "object") throw errors.validation(`Model ${model.id} permission is required`);
  requireNonEmpty(model.permission.doctype, `Model ${model.id} permission doctype`, 160);
  if (model.permission.action !== "report") throw errors.validation(`Model ${model.id} permission action must be report`);
  if (!Number.isSafeInteger(model.maxRows) || model.maxRows < 1 || model.maxRows > 10_000) throw errors.validation(`Model ${model.id} maxRows must be an integer from 1 to 10000`);

  if (!model.source || typeof model.source !== "object") throw errors.validation(`Model ${model.id} source is required`);
  if (model.source.kind === "view") {
    requireSqlIdentifier(model.source.name, `Model ${model.id} source view`);
    requireSqlIdentifier(model.source.tenantField, `Model ${model.id} tenant field`);
    if (model.source.access?.ownerField) requireSqlIdentifier(model.source.access.ownerField, `Model ${model.id} access ownerField`);
    if (model.source.access?.nameField) requireSqlIdentifier(model.source.access.nameField, `Model ${model.id} access nameField`);
  } else if (model.source.kind === "doctype") {
    requireNonEmpty(model.source.doctype, `Model ${model.id} source doctype`, 160);
    if (!DOCUMENT_STATES.has(model.source.state)) throw errors.validation(`Model ${model.id} doctype source state is unsupported`);
  } else {
    throw errors.validation(`Model ${model.id} source kind is unsupported`);
  }

  if (!Array.isArray(model.dimensions) || !Array.isArray(model.metrics) || (model.dimensions.length === 0 && model.metrics.length === 0)) throw errors.validation(`Model ${model.id} must define at least one dimension or metric`);
  if (model.dimensions.length > 80 || model.metrics.length > 80) throw errors.validation(`Model ${model.id} has too many semantic members`);

  const ids = new Set<string>();
  for (const dimension of model.dimensions) {
    requireMemberId(dimension.id, `Model ${model.id} dimension id`);
    if (ids.has(dimension.id)) throw errors.validation(`Model ${model.id} has duplicate member id ${dimension.id}`);
    ids.add(dimension.id);
    requireNonEmpty(dimension.label, `Dimension ${dimension.id} label`, 160);
    if (!DIMENSION_KINDS.has(dimension.kind)) throw errors.validation(`Dimension ${dimension.id} kind is unsupported`);
    if (model.source.kind === "view") requireSqlIdentifier(dimension.field, `Dimension ${dimension.id} field`);
    else requireDocumentField(dimension.field, `Dimension ${dimension.id} field`);
    if (dimension.kind === "link") requireNonEmpty(dimension.options ?? "", `Dimension ${dimension.id} Link options`, 160);
    else if (dimension.options !== undefined) throw errors.validation(`Dimension ${dimension.id} options are only valid for link dimensions`);
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
    if (!currencyDimension) continue;
    const dimension = dimensionsById.get(currencyDimension);
    if (!dimension) throw errors.validation(`Metric ${metric.id} references unknown currency dimension ${currencyDimension}`);
    if (dimension.kind !== "currency") throw errors.validation(`Metric ${metric.id} currencyDimension ${currencyDimension} must have kind=currency`);
  }
}

export class SemanticModelRegistry {
  private readonly models: Map<string, SemanticModelDefinition>;

  constructor(definitions: SemanticModelDefinition[]) {
    if (!Array.isArray(definitions) || definitions.length > 500) throw errors.validation("Semantic model registry must contain at most 500 models");
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

function qualifiedIdentifier(field: string): string {
  return `${SOURCE_ALIAS}.${quoteIdentifier(field)}`;
}

function documentExpression(field: string): string {
  requireDocumentField(field, "document field");
  if (DOCUMENT_COLUMNS.has(field)) return qualifiedIdentifier(field);
  return `json_extract(${SOURCE_ALIAS}.payload_json,'$.${field}')`;
}

function sourceFieldExpression(model: SemanticModelDefinition, field: string): string {
  return model.source.kind === "view" ? qualifiedIdentifier(field) : documentExpression(field);
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
  if (state === "draft") return `${SOURCE_ALIAS}.docstatus=0`;
  if (state === "submitted") return `${SOURCE_ALIAS}.docstatus=1`;
  return `${SOURCE_ALIAS}.docstatus<>2`;
}

function currencyScopeSatisfied(metric: SemanticMetricDefinition, selectedDimensions: Set<string>, filters: SemanticFilter[]): boolean {
  const currency = metric.value.currencyDimension;
  if (!currency) return true;
  if (selectedDimensions.has(currency)) return true;
  const values = new Set<string>();
  for (const filter of filters) {
    if (filter.dimension !== currency || filter.operator !== "=") continue;
    const value = bindableScalar(filter.value, `Currency filter ${currency}`);
    values.add(`${typeof value}:${String(value)}`);
  }
  return values.size === 1;
}

function readScopeFieldExpressions(model: SemanticModelDefinition, fields: string[]): string[] {
  const expressions = new Set<string>();
  for (const field of fields) {
    for (const dimension of model.dimensions) {
      if (dimension.field === field) expressions.add(sourceFieldExpression(model, dimension.field));
    }
  }
  return [...expressions];
}

function appendReadScope(
  model: SemanticModelDefinition,
  scope: SemanticReadAccessScope,
  where: string[],
  params: unknown[],
): void {
  requireNonEmpty(scope.actor_user_id, "semantic access actor_user_id", 200);
  if (!Array.isArray(scope.user_permissions)) throw errors.permission("Semantic read scope user_permissions is invalid");

  const tenantExpression = model.source.kind === "view"
    ? sourceFieldExpression(model, model.source.tenantField)
    : `${SOURCE_ALIAS}.tenant_id`;
  const ownerExpression = model.source.kind === "doctype"
    ? `${SOURCE_ALIAS}.owner`
    : model.source.access?.ownerField ? sourceFieldExpression(model, model.source.access.ownerField) : null;
  const nameExpression = model.source.kind === "doctype"
    ? `${SOURCE_ALIAS}.name`
    : model.source.access?.nameField ? sourceFieldExpression(model, model.source.access.nameField) : null;

  const shareClause = () => {
    if (!nameExpression) throw errors.permission(`Semantic model ${model.id} cannot enforce shared-document scope`);
    params.push(model.permission.doctype, scope.actor_user_id);
    const doctypeParam = params.length - 1;
    const userParam = params.length;
    return `EXISTS (SELECT 1 FROM document_shares ds WHERE ds.tenant_id=${tenantExpression} AND ds.doctype=?${doctypeParam} AND ds.name=${nameExpression} AND ds.user=?${userParam} AND ds.can_read=1)`;
  };

  if (scope.mode === "owner") {
    if (!ownerExpression) throw errors.permission(`Semantic model ${model.id} cannot enforce owner scope`);
    params.push(scope.actor_user_id);
    where.push(`${ownerExpression}=?${params.length}`);
  } else if (scope.mode === "shared") {
    where.push(shareClause());
  } else if (scope.mode === "owner_or_shared") {
    if (!ownerExpression) throw errors.permission(`Semantic model ${model.id} cannot enforce owner scope`);
    params.push(scope.actor_user_id);
    const ownerParam = params.length;
    where.push(`(${ownerExpression}=?${ownerParam} OR ${shareClause()})`);
  } else if (scope.mode !== "all") {
    throw errors.permission(`Semantic read scope mode is unsupported: ${String(scope.mode)}`);
  }

  for (const restriction of scope.user_permissions) {
    if (!restriction || !Array.isArray(restriction.fields) || !Array.isArray(restriction.allowed_values)
      || restriction.fields.length === 0 || restriction.allowed_values.length === 0) {
      throw errors.permission("Semantic user-permission scope is invalid");
    }
    if (restriction.allowed_values.length > 80) throw errors.permission("Semantic user-permission value set is too large");
    const expressions = readScopeFieldExpressions(model, restriction.fields);
    if (expressions.length === 0) {
      throw errors.permission(`Semantic model ${model.id} does not expose a dimension required by ${restriction.allow_doctype} scope`);
    }
    const placeholders = restriction.allowed_values.map((value) => {
      if (typeof value !== "string" || !value || value.length > 200) throw errors.permission("Semantic user-permission allowed value is invalid");
      params.push(value);
      return `?${params.length}`;
    });
    where.push(`(${expressions.map((expression) => `${expression} IN (${placeholders.join(",")})`).join(" OR ")})`);
  }
}

export class SemanticQueryCompiler {
  constructor(private readonly registry: SemanticModelRegistry) {}

  compile(request: SemanticQueryRequest, scope?: SemanticReadAccessScope): CompiledSemanticQuery {
    if (typeof request.tenant_id !== "string" || !request.tenant_id.trim() || request.tenant_id.length > 200) throw errors.validation("tenant_id is required and must be at most 200 characters");
    const model = this.registry.get(request.model);
    const dimensionIds = normalizeRequestedIds(request.dimensions, "dimensions");
    const metricIds = normalizeRequestedIds(request.metrics, "metrics");
    if (dimensionIds.length === 0 && metricIds.length === 0) throw errors.validation("Semantic query must select at least one dimension or metric");

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
    const from = model.source.kind === "view"
      ? `${quoteIdentifier(model.source.name)} AS ${SOURCE_ALIAS}`
      : `documents AS ${SOURCE_ALIAS}`;
    if (model.source.kind === "view") {
      where.push(`${sourceFieldExpression(model, model.source.tenantField)}=?1`);
    } else {
      params.push(model.source.doctype);
      where.push(`${SOURCE_ALIAS}.tenant_id=?1`, `${SOURCE_ALIAS}.doctype=?2`, doctypeStatePredicate(model.source.state));
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
        if (!Array.isArray(filter.value) || filter.value.length === 0 || filter.value.length > 80) throw errors.validation(`IN filter requires a non-empty array up to 80 values: ${filter.dimension}`);
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

    if (scope) appendReadScope(model, scope, where, params);

    const selectedDimensions = new Set(dimensionIds);
    for (const metric of metrics) {
      if (!currencyScopeSatisfied(metric, selectedDimensions, filters)) {
        throw errors.validation(`Currency metric ${metric.id} requires dimension ${metric.value.currencyDimension} or exactly one equality filter on that currency`);
      }
    }

    const selected: string[] = [];
    const columns: SemanticResultColumn[] = [];
    for (const dimension of dimensions) {
      selected.push(`${sourceFieldExpression(model, dimension.field)} AS ${quoteIdentifier(dimension.id)}`);
      columns.push({ id: dimension.id, label: dimension.label, role: "dimension", valueKind: dimension.kind, ...(dimension.options ? { options: dimension.options } : {}) });
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
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > model.maxRows) throw errors.validation(`limit must be an integer from 1 to ${model.maxRows}`);
    const offset = request.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw errors.validation("offset must be an integer from 0 to 100000; use a feed/cursor path for larger extracts");
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
