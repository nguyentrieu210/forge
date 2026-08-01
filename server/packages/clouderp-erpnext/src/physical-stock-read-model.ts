import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export interface PhysicalStockLedgerRow extends JsonObject {
  tenant_id: string;
  company: string;
  item_code: string;
  warehouse: string;
  posting_at: string;
  voucher_type: string;
  voucher_no: string;
  voucher_row?: string;
  revision?: number;
  quantity_micros: number;
  /** Actual measured catch weight. Undefined means this movement was not weighed. */
  weight_micros?: number;
  value_micros?: number;
  physical_count_micros?: number;
  physical_identity_key?: string;
  inventory_mode?: string;
  measurement_profile?: string;
  color?: string;
  condition?: string;
  generation?: string;
  length_micros?: number;
  width_micros?: number;
  height_micros?: number;
  thickness_micros?: number;
  batch_no?: string;
  serial_no?: string;
  warehouse_role?: string;
  reversal_of_voucher_type?: string;
  reversal_of_voucher_no?: string;
  reversal_of_voucher_row?: string;
}

export interface PhysicalStockFilters {
  tenant_id: string;
  company: string;
  item_code?: string;
  warehouse?: string;
  warehouse_role?: string;
  inventory_mode?: string;
  measurement_profile?: string;
  color?: string;
  condition?: string;
  generation?: string;
  length_micros?: number;
  width_micros?: number;
  height_micros?: number;
  thickness_micros?: number;
  batch_no?: string;
  serial_no?: string;
  include_zero?: boolean;
  limit?: number;
  cursor?: string;
}

export interface PhysicalStockLineageEvent {
  posting_at: string;
  voucher_type: string;
  voucher_no: string;
  voucher_row?: string;
  revision?: number;
  quantity_micros: number;
  weight_micros?: number;
  value_micros: number;
  physical_count_micros: number;
  reversal_of?: {
    voucher_type: string;
    voucher_no: string;
    voucher_row?: string;
  };
}

export interface PhysicalStockBalance {
  key: string;
  tenant_id: string;
  company: string;
  item_code: string;
  warehouse: string;
  warehouse_role: string;
  physical_identity_key: string;
  inventory_mode: string;
  measurement_profile: string;
  color: string;
  condition: string;
  generation: string;
  length_micros?: number;
  width_micros?: number;
  height_micros?: number;
  thickness_micros?: number;
  batch_no: string;
  serial_no: string;
  quantity_micros: number;
  /** Omitted when any quantity-moving lineage row was not actually weighed. */
  weight_micros?: number;
  value_micros: number;
  physical_count_micros: number;
  first_posting_at: string;
  last_posting_at: string;
  lineage: PhysicalStockLineageEvent[];
}

export interface PhysicalStockTotals {
  quantity_micros: number;
  /** Omitted when weight is absent or any non-zero movement has unknown measured weight. */
  weight_micros?: number;
  value_micros: number;
  physical_count_micros: number;
}

export interface PhysicalStockPage {
  rows: PhysicalStockBalance[];
  next_cursor?: string;
  totals: PhysicalStockTotals;
  complete: boolean;
}

/**
 * Builds a deterministic read model from the authoritative append-only ledger.
 * It never writes balances and must not be used as a competing stock book.
 */
export function buildPhysicalStockPage(
  ledgerRows: readonly PhysicalStockLedgerRow[],
  filters: PhysicalStockFilters,
): PhysicalStockPage {
  assertFilters(filters);
  const groups = new Map<string, PhysicalStockBalance>();
  const completeWeight = new Map<string, boolean>();

  for (const row of ledgerRows) {
    if (!matches(row, filters)) continue;
    assertLedgerRow(row);
    const key = balanceKey(row);
    const event = lineageEvent(row);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, createBalance(key, row, event));
      completeWeight.set(key, row.quantity_micros === 0 || row.weight_micros !== undefined);
      continue;
    }
    current.quantity_micros = addMicros(current.quantity_micros, row.quantity_micros);
    current.value_micros = addMicros(current.value_micros, row.value_micros ?? 0);
    current.physical_count_micros = addMicros(current.physical_count_micros, row.physical_count_micros ?? 0);
    const wasComplete = completeWeight.get(key) !== false;
    const rowComplete = row.quantity_micros === 0 || row.weight_micros !== undefined;
    const remainsComplete = wasComplete && rowComplete;
    completeWeight.set(key, remainsComplete);
    if (!remainsComplete) {
      delete current.weight_micros;
    } else if (row.weight_micros !== undefined) {
      current.weight_micros = addMicros(current.weight_micros ?? 0, row.weight_micros);
    }
    if (row.posting_at < current.first_posting_at) current.first_posting_at = row.posting_at;
    if (row.posting_at > current.last_posting_at) current.last_posting_at = row.posting_at;
    current.lineage.push(event);
  }

  const all = [...groups.values()]
    .filter((row) => filters.include_zero || !isZeroBalance(row))
    .map((row) => ({ ...row, lineage: [...row.lineage].sort(compareEvents) }))
    .sort(compareBalances);

  const start = cursorIndex(all, filters.cursor);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = all.slice(start, start + limit);
  const hasMore = start + rows.length < all.length;
  const last = rows[rows.length - 1];

  return {
    rows,
    ...(hasMore && last ? { next_cursor: encodeCursor(last.key) } : {}),
    totals: sumBalances(all),
    complete: start === 0 && !hasMore,
  };
}

