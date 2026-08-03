import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors, jsonResponse, randomId, readJson } from "../../core/src/index.js";
import {
  cancelCanonicalSocialSalesOrder,
  ensureCanonicalSocialSalesOrder,
  resolveCanonicalDeliveryShipment,
} from "./canonical-order.js";

const WRITE_ROLES = new Set(["System Manager", "Social Commerce Manager", "Sales Manager", "Sales User"]);

export interface SocialOrderConversionInput {
  cart_id: string;
  page_id: string;
  external_actor_id: string;
  company: string;
  customer: string;
  currency: string;
  selling_price_list: string;
  transaction_date: string;
  items: Array<{ item_code: string; quantity: number }>;
  taxes: JsonObject[];
}

export interface SocialOrderConversionResult {
  sales_order_name: string;
  grand_total_minor: number;
  currency: string;
  status: string;
}

export interface SocialCommerceDomainPort {
  ensureSubmittedSalesOrder(input: SocialOrderConversionInput): Promise<SocialOrderConversionResult>;
}

interface SocialCommerceProfileDefaults {
  company: string;
  default_customer: string;
  currency: string;
  selling_price_list: string;
}

export async function routeSocialCommerceApi(
  request: Request,
  url: URL,
  db: D1Database,
  tenantId: string,
  actor: Actor,
  domain?: SocialCommerceDomainPort,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/v1/social/")) return null;

  if (request.method === "GET" && url.pathname === "/api/v1/social/summary") {
    const [pages, events, carts, orders, cod] = await db.batch([
      db.prepare("SELECT COUNT(*) AS value FROM social_pages WHERE tenant_id=?1 AND status='active'").bind(tenantId),
      db.prepare("SELECT COUNT(*) AS value FROM social_events WHERE tenant_id=?1 AND received_at>=datetime('now','-1 day')").bind(tenantId),
      db.prepare("SELECT COUNT(*) AS value FROM social_carts WHERE tenant_id=?1 AND status='open'").bind(tenantId),
      db.prepare("SELECT COUNT(*) AS value FROM social_orders WHERE tenant_id=?1 AND status NOT IN ('completed','cancelled','returned')").bind(tenantId),
      db.prepare("SELECT COALESCE(SUM(cod_expected_minor-COALESCE(cod_collected_minor,0)),0) AS value FROM social_shipments WHERE tenant_id=?1 AND cod_reconciled_at IS NULL").bind(tenantId),
    ]);
    return jsonResponse({ active_pages: scalar(pages), events_today: scalar(events), open_carts: scalar(carts), active_orders: scalar(orders), cod_pending_minor: scalar(cod) });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/social/pages") {
    const result = await db.prepare("SELECT page_id,page_name,provider,status,created_at,modified_at FROM social_pages WHERE tenant_id=?1 ORDER BY page_name").bind(tenantId).all();
    return jsonResponse({ pages: result.results ?? [] });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/social/events") {
    const result = await db.prepare(
      "SELECT event_id,page_id,event_kind,external_actor_id,message_text,occurred_at,received_at FROM social_events WHERE tenant_id=?1 ORDER BY received_at DESC LIMIT 100",
    ).bind(tenantId).all();
    return jsonResponse({ events: result.results ?? [] });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/social/carts") {
    const result = await db.prepare(
      `SELECT c.cart_id,c.page_id,c.external_actor_id,c.status,c.customer_name,c.phone,c.address,c.modified_at,
       COALESCE(SUM(i.quantity),0) AS item_quantity FROM social_carts c LEFT JOIN social_cart_items i
       ON i.tenant_id=c.tenant_id AND i.cart_id=c.cart_id WHERE c.tenant_id=?1 GROUP BY c.cart_id ORDER BY c.modified_at DESC LIMIT 100`,
    ).bind(tenantId).all();
    return jsonResponse({ carts: result.results ?? [] });
  }
  if (request.method === "POST" && url.pathname === "/api/v1/social/rules") {
    requireWriter(actor);
    const body = await readJson<JsonObject>(request, 16_000);
    const pageId = text(body.page_id, "page_id", 160); const keyword = text(body.keyword, "keyword", 160); const sku = text(body.sku, "sku", 160);
    const quantity = Number(body.quantity ?? 1); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) throw errors.validation("quantity is invalid");
    const ruleId = randomId("rule"); const now = new Date().toISOString();
    await db.prepare(`INSERT INTO social_keyword_rules(tenant_id,rule_id,page_id,keyword,sku,quantity,status,created_at,modified_at)
      VALUES(?1,?2,?3,?4,?5,?6,'active',?7,?7)`).bind(tenantId, ruleId, pageId, keyword, sku, quantity, now).run();
    return jsonResponse({ rule_id: ruleId, status: "active" }, 201);
  }

  const convert = url.pathname.match(/^\/api\/v1\/social\/carts\/([^/]+)\/convert$/);
  if (request.method === "POST" && convert) {
    requireWriter(actor);
    const cartId = pathId(convert[1]!, "cart_id");
    const cart = await db.prepare(
      "SELECT page_id,external_actor_id,status FROM social_carts WHERE tenant_id=?1 AND cart_id=?2",
    ).bind(tenantId, cartId).first<{ page_id: string; external_actor_id: string; status: string }>();
    if (!cart) throw errors.notFound("Cart not found");

    const existingOrder = await db.prepare(
      "SELECT order_id,sales_order_name,status,cod_amount_minor,currency FROM social_orders WHERE tenant_id=?1 AND cart_id=?2",
    ).bind(tenantId, cartId).first<{ order_id: string; sales_order_name: string | null; status: string; cod_amount_minor: number; currency: string }>();
    if (existingOrder?.sales_order_name && existingOrder.status !== "draft") {
      return jsonResponse({
        order_id: existingOrder.order_id,
        sales_order_name: existingOrder.sales_order_name,
        status: existingOrder.status,
        cod_amount_minor: existingOrder.cod_amount_minor,
        currency: existingOrder.currency,
        idempotent_replay: true,
      });
    }
    if (!["open", "confirmed", "converted"].includes(cart.status)) throw errors.lifecycle("Cart cannot be converted");

    const body = await readJson<JsonObject>(request, 32_000);
    const profile = await socialCommerceProfile(db, tenantId, cart.page_id);
    const company = optionalText(body.company, "company", 160) ?? profile.company;
    const customer = optionalText(body.customer, "customer", 160) ?? profile.default_customer;
    const currency = optionalText(body.currency, "currency", 32) ?? profile.currency;
    const sellingPriceList = optionalText(body.selling_price_list, "selling_price_list", 160) ?? profile.selling_price_list;
    const transactionDate = optionalDate(body.transaction_date) ?? new Date().toISOString().slice(0, 10);
    const taxes = jsonObjectArray(body.taxes, "taxes", 50);

    const itemRows = await db.prepare(
      "SELECT sku,quantity FROM social_cart_items WHERE tenant_id=?1 AND cart_id=?2 ORDER BY sku",
    ).bind(tenantId, cartId).all<{ sku: string; quantity: number }>();
    const items = (itemRows.results ?? []).map((row, index) => {
      const itemCode = String(row.sku ?? "").trim();
      const quantity = Number(row.quantity);
      if (!itemCode || !Number.isSafeInteger(quantity) || quantity <= 0) throw errors.validation(`Cart item ${index + 1} is invalid`);
      return { item_code: itemCode, quantity };
    });
    if (items.length === 0) throw errors.validation("Cart has no items to convert");

    const orderId = `social_order_${cartId}`;
    const startedAt = new Date().toISOString();
    await db.prepare(
      `INSERT INTO social_orders(tenant_id,order_id,cart_id,sales_order_name,status,cod_amount_minor,currency,created_at,modified_at)
       VALUES(?1,?2,?3,NULL,'draft',0,?4,?5,?5)
       ON CONFLICT(tenant_id,cart_id) DO NOTHING`,
    ).bind(tenantId, orderId, cartId, currency, startedAt).run();

    const canonicalInput: SocialOrderConversionInput = {
      cart_id: cartId,
      page_id: cart.page_id,
      external_actor_id: cart.external_actor_id,
      company,
      customer,
      currency,
      selling_price_list: sellingPriceList,
      transaction_date: transactionDate,
      items,
      taxes,
    };
    const canonical = domain
      ? await domain.ensureSubmittedSalesOrder(canonicalInput)
      : await ensureCanonicalSocialSalesOrder(db, tenantId, actor, canonicalInput);
    if (!canonical.sales_order_name || !Number.isSafeInteger(canonical.grand_total_minor) || canonical.grand_total_minor < 0) {
      throw errors.ledger("Canonical Sales Order conversion returned an invalid commercial total");
    }
    if (canonical.currency !== currency) throw errors.reference("Canonical Sales Order currency does not match cart conversion currency");

    const finishedAt = new Date().toISOString();
    await db.batch([
      db.prepare(
        `UPDATE social_orders SET sales_order_name=?3,status='confirmed',cod_amount_minor=?4,currency=?5,modified_at=?6
         WHERE tenant_id=?1 AND cart_id=?2`,
      ).bind(tenantId, cartId, canonical.sales_order_name, canonical.grand_total_minor, canonical.currency, finishedAt),
      db.prepare("UPDATE social_carts SET status='converted',modified_at=?3 WHERE tenant_id=?1 AND cart_id=?2").bind(tenantId, cartId, finishedAt),
    ]);
    return jsonResponse({
      order_id: existingOrder?.order_id ?? orderId,
      sales_order_name: canonical.sales_order_name,
      status: "confirmed",
      cod_amount_minor: canonical.grand_total_minor,
      currency: canonical.currency,
      stock_reservation: "pending_ws04_generic_reservation",
    }, 201);
  }

  const cancelOrder = url.pathname.match(/^\/api\/v1\/social\/orders\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelOrder) {
    requireWriter(actor);
    const orderId = pathId(cancelOrder[1]!, "order_id");
    const order = await db.prepare(
      "SELECT cart_id,sales_order_name,status FROM social_orders WHERE tenant_id=?1 AND order_id=?2",
    ).bind(tenantId, orderId).first<{ cart_id: string; sales_order_name: string | null; status: string }>();
    if (!order) throw errors.notFound("Social order not found");
    if (order.status === "cancelled") return jsonResponse({ order_id: orderId, sales_order_name: order.sales_order_name, status: "cancelled", idempotent_replay: true });
    if (!order.sales_order_name) throw errors.lifecycle("Social order is not linked to a canonical Sales Order");
    const reconciledCod = await db.prepare(
      "SELECT COUNT(*) AS value FROM social_shipments WHERE tenant_id=?1 AND order_id=?2 AND cod_reconciled_at IS NOT NULL",
    ).bind(tenantId, orderId).first<{ value: number }>();
    if (Number(reconciledCod?.value ?? 0) > 0) {
      throw errors.lifecycle("Social order cannot be cancelled after COD reconciliation; reverse the canonical finance settlement first");
    }

    const canonical = await cancelCanonicalSocialSalesOrder(db, tenantId, actor, order.cart_id, order.sales_order_name);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE social_orders SET status='cancelled',modified_at=?3 WHERE tenant_id=?1 AND order_id=?2").bind(tenantId, orderId, now),
      db.prepare("UPDATE social_carts SET status='cancelled',modified_at=?3 WHERE tenant_id=?1 AND cart_id=?2").bind(tenantId, order.cart_id, now),
      db.prepare("UPDATE social_shipments SET status='cancelled',modified_at=?3 WHERE tenant_id=?1 AND order_id=?2 AND cod_reconciled_at IS NULL").bind(tenantId, orderId, now),
    ]);
    return jsonResponse({ order_id: orderId, sales_order_name: canonical.sales_order_name, status: "cancelled", idempotent_replay: canonical.idempotent_replay });
  }

  const shipment = url.pathname.match(/^\/api\/v1\/social\/orders\/([^/]+)\/shipments$/);
  if (request.method === "POST" && shipment) {
    requireWriter(actor);
    const orderId = pathId(shipment[1]!, "order_id");
    const body = await readJson<JsonObject>(request, 16_000);
    const order = await db.prepare(
      "SELECT status,sales_order_name,currency FROM social_orders WHERE tenant_id=?1 AND order_id=?2",
    ).bind(tenantId, orderId).first<{ status: string; sales_order_name: string | null; currency: string }>();
    if (!order || ["cancelled", "returned"].includes(order.status)) throw errors.notFound("Active order not found");
    if (!order.sales_order_name) throw errors.lifecycle("Social order is not linked to a canonical Sales Order");

    const deliveryNoteName = text(body.delivery_note_name, "delivery_note_name", 200);
    const canonicalDelivery = await resolveCanonicalDeliveryShipment(db, tenantId, actor, order.sales_order_name, deliveryNoteName);
    if (canonicalDelivery.currency !== order.currency) throw errors.reference("Delivery Note currency does not match social order currency");
    const carrier = text(body.carrier, "carrier", 160);
    const tracking = typeof body.tracking_code === "string" ? body.tracking_code.trim().slice(0, 320) : "";
    const shipmentId = canonicalDelivery.delivery_note_name;
    const existingShipment = await db.prepare(
      "SELECT order_id,carrier,tracking_code,status,cod_expected_minor FROM social_shipments WHERE tenant_id=?1 AND shipment_id=?2",
    ).bind(tenantId, shipmentId).first<{ order_id: string; carrier: string; tracking_code: string | null; status: string; cod_expected_minor: number }>();
    if (existingShipment) {
      if (existingShipment.order_id !== orderId
        || existingShipment.carrier !== carrier
        || (existingShipment.tracking_code ?? "") !== tracking
        || existingShipment.cod_expected_minor !== canonicalDelivery.grand_total_minor) throw errors.idempotency();
      return jsonResponse({ shipment_id: shipmentId, delivery_note_name: shipmentId, sales_order_name: order.sales_order_name, status: existingShipment.status, cod_expected_minor: existingShipment.cod_expected_minor, idempotent_replay: true });
    }

    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO social_shipments(tenant_id,shipment_id,order_id,carrier,tracking_code,status,cod_expected_minor,created_at,modified_at)
        VALUES(?1,?2,?3,?4,?5,'ready',?6,?7,?7)`).bind(tenantId, shipmentId, orderId, carrier, tracking || null, canonicalDelivery.grand_total_minor, now),
      db.prepare("UPDATE social_orders SET status='packing',modified_at=?3 WHERE tenant_id=?1 AND order_id=?2").bind(tenantId, orderId, now),
    ]);
    return jsonResponse({ shipment_id: shipmentId, delivery_note_name: shipmentId, sales_order_name: order.sales_order_name, status: "ready", cod_expected_minor: canonicalDelivery.grand_total_minor }, 201);
  }

  const reconcile = url.pathname.match(/^\/api\/v1\/social\/shipments\/([^/]+)\/cod-reconcile$/);
  if (request.method === "POST" && reconcile) {
    requireWriter(actor);
    const shipmentId = pathId(reconcile[1]!, "shipment_id");
    const body = await readJson<JsonObject>(request, 16_000);
    const collected = Number(body.cod_collected_minor);
    if (!Number.isSafeInteger(collected) || collected < 0) throw errors.validation("cod_collected_minor is invalid");
    const shipmentRow = await db.prepare(
      `SELECT s.order_id,s.cod_expected_minor,s.cod_reconciled_at,o.sales_order_name
       FROM social_shipments s JOIN social_orders o ON o.tenant_id=s.tenant_id AND o.order_id=s.order_id
       WHERE s.tenant_id=?1 AND s.shipment_id=?2`,
    ).bind(tenantId, shipmentId).first<{ order_id: string; cod_expected_minor: number; cod_reconciled_at: string | null; sales_order_name: string | null }>();
    if (!shipmentRow || !shipmentRow.sales_order_name) throw errors.notFound("Canonical shipment not found");
    if (shipmentRow.cod_reconciled_at) throw errors.lifecycle("COD was already reconciled");
    await resolveCanonicalDeliveryShipment(db, tenantId, actor, shipmentRow.sales_order_name, shipmentId);
    if (collected !== shipmentRow.cod_expected_minor) {
      throw errors.validation("COD collected amount does not match the canonical Delivery Note amount", { expected_minor: shipmentRow.cod_expected_minor, collected_minor: collected });
    }
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE social_shipments SET cod_collected_minor=?3,cod_reconciled_at=?4,modified_at=?4,status='cod_reconciled'
      WHERE tenant_id=?1 AND shipment_id=?2 AND cod_reconciled_at IS NULL`).bind(tenantId, shipmentId, collected, now).run();
    if ((result.meta?.changes ?? 0) !== 1) throw errors.lifecycle("COD was already reconciled or shipment does not exist");
    return jsonResponse({
      shipment_id: shipmentId,
      delivery_note_name: shipmentId,
      cod_collected_minor: collected,
      reconciled_at: now,
      accounting_posted: false,
      accounting_dependency: "WS01 requires canonical Sales Invoice/Payment Entry allocation before COD cash can post to Finance",
    });
  }
  return jsonResponse({ error: { code: "SOCIAL_ROUTE_NOT_FOUND" } }, 404);
}

