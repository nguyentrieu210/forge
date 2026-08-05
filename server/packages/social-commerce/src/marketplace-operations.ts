import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  commitCommercialStockReservations,
  getAvailableToPromise,
  releaseCommercialStockReservations,
  reserveCommercialStock,
  type AvailableToPromiseResult,
  type CommercialReservationResult,
} from "../../clouderp-stock/src/index.js";
import {
  resolveMarketplaceCustomerIdentity,
  type MarketplaceCustomerIdentityStatus,
} from "./marketplace-customer-identity.js";
import { ensureCanonicalMarketplaceSalesOrder, marketplaceOrderSourceKey, type MarketplaceOrderResult } from "./marketplace-order.js";
import type { ResolvedMarketplaceOrder } from "./marketplace-profile.js";

export interface MarketplaceOperationalOrderResult extends MarketplaceOrderResult {
  order_id: string;
  operational_status: string;
  reservation: CommercialReservationResult;
  customer: string;
  customer_identity_status: MarketplaceCustomerIdentityStatus;
  customer_identity_key: string | null;
  crm_contact: string | null;
}

export interface MarketplaceOperationalOrderRow {
  order_id: string;
  source_key: string;
  provider: string;
  sales_order_name: string | null;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
  modified_at: string;
}

/**
 * Full marketplace order acceptance owned by commerce orchestration while stock ATP
 * remains owned by clouderp-stock and the commercial document remains a canonical
 * Sales Order. Exact Customer identity is resolved before reservation/submit; provider
 * input can never select the ERP Customer. Reservation happens before Sales Order submit.
 */
export async function ingestResolvedMarketplaceOrder(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  resolved: ResolvedMarketplaceOrder,
): Promise<MarketplaceOperationalOrderResult> {
  const customerResolution = await resolveMarketplaceCustomerIdentity(db, tenantId, resolved);
  const effective = customerResolution.resolved;
  const sourceKey = await marketplaceOrderSourceKey(
    effective.order.provider,
    effective.order.shop_id,
    effective.order.external_order_id,
  );
  const reservation = await reserveCommercialStock(db, tenantId, {
    source_doctype: "Marketplace Order",
    source_name: sourceKey,
    lines: effective.order.items.map((item) => ({
      item_code: item.item_code,
      warehouse: effective.warehouse,
      qty_micros: item.quantity * 1_000_000,
    })),
  });

  let canonical: MarketplaceOrderResult;
  try {
    canonical = await ensureCanonicalMarketplaceSalesOrder(db, tenantId, actor, effective.order);
  } catch (error) {
    await releaseCommercialStockReservations(
      db,
      tenantId,
      "Marketplace Order",
      sourceKey,
      "Canonical Sales Order was not accepted",
    );
    throw error;
  }
  if (canonical.source_key !== sourceKey) throw errors.idempotency();

  const cartId = marketplaceCartId(sourceKey);
  const orderId = marketplaceOperationalOrderId(sourceKey);
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO social_orders(
      tenant_id,order_id,cart_id,sales_order_name,status,cod_amount_minor,currency,created_at,modified_at
    ) VALUES(?1,?2,?3,?4,'confirmed',?5,?6,?7,?7)
    ON CONFLICT(tenant_id,cart_id) DO NOTHING
  `).bind(
    tenantId,
    orderId,
    cartId,
    canonical.sales_order_name,
    canonical.grand_total_minor,
    canonical.currency,
    now,
  ).run();

  const operational = await db.prepare(`
    SELECT order_id,sales_order_name,status,cod_amount_minor,currency
    FROM social_orders WHERE tenant_id=?1 AND cart_id=?2 LIMIT 1
  `).bind(tenantId, cartId).first<{
    order_id: string;
    sales_order_name: string | null;
    status: string;
    cod_amount_minor: number;
    currency: string;
  }>();
  if (!operational) throw errors.ledger("Marketplace operational order projection was not persisted");
  if (operational.order_id !== orderId
    || operational.sales_order_name !== canonical.sales_order_name
    || Number(operational.cod_amount_minor) !== canonical.grand_total_minor
    || operational.currency !== canonical.currency) throw errors.idempotency();

  return {
    ...canonical,
    order_id: orderId,
    operational_status: operational.status,
    reservation,
    customer: customerResolution.identity.customer,
    customer_identity_status: customerResolution.identity.status,
    customer_identity_key: customerResolution.identity.identity_key,
    crm_contact: customerResolution.identity.crm_contact,
  };
}

export async function listMarketplaceOperationalOrders(
  db: D1Database,
  tenantId: string,
  limit = 100,
): Promise<MarketplaceOperationalOrderRow[]> {
  const bounded = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  const result = await db.prepare(`
    SELECT order_id,cart_id,sales_order_name,status,cod_amount_minor,currency,created_at,modified_at
    FROM social_orders
    WHERE tenant_id=?1 AND cart_id LIKE 'marketplace:%'
    ORDER BY modified_at DESC
    LIMIT ?2
  `).bind(tenantId, bounded).all<{
    order_id: string;
    cart_id: string;
    sales_order_name: string | null;
    status: string;
    cod_amount_minor: number;
    currency: string;
    created_at: string;
    modified_at: string;
  }>();
  return (result.results ?? []).map((row) => {
    const sourceKey = marketplaceSourceKeyFromCart(row.cart_id);
    return {
      order_id: row.order_id,
      source_key: sourceKey,
      provider: sourceKey.split("-", 1)[0] ?? "unknown",
      sales_order_name: row.sales_order_name,
      status: row.status,
      amount_minor: Number(row.cod_amount_minor),
      currency: row.currency,
      created_at: row.created_at,
      modified_at: row.modified_at,
    };
  });
}

export async function marketplaceAvailableToPromise(
  db: D1Database,
  tenantId: string,
  resolved: ResolvedMarketplaceOrder,
): Promise<AvailableToPromiseResult[]> {
  const seen = new Set<string>();
  const results: AvailableToPromiseResult[] = [];
  for (const item of resolved.order.items) {
    const key = `${item.item_code}\u0000${resolved.warehouse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(await getAvailableToPromise(db, tenantId, item.item_code, resolved.warehouse));
  }
  return results;
}

