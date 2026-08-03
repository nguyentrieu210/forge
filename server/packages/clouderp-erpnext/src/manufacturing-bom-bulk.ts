import type { JsonObject } from "../../contracts/src/index.js";
import { errors, sha256Hex } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { BillOfMaterialsData, BomItem } from "./types.js";
import type { BomQuantityBasis } from "./manufacturing-lifecycle.js";

export const MAX_BULK_BOM_ROWS = 500;
const QUANTITY_BASES = new Set<BomQuantityBasis>([
  "Cố định",
  "Theo chiều cao",
  "Theo chiều rộng",
  "Theo diện tích",
  "Theo số lá",
]);

export interface BulkBomRowInput extends JsonObject {
  item_code: string;
  qty: string | number;
  source_warehouse?: string;
  uom?: string;
  conversion_factor?: string | number;
  qty_basis?: BomQuantityBasis;
}

export interface BulkBomDraftInput extends JsonObject {
  company: string;
  item: string;
  quantity?: string | number;
  currency?: string;
  operating_cost?: string | number;
  revision?: number;
  effective_from: string;
  effective_to?: string;
  output_uom?: string;
  output_conversion_factor?: string | number;
  rows: BulkBomRowInput[];
}

export interface BulkBomDraftDocument extends BillOfMaterialsData {
  revision: number;
  bom_status: "Draft";
  effective_from: string;
  effective_to?: string;
  output_uom?: string;
  output_conversion_factor?: string;
  items: Array<BomItem & {
    uom?: string;
    conversion_factor?: string;
    qty_basis?: BomQuantityBasis;
  }>;
}

export interface BulkBomDraftPreview extends JsonObject {
  schema_version: 1;
  fingerprint: string;
  company: string;
  item: string;
  revision: number;
  effective_from: string;
  effective_to?: string;
  row_count: number;
  document: BulkBomDraftDocument;
}

/** Converts one pasted BOM parent + child table into the ordinary canonical BOM draft shape. */
export function buildBulkBomDraftDocument(input: BulkBomDraftInput): BulkBomDraftDocument {
  const company = requiredText(input.company, "company");
  const item = requiredText(input.item, "item");
  const quantityMicros = positiveMicros(input.quantity ?? 1, "quantity");
  const revision = positiveInteger(input.revision ?? 1, "revision");
  const effectiveFrom = validDate(input.effective_from, "effective_from");
  const effectiveTo = input.effective_to ? validDate(input.effective_to, "effective_to") : undefined;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw errors.validation("effective_to must be on or after effective_from");
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw errors.validation("Bulk BOM requires at least one component row");
  }
  if (input.rows.length > MAX_BULK_BOM_ROWS) {
    throw errors.validation(`Bulk BOM supports at most ${MAX_BULK_BOM_ROWS} component rows`);
  }

  const rows = input.rows.map((raw, index) => normalizeRow(raw, index, item));
  const outputUom = optionalText(input.output_uom);
  const outputConversion = input.output_conversion_factor === undefined
    ? undefined
    : positiveMicros(input.output_conversion_factor, "output_conversion_factor");
  const operatingCost = input.operating_cost === undefined
    ? undefined
    : nonNegativeMicros(input.operating_cost, "operating_cost");
  const currency = optionalText(input.currency);

  return {
    company,
    item,
    quantity: fromScaledInt(quantityMicros, 6),
    revision,
    bom_status: "Draft",
    effective_from: effectiveFrom,
    ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    ...(currency ? { currency } : {}),
    ...(operatingCost !== undefined ? { operating_cost: fromScaledInt(operatingCost, 6) } : {}),
    ...(outputUom ? { output_uom: outputUom } : {}),
    ...(outputConversion !== undefined ? { output_conversion_factor: fromScaledInt(outputConversion, 6) } : {}),
    items: rows,
  };
}

export function bulkBomRevisionKey(input: BulkBomDraftInput): string {
  const document = buildBulkBomDraftDocument(input);
  return `${document.company}\u0000${document.item}\u0000${document.revision}`;
}

/**
 * Compares the caller's exact business input with a Draft after the ordinary BOM
 * controller has expanded UOM defaults, rates, money scale and checksum fields.
 * Computed fields are intentionally ignored; explicit caller fields still have to
 * match. This is the replay guard for a lost-response retry, not a second BOM validator.
 */
export function canonicalDraftMatchesBulkBomInput(input: BulkBomDraftInput, canonical: JsonObject): boolean {
  const candidate = buildBulkBomDraftDocument(input);
  if (text(canonical.company) !== candidate.company || text(canonical.item) !== candidate.item) return false;
  if (positiveIntegerOrZero(canonical.revision) !== candidate.revision) return false;
  if (text(canonical.bom_status) !== "Draft") return false;
  if (text(canonical.effective_from) !== candidate.effective_from) return false;
  if (optionalText(canonical.effective_to) !== candidate.effective_to) return false;
  if (!sameDecimal(canonical.quantity, candidate.quantity, 6)) return false;
  if (!sameOptionalDecimal(canonical.operating_cost, candidate.operating_cost, 6)) return false;
  if (!matchesOptionalUomAndFactor(
    candidate.output_uom,
    candidate.output_conversion_factor,
    canonical.output_uom,
    canonical.output_stock_uom,
    canonical.output_conversion_factor,
  )) return false;

  const existingRows = Array.isArray(canonical.items) ? canonical.items : [];
  if (existingRows.length !== candidate.items.length) return false;
  for (const [index, candidateRow] of candidate.items.entries()) {
    const existing = existingRows[index];
    if (!isObject(existing)) return false;
    if (text(existing.item_code) !== candidateRow.item_code) return false;
    if (!sameDecimal(existing.qty, candidateRow.qty, 6)) return false;
    if (optionalText(existing.source_warehouse) !== optionalText(candidateRow.source_warehouse)) return false;
    const candidateBasis = candidateRow.qty_basis ?? "Cố định";
    if ((optionalText(existing.qty_basis) ?? "Cố định") !== candidateBasis) return false;
    if (!matchesOptionalUomAndFactor(
      candidateRow.uom,
      candidateRow.conversion_factor,
      existing.uom,
      existing.stock_uom,
      existing.conversion_factor,
    )) return false;
  }
  return true;
}