async function socialCommerceProfile(db: D1Database, tenantId: string, pageId: string): Promise<SocialCommerceProfileDefaults> {
  const row = await db.prepare(
    "SELECT data_json FROM documents WHERE tenant_id=?1 AND doctype='Social Commerce Profile' AND name=?2 AND docstatus=0 LIMIT 1",
  ).bind(tenantId, pageId).first<{ data_json: string }>();
  if (!row?.data_json) throw errors.misconfigured(`Social Commerce Profile is required for page ${pageId}`);
  let data: JsonObject;
  try { data = JSON.parse(row.data_json) as JsonObject; } catch { throw errors.misconfigured(`Social Commerce Profile ${pageId} contains invalid JSON`); }
  if (data.disabled === true || data.disabled === 1 || data.disabled === "1") throw errors.misconfigured(`Social Commerce Profile ${pageId} is disabled`);
  return {
    company: text(data.company, "profile.company", 160),
    default_customer: text(data.default_customer, "profile.default_customer", 160),
    currency: text(data.currency, "profile.currency", 32),
    selling_price_list: text(data.selling_price_list, "profile.selling_price_list", 160),
  };
}

function scalar(result: D1Result | undefined): number { const value = (result?.results?.[0] as { value?: unknown } | undefined)?.value; return typeof value === "number" ? value : Number(value ?? 0); }
function requireWriter(actor: Actor): void { if (!actor.roles.some((role) => WRITE_ROLES.has(role))) throw errors.permission("Social Commerce write permission is required"); }
function text(value: unknown, field: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is invalid`); return value.trim(); }
function optionalText(value: unknown, field: string, max: number): string | undefined { if (value === undefined || value === null || value === "") return undefined; return text(value, field, max); }
function pathId(value: string, field: string): string { const decoded = decodeURIComponent(value).trim(); if (!decoded || decoded.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(decoded)) throw errors.validation(`${field} is invalid`); return decoded; }
function optionalDate(value: unknown): string | undefined { if (value === undefined || value === null || value === "") return undefined; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) throw errors.validation("transaction_date is invalid"); return value; }
function jsonObjectArray(value: unknown, field: string, maxRows: number): JsonObject[] { if (value === undefined || value === null) return []; if (!Array.isArray(value) || value.length > maxRows) throw errors.validation(`${field} is invalid`); return value.map((row, index) => { if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.validation(`${field}[${index}] is invalid`); return row as JsonObject; }); }
