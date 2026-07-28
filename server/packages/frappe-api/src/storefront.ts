/**
 * The public storefront: reading a catalogue, placing an order, tracking one.
 *
 * These are the only READ paths on the platform an unauthenticated visitor may reach,
 * and the shape of that access is deliberately narrow. Not "get_list without a session"
 * — that would be one forgotten filter away from serving the customer table. An app
 * declares ONE doctype, ONE published flag and an explicit field list, and this serves
 * exactly that, filtered to published rows, projected to those fields.
 *
 * THREE THINGS THE VISITOR DOES NOT CONTROL:
 *
 *  1. Which fields come back. Cost price, dealer price and stock level live on the same
 *     doctype as the photograph and the retail price. A visitor-supplied field list, or
 *     a `SELECT *`, publishes them.
 *  2. What anything costs. The price on an order is read from the catalogue row on the
 *     server. A browser that can name its own price is not a shop.
 *  3. Whether an order moves stock. It does not. A web order is a REQUEST; staff confirm
 *     it and raise the real Sales Order, which is where stock is committed inside the
 *     transaction. Letting a passer-by reserve stock means one bored person empties the
 *     warehouse on paper.
 */

import type { Actor, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DocTypeMeta } from "../../frappe-model/src/index.js";
import { visitorKey } from "../../frappe-model/src/index.js";

export const STOREFRONT_CATALOG = "/api/method/forge.storefront.catalog";
export const STOREFRONT_PRODUCT = "/api/method/forge.storefront.product";
export const STOREFRONT_PLACE_ORDER = "/api/method/forge.storefront.place_order";
export const STOREFRONT_TRACK_ORDER = "/api/method/forge.storefront.track_order";

const STOREFRONT_PATHS = new Set([STOREFRONT_CATALOG, STOREFRONT_PRODUCT, STOREFRONT_PLACE_ORDER, STOREFRONT_TRACK_ORDER]);

/** Paths a visitor with no session may reach. */
export function isStorefrontPath(pathname: string): boolean {
  return STOREFRONT_PATHS.has(pathname);
}

// The spec itself lives with the manifest that carries it: an app declares a storefront,
// and this module only serves what was declared. Importing it the other way round would
// make the package that defines app packages depend on the API that reads them.
import type { StorefrontSpec } from "../../app-registry/src/index.js";
export type { StorefrontSpec } from "../../app-registry/src/index.js";

/**
 * Line fields are FIXED, not configurable.
 *
 * Everything else here is declared by the app, so it is fair to ask why these are not.
 * Because they are the four names the pricing arithmetic itself uses: making them
 * configurable would move a calculation into configuration, where a typo produces an
 * order that totals zero rather than an error anybody sees.
 */
const LINE_ITEM = "item_code";
const LINE_QTY = "qty";
const LINE_RATE = "rate";
const LINE_AMOUNT = "amount";
const LINE_LABEL = "item_name";

const MAX_LINES = 50;
const MAX_QTY_PER_LINE = 10_000;

export interface StorefrontContext {
  db: D1Database;
  tenantId: string;
  now: string;
  salt: string;
  clientAddress: string;
  spec: StorefrontSpec;
  /** Metadata of the catalogue doctype, for validating the declared field list. */
  catalogMeta: DocTypeMeta;
}

interface CatalogRow { name: string; payload_json: string }

/**
 * Reads published rows straight from `documents`.
 *
 * Deliberately not through the list service: that service answers for an ACTOR, and the
 * actor here is nobody. Rather than invent a guest with read permission on the product
 * table — which would then also be able to read it through every other API — this path
 * carries its own, much smaller rule: this doctype, published only, these fields.
 */
