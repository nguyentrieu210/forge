import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors, sha256Hex } from "../../core/src/index.js";

export type MigrationSourceKind = "csv" | "excel" | "api" | "sql" | "erpnext" | "misa" | "odoo" | "fast" | "bravo" | "legacy";
export type MigrationDuplicatePolicy = "error" | "skip" | "update";
export type MigrationRunState = "draft" | "validated" | "applying" | "applied" | "reconciling" | "completed" | "failed" | "cancelled";

export interface MigrationTargetField {
  fieldname: string;
  required?: boolean;
  has_default?: boolean;
}

export interface MigrationPlanInput {
  source_id: string;
  source_kind: MigrationSourceKind;
  target_doctype: string;
  headers: string[];
  rows: JsonObject[];
  target_fields: Array<string | MigrationTargetField>;
  mapping?: Record<string, string | null>;
  duplicate_policy?: MigrationDuplicatePolicy;
  key_field?: string;
}

export interface MigrationPlannedRow {
  row_number: number;
  row_key: string;
  fingerprint: string;
  document: JsonObject;
}

export interface MigrationPlan {
  plan_id: string;
  source_id: string;
  source_kind: MigrationSourceKind;
  source_fingerprint: string;
  target_doctype: string;
  mapping: Record<string, string | null>;
  duplicate_policy: MigrationDuplicatePolicy;
  key_field: string | null;
  rows: MigrationPlannedRow[];
  total_rows: number;
}

export interface MigrationReconciliationMetric {
  metric: string;
  expected: string;
  actual: string;
  matches: boolean;
}

const ALLOWED_TRANSITIONS: Readonly<Record<MigrationRunState, readonly MigrationRunState[]>> = {
  draft: ["validated", "cancelled"],
  validated: ["applying", "cancelled"],
  applying: ["applied", "failed"],
  applied: ["reconciling", "completed"],
  reconciling: ["completed", "failed"],
  completed: [],
  failed: ["applying", "reconciling", "cancelled"],
  cancelled: [],
};

export async function buildMigrationPlan(input: MigrationPlanInput): Promise<MigrationPlan> {
  const sourceId = boundedText(input.source_id, "source_id", 240);
  const targetDoctype = boundedText(input.target_doctype, "target_doctype", 160);
  const sourceKind = input.source_kind;
  const duplicatePolicy = input.duplicate_policy ?? "error";
  const headers = validateHeaders(input.headers);
  const targetFields = normalizeTargetFields(input.target_fields);
  const mapping = normalizeMapping(headers, targetFields, input.mapping);
  const keyField = input.key_field === undefined ? null : boundedText(input.key_field, "key_field", 160);

  if (keyField && !headers.includes(keyField)) {
    throw errors.validation(`Migration key field is not a source column: ${keyField}`);
  }

  const mappedTargets = new Set(Object.values(mapping).filter((value): value is string => Boolean(value)));
  for (const field of targetFields.values()) {
    if (field.required && !field.has_default && !mappedTargets.has(field.fieldname)) {
      throw errors.validation(`Required target field is not mapped: ${field.fieldname}`);
    }
  }

  const sourceRows = input.rows.map((row, index) => normalizeSourceRow(row, headers, index + 2));
  const sourceFingerprint = await sha256Hex(stableStringify({ source_id: sourceId, source_kind: sourceKind, headers, rows: sourceRows }));
  const canonicalMapping = Object.fromEntries(headers.map((header) => [header, mapping[header] ?? null])) as Record<string, string | null>;
  const planDigest = await sha256Hex(stableStringify({
    source_fingerprint: sourceFingerprint,
    target_doctype: targetDoctype,
    mapping: canonicalMapping,
    duplicate_policy: duplicatePolicy,
    key_field: keyField,
  }));
  const planId = `migration-${planDigest.slice(0, 40)}`;

  const seenKeys = new Set<string>();
  const rows: MigrationPlannedRow[] = [];
  for (let index = 0; index < sourceRows.length; index += 1) {
    const sourceRow = sourceRows[index]!;
    const rowNumber = index + 2;
    const rowKey = keyField ? migrationKey(sourceRow[keyField], keyField, rowNumber) : String(rowNumber);
    if (seenKeys.has(rowKey)) throw errors.validation(`Duplicate migration key at row ${rowNumber}: ${rowKey}`);
    seenKeys.add(rowKey);

    const document: JsonObject = {};
    for (const sourceHeader of headers) {
      const target = canonicalMapping[sourceHeader];
      if (!target) continue;
      const value = sourceRow[sourceHeader];
      if (value !== undefined) document[target] = structuredClone(value);
    }
    const fingerprint = await sha256Hex(stableStringify({ plan_id: planId, row_key: rowKey, document }));
    rows.push({ row_number: rowNumber, row_key: rowKey, fingerprint, document });
  }

  return {
    plan_id: planId,
    source_id: sourceId,
    source_kind: sourceKind,
    source_fingerprint: sourceFingerprint,
    target_doctype: targetDoctype,
    mapping: canonicalMapping,
    duplicate_policy: duplicatePolicy,
    key_field: keyField,
    rows,
    total_rows: rows.length,
  };
}