export function reconcilePhysicalStockPage(page: PhysicalStockPage): void {
  for (const row of page.rows) {
    const eventTotals = sumEvents(row.lineage);
    if (
      eventTotals.quantity_micros !== row.quantity_micros
      || eventTotals.weight_micros !== row.weight_micros
      || eventTotals.value_micros !== row.value_micros
      || eventTotals.physical_count_micros !== row.physical_count_micros
    ) {
      throw new Error(`physical stock lineage does not reconcile for ${row.key}`);
    }
  }

  if (!page.complete) return;
  const pageTotals = sumBalances(page.rows);
  if (
    pageTotals.quantity_micros !== page.totals.quantity_micros
    || pageTotals.weight_micros !== page.totals.weight_micros
    || pageTotals.value_micros !== page.totals.value_micros
    || pageTotals.physical_count_micros !== page.totals.physical_count_micros
  ) {
    throw new Error("physical stock totals do not reconcile");
  }
}

function createBalance(
  key: string,
  row: PhysicalStockLedgerRow,
  event: PhysicalStockLineageEvent,
): PhysicalStockBalance {
  return {
    key,
    tenant_id: row.tenant_id,
    company: row.company,
    item_code: row.item_code,
    warehouse: row.warehouse,
    warehouse_role: text(row.warehouse_role),
    physical_identity_key: text(row.physical_identity_key),
    inventory_mode: text(row.inventory_mode) || "Hàng thường",
    measurement_profile: text(row.measurement_profile),
    color: text(row.color),
    condition: text(row.condition),
    generation: text(row.generation),
    ...(row.length_micros === undefined ? {} : { length_micros: row.length_micros }),
    ...(row.width_micros === undefined ? {} : { width_micros: row.width_micros }),
    ...(row.height_micros === undefined ? {} : { height_micros: row.height_micros }),
    ...(row.thickness_micros === undefined ? {} : { thickness_micros: row.thickness_micros }),
    batch_no: text(row.batch_no),
    serial_no: text(row.serial_no),
    quantity_micros: row.quantity_micros,
    ...(row.weight_micros === undefined ? {} : { weight_micros: row.weight_micros }),
    value_micros: row.value_micros ?? 0,
    physical_count_micros: row.physical_count_micros ?? 0,
    first_posting_at: row.posting_at,
    last_posting_at: row.posting_at,
    lineage: [event],
  };
}

function matches(row: PhysicalStockLedgerRow, filters: PhysicalStockFilters): boolean {
  return row.tenant_id === filters.tenant_id
    && row.company === filters.company
    && matchText(row.item_code, filters.item_code)
    && matchText(row.warehouse, filters.warehouse)
    && matchText(row.warehouse_role, filters.warehouse_role)
    && matchText(row.inventory_mode, filters.inventory_mode)
    && matchText(row.measurement_profile, filters.measurement_profile)
    && matchText(row.color, filters.color)
    && matchText(row.condition, filters.condition)
    && matchText(row.generation, filters.generation)
    && matchNumber(row.length_micros, filters.length_micros)
    && matchNumber(row.width_micros, filters.width_micros)
    && matchNumber(row.height_micros, filters.height_micros)
    && matchNumber(row.thickness_micros, filters.thickness_micros)
    && matchText(row.batch_no, filters.batch_no)
    && matchText(row.serial_no, filters.serial_no);
}

function matchText(value: unknown, expected: string | undefined): boolean {
  return expected === undefined || text(value) === expected;
}

function matchNumber(value: number | undefined, expected: number | undefined): boolean {
  return expected === undefined || value === expected;
}

function balanceKey(row: PhysicalStockLedgerRow): string {
  return [
    row.tenant_id,
    row.company,
    row.item_code,
    row.warehouse,
    text(row.physical_identity_key),
    text(row.batch_no),
    text(row.serial_no),
  ].map(escapePart).join("|");
}

function lineageEvent(row: PhysicalStockLedgerRow): PhysicalStockLineageEvent {
  return {
    posting_at: row.posting_at,
    voucher_type: row.voucher_type,
    voucher_no: row.voucher_no,
    ...(row.voucher_row ? { voucher_row: row.voucher_row } : {}),
    ...(row.revision === undefined ? {} : { revision: row.revision }),
    quantity_micros: row.quantity_micros,
    ...(row.weight_micros === undefined ? {} : { weight_micros: row.weight_micros }),
    value_micros: row.value_micros ?? 0,
    physical_count_micros: row.physical_count_micros ?? 0,
    ...(row.reversal_of_voucher_type && row.reversal_of_voucher_no ? {
      reversal_of: {
        voucher_type: row.reversal_of_voucher_type,
        voucher_no: row.reversal_of_voucher_no,
        ...(row.reversal_of_voucher_row ? { voucher_row: row.reversal_of_voucher_row } : {}),
      },
    } : {}),
  };
}

