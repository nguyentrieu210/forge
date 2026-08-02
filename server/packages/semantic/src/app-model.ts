import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  SemanticModelRegistry,
  type SemanticAggregation,
  type SemanticDimensionDefinition,
  type SemanticDimensionKind,
  type SemanticDocumentState,
  type SemanticMetricDefinition,
  type SemanticModelDefinition,
  type SemanticValueDefinition,
  type SemanticValueKind,
} from "./index.js";

export interface AppSemanticDocTypeScope {
  name: string;
  /** App-owned fieldnames. Framework record fields are added automatically. */
  fields: string[];
}

export interface AppSemanticParseContext {
  appId: string;
  doctypes: AppSemanticDocTypeScope[];
}

const MODEL_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER_ID = /^[a-z][a-z0-9_]{0,79}$/;
const FIELD = /^[a-z_][a-z0-9_]*$/;
const RECORD_FIELDS = new Set(["name", "owner", "status", "docstatus", "created_at", "modified_at"]);
const DIMENSION_KINDS = new Set<SemanticDimensionKind>(["category", "date", "datetime", "link", "currency", "uom"]);
const VALUE_KINDS = new Set<SemanticValueKind>(["integer", "number", "currency", "quantity", "percent", "duration"]);
const AGGREGATIONS = new Set<SemanticAggregation>(["count", "count_distinct", "sum", "avg", "min", "max"]);
const STATES = new Set<SemanticDocumentState>(["draft", "submitted", "non_cancelled"]);

