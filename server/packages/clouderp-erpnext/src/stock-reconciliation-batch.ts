import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";

export const MAX_STOCK_RECONCILIATION_BATCH_ROWS = 500;

export interface StockReconciliationBatchRowInput extends JsonObject {
  item_code: string;
  batch_no?: string;
  counted_qty: string | number;
  counted_weight_kg?: string | number;
  serial_and_batch_bundle?: string;
  valuation_rate?: string | number;
  variance_reason?: string;
  variance_note?: string;
}

export interface StockReconciliationBatchDocument extends JsonObject {
  warehouse: string;
  scope: string;
  item_group?: string;
  item_code?: string;
  snapshot_at: string;
  counted_by: string;
  witnessed_by?: string;
  recon_state?: string;
  company?: string;
  currency?: string;
  currency_scale?: number;
  items: StockReconciliationBatchDocumentRow[];
}

export interface StockReconciliationBatchDocumentRow extends JsonObject {
  row_id?: string;
  item_code: string;
  batch_no?: string;
  counted_qty: string | number;
  counted_weight_kg?: string | number;
  serial_and_batch_bundle?: string;
  valuation_rate?: string | number;
  variance_reason?: string;
  variance_note?: string;
}

interface NormalizedBatchRow extends StockReconciliationBatchRowInput {
  item_code: string;
  counted_qty: string | number;
}

const EDITABLE_FIELDS = [
  "counted_qty",
  "counted_weight_kg",
  "serial_and_batch_bundle",
  "valuation_rate",
  "variance_reason",
  "variance_note",
] as const;

/**
 * Map pasted/repeatable count rows onto one already-snapshotted Stock Reconciliation draft.
 *
 * This is deliberately domain-only. It does not own generic batch identity, idempotency,
 * atomicity, trusted actor/tenant context or persistence. The shared WS09 executor must
 * invoke the ordinary Stock Reconciliation save path after applying this mapping.
 *
 * Frozen book/variance fields supplied by the caller are ignored because they are not part
 * of StockReconciliationBatchRowInput. Existing snapshot row order and row_id are retained;
 * physical rows discovered during counting are appended deterministically and the canonical
 * controller remains responsible for scope/master/warehouse/valuation validation.
 */
export function buildStockReconciliationBatchDocument(
  draft: StockReconciliationBatchDocument,
  rawRows: StockReconciliationBatchRowInput[],
): StockReconciliationBatchDocument {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw errors.validation("Stock Reconciliation batch requires an existing draft document");
  }
  if (!Array.isArray(draft.items)) {
    throw errors.validation("Stock Reconciliation draft must contain snapshot rows");
  }
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw errors.validation("Stock Reconciliation batch requires at least one count row");
  }
  if (rawRows.length > MAX_STOCK_RECONCILIATION_BATCH_ROWS) {
    throw errors.validation(
      `Stock Reconciliation batch supports at most ${MAX_STOCK_RECONCILIATION_BATCH_ROWS} rows`,
    );
  }

  const snapshotRows = draft.items.map((row, index) => normalizeSnapshotRow(row, index));
  const rows = rawRows.map((row, index) => normalizeBatchRow(row, index));
  assertNoDuplicateOrAmbiguousRows(snapshotRows, "Stock Reconciliation snapshot");
  assertNoDuplicateOrAmbiguousRows(rows, "Stock Reconciliation batch input");

  const inputByIdentity = new Map(rows.map((row) => [rowIdentity(row), row]));
  const missing = snapshotRows.filter((row) => !inputByIdentity.has(rowIdentity(row)));
  if (missing.length > 0) {
    const sample = missing.slice(0, 5).map(displayIdentity).join(", ");
    throw errors.validation(
      `Stock Reconciliation batch must cover every frozen snapshot row; missing ${missing.length}: ${sample}${missing.length > 5 ? ", ..." : ""}`,
    );
  }

  const snapshotIdentities = new Set(snapshotRows.map(rowIdentity));
  const mapped = snapshotRows.map((snapshotRow) => {
    const incoming = inputByIdentity.get(rowIdentity(snapshotRow))!;
    return applyEditableValues(snapshotRow, incoming);
  });
  const extras = rows.filter((row) => !snapshotIdentities.has(rowIdentity(row)));
  for (const [index, row] of extras.entries()) {
    mapped.push({
      ...row,
      row_id: `BATCH-EXTRA-${index + 1}`,
    });
  }
  assertNoDuplicateOrAmbiguousRows(mapped, "Stock Reconciliation mapped draft");

  return {
    ...draft,
    items: mapped,
  };
}