export async function storefrontCatalog(
  context: StorefrontContext,
  query: { search?: string; facet?: string; limit?: number; offset?: number },
): Promise<JsonObject> {
  const { spec } = context;
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 60);
  const offset = Math.max(query.offset ?? 0, 0);

  const rows = await context.db.prepare(
    `SELECT name, payload_json FROM documents
     WHERE tenant_id=?1 AND doctype=?2 AND docstatus<2
       AND json_extract(payload_json,'$.${sqlPath(spec.catalog.published_field)}') IN (1,'1',true)
     ORDER BY name
     LIMIT 500`,
  ).bind(context.tenantId, spec.catalog.doctype).all<CatalogRow>();

  const search = (query.search ?? "").trim().toLowerCase();
  const facet = (query.facet ?? "").trim();

  const items: JsonObject[] = [];
  for (const row of rows.results ?? []) {
    let payload: JsonObject;
    try { payload = JSON.parse(row.payload_json) as JsonObject; } catch { continue; }
    if (facet && spec.catalog.facet_field && String(payload[spec.catalog.facet_field] ?? "") !== facet) continue;
    if (search) {
      const haystack = spec.catalog.search_fields.map((field) => String(payload[field] ?? "").toLowerCase()).join(" ");
      if (!haystack.includes(search)) continue;
    }
    items.push(project(row.name, payload, spec.catalog.fields));
  }

  // Facet values come from the published rows themselves, so a group with nothing in it
  // never appears as a filter that returns an empty page.
  const facets = spec.catalog.facet_field
    ? [...new Set(items.map((item) => String(item[spec.catalog.facet_field!] ?? "")).filter(Boolean))].sort()
    : [];

  return {
    total: items.length,
    items: items.slice(offset, offset + limit) as unknown as JsonValue,
    facets: facets as unknown as JsonValue,
  };
}

/** One product, addressed by its slug. */
export async function storefrontProduct(context: StorefrontContext, slug: string): Promise<JsonObject> {
  const { spec } = context;
  const row = await context.db.prepare(
    `SELECT name, payload_json FROM documents
     WHERE tenant_id=?1 AND doctype=?2 AND docstatus<2
       AND json_extract(payload_json,'$.${sqlPath(spec.catalog.published_field)}') IN (1,'1',true)
       AND json_extract(payload_json,'$.${sqlPath(spec.catalog.slug_field)}')=?3`,
  ).bind(context.tenantId, spec.catalog.doctype, slug).first<CatalogRow>();
  if (!row) throw errors.notFound("No such product");

  return project(row.name, JSON.parse(row.payload_json) as JsonObject, spec.catalog.fields);
}

export interface PlacedOrder {
  document: JsonObject;
  actor: Actor;
  doctype: string;
}

/**
 * Builds the order document from a submission, pricing it on the server.
 *
 * Returns the document rather than writing it: the write goes through the ordinary
 * kernel path in the router, so a public order is subject to exactly the same
 * permission, validation and audit as any other write. A second write path here is how
 * a public endpoint ends up with rules of its own that nobody remembers to update.
 */