export async function releaseMarketplaceReservationForCart(
  db: D1Database,
  tenantId: string,
  cartId: string,
  reason: string,
): Promise<number> {
  if (!isMarketplaceCartId(cartId)) return 0;
  return releaseCommercialStockReservations(
    db,
    tenantId,
    "Marketplace Order",
    marketplaceSourceKeyFromCart(cartId),
    reason,
  );
}

export async function commitMarketplaceReservationForCart(
  db: D1Database,
  tenantId: string,
  cartId: string,
): Promise<number> {
  if (!isMarketplaceCartId(cartId)) return 0;
  return commitCommercialStockReservations(
    db,
    tenantId,
    "Marketplace Order",
    marketplaceSourceKeyFromCart(cartId),
  );
}

export function marketplaceOperationalOrderId(sourceKey: string): string {
  return `marketplace_order_${requiredSourceKey(sourceKey)}`;
}

export function marketplaceCartId(sourceKey: string): string {
  return `marketplace:${requiredSourceKey(sourceKey)}`;
}

export function isMarketplaceCartId(cartId: string): boolean {
  return typeof cartId === "string" && cartId.startsWith("marketplace:") && cartId.length > "marketplace:".length;
}

function marketplaceSourceKeyFromCart(cartId: string): string {
  if (!isMarketplaceCartId(cartId)) throw errors.validation("Marketplace cart lineage is invalid");
  return requiredSourceKey(cartId.slice("marketplace:".length));
}

function requiredSourceKey(value: string): string {
  if (typeof value !== "string" || !/^(shopee|lazada|tiktok_shop)-[a-f0-9]{40}$/.test(value)) {
    throw errors.validation("Marketplace source key is invalid");
  }
  return value;
}
