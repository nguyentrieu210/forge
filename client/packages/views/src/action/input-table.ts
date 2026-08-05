import type { AppAction, AppActionField, AppActionInputTable } from "@metaforge/core";

const LEGACY_BULK_TRANSACTION_PREFIX = "BulkTransaction:";

function positiveInteger(value: unknown, fallback: number, max: number): number {
  return Number.isInteger(value) && Number(value) > 0
    ? Math.min(Number(value), max)
    : fallback;
}

function normalizedTable(table: AppActionInputTable): AppActionInputTable | undefined {
  if (!table || typeof table !== "object") return undefined;
  if (!table.fieldname?.trim() || !table.label?.trim() || !Array.isArray(table.columns) || !table.columns.length) {
    return undefined;
  }
  const columns = table.columns.filter((column) => Boolean(
    column
    && typeof column === "object"
    && column.fieldname?.trim()
    && column.label?.trim()
    && column.fieldtype?.trim(),
  ));
  if (!columns.length || new Set(columns.map((column) => column.fieldname)).size !== columns.length) return undefined;

  const minRows = positiveInteger(table.min_rows, 1, 500);
  const maxRows = Math.max(minRows, positiveInteger(table.max_rows, 100, 500));
  return {
    fieldname: table.fieldname.trim(),
    label: table.label.trim(),
    ...(table.description?.trim() ? { description: table.description.trim() } : {}),
    columns,
    min_rows: minRows,
    max_rows: maxRows,
    allow_paste: table.allow_paste !== false,
    ...(table.presentation ? { presentation: table.presentation } : {}),
    ...(table.summary ? { summary: table.summary } : {}),
  };
}

function compatibilityField(table: AppActionInputTable): AppActionField {
  return {
    fieldname: table.fieldname,
    label: table.label,
    fieldtype: "Text",
    options: `${LEGACY_BULK_TRANSACTION_PREFIX}${JSON.stringify({
      columns: table.columns,
      minRows: table.min_rows,
      maxRows: table.max_rows,
      allowPaste: table.allow_paste,
      ...(table.presentation ? { presentation: table.presentation } : {}),
      ...(table.summary ? { summary: table.summary } : {}),
    })}`,
    required: table.min_rows > 0,
    ...(table.description ? { description: table.description } : {}),
  };
}

/**
 * Prefer first-class AppAction.input_tables while preserving the proven legacy grid renderer.
 * The conversion happens only at the client presentation seam and never mutates server data.
 */
export function preferFirstClassActionInputTables(action: AppAction): AppAction {
  const rawTables = Array.isArray(action.input_tables) ? action.input_tables : [];
  const tables = rawTables.flatMap((table) => {
    const normalized = normalizedTable(table);
    return normalized ? [normalized] : [];
  });
  if (!tables.length) return action;

  const tableNames = new Set(tables.map((table) => table.fieldname));
  const scalarFields = action.fields.filter((field) => !tableNames.has(field.fieldname));
  return {
    ...action,
    fields: [...scalarFields, ...tables.map(compatibilityField)],
    input_tables: tables,
  };
}
