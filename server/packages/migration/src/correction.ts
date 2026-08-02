import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MigrationPlan } from "./index.js";
import type { MigrationRowOutcome } from "./execution.js";

export interface MigrationCorrectionRow extends JsonObject {
  __source_row: number;
  __row_key: string;
  __error: string;
}

export interface MigrationCorrectionDataset {
  plan_id: string;
  target_doctype: string;
  failed_rows: MigrationCorrectionRow[];
}

/**
 * Builds a correction dataset only from confirmed failed outcomes. Missing/unresolved rows
 * are deliberately excluded until authoritative receipt reconciliation decides their state.
 */
export function buildMigrationCorrectionDataset(
  plan: MigrationPlan,
  outcomes: readonly MigrationRowOutcome[],
): MigrationCorrectionDataset {
  const planned = new Map(plan.rows.map((row) => [row.row_key, row]));
  const seen = new Set<string>();
  const failedRows: MigrationCorrectionRow[] = [];
  for (const outcome of outcomes) {
    if (seen.has(outcome.row_key)) throw errors.validation(`Duplicate migration outcome: ${outcome.row_key}`);
    seen.add(outcome.row_key);
    const row = planned.get(outcome.row_key);
    if (!row) throw errors.validation(`Migration outcome references unknown row: ${outcome.row_key}`);
    if (row.fingerprint !== outcome.fingerprint) throw errors.idempotency();
    if (outcome.status !== "failed") continue;
    failedRows.push({
      __source_row: row.row_number,
      __row_key: row.row_key,
      __error: outcome.error?.trim() || "Migration row failed",
      ...structuredClone(row.document),
    });
  }
  return { plan_id: plan.plan_id, target_doctype: plan.target_doctype, failed_rows: failedRows };
}

export function renderMigrationCorrectionCsv(dataset: MigrationCorrectionDataset): string {
  if (!dataset.failed_rows.length) return "";
  const dataFields: string[] = [];
  const seen = new Set<string>();
  for (const row of dataset.failed_rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith("__") || seen.has(key)) continue;
      seen.add(key);
      dataFields.push(key);
    }
  }
  const headers = ["__source_row", "__row_key", "__error", ...dataFields];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of dataset.failed_rows) {
    lines.push(headers.map((header) => csvCell(cellValue(row[header]))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function cellValue(value: JsonValue | undefined): string | number | boolean {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
