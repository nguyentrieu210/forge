import { jsonResponse } from "../../../packages/core/src/index.js";
import baseWorker from "./index-core-base.js";
import type { TenantEnv } from "./env.js";

interface OperationalOrderRow {
  order_id: string;
  source_key: string;
  sales_order_name: string | null;
  status: string;
  currency: string;
}

interface ShipmentRow {
  shipment_id: string;
  carrier: string;
  tracking_code: string | null;
  status: string;
  cod_expected_minor: number;
  cod_collected_minor: number | null;
  cod_reconciled_at: string | null;
  created_at: string;
  modified_at: string;
}

interface ProviderEventStateRow {
  latest_external_status: string;
  latest_occurred_at: string;
  observed_at: string;
  event_count: number;
  stale_event_count: number;
  duplicate_event_count: number;
  conflict_event_count: number;
}

/**
 * Read-only fulfillment projection for marketplace UI.
 *
 * Authentication/read permission is delegated to the canonical Social Commerce orders
 * route first. This module creates no mutation or authorization authority; shipment,
 * cancellation, return and COD writes remain owned by routeSocialCommerceApi. Provider
 * event state is observational only and never drives canonical order/shipment lifecycle.
 */
export async function routeMarketplaceFulfillmentRead(
  request: Request,
  url: URL,
  env: TenantEnv,
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/v1\/social\/marketplace\/orders\/([^/]+)\/fulfillment$/);
  if (!match || request.method !== "GET") return null;

  const authorizationProbe = await baseWorker.fetch(new Request(new URL("/api/v1/social/marketplace/orders?limit=1", request.url), {
    method: "GET",
    headers: request.headers,
  }), env);
  if (!authorizationProbe.ok) return authorizationProbe;

  const tenantId = tenantFromRequest(request, env);
  const orderId = pathId(match[1]!, "order_id");
  const order = await env.DB.prepare(`
    SELECT order_id,source_key,sales_order_name,status,currency
    FROM social_orders
    WHERE tenant_id=?1 AND order_id=?2 AND cart_id LIKE 'marketplace:%'
    LIMIT 1
  `).bind(tenantId, orderId).first<OperationalOrderRow>();
  if (!order) return jsonResponse({ error: { code: "MARKETPLACE_ORDER_NOT_FOUND" } }, 404);

  const [shipments, providerEvent] = await Promise.all([
    env.DB.prepare(`
      SELECT shipment_id,carrier,tracking_code,status,cod_expected_minor,cod_collected_minor,
             cod_reconciled_at,created_at,modified_at
      FROM social_shipments
      WHERE tenant_id=?1 AND order_id=?2
      ORDER BY created_at DESC,shipment_id DESC
      LIMIT 100
    `).bind(tenantId, orderId).all<ShipmentRow>(),
    env.DB.prepare(`
      SELECT latest_external_status,latest_occurred_at,observed_at,event_count,
             stale_event_count,duplicate_event_count,conflict_event_count
      FROM marketplace_provider_order_state
      WHERE tenant_id=?1 AND source_key=?2
      LIMIT 1
    `).bind(tenantId, order.source_key).first<ProviderEventStateRow>(),
  ]);

  return jsonResponse({
    order_id: order.order_id,
    sales_order_name: order.sales_order_name,
    status: order.status,
    currency: order.currency,
    provider_event: providerEvent ? {
      latest_external_status: providerEvent.latest_external_status,
      latest_occurred_at: providerEvent.latest_occurred_at,
      observed_at: providerEvent.observed_at,
      event_count: Number(providerEvent.event_count),
      stale_event_count: Number(providerEvent.stale_event_count),
      duplicate_event_count: Number(providerEvent.duplicate_event_count),
      conflict_event_count: Number(providerEvent.conflict_event_count),
    } : null,
    shipments: (shipments.results ?? []).map((row) => ({
      shipment_id: row.shipment_id,
      delivery_note_name: row.shipment_id,
      carrier: row.carrier,
      tracking_code: row.tracking_code,
      status: row.status,
      cod_expected_minor: Number(row.cod_expected_minor),
      cod_collected_minor: row.cod_collected_minor === null ? null : Number(row.cod_collected_minor),
      cod_reconciled_at: row.cod_reconciled_at,
      created_at: row.created_at,
      modified_at: row.modified_at,
    })),
  }, 200, { "cache-control": "no-store" });
}

function tenantFromRequest(request: Request, env: TenantEnv): string {
  const routed = request.headers.get("x-cloudforge-tenant")?.trim() || null;
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) throw new Error("Tenant binding mismatch");
  return text(env.TENANT_ID ?? routed, "tenant_id", 128);
}

function pathId(value: string, field: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); }
  catch { throw new Error(`${field} is invalid`); }
  const normalized = decoded.trim();
  if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
