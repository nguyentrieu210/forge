import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { crmCustomerExternalIdentityKey } from "../../clouderp-selling/src/index.js";
import { ensureCanonicalSocialSalesOrder } from "./canonical-order.js";

export const MARKETPLACE_PROVIDERS = ["shopee", "lazada", "tiktok_shop"] as const;
export type MarketplaceProvider = typeof MARKETPLACE_PROVIDERS[number];

export interface MarketplaceOrderItemInput {
  external_sku: string;
  external_variant_id?: string;
  item_code: string;
  quantity: number;
}

export interface MarketplaceOrderInput {
  provider: MarketplaceProvider;
  connection_id: string;
  shop_id: string;
  external_order_id: string;
  external_status: string;
  occurred_at: string;
  transaction_date: string;
  company: string;
  customer: string;
  currency: string;
  selling_price_list: string;
  external_buyer_id?: string;
  items: MarketplaceOrderItemInput[];
  taxes?: JsonObject[];
  /**
   * Optional normalized merchandise total from the provider. This is NOT used
   * to price the Sales Order. When supplied it is a reconciliation assertion
   * against the server-authoritative commercial total before submit.
   */
  provider_merchandise_total_minor?: number;
}

export interface MarketplaceOrderResult {
  provider: MarketplaceProvider;
  source_key: string;
  channel_id: string;
  external_order_id: string;
  sales_order_name: string;
  grand_total_minor: number;
  currency: string;
  status: string;
  reconciled_provider_total: boolean | null;
}

/**
 * Provider-specific adapters live behind the Integration Hub boundary. This
 * function accepts only the provider-neutral order contract after connector
 * signature/auth/idempotency and SKU mapping have succeeded.
 *
 * Marketplace orchestration never becomes a Stock/Finance source of truth:
 * the commercial document is the canonical Sales Order produced by the normal
 * DocumentKernel/O2C controller path.
 */
export async function ensureCanonicalMarketplaceSalesOrder(
  db: D1Database,
  tenantId: string,
  actor: Actor,
  input: MarketplaceOrderInput,
): Promise<MarketplaceOrderResult> {
  const normalized = normalizeMarketplaceOrderInput(input);
  const sourceKey = await marketplaceOrderSourceKey(normalized.provider, normalized.shop_id, normalized.external_order_id);
  const channelId = await marketplaceChannelId(normalized.provider, normalized.connection_id, normalized.shop_id);
  const externalActorLineage = normalized.external_buyer_id
    ? marketplaceCustomerIdentityLineage(await crmCustomerExternalIdentityKey(
        normalized.provider,
        normalized.shop_id,
        normalized.external_buyer_id,
      ))
    : `marketplace:${normalized.provider}:guest`;

  // Reuse the already hardened social -> canonical Sales Order bridge. The
  // synthetic cart/page identifiers are deterministic marketplace lineage,
  // not a second order source of truth. Buyer identity is an opaque CRM
  // fingerprint: provider buyer/user ids never enter the canonical Sales Order.
  const canonical = await ensureCanonicalSocialSalesOrder(db, tenantId, actor, {
    cart_id: `marketplace:${sourceKey}`,
    page_id: channelId,
    external_actor_id: externalActorLineage,
    company: normalized.company,
    customer: normalized.customer,
    currency: normalized.currency,
    selling_price_list: normalized.selling_price_list,
    transaction_date: normalized.transaction_date,
    items: normalized.items.map((item) => ({ item_code: item.item_code, quantity: item.quantity })),
    taxes: normalized.taxes ?? [],
    ...(normalized.provider_merchandise_total_minor === undefined
      ? {}
      : { expected_grand_total_minor: normalized.provider_merchandise_total_minor }),
  });

  // If an expected provider total was supplied, reaching this point proves the
  // canonical pre-submit reconciliation succeeded. A mismatch never submits.
  const reconciledProviderTotal = normalized.provider_merchandise_total_minor === undefined ? null : true;

  return {
    provider: normalized.provider,
    source_key: sourceKey,
    channel_id: channelId,
    external_order_id: normalized.external_order_id,
    sales_order_name: canonical.sales_order_name,
    grand_total_minor: canonical.grand_total_minor,
    currency: canonical.currency,
    status: canonical.status,
    reconciled_provider_total: reconciledProviderTotal,
  };
}