/**
 * Domain-level lost-response/retry comparison only. Generic idempotency remains owned by A2.
 * Computed book/variance/controller fields are intentionally ignored.
 */
export function stockReconciliationBatchValuesMatch(
  canonicalDraft: StockReconciliationBatchDocument,
  rawRows: StockReconciliationBatchRowInput[],
): boolean {
  try {
    const candidate = buildStockReconciliationBatchDocument(canonicalDraft, rawRows);
    if (candidate.items.length !== canonicalDraft.items.length) return false;
    return candidate.items.every((candidateRow, index) => {
      const canonicalRow = canonicalDraft.items[index];
      if (!canonicalRow) return false;
      if (rowIdentity(candidateRow) !== rowIdentity(canonicalRow)) return false;
      return editableValuesEqual(candidateRow, canonicalRow);
    });
  } catch {
    return false;
  }
}

export function stockReconciliationBatchRowIdentity(
  row: Pick<StockReconciliationBatchDocumentRow, "item_code" | "batch_no">,
): string {
  return rowIdentity(row);
}

function normalizeSnapshotRow(
  raw: StockReconciliationBatchDocumentRow,
  index: number,
): StockReconciliationBatchDocumentRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw errors.validation(`Stock Reconciliation snapshot row ${index + 1} must be an object`);
  }
  const itemCode = requiredText(raw.item_code, `snapshot.items[${index}].item_code`);
  const batchNo = optionalText(raw.batch_no);
  const normalized: StockReconciliationBatchDocumentRow = {
    ...raw,
    item_code: itemCode,
  };
  if (batchNo) normalized.batch_no = batchNo;
  else delete normalized.batch_no;
  return normalized;
}

function normalizeBatchRow(raw: StockReconciliationBatchRowInput, index: number): NormalizedBatchRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw errors.validation(`Stock Reconciliation batch row ${index + 1} must be an object`);
  }
  const itemCode = requiredText(raw.item_code, `rows[${index}].item_code`);
  const batchNo = optionalText(raw.batch_no);
  const countedQty = nonNegativeDecimal(raw.counted_qty, `rows[${index}].counted_qty`, 6);
  const countedWeight = optionalNonNegativeDecimal(raw.counted_weight_kg, `rows[${index}].counted_weight_kg`, 6);
  const valuationRate = optionalNonNegativeDecimal(raw.valuation_rate, `rows[${index}].valuation_rate`, 6);
  const bundle = optionalText(raw.serial_and_batch_bundle);
  const reason = optionalText(raw.variance_reason);
  const note = optionalText(raw.variance_note);

  return {
    item_code: itemCode,
    ...(batchNo ? { batch_no: batchNo } : {}),
    counted_qty: countedQty,
    ...(countedWeight === undefined ? {} : { counted_weight_kg: countedWeight }),
    ...(bundle ? { serial_and_batch_bundle: bundle } : {}),
    ...(valuationRate === undefined ? {} : { valuation_rate: valuationRate }),
    ...(reason ? { variance_reason: reason } : {}),
    ...(note ? { variance_note: note } : {}),
  };
}

