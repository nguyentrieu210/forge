import { errors } from "../../core/src/index.js";

export type CommercialReservationStatus = "active" | "committed" | "released" | "expired";

export interface CommercialReservationLineInput {
  item_code: string;
  warehouse: string;
  qty_micros: number;
}

export interface CommercialReservationLineResult extends CommercialReservationLineInput {
  reservation_id: string;
  status: CommercialReservationStatus;
}

export interface CommercialReservationResult {
  source_doctype: string;
  source_name: string;
  idempotent_replay: boolean;
  lines: CommercialReservationLineResult[];
}

export interface AvailableToPromiseResult {
  item_code: string;
  warehouse: string;
  physical_qty_micros: number;
  reserved_qty_micros: number;
  available_qty_micros: number;
}

interface ReservationRow {
  reservation_id: string;
  item_code: string;
  warehouse: string;
  qty_micros: number;
  status: CommercialReservationStatus;
}

/**
 * Generic commercial stock promise owned by Inventory/WMS.
 *
 * Physical stock remains authoritative in stock_ledger_entries. This table stores only
 * active commercial promises. The INSERT is one SQLite statement for the whole order:
 * either every requested item/warehouse row fits ATP and is inserted, or no row is.
 * That prevents two marketplaces from both winning the final unit without introducing
 * a second stock ledger.
 */
export async function reserveCommercialStock(
  db: D1Database,
  tenantId: string,
  input: {
    source_doctype: string;
    source_name: string;
    lines: CommercialReservationLineInput[];
    expires_at?: string;
    now?: string;
  },
): Promise<CommercialReservationResult> {
  const sourceDoctype = requiredText(input.source_doctype, "source_doctype", 160);
  const sourceName = requiredText(input.source_name, "source_name", 240);
  const now = input.now ? isoDateTime(input.now, "now") : new Date().toISOString();
  const expiresAt = input.expires_at ? isoDateTime(input.expires_at, "expires_at") : undefined;
  if (expiresAt && expiresAt <= now) throw errors.validation("expires_at must be after reservation time");
  const grouped = await normalizeLines(sourceDoctype, sourceName, input.lines);

  const previous = await readSourceReservations(db, tenantId, sourceDoctype, sourceName);
  if (previous.length > 0) {
    assertSameReservationShape(grouped, previous);
    if (previous.every((row) => row.status === "active" || row.status === "committed")) {
      return { source_doctype: sourceDoctype, source_name: sourceName, idempotent_replay: true, lines: previous };
    }
    throw errors.lifecycle(`Commercial reservation ${sourceDoctype} ${sourceName} has already ended`);
  }

  const requestedJson = JSON.stringify(grouped);
  const statement = db.prepare(`
    WITH requested AS (
      SELECT
        json_extract(value, '$.reservation_id') AS reservation_id,
        json_extract(value, '$.item_code') AS item_code,
        json_extract(value, '$.warehouse') AS warehouse,
        CAST(json_extract(value, '$.qty_micros') AS INTEGER) AS qty_micros
      FROM json_each(?4)
    ), capacity AS (
      SELECT NOT EXISTS (
        SELECT 1
        FROM requested r
        WHERE r.qty_micros >
          COALESCE((
            SELECT SUM(s.actual_qty_micros)
            FROM stock_ledger_entries s
            WHERE s.tenant_id=?1 AND s.item_code=r.item_code AND s.warehouse=r.warehouse
          ),0)
          - COALESCE((
            SELECT SUM(c.qty_micros)
            FROM commercial_stock_reservations c
            WHERE c.tenant_id=?1
              AND c.item_code=r.item_code
              AND c.warehouse=r.warehouse
              AND c.status='active'
              AND (c.expires_at IS NULL OR c.expires_at>?5)
          ),0)
      ) AS ok
    )
    INSERT OR IGNORE INTO commercial_stock_reservations(
      tenant_id,reservation_id,source_doctype,source_name,item_code,warehouse,qty_micros,status,expires_at,created_at,modified_at
    )
    SELECT ?1,r.reservation_id,?2,?3,r.item_code,r.warehouse,r.qty_micros,'active',?6,?5,?5
    FROM requested r
    WHERE (SELECT ok FROM capacity)=1
  `).bind(tenantId, sourceDoctype, sourceName, requestedJson, now, expiresAt ?? null);

  const result = await statement.run();
  if ((result.meta?.changes ?? 0) === grouped.length) {
    return { source_doctype: sourceDoctype, source_name: sourceName, idempotent_replay: false, lines: grouped.map((line) => ({ ...line, status: "active" })) };
  }

  // Same-source concurrent replay may have won after our first read. Re-read before
  // deciding this is an ATP failure.
  const raced = await readSourceReservations(db, tenantId, sourceDoctype, sourceName);
  if (raced.length > 0) {
    assertSameReservationShape(grouped, raced);
    if (raced.every((row) => row.status === "active" || row.status === "committed")) {
      return { source_doctype: sourceDoctype, source_name: sourceName, idempotent_replay: true, lines: raced };
    }
  }

  const availability = await Promise.all(grouped.map((line) => getAvailableToPromise(db, tenantId, line.item_code, line.warehouse, now)));
  const short = availability.find((row, index) => row.available_qty_micros < grouped[index]!.qty_micros);
  if (short) {
    const requested = grouped.find((line) => line.item_code === short.item_code && line.warehouse === short.warehouse)!;
    throw errors.reference(`Insufficient available-to-promise stock for ${short.item_code} in ${short.warehouse}`, {
      item_code: short.item_code,
      warehouse: short.warehouse,
      physical_qty_micros: short.physical_qty_micros,
      reserved_qty_micros: short.reserved_qty_micros,
      available_qty_micros: short.available_qty_micros,
      requested_qty_micros: requested.qty_micros,
    });
  }
  throw errors.idempotency();
}