/** Stable fingerprint for preview/audit. Kernel idempotency remains authoritative for the write itself. */
export async function fingerprintBulkBomDraft(input: BulkBomDraftInput): Promise<string> {
  return sha256Hex(canonicalJson(buildBulkBomDraftDocument(input)));
}

export async function previewBulkBomDraft(input: BulkBomDraftInput): Promise<BulkBomDraftPreview> {
  const document = buildBulkBomDraftDocument(input);
  return {
    schema_version: 1,
    fingerprint: await sha256Hex(canonicalJson(document)),
    company: document.company,
    item: document.item,
    revision: document.revision,
    effective_from: document.effective_from,
    ...(document.effective_to ? { effective_to: document.effective_to } : {}),
    row_count: document.items.length,
    document,
  };
}

function normalizeRow(
  raw: BulkBomRowInput,
  index: number,
  outputItem: string,
): BulkBomDraftDocument["items"][number] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw errors.validation(`Bulk BOM row ${index + 1} must be an object`);
  }
  const itemCode = requiredText(raw.item_code, `rows[${index}].item_code`);
  if (itemCode === outputItem) {
    throw errors.validation(`Bulk BOM row ${index + 1} cannot consume its own output Item`);
  }
  const qtyMicros = positiveMicros(raw.qty, `rows[${index}].qty`);
  const sourceWarehouse = optionalText(raw.source_warehouse);
  const uom = optionalText(raw.uom);
  const factorMicros = raw.conversion_factor === undefined
    ? undefined
    : positiveMicros(raw.conversion_factor, `rows[${index}].conversion_factor`);
  const qtyBasis = raw.qty_basis;
  if (qtyBasis !== undefined && !QUANTITY_BASES.has(qtyBasis)) {
    throw errors.validation(`Unsupported qty_basis at row ${index + 1}`);
  }

  return {
    row_id: `ROW-${index + 1}`,
    item_code: itemCode,
    qty: fromScaledInt(qtyMicros, 6),
    ...(sourceWarehouse ? { source_warehouse: sourceWarehouse } : {}),
    ...(uom ? { uom } : {}),
    ...(factorMicros !== undefined ? { conversion_factor: fromScaledInt(factorMicros, 6) } : {}),
    ...(qtyBasis ? { qty_basis: qtyBasis } : {}),
  };
}

function matchesOptionalUomAndFactor(
  requestedUom: unknown,
  requestedFactor: unknown,
  actualUom: unknown,
  actualStockUom: unknown,
  actualFactor: unknown,
): boolean {
  const requestedUomText = optionalText(requestedUom);
  const actualUomText = optionalText(actualUom);
  const stockUomText = optionalText(actualStockUom);
  if (requestedUomText) {
    if (actualUomText !== requestedUomText) return false;
  } else if (actualUomText && stockUomText && actualUomText !== stockUomText) {
    return false;
  }

  if (requestedFactor !== undefined) return sameDecimal(actualFactor, requestedFactor, 6);
  return actualFactor === undefined || sameDecimal(actualFactor, "1", 6);
}

function sameOptionalDecimal(left: unknown, right: unknown, scale: number): boolean {
  if (left === undefined || left === null || left === "") {
    return right === undefined || right === null || right === "" || sameDecimal(right, "0", scale);
  }
  if (right === undefined || right === null || right === "") return sameDecimal(left, "0", scale);
  return sameDecimal(left, right, scale);
}

function sameDecimal(left: unknown, right: unknown, scale: number): boolean {
  if (!isDecimalInput(left) || !isDecimalInput(right)) return false;
  try {
    return toScaledInt(left, scale) === toScaledInt(right, scale);
  } catch {
    return false;
  }
}

function isDecimalInput(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function positiveInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw errors.validation(`${field} must be a positive integer`);
  }
  return number;
}

function positiveIntegerOrZero(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function positiveMicros(value: string | number, field: string): number {
  const micros = toScaledInt(value, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function nonNegativeMicros(value: string | number, field: string): number {
  const micros = toScaledInt(value, 6, field);
  if (micros < 0) throw errors.validation(`${field} cannot be negative`);
  return micros;
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function text(value: unknown): string {
  return optionalText(value) ?? "";
}

function validDate(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw errors.validation(`${field} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw errors.validation(`${field} must be a valid calendar date`);
  }
  return normalized;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation("Bulk BOM fingerprint cannot contain non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw errors.validation("Bulk BOM fingerprint contains an unsupported value");
}