function record(value: JsonValue | undefined, field: string): Record<string, JsonValue | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be an object`);
  return value as Record<string, JsonValue | undefined>;
}

function string(value: JsonValue | undefined, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return value;
}

function optionalString(value: JsonValue | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  return string(value, field, max);
}

function integer(value: JsonValue | undefined, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw errors.validation(`${field} must be an integer from ${min} to ${max}`);
  }
  return value as number;
}

function array(value: JsonValue | undefined, field: string, max: number): JsonValue[] {
  if (!Array.isArray(value) || value.length > max) throw errors.validation(`${field} must be an array with at most ${max} entries`);
  return value;
}

function onlyKeys(object: Record<string, JsonValue | undefined>, allowed: string[], field: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(object)) if (!set.has(key)) throw errors.validation(`${field} contains unsupported key ${key}`);
}

function parseValue(object: Record<string, JsonValue | undefined>, field: string): SemanticValueDefinition {
  onlyKeys(object, ["kind", "scale", "currencyDimension", "unit", "exact"], field);
  const kind = string(object.kind, `${field}.kind`, 40) as SemanticValueKind;
  if (!VALUE_KINDS.has(kind)) throw errors.validation(`${field}.kind is unsupported`);
  const scale = object.scale === undefined ? undefined : integer(object.scale, `${field}.scale`, 1, 1_000_000_000);
  const currencyDimension = optionalString(object.currencyDimension, `${field}.currencyDimension`, 80);
  if (currencyDimension && !MEMBER_ID.test(currencyDimension)) throw errors.validation(`${field}.currencyDimension is invalid`);
  const unit = optionalString(object.unit, `${field}.unit`, 40);
  let exact: boolean | undefined;
  if (object.exact !== undefined) {
    if (typeof object.exact !== "boolean") throw errors.validation(`${field}.exact must be boolean`);
    exact = object.exact;
  }
  return {
    kind,
    ...(scale !== undefined ? { scale } : {}),
    ...(currencyDimension ? { currencyDimension } : {}),
    ...(unit ? { unit } : {}),
    ...(exact !== undefined ? { exact } : {}),
  };
}

function parseDimension(value: JsonValue, index: number, allowedFields: Set<string>): SemanticDimensionDefinition {
  const field = `semanticModels[].dimensions[${index}]`;
  const object = record(value, field);
  onlyKeys(object, ["id", "label", "field", "kind", "description", "options"], field);
  const id = string(object.id, `${field}.id`, 80);
  if (!MEMBER_ID.test(id)) throw errors.validation(`${field}.id is invalid`);
  const physicalField = string(object.field, `${field}.field`, 80);
  if (!FIELD.test(physicalField) || !allowedFields.has(physicalField)) throw errors.validation(`${field}.field is not owned by the app doctype`);
  const kind = string(object.kind, `${field}.kind`, 40) as SemanticDimensionKind;
  if (!DIMENSION_KINDS.has(kind)) throw errors.validation(`${field}.kind is unsupported`);
  const description = optionalString(object.description, `${field}.description`, 500);
  const options = optionalString(object.options, `${field}.options`, 160);
  return {
    id,
    label: string(object.label, `${field}.label`, 160),
    field: physicalField,
    kind,
    ...(description ? { description } : {}),
    ...(options ? { options } : {}),
  };
}

function parseMetric(value: JsonValue, index: number, allowedFields: Set<string>): SemanticMetricDefinition {
  const field = `semanticModels[].metrics[${index}]`;
  const object = record(value, field);
  onlyKeys(object, ["id", "label", "aggregation", "field", "value", "description", "additive"], field);
  const id = string(object.id, `${field}.id`, 80);
  if (!MEMBER_ID.test(id)) throw errors.validation(`${field}.id is invalid`);
  const aggregation = string(object.aggregation, `${field}.aggregation`, 40) as SemanticAggregation;
  if (!AGGREGATIONS.has(aggregation)) throw errors.validation(`${field}.aggregation is unsupported`);
  const physicalField = optionalString(object.field, `${field}.field`, 80);
  if (physicalField && (!FIELD.test(physicalField) || !allowedFields.has(physicalField))) {
    throw errors.validation(`${field}.field is not owned by the app doctype`);
  }
  const valueDefinition = parseValue(record(object.value, `${field}.value`), `${field}.value`);
  const additive = optionalString(object.additive, `${field}.additive`, 20) as "full" | "semi" | "non" | undefined;
  if (additive && !["full", "semi", "non"].includes(additive)) throw errors.validation(`${field}.additive is unsupported`);
  const description = optionalString(object.description, `${field}.description`, 500);
  return {
    id,
    label: string(object.label, `${field}.label`, 160),
    aggregation,
    ...(physicalField ? { field: physicalField } : {}),
    value: valueDefinition,
    ...(description ? { description } : {}),
    ...(additive ? { additive } : {}),
  };
}

/**
 * Parses semantic models shipped by an app package.
 *
 * Critical boundary: app packages may only model their own DocTypes. They cannot name a
 * SQL view/table, another app's DocType, or a different permission doctype. Platform-owned
 * SQL-view models remain source-controlled server definitions audited by WS08/domain owners.
 */
export function parseAppSemanticModels(value: JsonValue | undefined, context: AppSemanticParseContext): SemanticModelDefinition[] {
  if (value === undefined) return [];
  const models = array(value, "semanticModels", 40);
  if (!MODEL_ID.test(context.appId)) throw errors.validation("appId must be a stable lowercase id");

  const doctypes = new Map<string, Set<string>>();
  for (const doctype of context.doctypes) {
    if (!doctype.name.trim() || doctype.name.length > 160) throw errors.validation("app semantic doctype name is invalid");
    if (doctypes.has(doctype.name)) throw errors.validation(`Duplicate app semantic doctype ${doctype.name}`);
    const fields = new Set(RECORD_FIELDS);
    for (const field of doctype.fields) {
      if (!FIELD.test(field)) throw errors.validation(`App doctype ${doctype.name} has invalid field ${field}`);
      fields.add(field);
    }
    doctypes.set(doctype.name, fields);
  }

  const parsed = models.map((raw, index): SemanticModelDefinition => {
    const field = `semanticModels[${index}]`;
    const object = record(raw, field);
    onlyKeys(object, ["id", "label", "description", "doctype", "state", "grain", "dimensions", "metrics", "maxRows"], field);
    const id = string(object.id, `${field}.id`, 96);
    if (!MODEL_ID.test(id) || !id.startsWith(`${context.appId}.`)) {
      throw errors.validation(`${field}.id must be namespaced under ${context.appId}.`);
    }
    const doctype = string(object.doctype, `${field}.doctype`, 160);
    const allowedFields = doctypes.get(doctype);
    if (!allowedFields) throw errors.validation(`${field}.doctype is not owned by app ${context.appId}`);
    const state = string(object.state, `${field}.state`, 40) as SemanticDocumentState;
    if (!STATES.has(state)) throw errors.validation(`${field}.state is unsupported`);
    const dimensions = array(object.dimensions, `${field}.dimensions`, 40).map((entry, dimensionIndex) => parseDimension(entry, dimensionIndex, allowedFields));
    const metrics = array(object.metrics, `${field}.metrics`, 40).map((entry, metricIndex) => parseMetric(entry, metricIndex, allowedFields));
    const description = optionalString(object.description, `${field}.description`, 500);
    return {
      id,
      label: string(object.label, `${field}.label`, 160),
      ...(description ? { description } : {}),
      source: { kind: "doctype", doctype, state },
      grain: string(object.grain, `${field}.grain`, 240),
      permission: { doctype, action: "report" },
      dimensions,
      metrics,
      maxRows: integer(object.maxRows, `${field}.maxRows`, 1, 2_000),
    };
  });

  // Validate the WHOLE set at once so duplicate model ids are rejected across one app package,
  // in addition to the per-model member/exact/currency/aggregation invariants.
  const registry = new SemanticModelRegistry(parsed);
  return parsed.map((model) => registry.get(model.id));
}