export function normalizeMarketplaceOrderInput(input: MarketplaceOrderInput): MarketplaceOrderInput {
  if (!MARKETPLACE_PROVIDERS.includes(input.provider)) throw errors.validation("Unsupported marketplace provider");
  const normalized: MarketplaceOrderInput = {
    provider: input.provider,
    connection_id: requiredText(input.connection_id, "connection_id", 160),
    shop_id: requiredText(input.shop_id, "shop_id", 200),
    external_order_id: requiredText(input.external_order_id, "external_order_id", 240),
    external_status: requiredText(input.external_status, "external_status", 120),
    occurred_at: isoDateTime(input.occurred_at, "occurred_at"),
    transaction_date: isoDate(input.transaction_date, "transaction_date"),
    company: requiredText(input.company, "company", 160),
    customer: requiredText(input.customer, "customer", 160),
    currency: requiredText(input.currency, "currency", 32).toUpperCase(),
    selling_price_list: requiredText(input.selling_price_list, "selling_price_list", 160),
    items: normalizeItems(input.items),
    taxes: normalizeTaxes(input.taxes),
  };
  if (input.external_buyer_id !== undefined) {
    normalized.external_buyer_id = requiredText(input.external_buyer_id, "external_buyer_id", 240);
  }
  if (input.provider_merchandise_total_minor !== undefined) {
    if (!Number.isSafeInteger(input.provider_merchandise_total_minor) || input.provider_merchandise_total_minor < 0) {
      throw errors.validation("provider_merchandise_total_minor must be a non-negative safe integer");
    }
    normalized.provider_merchandise_total_minor = input.provider_merchandise_total_minor;
  }
  return normalized;
}

export async function marketplaceOrderSourceKey(
  provider: MarketplaceProvider,
  shopId: string,
  externalOrderId: string,
): Promise<string> {
  if (!MARKETPLACE_PROVIDERS.includes(provider)) throw errors.validation("Unsupported marketplace provider");
  const shop = requiredText(shopId, "shop_id", 200);
  const order = requiredText(externalOrderId, "external_order_id", 240);
  const digest = await sha256Hex(JSON.stringify([provider, shop, order]));
  return `${provider}-${digest.slice(0, 40)}`;
}

export async function marketplaceChannelId(
  provider: MarketplaceProvider,
  connectionId: string,
  shopId: string,
): Promise<string> {
  if (!MARKETPLACE_PROVIDERS.includes(provider)) throw errors.validation("Unsupported marketplace provider");
  const connection = requiredText(connectionId, "connection_id", 160);
  const shop = requiredText(shopId, "shop_id", 200);
  const digest = await sha256Hex(JSON.stringify([provider, connection, shop]));
  return `marketplace:${provider}:${digest.slice(0, 40)}`;
}

export function marketplaceCustomerIdentityLineage(identityKey: string): string {
  if (typeof identityKey !== "string" || !/^[a-f0-9]{64}$/.test(identityKey)) {
    throw errors.validation("Marketplace customer identity fingerprint is invalid");
  }
  return `crm-external-identity:${identityKey}`;
}

export function marketplaceCustomerIdentityKeyFromLineage(value: string): string | null {
  if (typeof value !== "string") return null;
  const match = /^crm-external-identity:([a-f0-9]{64})$/.exec(value);
  return match?.[1] ?? null;
}

function normalizeItems(items: MarketplaceOrderItemInput[]): MarketplaceOrderItemInput[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    throw errors.validation("Marketplace order requires 1..500 items");
  }
  const lineIdentity = new Set<string>();
  return items.map((item, index) => {
    const externalSku = requiredText(item.external_sku, `items[${index}].external_sku`, 200);
    const externalVariantId = item.external_variant_id === undefined
      ? undefined
      : requiredText(item.external_variant_id, `items[${index}].external_variant_id`, 200);
    const itemCode = requiredText(item.item_code, `items[${index}].item_code`, 200);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000) {
      throw errors.validation(`items[${index}].quantity is invalid`);
    }
    const identity = `${externalSku}\n${externalVariantId ?? ""}`;
    if (lineIdentity.has(identity)) throw errors.validation("Duplicate marketplace SKU/variant line");
    lineIdentity.add(identity);
    return {
      external_sku: externalSku,
      ...(externalVariantId ? { external_variant_id: externalVariantId } : {}),
      item_code: itemCode,
      quantity: item.quantity,
    };
  });
}

function normalizeTaxes(taxes: JsonObject[] | undefined): JsonObject[] {
  if (taxes === undefined) return [];
  if (!Array.isArray(taxes) || taxes.length > 50) throw errors.validation("taxes is invalid");
  return taxes.map((tax, index) => {
    if (!tax || typeof tax !== "object" || Array.isArray(tax)) throw errors.validation(`taxes[${index}] is invalid`);
    return structuredClone(tax);
  });
}

function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function isoDate(value: string, field: string): string {
  const normalized = requiredText(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))) {
    throw errors.validation(`${field} must be YYYY-MM-DD`);
  }
  return normalized;
}

function isoDateTime(value: string, field: string): string {
  const normalized = requiredText(value, field, 64);
  if (Number.isNaN(Date.parse(normalized)) ) throw errors.validation(`${field} must be an ISO date-time`);
  return new Date(normalized).toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
