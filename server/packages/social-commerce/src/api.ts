import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors, jsonResponse, randomId, readJson } from "../../core/src/index.js";

const WRITE_ROLES = new Set(["System Manager", "Social Commerce Manager", "Sales Manager", "Sales User"]);

export async function routeSocialCommerceApi(
  request: Request, url: URL, db: D1Database, tenantId: string, actor: Actor,
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
    requireWriter(actor); const cartId = decodeURIComponent(convert[1]!);
    const cart = await db.prepare("SELECT status FROM social_carts WHERE tenant_id=?1 AND cart_id=?2").bind(tenantId, cartId).first<{ status: string }>();
    if (!cart) throw errors.notFound("Cart not found"); if (cart.status !== "open" && cart.status !== "confirmed") throw errors.lifecycle("Cart cannot be converted");
    const body = await readJson<JsonObject>(request, 16_000); const cod = Number(body.cod_amount_minor ?? 0);
    if (!Number.isSafeInteger(cod) || cod < 0) throw errors.validation("cod_amount_minor is invalid");
    const orderId = randomId("social_order"); const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO social_orders(tenant_id,order_id,cart_id,status,cod_amount_minor,currency,created_at,modified_at)
        VALUES(?1,?2,?3,'confirmed',?4,'VND',?5,?5)`).bind(tenantId, orderId, cartId, cod, now),
      db.prepare("UPDATE social_carts SET status='converted',modified_at=?3 WHERE tenant_id=?1 AND cart_id=?2").bind(tenantId, cartId, now),
    ]);
    return jsonResponse({ order_id: orderId, status: "confirmed" }, 201);
  }
  const shipment = url.pathname.match(/^\/api\/v1\/social\/orders\/([^/]+)\/shipments$/);
  if (request.method === "POST" && shipment) {
    requireWriter(actor); const orderId = decodeURIComponent(shipment[1]!); const body = await readJson<JsonObject>(request, 16_000);
    const order = await db.prepare("SELECT cod_amount_minor,status FROM social_orders WHERE tenant_id=?1 AND order_id=?2").bind(tenantId, orderId).first<{ cod_amount_minor: number; status: string }>();
    if (!order || order.status === "cancelled") throw errors.notFound("Active order not found");
    const carrier = text(body.carrier, "carrier", 160); const tracking = typeof body.tracking_code === "string" ? body.tracking_code.trim().slice(0, 320) : "";
    const shipmentId = randomId("shipment"); const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO social_shipments(tenant_id,shipment_id,order_id,carrier,tracking_code,status,cod_expected_minor,created_at,modified_at)
        VALUES(?1,?2,?3,?4,?5,'ready',?6,?7,?7)`).bind(tenantId, shipmentId, orderId, carrier, tracking || null, order.cod_amount_minor, now),
      db.prepare("UPDATE social_orders SET status='packing',modified_at=?3 WHERE tenant_id=?1 AND order_id=?2").bind(tenantId, orderId, now),
    ]);
    return jsonResponse({ shipment_id: shipmentId, status: "ready" }, 201);
  }
  const reconcile = url.pathname.match(/^\/api\/v1\/social\/shipments\/([^/]+)\/cod-reconcile$/);
  if (request.method === "POST" && reconcile) {
    requireWriter(actor); const shipmentId = decodeURIComponent(reconcile[1]!); const body = await readJson<JsonObject>(request, 16_000);
    const collected = Number(body.cod_collected_minor); if (!Number.isSafeInteger(collected) || collected < 0) throw errors.validation("cod_collected_minor is invalid");
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE social_shipments SET cod_collected_minor=?3,cod_reconciled_at=?4,modified_at=?4
      WHERE tenant_id=?1 AND shipment_id=?2 AND cod_reconciled_at IS NULL`).bind(tenantId, shipmentId, collected, now).run();
    if ((result.meta?.changes ?? 0) !== 1) throw errors.lifecycle("COD was already reconciled or shipment does not exist");
    return jsonResponse({ shipment_id: shipmentId, cod_collected_minor: collected, reconciled_at: now });
  }
  return jsonResponse({ error: { code: "SOCIAL_ROUTE_NOT_FOUND" } }, 404);
}

function scalar(result: D1Result | undefined): number {
  const value = (result?.results?.[0] as { value?: unknown } | undefined)?.value;
  return typeof value === "number" ? value : Number(value ?? 0);
}
function requireWriter(actor: Actor): void { if (!actor.roles.some((role) => WRITE_ROLES.has(role))) throw errors.permission("Social Commerce write permission is required"); }
function text(value: unknown, field: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is invalid`); return value.trim(); }
