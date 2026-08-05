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
  link_filters?: string;
}

export type AppActionInputTableMode = "bulk" | "child-grid-inline";

export interface AppActionInputTablePresentation {
  mode?: AppActionInputTableMode;
  row_doctype?: string;
  fit_viewport?: boolean;
  emphasize_editable?: boolean;
  money_precision?: number;
  print_format?: string;
}

export interface AppActionInputTableSummary {
  subtotal_field: string;
  discount_percentage_field?: string;
  vat_percentage_field?: string;
}

/**
 * First-class repeatable input for an AppAction.
 *
 * `fieldname` is the key posted to the app method. Its value is an array of row objects.
 * Presentation metadata is generic: `row_doctype` points to canonical child metadata so an
 * app does not have to duplicate depends_on/read_only/Link rules in its action declaration.
 */
export interface AppActionInputTable {
  fieldname: string;
  label: string;
  description?: string;
  columns: AppActionInputColumn[];
  min_rows: number;
  max_rows: number;
  allow_paste: boolean;
  presentation?: AppActionInputTablePresentation;
  summary?: AppActionInputTableSummary;
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

function optionalText(value: unknown, where: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, where, max);
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function optionalInteger(value: unknown, where: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return integer(value, where, min, max);
}

function optionalBoolean(value: unknown, where: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw errors.validation(`${where} must be boolean`);
  return value;
}

function parsePresentation(value: unknown, where: string): AppActionInputTablePresentation | undefined {
  if (value === undefined) return undefined;
  const input = asObject(value, where);
  const modeRaw = optionalText(input.mode, `${where}.mode`, 40);
  if (modeRaw && modeRaw !== "bulk" && modeRaw !== "child-grid-inline") {
    throw errors.validation(`${where}.mode must be bulk or child-grid-inline`);
  }
  const mode = modeRaw as AppActionInputTableMode | undefined;
  const rowDoctype = optionalText(input.row_doctype ?? input.rowDoctype, `${where}.row_doctype`, 160);
  const fitViewport = optionalBoolean(input.fit_viewport ?? input.fitViewport, `${where}.fit_viewport`);
  const emphasizeEditable = optionalBoolean(input.emphasize_editable ?? input.emphasizeEditable, `${where}.emphasize_editable`);
  const moneyPrecision = optionalInteger(input.money_precision ?? input.moneyPrecision, `${where}.money_precision`, 0, 6);
  const printFormat = optionalText(input.print_format ?? input.printFormat, `${where}.print_format`, 160);
  if (mode === "child-grid-inline" && !rowDoctype) {
    throw errors.validation(`${where}.row_doctype is required for child-grid-inline`);
  }
  return {
    ...(mode ? { mode } : {}),
    ...(rowDoctype ? { row_doctype: rowDoctype } : {}),
    ...(fitViewport === undefined ? {} : { fit_viewport: fitViewport }),
    ...(emphasizeEditable === undefined ? {} : { emphasize_editable: emphasizeEditable }),
    ...(moneyPrecision === undefined ? {} : { money_precision: moneyPrecision }),
    ...(printFormat ? { print_format: printFormat } : {}),
  };
}

function parseSummary(value: unknown, where: string, columnNames: ReadonlySet<string>): AppActionInputTableSummary | undefined {
  if (value === undefined) return undefined;
  const input = asObject(value, where);
  const subtotalField = text(input.subtotal_field ?? input.subtotalField, `${where}.subtotal_field`, 120);
  if (!columnNames.has(subtotalField)) {
    throw errors.validation(`${where}.subtotal_field must name a declared input-table column`);
  }
  const discount = optionalText(input.discount_percentage_field ?? input.discountPercentageField, `${where}.discount_percentage_field`, 120);
  const vat = optionalText(input.vat_percentage_field ?? input.vatPercentageField, `${where}.vat_percentage_field`, 120);
  for (const [label, fieldname] of [["discount_percentage_field", discount], ["vat_percentage_field", vat]] as const) {
    if (fieldname && !ACTION_INPUT_NAME.test(fieldname)) {
      throw errors.validation(`${where}.${label} must use lowercase letters, digits and underscore`);
    }
  }
  return {
    subtotal_field: subtotalField,
    ...(discount ? { discount_percentage_field: discount } : {}),
    ...(vat ? { vat_percentage_field: vat } : {}),
  };
}

function parseLinkFilters(value: unknown, where: string): string | undefined {
  const source = optionalText(value, where, 4000);
  if (!source) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw errors.validation(`${where} must be valid JSON`); }
  if (!Array.isArray(parsed)) throw errors.validation(`${where} must encode an array of filters`);
  return source;
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
  const linkFilters = parseLinkFilters(input.link_filters ?? input.linkFilters, `${where}.link_filters`);
  if (linkFilters && fieldtype !== "Link" && fieldtype !== "Dynamic Link") {
    throw errors.validation(`${where}.link_filters is only valid on Link or Dynamic Link columns`);
  }

  return {
    fieldname,
    label: text(input.label, `${where}.label`, 160),
    fieldtype,
    ...(options ? { options } : {}),
    ...(input.required === true ? { required: true } : {}),
    ...(input.default === undefined ? {} : { default: text(input.default, `${where}.default`, 160) }),
    ...(input.description === undefined ? {} : { description: text(input.description, `${where}.description`, 320) }),
    ...(linkFilters ? { link_filters: linkFilters } : {}),
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

  const presentation = parsePresentation(input.presentation, `${where}.presentation`);
  const summary = parseSummary(input.summary, `${where}.summary`, names);
  if (presentation?.row_doctype && linkTargets && !linkTargets.has(presentation.row_doctype)) {
    throw errors.validation(`${where}.presentation.row_doctype ${presentation.row_doctype} is not declared by this app or its external DocTypes`);
  }

  return {
    fieldname,
    label: text(input.label, `${where}.label`, 160),
    ...(input.description === undefined ? {} : { description: text(input.description, `${where}.description`, 500) }),
    columns,
    min_rows: minRows,
    max_rows: maxRows,
    allow_paste: input.allow_paste !== false,
    ...(presentation ? { presentation } : {}),
    ...(summary ? { summary } : {}),
  };
}

/**
 * Decode the Bulk Transaction v1 compatibility field into the first-class shape.
 * Unknown presentation keys were historically ignored; the rolling bridge now preserves
 * the generic rich-table contract so installed packages do not lose it during decoration.
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
    ...(legacy.presentation === undefined ? {} : { presentation: legacy.presentation }),
    ...(legacy.summary === undefined ? {} : { summary: legacy.summary }),
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
