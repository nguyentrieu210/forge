import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MigrationSourceKind } from "./index.js";
import type { MigrationSourceTable } from "./adapters.js";

/**
 * Converts a decoded CSV/Excel grid into the generic source table.
 *
 * File decoding is intentionally outside the server package. Browser/CLI callers may use
 * SheetJS or another reader, while WS13 owns the deterministic header/row semantics. This
 * avoids pulling a workbook parser into Cloudflare Workers just to share import rules.
 */
export function adaptTabularGrid(input: {
  source_id: string;
  source_kind: Extract<MigrationSourceKind, "csv" | "excel" | "legacy">;
  grid: readonly (readonly unknown[])[];
  header_row?: number;
  key_column?: string;
  skip_blank_rows?: boolean;
}): MigrationSourceTable {
  const sourceId = requireText(input.source_id, "source_id", 240);
  const headerIndex = input.header_row ?? 0;
  if (!Number.isSafeInteger(headerIndex) || headerIndex < 0 || headerIndex >= input.grid.length) {
    throw errors.validation("header_row is outside the source grid");
  }
  const rawHeaders = input.grid[headerIndex] ?? [];
  const headers = rawHeaders.map((value, index) => {
    const text = String(value ?? "").trim();
    if (!text) throw errors.validation(`Source header column ${index + 1} is blank`);
    if (text.length > 160) throw errors.validation(`Source header column ${index + 1} exceeds 160 characters`);
    return text;
  });
  if (!headers.length) throw errors.validation("Tabular source has no headers");
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) throw errors.validation(`Duplicate source header: ${header}`);
    seen.add(header);
  }
  const keyColumn = input.key_column?.trim();
  if (keyColumn && !seen.has(keyColumn)) throw errors.validation(`Unknown key_column: ${keyColumn}`);

  const rows: JsonObject[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < input.grid.length; rowIndex += 1) {
    const rawRow = input.grid[rowIndex] ?? [];
    const row: JsonObject = {};
    let hasValue = false;
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const value = toJsonCell(rawRow[columnIndex], rowIndex + 1, columnIndex + 1);
      if (value !== null && value !== "") hasValue = true;
      row[headers[columnIndex]!] = value;
    }
    if (!hasValue && input.skip_blank_rows !== false) continue;
    rows.push(row);
  }

  return {
    source_id: sourceId,
    source_kind: input.source_kind,
    headers,
    rows,
    ...(keyColumn ? { key_field: keyColumn } : {}),
  };
}

function toJsonCell(value: unknown, row: number, column: number): JsonValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`Non-finite number at row ${row}, column ${column}`);
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw errors.validation(`Invalid date at row ${row}, column ${column}`);
    return value.toISOString();
  }
  // Workbook cells should be scalar. Refuse objects instead of stringifying a parser-specific
  // object such as a formula/cell metadata structure into business data.
  throw errors.validation(`Unsupported cell value at row ${row}, column ${column}`);
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}