function applyEditableValues(
  snapshotRow: StockReconciliationBatchDocumentRow,
  incoming: NormalizedBatchRow,
): StockReconciliationBatchDocumentRow {
  const mapped: StockReconciliationBatchDocumentRow = { ...snapshotRow };
  const target = mapped as JsonObject;
  for (const field of EDITABLE_FIELDS) {
    const value = incoming[field];
    if (value === undefined) delete target[field];
    else target[field] = value;
  }
  return mapped;
}

function editableValuesEqual(
  left: StockReconciliationBatchDocumentRow,
  right: StockReconciliationBatchDocumentRow,
): boolean {
  if (!sameRequiredDecimal(left.counted_qty, right.counted_qty, 6)) return false;
  if (!sameOptionalDecimal(left.counted_weight_kg, right.counted_weight_kg, 6)) return false;
  if (!sameOptionalDecimal(left.valuation_rate, right.valuation_rate, 6)) return false;
  return optionalText(left.serial_and_batch_bundle) === optionalText(right.serial_and_batch_bundle)
    && optionalText(left.variance_reason) === optionalText(right.variance_reason)
    && optionalText(left.variance_note) === optionalText(right.variance_note);
}

function assertNoDuplicateOrAmbiguousRows(
  rows: Array<Pick<StockReconciliationBatchDocumentRow, "item_code" | "batch_no">>,
  source: string,
): void {
  const identities = new Set<string>();
  const itemModes = new Map<string, { aggregate: boolean; batches: Set<string> }>();
  for (const row of rows) {
    const itemCode = requiredText(row.item_code, `${source}.item_code`);
    const identity = rowIdentity(row);
    if (identities.has(identity)) {
      throw errors.validation(`${source}: duplicate row ${displayIdentity(row)}`);
    }
    identities.add(identity);
    const batchNo = optionalText(row.batch_no);
    const mode = itemModes.get(itemCode) ?? { aggregate: false, batches: new Set<string>() };
    if (batchNo) mode.batches.add(batchNo);
    else mode.aggregate = true;
    itemModes.set(itemCode, mode);
  }
  for (const [itemCode, mode] of itemModes) {
    if (mode.aggregate && mode.batches.size > 0) {
      throw errors.validation(`${source}: ${itemCode} cannot mix aggregate and batch-specific rows`);
    }
  }
}

function rowIdentity(row: { item_code?: unknown; batch_no?: unknown }): string {
  return `${requiredText(row.item_code, "item_code")}\u0000${optionalText(row.batch_no) ?? ""}`;
}

function displayIdentity(row: { item_code?: unknown; batch_no?: unknown }): string {
  const itemCode = requiredText(row.item_code, "item_code");
  const batchNo = optionalText(row.batch_no);
  return batchNo ? `${itemCode} / ${batchNo}` : itemCode;
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).normalize("NFC").trim();
  return normalized || undefined;
}

function nonNegativeDecimal(value: unknown, field: string, scale: number): string | number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw errors.validation(`${field} must be a decimal value`);
  }
  const micros = toScaledInt(value, scale, field);
  if (micros < 0) throw errors.validation(`${field} cannot be negative`);
  return typeof value === "string" ? value.trim() : value;
}

function optionalNonNegativeDecimal(
  value: unknown,
  field: string,
  scale: number,
): string | number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return nonNegativeDecimal(value, field, scale);
}

function sameRequiredDecimal(left: unknown, right: unknown, scale: number): boolean {
  if ((typeof left !== "string" && typeof left !== "number")
    || (typeof right !== "string" && typeof right !== "number")) return false;
  try {
    return toScaledInt(left, scale) === toScaledInt(right, scale);
  } catch {
    return false;
  }
}

function sameOptionalDecimal(left: unknown, right: unknown, scale: number): boolean {
  const leftMissing = left === undefined || left === null || left === "";
  const rightMissing = right === undefined || right === null || right === "";
  if (leftMissing || rightMissing) return leftMissing && rightMissing;
  return sameRequiredDecimal(left, right, scale);
}
