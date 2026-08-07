import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { assertFieldConditionSupported } from "./field-condition.js";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const METHOD = /^[A-Za-z0-9_.:-]+$/;
const RESPONSE_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const BLOCK_TYPES = new Set(["fields", "stats", "alert", "projection"]);
const TONES = new Set(["neutral", "brand", "info", "success", "warning", "danger"]);
const FORMATS = new Set(["text", "number", "currency", "percent", "date", "datetime"]);
const EMPHASIS = new Set(["normal", "strong", "grand"]);

function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${path} must be a non-empty string up to ${max} characters`);
  return value.trim();
}
function integer(value: unknown, path: string, min: number, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw errors.validation(`${path} must be an integer from ${min} to ${max}`);
  return value;
}
function enumText(value: unknown, path: string, allowed: Set<string>): string | undefined {
  if (value === undefined) return undefined;
  const parsed = text(value, path, 64);
  if (!allowed.has(parsed)) throw errors.validation(`${path} is not recognised: ${parsed}`);
  return parsed;
}
function stringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.length) throw errors.validation(`${path} must be a non-empty array`);
  return value.map((entry, index) => text(entry, `${path}[${index}]`));
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
function assertField(value: unknown, known: Set<string>, path: string): string {
  const field = text(value, path, 160);
  if (!known.has(field)) throw errors.validation(`${path} names unknown field: ${field}`);
  return field;
}
function optionalText(value: unknown, path: string, max = 240): string | undefined {
  return value === undefined ? undefined : text(value, path, max);
}

/**
 * MetaForm 4.1 composition is presentation-only. It may place existing fields, format existing
 * scalar values, show alerts and call named read-only projections. It cannot write projection
 * results back into a document and it cannot contain arbitrary executable expressions.
 */
export function parseOperationalFormComposition(value: unknown, known: Set<string>): JsonObject {
  const input = obj(value, "viewPolicy.operational.form.composition");
  const unsupported = Object.keys(input).filter((key) => !["columns", "blocks"].includes(key));
  if (unsupported.length) throw errors.validation(`viewPolicy.operational.form.composition contains unsupported keys: ${unsupported.join(", ")}`);
  const columns = integer(input.columns, "viewPolicy.operational.form.composition.columns", 12, 12, 12);
  if (columns !== 12) throw errors.validation("viewPolicy.operational.form.composition.columns must be 12");
  if (!Array.isArray(input.blocks) || !input.blocks.length || input.blocks.length > 32) throw errors.validation("viewPolicy.operational.form.composition.blocks must contain 1-32 blocks");
  const seen = new Set<string>();
  const blocks = input.blocks.map((entry, index) => {
    const path = `viewPolicy.operational.form.composition.blocks[${index}]`;
    const block = obj(entry, path);
    const type = enumText(block.type, `${path}.type`, BLOCK_TYPES)!;
    const key = text(block.key, `${path}.key`, 80);
    if (!IDENT.test(key)) throw errors.validation(`${path}.key must be an identifier`);
    if (seen.has(key)) throw errors.validation(`Duplicate form composition block: ${key}`);
    seen.add(key);
    const result: JsonObject = { key, type, span: integer(block.span, `${path}.span`, 1, 12, 12) };
    const title = optionalText(block.title, `${path}.title`, 160);
    const description = optionalText(block.description, `${path}.description`, 500);
    const tone = enumText(block.tone, `${path}.tone`, TONES);
    if (title) result.title = title;
    if (description) result.description = description;
    if (tone) result.tone = tone;
    if (block.when !== undefined) {
      const when = text(block.when, `${path}.when`, 500);
      assertFieldConditionSupported(when, "operational.form.composition", "when");
      result.when = when;
    }

    if (type === "fields") {
      const fields = stringList(block.fields, `${path}.fields`).map((field, fieldIndex) => assertField(field, known, `${path}.fields[${fieldIndex}]`));
      if (new Set(fields).size !== fields.length) throw errors.validation(`${path}.fields must not contain duplicates`);
      result.fields = fields;
      if (block.fieldSpans !== undefined) {
        const spans = obj(block.fieldSpans, `${path}.fieldSpans`);
        const spanOut: JsonObject = {};
        for (const [field, rawSpan] of Object.entries(spans)) {
          if (!fields.includes(field)) throw errors.validation(`${path}.fieldSpans.${field} must name a field in the block`);
          spanOut[field] = integer(rawSpan, `${path}.fieldSpans.${field}`, 1, 12);
        }
        result.fieldSpans = spanOut;
      }
    } else if (type === "stats") {
      if (!Array.isArray(block.items) || !block.items.length || block.items.length > 12) throw errors.validation(`${path}.items must contain 1-12 items`);
      result.items = block.items.map((rawItem, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex}]`;
        const item = obj(rawItem, itemPath);
        const out: JsonObject = { field: assertField(item.field, known, `${itemPath}.field`) };
        const label = optionalText(item.label, `${itemPath}.label`, 160);
        const format = enumText(item.format, `${itemPath}.format`, FORMATS);
        const emphasis = enumText(item.emphasis, `${itemPath}.emphasis`, EMPHASIS);
        if (label) out.label = label;
        if (format) out.format = format;
        if (emphasis) out.emphasis = emphasis;
        return out;
      });
    } else if (type === "alert") {
      result.field = assertField(block.field, known, `${path}.field`);
      const label = optionalText(block.label, `${path}.label`, 160);
      if (label) result.label = label;
    } else {
      const projection = obj(block.projection, `${path}.projection`);
      const method = text(projection.method, `${path}.projection.method`, 240);
      if (!METHOD.test(method)) throw errors.validation(`${path}.projection.method contains unsupported characters`);
      const watch = stringList(projection.watch, `${path}.projection.watch`).map((field, watchIndex) => assertField(field, known, `${path}.projection.watch[${watchIndex}]`));
      const inputs = obj(projection.inputs, `${path}.projection.inputs`);
      const inputOut: JsonObject = {};
      for (const [arg, rawBinding] of Object.entries(inputs)) {
        if (!IDENT.test(arg)) throw errors.validation(`${path}.projection.inputs key must be an identifier: ${arg}`);
        const binding = text(rawBinding, `${path}.projection.inputs.${arg}`, 240);
        if (!binding.startsWith("parent.")) throw errors.validation(`${path}.projection.inputs.${arg} must bind parent.<field>`);
        const field = binding.slice("parent.".length);
        if (!IDENT.test(field) || !known.has(field)) throw errors.validation(`${path}.projection.inputs.${arg} names unknown parent field: ${field}`);
        inputOut[arg] = `parent.${field}`;
      }
      if (!Array.isArray(projection.items) || !projection.items.length || projection.items.length > 12) throw errors.validation(`${path}.projection.items must contain 1-12 display items`);
      const itemOut = projection.items.map((rawItem, itemIndex) => {
        const itemPath = `${path}.projection.items[${itemIndex}]`;
        const item = obj(rawItem, itemPath);
        const sourcePath = text(item.path, `${itemPath}.path`, 240);
        if (!RESPONSE_PATH.test(sourcePath)) throw errors.validation(`${itemPath}.path is invalid`);
        const out: JsonObject = { path: sourcePath, label: text(item.label, `${itemPath}.label`, 160) };
        const format = enumText(item.format, `${itemPath}.format`, FORMATS);
        const itemTone = enumText(item.tone, `${itemPath}.tone`, TONES);
        if (format) out.format = format;
        if (itemTone) out.tone = itemTone;
        return out;
      });
      const projectionOut: JsonObject = { method, watch, inputs: inputOut, items: itemOut };
      if (projection.constants !== undefined) projectionOut.constants = jsonValue(projection.constants, `${path}.projection.constants`);
      if (projection.debounceMs !== undefined) projectionOut.debounceMs = integer(projection.debounceMs, `${path}.projection.debounceMs`, 0, 5000);
      result.projection = projectionOut;
    }
    return result;
  });
  return { columns: 12, blocks };
}