export function transitionMigrationState(current: MigrationRunState, next: MigrationRunState): MigrationRunState {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw errors.lifecycle(`Migration state cannot move from ${current} to ${next}`);
  }
  return next;
}

export function reconcileExactMetrics(expected: Record<string, string>, actual: Record<string, string>): MigrationReconciliationMetric[] {
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return names.map((metric) => {
    const expectedValue = expected[metric] ?? "";
    const actualValue = actual[metric] ?? "";
    return { metric, expected: expectedValue, actual: actualValue, matches: expectedValue === actualValue };
  });
}

export function assertReconciled(metrics: readonly MigrationReconciliationMetric[]): void {
  const mismatches = metrics.filter((metric) => !metric.matches);
  if (!mismatches.length) return;
  throw errors.validation("Migration reconciliation failed", {
    mismatches: mismatches.map((metric) => ({ metric: metric.metric, expected: metric.expected, actual: metric.actual })),
  });
}

function normalizeMapping(
  headers: readonly string[],
  targetFields: ReadonlyMap<string, MigrationTargetField>,
  requested: Record<string, string | null> | undefined,
): Record<string, string | null> {
  const unknownSources = Object.keys(requested ?? {}).filter((source) => !headers.includes(source));
  if (unknownSources.length) throw errors.validation(`Unknown source mapping columns: ${unknownSources.join(", ")}`);

  const mapping: Record<string, string | null> = {};
  const targets = new Set<string>();
  for (const header of headers) {
    const rawTarget = requested && Object.prototype.hasOwnProperty.call(requested, header) ? requested[header] : header;
    const target = rawTarget === null || rawTarget.trim() === "" ? null : rawTarget.trim();
    if (target && target !== "name" && !targetFields.has(target)) {
      throw errors.validation(`Unknown migration target field: ${target}`);
    }
    if (target && targets.has(target)) throw errors.validation(`Multiple source columns map to target field: ${target}`);
    if (target) targets.add(target);
    mapping[header] = target;
  }
  return mapping;
}

function normalizeTargetFields(fields: Array<string | MigrationTargetField>): Map<string, MigrationTargetField> {
  const output = new Map<string, MigrationTargetField>();
  for (const entry of fields) {
    const field = typeof entry === "string" ? { fieldname: entry } : entry;
    const fieldname = boundedText(field.fieldname, "target field", 160);
    if (output.has(fieldname)) throw errors.validation(`Duplicate target field: ${fieldname}`);
    output.set(fieldname, { fieldname, required: field.required === true, has_default: field.has_default === true });
  }
  return output;
}

function validateHeaders(input: string[]): string[] {
  if (!Array.isArray(input) || !input.length) throw errors.validation("Migration source must contain at least one header");
  const headers = input.map((header, index) => boundedText(header, `headers[${index}]`, 160));
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) throw errors.validation(`Duplicate source header: ${header}`);
    seen.add(header);
  }
  return headers;
}

function normalizeSourceRow(row: JsonObject, headers: readonly string[], rowNumber: number): JsonObject {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`Migration row ${rowNumber} must be an object`);
  const allowed = new Set(headers);
  const unknown = Object.keys(row).filter((key) => !allowed.has(key));
  if (unknown.length) throw errors.validation(`Migration row ${rowNumber} contains unknown source columns: ${unknown.join(", ")}`);
  const normalized: JsonObject = {};
  for (const header of headers) {
    const value = row[header];
    if (value !== undefined) normalized[header] = structuredClone(value);
  }
  return normalized;
}

function migrationKey(value: JsonValue | undefined, keyField: string, rowNumber: number): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw errors.validation(`Migration key ${keyField} must be text or number at row ${rowNumber}`);
  }
  const key = String(value).trim();
  if (!key) throw errors.validation(`Migration key ${keyField} is empty at row ${rowNumber}`);
  return key;
}

function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) output[key] = canonicalize(object[key]);
  return output;
}
