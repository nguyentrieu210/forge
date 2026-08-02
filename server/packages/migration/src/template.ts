import { errors } from "../../core/src/index.js";
import { normalizeSourceHeader } from "./adapters.js";

export interface MigrationTemplateField {
  fieldname: string;
  label: string;
  fieldtype?: string;
  required?: boolean;
  has_default?: boolean;
  writable?: boolean;
  options?: string[];
  description?: string;
}

export interface MigrationTemplateColumn {
  fieldname: string;
  label: string;
  required: boolean;
  fieldtype: string | null;
  options: string[];
  description: string | null;
}

export interface MigrationTemplateDefinition {
  doctype: string;
  columns: MigrationTemplateColumn[];
  instructions: string[];
}

export interface MigrationMappingSuggestion {
  source_header: string;
  target_field: string | null;
  confidence: number;
  reason: "exact_fieldname" | "exact_label" | "normalized_match" | "ambiguous" | "none";
}

const NON_VALUE_FIELDS = new Set(["Heading", "Section Break", "Column Break", "HTML", "Tab Break", "Fold", "Button"]);

/**
 * Builds a workbook-neutral template contract. CSV/XLSX renderers can consume the same
 * columns so import rules do not drift by file format or UI implementation.
 */
export function buildMigrationTemplate(
  doctype: string,
  fields: readonly MigrationTemplateField[],
  options: { include_name?: boolean } = {},
): MigrationTemplateDefinition {
  const targetDoctype = requireText(doctype, "doctype", 160);
  const columns: MigrationTemplateColumn[] = [];
  const seen = new Set<string>();
  if (options.include_name !== false) {
    columns.push({ fieldname: "name", label: "ID / Name", required: false, fieldtype: "Data", options: [], description: "Stable document identity; required for Update Existing." });
    seen.add("name");
  }
  for (const field of fields) {
    const fieldname = requireText(field.fieldname, "fieldname", 160);
    if (seen.has(fieldname)) throw errors.validation(`Duplicate migration template field: ${fieldname}`);
    seen.add(fieldname);
    if (field.writable === false || (field.fieldtype && NON_VALUE_FIELDS.has(field.fieldtype))) continue;
    const label = requireText(field.label || fieldname, `${fieldname}.label`, 240);
    columns.push({
      fieldname,
      label,
      required: field.required === true && field.has_default !== true,
      fieldtype: field.fieldtype?.trim() || null,
      options: [...new Set((field.options ?? []).map((entry) => entry.trim()).filter(Boolean))],
      description: field.description?.trim() || null,
    });
  }
  if (!columns.length) throw errors.validation(`No importable fields for ${targetDoctype}`);
  return {
    doctype: targetDoctype,
    columns,
    instructions: [
      "Do not rename required columns unless you remap them during preview.",
      "Preview is advisory; final server validation runs again during apply.",
      "Insert may omit name when the target DocType has authoritative naming rules.",
      "Update Existing requires stable identity and server-side permission.",
      "Partial success is allowed: fix failed rows and retry only confirmed failures.",
    ],
  };
}

/** Minimal CSV renderer used by CLI/tests; XLSX presentation remains a separate renderer. */
export function renderMigrationCsvTemplate(
  template: MigrationTemplateDefinition,
  sample?: Record<string, string | number | boolean | null>,
): string {
  const headers = template.columns.map((column) => column.fieldname);
  const lines = [headers.map(csvCell).join(",")];
  if (sample) lines.push(headers.map((header) => csvCell(sample[header] ?? "")).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Deterministic first-pass mapper for the wizard. It handles exact/diacritic-insensitive
 * matches only; fuzzy/AI suggestions can layer on top but must never silently resolve an
 * ambiguous target.
 */
export function suggestMigrationMapping(
  sourceHeaders: readonly string[],
  targetFields: readonly MigrationTemplateField[],
): MigrationMappingSuggestion[] {
  const candidates = targetFields
    .filter((field) => field.writable !== false && !(field.fieldtype && NON_VALUE_FIELDS.has(field.fieldtype)))
    .map((field) => ({
      fieldname: requireText(field.fieldname, "fieldname", 160),
      normalizedFieldname: normalizeSourceHeader(field.fieldname.replace(/_/g, " ")),
      normalizedLabel: normalizeSourceHeader(field.label || field.fieldname),
    }));

  return sourceHeaders.map((sourceHeader) => {
    const source = requireText(sourceHeader, "source header", 240);
    const normalized = normalizeSourceHeader(source);
    const exactFieldname = candidates.filter((candidate) => candidate.fieldname === source);
    if (exactFieldname.length === 1) return suggestion(source, exactFieldname[0]!.fieldname, 1, "exact_fieldname");

    const exactLabel = candidates.filter((candidate) => candidate.normalizedLabel === normalized);
    if (exactLabel.length === 1) return suggestion(source, exactLabel[0]!.fieldname, 0.98, "exact_label");
    if (exactLabel.length > 1) return suggestion(source, null, 0, "ambiguous");

    const normalizedMatches = candidates.filter((candidate) => candidate.normalizedFieldname === normalized);
    if (normalizedMatches.length === 1) return suggestion(source, normalizedMatches[0]!.fieldname, 0.95, "normalized_match");
    if (normalizedMatches.length > 1) return suggestion(source, null, 0, "ambiguous");
    return suggestion(source, null, 0, "none");
  });
}

function suggestion(
  sourceHeader: string,
  targetField: string | null,
  confidence: number,
  reason: MigrationMappingSuggestion["reason"],
): MigrationMappingSuggestion {
  return { source_header: sourceHeader, target_field: targetField, confidence, reason };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}
