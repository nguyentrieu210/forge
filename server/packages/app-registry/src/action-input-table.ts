import { errors } from "../../core/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

/**
 * One column inside a repeatable AppAction input table.
 *
 * It deliberately mirrors the scalar AppAction field contract so the generic runtime can
 * resolve the same controls for a cell that it already resolves for a normal action field.
 * The table is only a transport/presentation primitive; authoritative validation remains in
 * the app method/controller that receives the submitted rows.
 */
export interface AppActionInputColumn {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string;
  required?: boolean;
  default?: string;
  description?: string;
}

/**
 * First-class repeatable input for an AppAction.
 *
 * `fieldname` is the key posted to the app method. Its value is an array of row objects.
 * This replaces the temporary `Text` + `BulkTransaction:<json>` compatibility transport
 * without teaching the platform any vertical-specific business rule.
 */
export interface AppActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: AppActionInputColumn[];
  min_rows: number;
  max_rows: number;
  allow_paste: boolean;
}

export interface LegacyBulkTransactionField {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string;
  description?: string;
}

const ACTION_INPUT_NAME = /^[a-z][a-z0-9_]*$/;
const LEGACY_BULK_TRANSACTION_PREFIX = "BulkTransaction:";

/**
 * Keep this aligned with the controls already supported by ActionScreen. A first-class
 * contract must not make a package install successfully and then hand the client a cell it
 * cannot render.
 */
export const APP_ACTION_INPUT_FIELDTYPES = new Set([
  "Data", "Small Text", "Text", "Int", "Float", "Currency", "Percent",
  "Check", "Select", "Link", "Date", "Datetime", "Time",
  "Attach", "Attach Image",
]);

function asObject(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`${where} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, where: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${where} must be an array`);
  return value as JsonValue[];
}

function text(value: unknown, where: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${where} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function parseColumn(
  value: JsonValue,
  where: string,
  linkTargets?: ReadonlySet<string>,
): AppActionInputColumn {
  const input = asObject(value, where);
  const fieldname = text(input.fieldname, `${where}.fieldname`, 120);
  if (!ACTION_INPUT_NAME.test(fieldname)) {
    throw errors.validation(`${where}.fieldname must use lowercase letters, digits and underscore: ${fieldname}`);
  }

  const fieldtype = text(input.fieldtype ?? "Data", `${where}.fieldtype`, 32);
  if (!APP_ACTION_INPUT_FIELDTYPES.has(fieldtype)) {
    throw errors.validation(`${where}.fieldtype is not one an action input table can render: ${fieldtype}`);
  }

  const options = input.options === undefined ? undefined : text(input.options, `${where}.options`, 2000);
  if ((fieldtype === "Link" || fieldtype === "Select") && !options) {
    throw errors.validation(`${where} is a ${fieldtype} but names no options`);
  }
  if (fieldtype === "Link" && linkTargets && !linkTargets.has(options!)) {
    throw errors.validation(`${where} links to ${options}, which is not declared by this app or its external DocTypes`);
  }

  return {
    fieldname,
    label: text(input.label, `${where}.label`, 160),
    fieldtype,
    ...(options ? { options } : {}),
    ...(input.required === true ? { required: true } : {}),
    ...(input.default === undefined ? {} : { default: text(input.default, `${where}.default`, 160) }),
    ...(input.description === undefined ? {} : { description: text(input.description, `${where}.description`, 320) }),
  };
}

/** Parse one first-class AppAction input-table declaration. */
export function parseAppActionInputTable(
  value: unknown,
  index = 0,
  linkTargets?: ReadonlySet<string>,
): AppActionInputTable {
  const where = `input_tables[${index}]`;
  const input = asObject(value, where);
  const fieldname = text(input.fieldname, `${where}.fieldname`, 120);
  if (!ACTION_INPUT_NAME.test(fieldname)) {
    throw errors.validation(`${where}.fieldname must use lowercase letters, digits and underscore: ${fieldname}`);
  }

  const columns = array(input.columns, `${where}.columns`).map((column, position) =>
    parseColumn(column, `${where}.columns[${position}]`, linkTargets));
  if (!columns.length) throw errors.validation(`${where} has no columns`);
  if (columns.length > 64) throw errors.validation(`${where} may declare at most 64 columns`);

  const names = new Set<string>();
  for (const column of columns) {
    if (names.has(column.fieldname)) throw errors.validation(`Duplicate ${where} column: ${column.fieldname}`);
    names.add(column.fieldname);
  }

  const minRows = input.min_rows === undefined ? 1 : integer(input.min_rows, `${where}.min_rows`, 1, 500);
  const maxRows = input.max_rows === undefined ? 100 : integer(input.max_rows, `${where}.max_rows`, 1, 500);
  if (maxRows < minRows) throw errors.validation(`${where}.max_rows must be greater than or equal to min_rows`);
  if (input.allow_paste !== undefined && typeof input.allow_paste !== "boolean") {
    throw errors.validation(`${where}.allow_paste must be boolean`);
  }

  return {
    fieldname,
    label: text(input.label, `${where}.label`, 160),
    ...(input.description === undefined ? {} : { description: text(input.description, `${where}.description`, 500) }),
    columns,
    min_rows: minRows,
    max_rows: maxRows,
    allow_paste: input.allow_paste !== false,
  };
}

/**
 * Decode the Bulk Transaction v1 compatibility field into the first-class shape.
 *
 * This is intentionally exported for migration/compatibility tests. New manifests should
 * declare `input_tables`; this decoder exists so an installer/compiler upgrade can preserve
 * old packages instead of forcing a flag day across already-installed apps.
 */
export function parseLegacyBulkTransactionField(
  field: LegacyBulkTransactionField,
  linkTargets?: ReadonlySet<string>,
): AppActionInputTable | undefined {
  if (field.fieldtype !== "Text" || !field.options?.startsWith(LEGACY_BULK_TRANSACTION_PREFIX)) return undefined;

  let legacy: JsonObject;
  try {
    legacy = asObject(JSON.parse(field.options.slice(LEGACY_BULK_TRANSACTION_PREFIX.length)), "BulkTransaction compatibility spec");
  } catch (error) {
    if (error instanceof SyntaxError) throw errors.validation("BulkTransaction compatibility spec is not valid JSON");
    throw error;
  }

  return parseAppActionInputTable({
    fieldname: field.fieldname,
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    columns: legacy.columns,
    min_rows: legacy.minRows ?? 1,
    max_rows: legacy.maxRows ?? 100,
    allow_paste: legacy.allowPaste ?? true,
  }, 0, linkTargets);
}

/** Ensure scalar action fields and repeatable tables cannot post to the same key. */
export function assertActionInputNamesUnique(
  scalarFieldnames: Iterable<string>,
  inputTables: Iterable<AppActionInputTable>,
): void {
  const seen = new Set<string>();
  for (const fieldname of scalarFieldnames) seen.add(fieldname);
  for (const table of inputTables) {
    if (seen.has(table.fieldname)) {
      throw errors.validation(`AppAction input key is declared more than once: ${table.fieldname}`);
    }
    seen.add(table.fieldname);
  }
}
