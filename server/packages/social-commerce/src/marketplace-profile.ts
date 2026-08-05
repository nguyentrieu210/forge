import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MarketplaceOrderInput, MarketplaceProvider } from "./marketplace-order.js";
import { MARKETPLACE_PROVIDERS } from "./marketplace-order.js";

export interface MarketplaceProviderOrderItemInput {
  external_sku: string;
  external_variant_key?: string;
  quantity: number;
}

export interface MarketplaceProviderOrderInput {
  channel_profile: string;
  external_order_id: string;
  external_status: string;
  occurred_at: string;
  transaction_date: string;
  external_buyer_id?: string;
  items: MarketplaceProviderOrderItemInput[];
  provider_merchandise_total_minor?: number;
}

export interface ResolvedMarketplaceOrder {
  channel_profile: string;
  warehouse: string;
  order: MarketplaceOrderInput;
}

interface DocumentRow {
  docstatus: number;
  payload_json: string;
}

/**
 * Resolve all ERP-controlled commercial context from tenant metadata. Provider
 * input can name only the configured channel and provider-side identities.
 * Company, Customer, Currency, Price List, Warehouse and ERP Item codes stay
 * server-authoritative.
 */
export async function resolveMarketplaceOrderFromMetadata(
  db: D1Database,
  tenantId: string,
  input: MarketplaceProviderOrderInput,
): Promise<ResolvedMarketplaceOrder> {
  const channelProfile = requiredText(input.channel_profile, "channel_profile", 240);
  const profileRow = await readDocument(db, tenantId, "Commerce Channel Profile", channelProfile);
  if (!profileRow || profileRow.docstatus === 2) throw errors.reference(`Commerce Channel Profile ${channelProfile} not found`);
  const profile = parsePayload(profileRow.payload_json, "Commerce Channel Profile");
  if (truthyCheck(profile.disabled)) throw errors.lifecycle(`Commerce Channel Profile ${channelProfile} is disabled`);
  if (!truthyCheck(profile.sync_orders)) throw errors.lifecycle(`Order synchronization is disabled for ${channelProfile}`);

  const provider = providerValue(profile.provider);
  const connectionId = jsonText(profile.connection_id, "connection_id", 160);
  const shopId = jsonText(profile.external_shop_id, "external_shop_id", 200);
  const company = jsonText(profile.company, "company", 160);
  const customer = jsonText(profile.default_customer, "default_customer", 160);
  const currency = jsonText(profile.currency, "currency", 32).toUpperCase();
  const sellingPriceList = jsonText(profile.selling_price_list, "selling_price_list", 160);
  const warehouse = jsonText(profile.warehouse, "warehouse", 200);

  const sourceItems = normalizeProviderItems(input.items);
  const statements = sourceItems.map((item) => {
    const mappingName = marketplaceMappingName(channelProfile, item.external_sku, item.external_variant_key);
    return db.prepare(
      `SELECT docstatus,payload_json FROM documents
       WHERE tenant_id=?1 AND doctype='Marketplace SKU Mapping' AND name=?2 LIMIT 1`,
    ).bind(tenantId, mappingName);
  });
  const mappingResults = statements.length > 0 ? await db.batch(statements) : [];
  const items = sourceItems.map((item, index) => {
    const row = mappingResults[index]?.results?.[0] as DocumentRow | undefined;
    if (!row || row.docstatus === 2) {
      throw errors.reference(`No active Marketplace SKU Mapping for ${item.external_sku}/${item.external_variant_key}`);
    }
    const mapping = parsePayload(row.payload_json, "Marketplace SKU Mapping");
    if (truthyCheck(mapping.disabled)) {
      throw errors.lifecycle(`Marketplace SKU Mapping is disabled for ${item.external_sku}/${item.external_variant_key}`);
    }
    if (jsonText(mapping.channel_profile, "channel_profile", 240) !== channelProfile) throw errors.reference("Marketplace SKU Mapping channel mismatch");
    if (jsonText(mapping.external_sku, "external_sku", 200) !== item.external_sku) throw errors.reference("Marketplace SKU Mapping SKU mismatch");
    if (jsonText(mapping.external_variant_key, "external_variant_key", 200) !== item.external_variant_key) {
      throw errors.reference("Marketplace SKU Mapping variant mismatch");
    }
    return {
      external_sku: item.external_sku,
      ...(item.external_variant_key === "BASE" ? {} : { external_variant_id: item.external_variant_key }),
      item_code: jsonText(mapping.item_code, "item_code", 200),
      quantity: item.quantity,
    };
  });

  const order: MarketplaceOrderInput = {
    provider,
    connection_id: connectionId,
    shop_id: shopId,
    external_order_id: requiredText(input.external_order_id, "external_order_id", 240),
    external_status: requiredText(input.external_status, "external_status", 120),
    occurred_at: requiredText(input.occurred_at, "occurred_at", 64),
    transaction_date: requiredText(input.transaction_date, "transaction_date", 10),
    company,
    customer,
    currency,
    selling_price_list: sellingPriceList,
    items,
    taxes: [],
  };
  if (input.external_buyer_id !== undefined) order.external_buyer_id = requiredText(input.external_buyer_id, "external_buyer_id", 240);
  if (input.provider_merchandise_total_minor !== undefined) {
    if (!Number.isSafeInteger(input.provider_merchandise_total_minor) || input.provider_merchandise_total_minor < 0) {
      throw errors.validation("provider_merchandise_total_minor must be a non-negative safe integer");
    }
    order.provider_merchandise_total_minor = input.provider_merchandise_total_minor;
  }
  return { channel_profile: channelProfile, warehouse, order };
}

