import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import type {
  AdjustmentBasis,
  AdjustmentCondition,
  AdjustmentOperator,
  AdjustmentScope,
  SalesAdjustmentRule,
} from "./adjustment-policy.js";

export interface SalesAdjustmentRuleRecord {
  name: string;
  data: JsonObject;
  version?: number;
}

export interface SalesAdjustmentRuleLoadContext {
  postingDate: string;
  currency: string;
  currencyScale: number;
}

/**
 * Runtime shape produced from a persisted Sales Adjustment Rule document.
 * Source identity/version are carried beside the generic evaluator fields so a
 * transaction can snapshot exactly which rule revision produced an adjustment.
 */
export interface PersistedSalesAdjustmentRule extends SalesAdjustmentRule {
  source_name: string;
  source_version?: number;
}

const BASIS = new Set<AdjustmentBasis>(["FIXED", "AREA_SQM", "LENGTH_M", "SET_COUNT"]);
const SCOPES = new Set<AdjustmentScope>(["LINE", "ORDER", "UNRESOLVED"]);
const OPERATORS = new Set<AdjustmentOperator>(["eq", "neq", "in", "not_in", "lt", "lte", "gt", "gte"]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  const normalized = text(value).toLocaleLowerCase("vi");
  if (["true", "yes", "có", "co"].includes(normalized)) return true;
  if (["false", "no", "không", "khong"].includes(normalized)) return false;
  throw errors.validation(`Adjustment boolean value "${text(value)}" is invalid`);
}

function disabled(data: JsonObject): boolean {
  return bool(data.disabled, false);
}

function dateOnly(value: unknown, field: string): string {
  const date = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw errors.validation(`${field} must use YYYY-MM-DD`);
  return date;
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || text(value) === "") return undefined;
  return dateOnly(value, field);
}

function primitive(value: unknown, field: string): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw errors.validation(`${field} must be string, number or boolean`);
}

function parseCondition(value: unknown, ruleCode: string, index: number): AdjustmentCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`Sales Adjustment Rule ${ruleCode} condition ${index + 1} must be an object`);
  }
  const data = value as JsonObject;
  const field = text(data.field || data.fieldname);
  if (!field || field.length > 128) {
    throw errors.validation(`Sales Adjustment Rule ${ruleCode} condition ${index + 1} field is required and must be at most 128 characters`);
  }
  const op = text(data.op || data.operator).toLowerCase() as AdjustmentOperator;
  if (!OPERATORS.has(op)) {
    throw errors.validation(`Sales Adjustment Rule ${ruleCode} condition ${index + 1} has unsupported operator ${op || "(blank)"}`);
  }

  if (op === "in" || op === "not_in") {
    if (!Array.isArray(data.values) || data.values.length === 0) {
      throw errors.validation(`Sales Adjustment Rule ${ruleCode} condition ${index + 1} requires non-empty values`);
    }
    return {
      field,
      op,
      values: data.values.map((entry, valueIndex) => primitive(entry, `${ruleCode}.conditions[${index}].values[${valueIndex}]`)),
    };
  }

  if (data.value === undefined || data.value === null) {
    throw errors.validation(`Sales Adjustment Rule ${ruleCode} condition ${index + 1} requires value`);
  }
  return { field, op, value: primitive(data.value, `${ruleCode}.conditions[${index}].value`) };
}

function parsePriority(value: unknown, ruleCode: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw errors.validation(`Sales Adjustment Rule ${ruleCode} priority must be a safe integer`);
  return parsed;
}

function parseRecord(
  record: SalesAdjustmentRuleRecord,
  context: SalesAdjustmentRuleLoadContext,
): PersistedSalesAdjustmentRule | null {
  const data = record.data;
  if (disabled(data)) return null;

  const postingDate = dateOnly(context.postingDate, "postingDate");
  const validFrom = optionalDate(data.valid_from, `${record.name}.valid_from`);
  const validUpto = optionalDate(data.valid_upto ?? data.valid_to, `${record.name}.valid_upto`);
  if (validFrom && postingDate < validFrom) return null;
  if (validUpto && postingDate > validUpto) return null;
  if (validFrom && validUpto && validFrom > validUpto) {
    throw errors.validation(`Sales Adjustment Rule ${record.name} valid_from cannot be after valid_upto`);
  }

  const currency = text(data.currency);
  if (!currency) throw errors.validation(`Sales Adjustment Rule ${record.name} currency is required`);
  if (currency !== text(context.currency)) return null;
  if (!Number.isSafeInteger(context.currencyScale) || context.currencyScale < 0 || context.currencyScale > 9) {
    throw errors.validation("Sales Adjustment Rule currencyScale must be an integer from 0 to 9");
  }

  const code = text(data.code) || record.name;
  if (!code || code.length > 128) throw errors.validation(`Sales Adjustment Rule ${record.name} code must be at most 128 characters`);
  const basis = text(data.basis).toUpperCase() as AdjustmentBasis;
  if (!BASIS.has(basis)) throw errors.validation(`Sales Adjustment Rule ${code} has unsupported basis ${basis || "(blank)"}`);
  const scope = (text(data.scope).toUpperCase() || "LINE") as AdjustmentScope;
  if (!SCOPES.has(scope)) throw errors.validation(`Sales Adjustment Rule ${code} has unsupported scope ${scope}`);
  if (typeof data.rate !== "string" && typeof data.rate !== "number") {
    throw errors.validation(`Sales Adjustment Rule ${code} rate is required`);
  }
  const rateMinor = toScaledInt(data.rate, context.currencyScale, `${code}.rate`);
  if (rateMinor < 0) throw errors.validation(`Sales Adjustment Rule ${code} rate cannot be negative`);

  const rawConditions = data.conditions === undefined ? [] : data.conditions;
  if (!Array.isArray(rawConditions)) throw errors.validation(`Sales Adjustment Rule ${code} conditions must be a child-row array`);
  const conditions = rawConditions.map((condition, index) => parseCondition(condition, code, index));
  const priority = parsePriority(data.priority, code);
  const exclusiveGroup = text(data.exclusive_group);
  const sourceVersion = record.version === undefined ? undefined : record.version;
  if (sourceVersion !== undefined && (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1)) {
    throw errors.validation(`Sales Adjustment Rule ${code} source version must be a positive integer`);
  }

  return {
    code,
    description: text(data.description) || text(data.rule_name) || code,
    basis,
    rate_minor: rateMinor,
    conditions,
    scope,
    ...(exclusiveGroup ? { exclusive_group: exclusiveGroup } : {}),
    ...(priority === undefined ? {} : { priority }),
    taxable: bool(data.taxable, true),
    discountable: bool(data.discountable, false),
    source_name: record.name,
    ...(sourceVersion === undefined ? {} : { source_version: sourceVersion }),
  };
}

/**
 * Converts persisted, effective-dated master data into the existing deterministic
 * adjustment evaluator contract. No item/door/finish names are known here.
 */
export function salesAdjustmentRulesFromRecords(
  records: SalesAdjustmentRuleRecord[],
  context: SalesAdjustmentRuleLoadContext,
): PersistedSalesAdjustmentRule[] {
  const active = records
    .map((record) => parseRecord(record, context))
    .filter((rule): rule is PersistedSalesAdjustmentRule => rule !== null);
  const seen = new Map<string, string>();
  for (const rule of active) {
    const prior = seen.get(rule.code);
    if (prior) throw errors.validation(`Multiple active Sales Adjustment Rule records use code ${rule.code}: ${prior}, ${rule.source_name}`);
    seen.set(rule.code, rule.source_name);
  }
  return active.sort((left, right) => left.code.localeCompare(right.code));
}
