import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocFieldMeta } from "./types.js";
import { assertFieldConditionSupported } from "./field-condition.js";
import { parseOperationalFormComposition } from "./operational-composition-validate.js";

const FORM_PRESENTATIONS = new Set(["full", "workspace"]);
const DENSITIES = new Set(["comfortable", "compact"]);
const TONES = new Set(["neutral", "brand"]);
const GROUP_TONES = new Set(["neutral", "brand", "input", "commercial", "result"]);
const CELL_ROLES = new Set(["operator_input", "optional_input", "auto", "formula", "readonly", "warning", "result", "money"]);
const SUMMARY_EMPHASIS = new Set(["normal", "strong", "grand"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const METHOD = /^[A-Za-z0-9_.:-]+$/;
const RESPONSE_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function bool(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw errors.validation(`${path} must be boolean`);
  return value;
}
function text(value: unknown, path: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${path} must be a non-empty string up to ${max} characters`);
  return value.trim();
}
function integer(value: unknown, path: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw errors.validation(`${path} must be an integer from ${min} to ${max}`);
  return value;
}
function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw errors.validation(`${path} must be an array`);
  return value.map((entry, index) => text(entry, `${path}[${index}]`, 160));
}
function enumText(value: unknown, path: string, allowed: Set<string>): string | undefined {
  if (value === undefined) return undefined;
  const parsed = text(value, path, 64);
  if (!allowed.has(parsed)) throw errors.validation(`${path} is not recognised: ${parsed}`);
  return parsed;
}
function jsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry, index) => jsonValue(entry, `${path}[${index}]`));
  if (value && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) out[key] = jsonValue(entry, `${path}.${key}`);
    return out;
  }
  throw errors.validation(`${path} must be valid JSON`);
}

function assertField(name: string, known: Set<string>, path: string): string {
  if (!known.has(name)) throw errors.validation(`${path} names unknown field: ${name}`);
  return name;
}

function parseBinding(value: unknown, known: Set<string>, path: string): string {
  const binding = text(value, path, 240);
  const [scope, field, ...rest] = binding.split(".");
  if (rest.length || !field || (scope !== "row" && scope !== "parent") || !IDENT.test(field)) {
    throw errors.validation(`${path} must bind exactly one row.<field> or parent.<field>`);
  }
  if (scope === "row") assertField(field, known, path);
  return `${scope}.${field}`;
}

/**
 * Validate MetaForm 4.x operational presentation without turning metadata into executable code.
 * The result is JSON-only and may be safely persisted with DocType metadata.
 *
 * `fieldRoles` is authoring sugar. The parser applies each validated role onto the already-parsed
 * DocField so every renderer sees one canonical field contract; it is not a second business rule.
 */
export function parseOperationalViewPolicy(value: unknown, fields: DocFieldMeta[]): JsonObject {
  const input = obj(value, "viewPolicy.operational");
  const unsupported = Object.keys(input).filter((key) => !["form", "grid", "fieldRoles"].includes(key));
  if (unsupported.length) throw errors.validation(`viewPolicy.operational contains unsupported keys: ${unsupported.join(", ")}`);
  const known = new Set(fields.map((field) => field.fieldname));
  const fieldByName = new Map(fields.map((field) => [field.fieldname, field]));
  const out: JsonObject = {};

  if (input.fieldRoles !== undefined) {
    const roles = obj(input.fieldRoles, "viewPolicy.operational.fieldRoles");
    for (const [fieldname, rawRole] of Object.entries(roles)) {
      assertField(fieldname, known, `viewPolicy.operational.fieldRoles.${fieldname}`);
      const role = enumText(rawRole, `viewPolicy.operational.fieldRoles.${fieldname}`, CELL_ROLES);
      if (!role) continue;
      fieldByName.get(fieldname)!.cellRole = role;
    }
  }

  if (input.form !== undefined) {
    const form = obj(input.form, "viewPolicy.operational.form");
    const formOut: JsonObject = {};
    const presentation = enumText(form.presentation, "viewPolicy.operational.form.presentation", FORM_PRESENTATIONS);
    const density = enumText(form.density, "viewPolicy.operational.form.density", DENSITIES);
    const fullWidth = bool(form.fullWidth, "viewPolicy.operational.form.fullWidth");
    if (presentation) formOut.presentation = presentation;
    if (density) formOut.density = density;
    if (fullWidth !== undefined) formOut.fullWidth = fullWidth;

    if (form.header !== undefined) {
      const header = obj(form.header, "viewPolicy.operational.form.header");
      const headerOut: JsonObject = {};
      const tone = enumText(header.tone, "viewPolicy.operational.form.header.tone", TONES);
      if (tone) headerOut.tone = tone;
      if (header.keyFields !== undefined) {
        headerOut.keyFields = strings(header.keyFields, "viewPolicy.operational.form.header.keyFields")
          .map((field, index) => assertField(field, known, `viewPolicy.operational.form.header.keyFields[${index}]`));
      }
      if (header.statusField !== undefined) headerOut.statusField = assertField(text(header.statusField, "viewPolicy.operational.form.header.statusField"), known, "viewPolicy.operational.form.header.statusField");
      formOut.header = headerOut;
    }

    if (form.summary !== undefined) {
      const summary = obj(form.summary, "viewPolicy.operational.form.summary");
      const summaryOut: JsonObject = {};
      const enabled = bool(summary.enabled, "viewPolicy.operational.form.summary.enabled");
      if (enabled !== undefined) summaryOut.enabled = enabled;
      if (summary.position !== undefined) {
        const position = text(summary.position, "viewPolicy.operational.form.summary.position", 32);
        if (!["bottom-right", "footer"].includes(position)) throw errors.validation(`viewPolicy.operational.form.summary.position is not recognised: ${position}`);
        summaryOut.position = position;
      }
      if (!Array.isArray(summary.items)) throw errors.validation("viewPolicy.operational.form.summary.items must be an array");
      summaryOut.items = summary.items.map((entry, index) => {
        const item = obj(entry, `viewPolicy.operational.form.summary.items[${index}]`);
        const field = assertField(text(item.field, `viewPolicy.operational.form.summary.items[${index}].field`), known, `viewPolicy.operational.form.summary.items[${index}].field`);
        const result: JsonObject = { field };
        if (item.label !== undefined) result.label = text(item.label, `viewPolicy.operational.form.summary.items[${index}].label`, 160);
        const emphasis = enumText(item.emphasis, `viewPolicy.operational.form.summary.items[${index}].emphasis`, SUMMARY_EMPHASIS);
        if (emphasis) result.emphasis = emphasis;
        return result;
      });
      formOut.summary = summaryOut;
    }
    if (form.composition !== undefined) formOut.composition = parseOperationalFormComposition(form.composition, known);
    out.form = formOut;
  }

  if (input.grid !== undefined) {
    const grid = obj(input.grid, "viewPolicy.operational.grid");
    const gridOut: JsonObject = {};
    const density = enumText(grid.density, "viewPolicy.operational.grid.density", DENSITIES);
    const headerTone = enumText(grid.headerTone, "viewPolicy.operational.grid.headerTone", TONES);
    const autoBorders = bool(grid.autoBorders, "viewPolicy.operational.grid.autoBorders");
    const frozenColumns = integer(grid.frozenColumns, "viewPolicy.operational.grid.frozenColumns", 0, 20);
    if (density) gridOut.density = density;
    if (headerTone) gridOut.headerTone = headerTone;
    if (autoBorders !== undefined) gridOut.autoBorders = autoBorders;
    if (frozenColumns !== undefined) gridOut.frozenColumns = frozenColumns;
    if (grid.stripe !== undefined) {
      const stripe = text(grid.stripe, "viewPolicy.operational.grid.stripe", 32);
      if (!["none", "alternating"].includes(stripe)) throw errors.validation(`viewPolicy.operational.grid.stripe is not recognised: ${stripe}`);
      gridOut.stripe = stripe;
    }
    if (grid.stripeScope !== undefined) {
      const scope = text(grid.stripeScope, "viewPolicy.operational.grid.stripeScope", 32);
      if (scope !== "record") throw errors.validation("viewPolicy.operational.grid.stripeScope must be record");
      gridOut.stripeScope = scope;
    }

    if (grid.columnGroups !== undefined) {
      if (!Array.isArray(grid.columnGroups)) throw errors.validation("viewPolicy.operational.grid.columnGroups must be an array");
      const seen = new Set<string>();
      gridOut.columnGroups = grid.columnGroups.map((entry, index) => {
        const group = obj(entry, `viewPolicy.operational.grid.columnGroups[${index}]`);
        const key = text(group.key, `viewPolicy.operational.grid.columnGroups[${index}].key`, 80);
        if (!IDENT.test(key)) throw errors.validation(`viewPolicy.operational.grid.columnGroups[${index}].key must be an identifier`);
        if (seen.has(key)) throw errors.validation(`Duplicate operational grid column group: ${key}`);
        seen.add(key);
        const fieldsValue = strings(group.fields, `viewPolicy.operational.grid.columnGroups[${index}].fields`)
          .map((field, fieldIndex) => assertField(field, known, `viewPolicy.operational.grid.columnGroups[${index}].fields[${fieldIndex}]`));
        const result: JsonObject = {
          key,
          label: text(group.label, `viewPolicy.operational.grid.columnGroups[${index}].label`, 160),
          fields: fieldsValue,
        };
        const tone = enumText(group.tone, `viewPolicy.operational.grid.columnGroups[${index}].tone`, GROUP_TONES);
        if (tone) result.tone = tone;
        return result;
      });
    }

    if (grid.secondaryRow !== undefined) {
      const secondary = obj(grid.secondaryRow, "viewPolicy.operational.grid.secondaryRow");
      const secondaryOut: JsonObject = {
        fields: strings(secondary.fields, "viewPolicy.operational.grid.secondaryRow.fields")
          .map((field, index) => assertField(field, known, `viewPolicy.operational.grid.secondaryRow.fields[${index}]`)),
      };
      if (secondary.when !== undefined) {
        const when = text(secondary.when, "viewPolicy.operational.grid.secondaryRow.when", 500);
        assertFieldConditionSupported(when, "operational.secondaryRow", "when");
        secondaryOut.when = when;
      }
      if (secondary.label !== undefined) secondaryOut.label = text(secondary.label, "viewPolicy.operational.grid.secondaryRow.label", 160);
      if (secondary.labelColumn !== undefined) secondaryOut.labelColumn = assertField(text(secondary.labelColumn, "viewPolicy.operational.grid.secondaryRow.labelColumn"), known, "viewPolicy.operational.grid.secondaryRow.labelColumn");
      gridOut.secondaryRow = secondaryOut;
    }

    if (grid.projections !== undefined) {
      if (!Array.isArray(grid.projections)) throw errors.validation("viewPolicy.operational.grid.projections must be an array");
      gridOut.projections = grid.projections.map((entry, index) => {
        const projection = obj(entry, `viewPolicy.operational.grid.projections[${index}]`);
        const method = text(projection.method, `viewPolicy.operational.grid.projections[${index}].method`, 240);
        if (!METHOD.test(method)) throw errors.validation(`viewPolicy.operational.grid.projections[${index}].method contains unsupported characters`);
        const watch = strings(projection.watch, `viewPolicy.operational.grid.projections[${index}].watch`).map((binding, watchIndex) => {
          if (binding.startsWith("parent.")) {
            const field = binding.slice("parent.".length);
            if (!IDENT.test(field)) throw errors.validation(`viewPolicy.operational.grid.projections[${index}].watch[${watchIndex}] has invalid parent field`);
            return binding;
          }
          return assertField(binding, known, `viewPolicy.operational.grid.projections[${index}].watch[${watchIndex}]`);
        });
        const inputs = obj(projection.inputs, `viewPolicy.operational.grid.projections[${index}].inputs`);
        const inputOut: JsonObject = {};
        for (const [arg, binding] of Object.entries(inputs)) {
          if (!IDENT.test(arg)) throw errors.validation(`viewPolicy.operational.grid.projections[${index}].inputs key must be an identifier: ${arg}`);
          inputOut[arg] = parseBinding(binding, known, `viewPolicy.operational.grid.projections[${index}].inputs.${arg}`);
        }
        const outputs = obj(projection.outputs, `viewPolicy.operational.grid.projections[${index}].outputs`);
        const outputOut: JsonObject = {};
        for (const [sourcePath, target] of Object.entries(outputs)) {
          if (!RESPONSE_PATH.test(sourcePath)) throw errors.validation(`viewPolicy.operational.grid.projections[${index}].outputs source path is invalid: ${sourcePath}`);
          const targetField = assertField(text(target, `viewPolicy.operational.grid.projections[${index}].outputs.${sourcePath}`), known, `viewPolicy.operational.grid.projections[${index}].outputs.${sourcePath}`);
          outputOut[sourcePath] = targetField;
        }
        const result: JsonObject = { method, watch, inputs: inputOut, outputs: outputOut };
        if (projection.key !== undefined) result.key = text(projection.key, `viewPolicy.operational.grid.projections[${index}].key`, 80);
        const debounceMs = integer(projection.debounceMs, `viewPolicy.operational.grid.projections[${index}].debounceMs`, 0, 5000);
        if (debounceMs !== undefined) result.debounceMs = debounceMs;
        if (projection.constants !== undefined) result.constants = jsonValue(projection.constants, `viewPolicy.operational.grid.projections[${index}].constants`);
        return result;
      });
    }
    out.grid = gridOut;
  }

  fields.forEach((field, index) => {
    const role = field.cellRole;
    if (role !== undefined && (typeof role !== "string" || !CELL_ROLES.has(role))) {
      throw errors.validation(`fields[${index}].cellRole is not recognised: ${String(role)}`);
    }
  });

  return out;
}