export async function buildStorefrontOrder(context: StorefrontContext, submitted: JsonObject): Promise<PlacedOrder> {
  const order = context.spec.order;
  if (!order) throw errors.notFound("This storefront does not accept orders");

  const rawLines = submitted[order.lines_field];
  if (!Array.isArray(rawLines) || rawLines.length === 0) throw errors.validation("Giỏ hàng đang trống");
  if (rawLines.length > MAX_LINES) throw errors.validation(`Một đơn tối đa ${MAX_LINES} dòng hàng`);

  // Priced from the catalogue, one query per distinct product. The client sends a code
  // and a quantity and nothing else that matters — a rate in the request is ignored.
  const lines: JsonObject[] = [];
  let total = 0;
  for (const [index, raw] of rawLines.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Dòng ${index + 1} không hợp lệ`);
    const line = raw as JsonObject;
    const code = String(line[LINE_ITEM] ?? "").trim();
    if (!code) throw errors.validation(`Dòng ${index + 1} thiếu mã hàng`);

    const qty = Number(line[LINE_QTY]);
    if (!Number.isFinite(qty) || qty <= 0) throw errors.validation(`Dòng ${index + 1} có số lượng không hợp lệ`);
    if (qty > MAX_QTY_PER_LINE) throw errors.validation(`Dòng ${index + 1} vượt số lượng tối đa cho một đơn web`);

    const product = await loadPublishedByName(context, code);
    const rate = Number(product[context.spec.catalog.price_field] ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) {
      // A published product with no retail price is a configuration mistake, and letting
      // it through would create an order worth nothing that somebody still has to ship.
      throw errors.validation(`Sản phẩm ${code} chưa có giá bán lẻ`);
    }
    const amount = round(rate * qty);
    total += amount;
    lines.push({
      [LINE_ITEM]: code,
      [LINE_LABEL]: product[LINE_LABEL] ?? code,
      [LINE_QTY]: qty,
      [LINE_RATE]: rate,
      [LINE_AMOUNT]: amount,
    });
  }

  const document: JsonObject = {};
  for (const field of order.buyer_fields) {
    if (submitted[field] === undefined) continue;
    document[field] = submitted[field] as JsonValue;
  }
  document[order.lines_field] = lines as unknown as JsonValue;
  document[order.total_field] = round(total);
  // Server time, always. A client-supplied timestamp would let an order claim to have
  // been placed inside a promotion window that closed yesterday.
  document[order.placed_at_field] = context.now;

  return {
    document,
    doctype: order.doctype,
    // Guest carrying exactly one role, exactly like a web form: whatever this write may
    // do comes from the tenant's DocPerm for that role, and revoking it is the same
    // action in the same place as for any other role.
    actor: { user_id: "Guest", roles: [order.submit_as_role] },
  };
}

/**
 * Order tracking, matched on BOTH the code and a second factor.
 *
 * Order codes are a readable series — DW-2026-00001 — so a lookup that needed only the
 * code would let anyone walk the whole sequence and read every customer's name, address
 * and telephone number. Requiring the phone number that placed the order turns a public
 * enumeration into a lookup that only the buyer can perform.
 */
export async function trackStorefrontOrder(
  context: StorefrontContext,
  code: string,
  secondFactor: string,
): Promise<JsonObject> {
  const order = context.spec.order;
  if (!order) throw errors.notFound("This storefront does not accept orders");
  if (!code.trim() || !secondFactor.trim()) throw errors.validation("Cần cả mã đơn và số điện thoại đã đặt");

  const row = await context.db.prepare(
    `SELECT name, payload_json, status FROM documents
     WHERE tenant_id=?1 AND doctype=?2 AND name=?3`,
  ).bind(context.tenantId, order.doctype, code.trim()).first<{ name: string; payload_json: string; status: string }>();
  // Same answer for "no such order" and "wrong phone number": telling them apart
  // confirms which order codes exist, which is the enumeration this is preventing.
  if (!row) throw errors.notFound("Không tìm thấy đơn hàng khớp thông tin này");

  const payload = JSON.parse(row.payload_json) as JsonObject;
  if (normalisePhone(String(payload[order.track_field] ?? "")) !== normalisePhone(secondFactor)) {
    throw errors.notFound("Không tìm thấy đơn hàng khớp thông tin này");
  }

  // Deliberately NOT the whole document: staff notes and the internal customer link are
  // not the buyer's business, and shipping them here would leak them to anyone the buyer
  // forwards the link to.
  const lines = Array.isArray(payload[order.lines_field]) ? payload[order.lines_field] as JsonObject[] : [];
  return {
    code: row.name,
    status: payload.workflow_state ?? row.status ?? "",
    placed_at: payload[order.placed_at_field] ?? "",
    total: payload[order.total_field] ?? 0,
    items: lines.map((line) => ({
      [LINE_LABEL]: line[LINE_LABEL] ?? line[LINE_ITEM],
      [LINE_QTY]: line[LINE_QTY],
      [LINE_AMOUNT]: line[LINE_AMOUNT],
    })) as unknown as JsonValue,
  };
}

/**
 * Counts one order against the daily ceiling, refusing when it is reached.
 *
 * Shares the web-form limiter's tables on purpose: it is the same problem — an
 * unauthenticated write that must not be able to fill a tenant's database — and a second
 * limiter would be a second thing to remember to prune and a second thing to get wrong.
 */
export async function consumeOrderAllowance(context: StorefrontContext): Promise<void> {
  const order = context.spec.order;
  if (!order) return;
  const key = `storefront:${order.doctype}`;
  const visitor = await visitorKey(context.clientAddress, key, context.salt);
  const day = context.now.slice(0, 10);
  const minute = `${context.now.slice(0, 16)}:00.000Z`;

  const burstMax = Math.min(10, Math.max(5, order.max_per_day));
  const burst = await context.db.prepare(
    `INSERT INTO web_form_rate_limits(tenant_id,form_name,visitor,window_start,attempt_count,modified_at)
     VALUES(?1,?2,?3,?4,1,?5)
     ON CONFLICT(tenant_id,form_name,visitor,window_start)
     DO UPDATE SET attempt_count=attempt_count+1,modified_at=excluded.modified_at
     RETURNING attempt_count`,
  ).bind(context.tenantId, key, visitor, minute, context.now).first<{ attempt_count: number }>();
  if ((burst?.attempt_count ?? 0) > burstMax) throw errors.rateLimited("Bạn thao tác quá nhanh, thử lại sau ít phút");

  const daily = await context.db.prepare(
    `INSERT INTO web_form_submissions(tenant_id,form_name,visitor,day,count,modified_at)
     VALUES(?1,?2,?3,?4,1,?5)
     ON CONFLICT(tenant_id,form_name,visitor,day) DO UPDATE SET count=count+1, modified_at=excluded.modified_at
     RETURNING count`,
  ).bind(context.tenantId, key, visitor, day, context.now).first<{ count: number }>();
  if ((daily?.count ?? 0) > order.max_per_day) throw errors.validation("Đã vượt số đơn cho phép trong ngày từ địa chỉ này");
}

async function loadPublishedByName(context: StorefrontContext, name: string): Promise<JsonObject> {
  const { spec } = context;
  const row = await context.db.prepare(
    `SELECT payload_json FROM documents
     WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND docstatus<2
       AND json_extract(payload_json,'$.${sqlPath(spec.catalog.published_field)}') IN (1,'1',true)`,
  ).bind(context.tenantId, spec.catalog.doctype, name).first<{ payload_json: string }>();
  // An unpublished product is "no such product" here. Otherwise a visitor could order
  // something that was deliberately taken off the shop by naming its code directly.
  if (!row) throw errors.validation(`Sản phẩm ${name} không còn được bán`);
  return JSON.parse(row.payload_json) as JsonObject;
}

function project(name: string, payload: JsonObject, fields: string[]): JsonObject {
  const projected: JsonObject = { name };
  for (const field of fields) projected[field] = (payload[field] ?? null) as JsonValue;
  return projected;
}

/**
 * A fieldname is a NAME, never an expression.
 *
 * These go into a JSON path inside the SQL text — the one place in this file where a
 * value is not a bound parameter, because SQLite cannot parameterise a json path. The
 * names come from the installed manifest rather than from a request, so this is a second
 * line rather than the first; it exists because "the manifest is trusted" is exactly the
 * assumption that stops being true the day an app is installed from somewhere else.
 */
function sqlPath(field: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(field)) throw errors.validation(`Unsafe field name in storefront spec: ${field}`);
  return field;
}

/** Money rounds to whole units here: VND has no minor unit, and the ledger re-derives
 *  every figure from the real Sales Order anyway. This total is what the buyer is shown. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Vietnamese numbers are written +84…, 84… and 0… interchangeably by the same person
  // on the same day. Comparing them literally means the buyer who typed one form and
  // tracks with the other is told their order does not exist.
  if (digits.startsWith("84")) return `0${digits.slice(2)}`;
  return digits;
}

/** Validates a declared storefront against the doctype it names. */
export function assertStorefrontSpec(spec: StorefrontSpec, catalogMeta: DocTypeMeta): void {
  const known = new Map(catalogMeta.fields.map((field) => [field.fieldname, field]));
  for (const field of [spec.catalog.published_field, spec.catalog.slug_field, spec.catalog.price_field, ...spec.catalog.fields]) {
    if (!known.has(field)) throw errors.validation(`Storefront names ${catalogMeta.name}.${field}, which does not exist`);
  }
  for (const field of spec.catalog.search_fields) {
    if (!spec.catalog.fields.includes(field)) {
      throw errors.validation(`Storefront searches ${field}, which it does not publish — a hidden field cannot be searched without leaking it`);
    }
  }
}