export async function releaseCommercialStockReservations(
  db: D1Database,
  tenantId: string,
  sourceDoctype: string,
  sourceName: string,
  reason: string,
  now = new Date().toISOString(),
): Promise<number> {
  const at = isoDateTime(now, "now");
  const result = await db.prepare(`
    UPDATE commercial_stock_reservations
    SET status='released',released_reason=?4,modified_at=?5
    WHERE tenant_id=?1 AND source_doctype=?2 AND source_name=?3 AND status='active'
  `).bind(
    tenantId,
    requiredText(sourceDoctype, "source_doctype", 160),
    requiredText(sourceName, "source_name", 240),
    requiredText(reason, "reason", 320),
    at,
  ).run();
  return result.meta?.changes ?? 0;
}

export async function commitCommercialStockReservations(
  db: D1Database,
  tenantId: string,
  sourceDoctype: string,
  sourceName: string,
  now = new Date().toISOString(),
): Promise<number> {
  const result = await db.prepare(`
    UPDATE commercial_stock_reservations
    SET status='committed',modified_at=?4
    WHERE tenant_id=?1 AND source_doctype=?2 AND source_name=?3 AND status='active'
  `).bind(
    tenantId,
    requiredText(sourceDoctype, "source_doctype", 160),
    requiredText(sourceName, "source_name", 240),
    isoDateTime(now, "now"),
  ).run();
  return result.meta?.changes ?? 0;
}

export async function expireCommercialStockReservations(
  db: D1Database,
  tenantId: string,
  now = new Date().toISOString(),
): Promise<number> {
  const at = isoDateTime(now, "now");
  const result = await db.prepare(`
    UPDATE commercial_stock_reservations
    SET status='expired',modified_at=?2
    WHERE tenant_id=?1 AND status='active' AND expires_at IS NOT NULL AND expires_at<=?2
  `).bind(tenantId, at).run();
  return result.meta?.changes ?? 0;
}

