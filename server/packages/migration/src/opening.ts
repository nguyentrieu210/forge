import type { JsonObject } from "../../contracts/src/index.js";
import { errors, sha256Hex } from "../../core/src/index.js";
import { reconcileExactMetrics, type MigrationReconciliationMetric } from "./index.js";

export type OpeningMigrationDomain = "finance" | "stock" | "hr";

export interface OpeningMigrationRecord {
  source_key: string;
  payload: JsonObject;
}

export interface OpeningMigrationDataset {
  source_id: string;
  domain: OpeningMigrationDomain;
  company: string;
  as_of_date: string;
  records: OpeningMigrationRecord[];
}

export interface OpeningMigrationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  expected_metrics: Record<string, string>;
}

export interface OpeningMigrationApplyResult {
  target_refs: string[];
  applied_metrics: Record<string, string>;
}

/** Domain owner supplies deterministic invariants and authoritative posting. */
export interface OpeningMigrationProvider {
  readonly domain: OpeningMigrationDomain;
  validate(dataset: OpeningMigrationDataset): Promise<OpeningMigrationValidation>;
  apply(dataset: OpeningMigrationDataset): Promise<OpeningMigrationApplyResult>;
  reconcile(dataset: OpeningMigrationDataset): Promise<Record<string, string>>;
}

export interface OpeningMigrationPreview {
  dataset_id: string;
  validation: OpeningMigrationValidation;
}

export interface OpeningMigrationExecution extends OpeningMigrationPreview {
  target_refs: string[];
  metrics: MigrationReconciliationMetric[];
  reconciled: boolean;
}

export async function previewOpeningMigration(
  dataset: OpeningMigrationDataset,
  provider: OpeningMigrationProvider,
): Promise<OpeningMigrationPreview> {
  const normalized = normalizeOpeningDataset(dataset);
  if (provider.domain !== normalized.domain) throw errors.validation("Opening migration provider domain does not match dataset");
  const validation = await provider.validate(normalized);
  return {
    dataset_id: await openingDatasetId(normalized),
    validation: normalizeValidation(validation),
  };
}

/**
 * Explicit apply entry point. Callers should expose preview as the default UX and invoke
 * this only after approval. The provider remains responsible for permission, period rules,
 * ledger invariants and correction/reversal semantics.
 */
export async function executeOpeningMigration(
  dataset: OpeningMigrationDataset,
  provider: OpeningMigrationProvider,
): Promise<OpeningMigrationExecution> {
  const normalized = normalizeOpeningDataset(dataset);
  if (provider.domain !== normalized.domain) throw errors.validation("Opening migration provider domain does not match dataset");
  const validation = normalizeValidation(await provider.validate(normalized));
  if (!validation.valid || validation.errors.length) {
    throw errors.validation("Opening migration validation failed", { error_count: validation.errors.length });
  }
  const applied = await provider.apply(normalized);
  const actualMetrics = await provider.reconcile(normalized);
  const expected = Object.keys(validation.expected_metrics).length
    ? validation.expected_metrics
    : applied.applied_metrics;
  const metrics = reconcileExactMetrics(expected, actualMetrics);
  return {
    dataset_id: await openingDatasetId(normalized),
    validation,
    target_refs: [...new Set(applied.target_refs)],
    metrics,
    reconciled: metrics.every((metric) => metric.matches),
  };
}

export function normalizeOpeningDataset(dataset: OpeningMigrationDataset): OpeningMigrationDataset {
  if (!["finance", "stock", "hr"].includes(dataset.domain)) throw errors.validation(`Unknown opening migration domain: ${String(dataset.domain)}`);
  const sourceId = text(dataset.source_id, "opening source_id", 240);
  const company = text(dataset.company, "opening company", 240);
  if (!isIsoCalendarDate(dataset.as_of_date)) throw errors.validation("Opening as_of_date must be a real YYYY-MM-DD date");
  if (!dataset.records.length) throw errors.validation("Opening migration dataset cannot be empty");
  const keys = new Set<string>();
  const records = dataset.records.map((record, index) => {
    const sourceKey = text(record.source_key, `opening records[${index}].source_key`, 240);
    if (keys.has(sourceKey)) throw errors.validation(`Duplicate opening source_key: ${sourceKey}`);
    keys.add(sourceKey);
    if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) {
      throw errors.validation(`Opening record ${sourceKey} payload must be an object`);
    }
    return { source_key: sourceKey, payload: structuredClone(record.payload) };
  });
  return { source_id: sourceId, domain: dataset.domain, company, as_of_date: dataset.as_of_date, records };
}

async function openingDatasetId(dataset: OpeningMigrationDataset): Promise<string> {
  const digest = await sha256Hex({
    source_id: dataset.source_id,
    domain: dataset.domain,
    company: dataset.company,
    as_of_date: dataset.as_of_date,
    records: dataset.records,
  });
  return `opening-${digest.slice(0, 40)}`;
}

function normalizeValidation(value: OpeningMigrationValidation): OpeningMigrationValidation {
  const errorsList = [...new Set((value.errors ?? []).map((entry) => text(entry, "opening validation error", 2000)))];
  const warnings = [...new Set((value.warnings ?? []).map((entry) => text(entry, "opening validation warning", 2000)))];
  const metrics: Record<string, string> = {};
  for (const [key, metric] of Object.entries(value.expected_metrics ?? {})) {
    const name = text(key, "opening metric name", 160);
    metrics[name] = text(metric, `opening metric ${name}`, 500);
  }
  return { valid: value.valid === true && errorsList.length === 0, errors: errorsList, warnings, expected_metrics: metrics };
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const result = value.trim();
  if (result.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return result;
}