function compareEvents(a: PhysicalStockLineageEvent, b: PhysicalStockLineageEvent): number {
  return a.posting_at.localeCompare(b.posting_at)
    || a.voucher_type.localeCompare(b.voucher_type)
    || a.voucher_no.localeCompare(b.voucher_no)
    || text(a.voucher_row).localeCompare(text(b.voucher_row));
}

function compareBalances(a: PhysicalStockBalance, b: PhysicalStockBalance): number {
  return a.item_code.localeCompare(b.item_code)
    || a.warehouse.localeCompare(b.warehouse)
    || a.physical_identity_key.localeCompare(b.physical_identity_key)
    || a.batch_no.localeCompare(b.batch_no)
    || a.serial_no.localeCompare(b.serial_no)
    || a.key.localeCompare(b.key);
}

function cursorIndex(rows: PhysicalStockBalance[], cursor: string | undefined): number {
  if (!cursor) return 0;
  const key = decodeCursor(cursor);
  const index = rows.findIndex((row) => row.key === key);
  if (index < 0) throw errors.validation("Invalid physical stock cursor");
  return index + 1;
}

function encodeCursor(key: string): string {
  return encodeURIComponent(key);
}

function decodeCursor(cursor: string): string {
  try {
    return decodeURIComponent(cursor);
  } catch {
    throw errors.validation("Invalid physical stock cursor");
  }
}

function sumBalances(rows: readonly PhysicalStockBalance[]): PhysicalStockTotals {
  const base = rows.reduce<PhysicalStockTotals>(
    (totals, row) => ({
      quantity_micros: addMicros(totals.quantity_micros, row.quantity_micros),
      value_micros: addMicros(totals.value_micros, row.value_micros),
      physical_count_micros: addMicros(totals.physical_count_micros, row.physical_count_micros),
    }),
    { quantity_micros: 0, value_micros: 0, physical_count_micros: 0 },
  );
  const hasMeasuredWeight = rows.some((row) => row.weight_micros !== undefined);
  const measurable = hasMeasuredWeight && rows.every((row) => row.quantity_micros === 0 || row.weight_micros !== undefined);
  if (!measurable) return base;
  return {
    ...base,
    weight_micros: rows.reduce((total, row) => addMicros(total, row.weight_micros ?? 0), 0),
  };
}

function sumEvents(events: readonly PhysicalStockLineageEvent[]): PhysicalStockTotals {
  const base = events.reduce<PhysicalStockTotals>(
    (totals, event) => ({
      quantity_micros: addMicros(totals.quantity_micros, event.quantity_micros),
      value_micros: addMicros(totals.value_micros, event.value_micros),
      physical_count_micros: addMicros(totals.physical_count_micros, event.physical_count_micros),
    }),
    { quantity_micros: 0, value_micros: 0, physical_count_micros: 0 },
  );
  const hasMeasuredWeight = events.some((event) => event.weight_micros !== undefined);
  const measurable = hasMeasuredWeight && events.every((event) => event.quantity_micros === 0 || event.weight_micros !== undefined);
  if (!measurable) return base;
  return {
    ...base,
    weight_micros: events.reduce((total, event) => addMicros(total, event.weight_micros ?? 0), 0),
  };
}

function isZeroBalance(row: PhysicalStockBalance): boolean {
  return row.quantity_micros === 0
    && (row.weight_micros ?? 0) === 0
    && row.value_micros === 0
    && row.physical_count_micros === 0;
}

function assertFilters(filters: PhysicalStockFilters): void {
  if (!text(filters.tenant_id)) throw new Error("tenant_id is required");
  if (!text(filters.company)) throw new Error("company is required");
  if (filters.limit !== undefined && !Number.isInteger(filters.limit)) throw new Error("limit must be an integer");
  for (const value of [filters.length_micros, filters.width_micros, filters.height_micros, filters.thickness_micros]) {
    if (value !== undefined && !Number.isSafeInteger(value)) throw new Error("physical dimension filters must use safe integer micros");
  }
}

function assertLedgerRow(row: PhysicalStockLedgerRow): void {
  if (!text(row.item_code) || !text(row.warehouse) || !text(row.posting_at) || !text(row.voucher_type) || !text(row.voucher_no)) {
    throw new Error("physical stock ledger row is incomplete");
  }
  for (const value of [
    row.quantity_micros,
    row.weight_micros,
    row.value_micros ?? 0,
    row.physical_count_micros ?? 0,
    row.length_micros,
    row.width_micros,
    row.height_micros,
    row.thickness_micros,
  ]) {
    if (value !== undefined && !Number.isSafeInteger(value)) throw new Error("physical stock ledger micros must be safe integers");
  }
}

function addMicros(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error("physical stock micros overflow");
  return value;
}

function escapePart(value: unknown): string {
  return encodeURIComponent(text(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}