export async function getAvailableToPromise(
  db: D1Database,
  tenantId: string,
  itemCode: string,
  warehouse: string,
  now = new Date().toISOString(),
): Promise<AvailableToPromiseResult> {
  const item = requiredText(itemCode, "item_code", 200);
  const wh = requiredText(warehouse, "warehouse", 200);
  const at = isoDateTime(now, "now");
  const row = await db.prepare(`
    SELECT
      COALESCE((SELECT SUM(actual_qty_micros) FROM stock_ledger_entries
        WHERE tenant_id=?1 AND item_code=?2 AND warehouse=?3),0) AS physical_qty_micros,
      COALESCE((SELECT SUM(qty_micros) FROM commercial_stock_reservations
        WHERE tenant_id=?1 AND item_code=?2 AND warehouse=?3 AND status='active'
          AND (expires_at IS NULL OR expires_at>?4)),0) AS reserved_qty_micros
  `).bind(tenantId, item, wh, at).first<{ physical_qty_micros: number; reserved_qty_micros: number }>();
  const physical = Number(row?.physical_qty_micros ?? 0);
  const reserved = Number(row?.reserved_qty_micros ?? 0);
  if (!Number.isSafeInteger(physical) || !Number.isSafeInteger(reserved)) throw errors.ledger("ATP projection returned an invalid quantity");
  return {
    item_code: item,
    warehouse: wh,
    physical_qty_micros: physical,
    reserved_qty_micros: reserved,
    available_qty_micros: Math.max(0, physical - reserved),
  };
}

async function normalizeLines(
  sourceDoctype: string,
  sourceName: string,
  lines: CommercialReservationLineInput[],
): Promise<Array<CommercialReservationLineInput & { reservation_id: string }>> {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 500) throw errors.validation("Commercial reservation requires 1..500 lines");
  const grouped = new Map<string, CommercialReservationLineInput>();
  for (const [index, line] of lines.entries()) {
    const itemCode = requiredText(line.item_code, `lines[${index}].item_code`, 200);
    const warehouse = requiredText(line.warehouse, `lines[${index}].warehouse`, 200);
    if (!Number.isSafeInteger(line.qty_micros) || line.qty_micros <= 0) throw errors.validation(`lines[${index}].qty_micros is invalid`);
    const key = `${itemCode}\u0000${warehouse}`;
    const previous = grouped.get(key);
    const qty = (previous?.qty_micros ?? 0) + line.qty_micros;
    if (!Number.isSafeInteger(qty)) throw errors.validation(`Aggregated quantity for ${itemCode} is too large`);
    grouped.set(key, { item_code: itemCode, warehouse, qty_micros: qty });
  }
  const result: Array<CommercialReservationLineInput & { reservation_id: string }> = [];
  for (const line of grouped.values()) {
    result.push({ ...line, reservation_id: await reservationId(sourceDoctype, sourceName, line.item_code, line.warehouse) });
  }
  result.sort((a, b) => a.reservation_id.localeCompare(b.reservation_id));
  return result;
}

async function readSourceReservations(
  db: D1Database,
  tenantId: string,
  sourceDoctype: string,
  sourceName: string,
): Promise<ReservationRow[]> {
  const rows = await db.prepare(`
    SELECT reservation_id,item_code,warehouse,qty_micros,status
    FROM commercial_stock_reservations
    WHERE tenant_id=?1 AND source_doctype=?2 AND source_name=?3
    ORDER BY reservation_id
  `).bind(tenantId, sourceDoctype, sourceName).all<ReservationRow>();
  return (rows.results ?? []).map((row) => ({
    reservation_id: String(row.reservation_id),
    item_code: String(row.item_code),
    warehouse: String(row.warehouse),
    qty_micros: Number(row.qty_micros),
    status: row.status,
  }));
}

function assertSameReservationShape(
  expected: Array<CommercialReservationLineInput & { reservation_id: string }>,
  actual: ReservationRow[],
): void {
  if (expected.length !== actual.length) throw errors.idempotency();
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index]!;
    const right = actual[index]!;
    if (left.reservation_id !== right.reservation_id
      || left.item_code !== right.item_code
      || left.warehouse !== right.warehouse
      || left.qty_micros !== right.qty_micros) throw errors.idempotency();
  }
}

async function reservationId(sourceDoctype: string, sourceName: string, itemCode: string, warehouse: string): Promise<string> {
  const raw = JSON.stringify([sourceDoctype, sourceName, itemCode, warehouse]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `csr-${hex.slice(0, 40)}`;
}

function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function isoDateTime(value: string, field: string): string {
  const normalized = requiredText(value, field, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be an ISO date-time`);
  return new Date(parsed).toISOString();
}
