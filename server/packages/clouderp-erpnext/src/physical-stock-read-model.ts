import type { JsonObject } from "../../contracts/src/index.js";

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
  value_micros: number;
  physical_count_micros: number;
  first_posting_at: string;
  last_posting_at: string;
  lineage: PhysicalStockLineageEvent[];
}

export interface PhysicalStockPage {
  rows: PhysicalStockBalance[];
  next_cursor?: string;
  totals: {
    quantity_micros: number;
    value_micros: number;
    physical_count_micros: number;
  };
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

  for (const row of ledgerRows) {
    if (!matches(row, filters)) continue;
    assertLedgerRow(row);
    const key = balanceKey(row);
    const event = lineageEvent(row);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
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
        value_micros: row.value_micros ?? 0,
        physical_count_micros: row.physical_count_micros ?? 0,
        first_posting_at: row.posting_at,
        last_posting_at: row.posting_at,
        lineage: [event],
      });
      continue;
    }
    current.quantity_micros += row.quantity_micros;
    current.value_micros += row.value_micros ?? 0;
    current.physical_count_micros += row.physical_count_micros ?? 0;
    if (row.posting_at < current.first_posting_at) current.first_posting_at = row.posting_at;
    if (row.posting_at > current.last_posting_at) current.last_posting_at = row.posting_at;
    current.lineage.push(event);
  }

  const all = [...groups.values()]
    .filter((row) => filters.include_zero || row.quantity_micros !== 0 || row.value_micros !== 0 || row.physical_count_micros !== 0)
    .map((row) => ({ ...row, lineage: row.lineage.sort(compareEvents) }))
    .sort(compareBalances);

  const start = cursorIndex(all, filters.cursor);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const rows = all.slice(start, start + limit);
  const next = start + rows.length < all.length ? encodeCursor(rows.at(-1)!.key) : undefined;

  return {
    rows,
    ...(next ? { next_cursor: next } : {}),
    totals: all.reduce(
      (totals, row) => ({
        quantity_micros: totals.quantity_micros + row.quantity_micros,
        value_micros: totals.value_micros + row.value_micros,
        physical_count_micros: totals.physical_count_micros + row.physical_count_micros,
      }),
      { quantity_micros: 0, value_micros: 0, physical_count_micros: 0 },
    ),
  };
}

export function reconcilePhysicalStockPage(page: PhysicalStockPage): void {
  const quantity = page.rows.reduce((sum, row) => sum + row.quantity_micros, 0);
  const value = page.rows.reduce((sum, row) => sum + row.value_micros, 0);
  const count = page.rows.reduce((sum, row) => sum + row.physical_count_micros, 0);
  if (!page.next_cursor && (quantity !== page.totals.quantity_micros || value !== page.totals.value_micros || count !== page.totals.physical_count_micros)) {
    throw new Error("physical stock totals do not reconcile");
  }
  for (const row of page.rows) {
    const eventQuantity = row.lineage.reduce((sum, event) => sum + event.quantity_micros, 0);
    const eventValue = row.lineage.reduce((sum, event) => sum + event.value_micros, 0);
    const eventCount = row.lineage.reduce((sum, event) => sum + event.physical_count_micros, 0);
    if (eventQuantity !== row.quantity_micros || eventValue !== row.value_micros || eventCount !== row.physical_count_micros) {
      throw new Error(`physical stock lineage does not reconcile for ${row.key}`);
    }
  }
}

function matches(row: PhysicalStockLedgerRow, filters: PhysicalStockFilters): boolean {
  return row.tenant_id === filters.tenant_id
    && row.company === filters.company
    && match(row.item_code, filters.item_code)
    && match(row.warehouse, filters.warehouse)
    && match(row.warehouse_role, filters.warehouse_role)
    && match(row.inventory_mode, filters.inventory_mode)
    && match(row.measurement_profile, filters.measurement_profile)
    && match(row.color, filters.color)
    && match(row.condition, filters.condition)
    && match(row.generation, filters.generation)
    && match(row.batch_no, filters.batch_no)
    && match(row.serial_no, filters.serial_no);
}

function match(value: unknown, expected: string | undefined): boolean {
  return expected === undefined || text(value) === expected;
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
  if (index < 0) throw new Error("invalid physical stock cursor");
  return index + 1;
}

function encodeCursor(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new Error("invalid physical stock cursor");
  }
}

function assertFilters(filters: PhysicalStockFilters): void {
  if (!text(filters.tenant_id)) throw new Error("tenant_id is required");
  if (!text(filters.company)) throw new Error("company is required");
}

function assertLedgerRow(row: PhysicalStockLedgerRow): void {
  if (!text(row.item_code) || !text(row.warehouse) || !text(row.posting_at) || !text(row.voucher_type) || !text(row.voucher_no)) {
    throw new Error("physical stock ledger row is incomplete");
  }
  for (const value of [row.quantity_micros, row.value_micros ?? 0, row.physical_count_micros ?? 0]) {
    if (!Number.isSafeInteger(value)) throw new Error("physical stock ledger micros must be safe integers");
  }
}

function escapePart(value: unknown): string {
  return encodeURIComponent(text(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