export function marketplaceMappingName(channelProfile: string, externalSku: string, externalVariantKey?: string): string {
  const channel = requiredText(channelProfile, "channel_profile", 240);
  const sku = requiredText(externalSku, "external_sku", 200);
  const variant = normalizeVariantKey(externalVariantKey);
  return `${channel}:${sku}:${variant}`;
}

function normalizeProviderItems(items: MarketplaceProviderOrderItemInput[]): Array<{ external_sku: string; external_variant_key: string; quantity: number }> {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw errors.validation("Marketplace provider order requires 1..500 items");
  const seen = new Set<string>();
  return items.map((item, index) => {
    const externalSku = requiredText(item.external_sku, `items[${index}].external_sku`, 200);
    const variant = normalizeVariantKey(item.external_variant_key);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000) throw errors.validation(`items[${index}].quantity is invalid`);
    const identity = `${externalSku}\n${variant}`;
    if (seen.has(identity)) throw errors.validation("Duplicate marketplace provider SKU/variant line");
    seen.add(identity);
    return { external_sku: externalSku, external_variant_key: variant, quantity: item.quantity };
  });
}

function normalizeVariantKey(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return "BASE";
  return requiredText(value, "external_variant_key", 200);
}

async function readDocument(db: D1Database, tenantId: string, doctype: string, name: string): Promise<DocumentRow | null> {
  return db.prepare(
    "SELECT docstatus,payload_json FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3 LIMIT 1",
  ).bind(tenantId, doctype, name).first<DocumentRow>();
}

function parsePayload(payload: string, label: string): JsonObject {
  try {
    const value = JSON.parse(payload) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value as JsonObject;
  } catch {
    throw errors.reference(`${label} payload is invalid`);
  }
}

function providerValue(value: unknown): MarketplaceProvider {
  if (typeof value !== "string" || !MARKETPLACE_PROVIDERS.includes(value as MarketplaceProvider)) throw errors.reference("Commerce Channel Profile provider is invalid");
  return value as MarketplaceProvider;
}

function jsonText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.reference(`Commerce metadata ${field} is invalid`);
  return requiredText(value, field, max);
}

function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function truthyCheck(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}
