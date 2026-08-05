import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MarketplaceProvider } from "./marketplace-order.js";
import type { MarketplaceProviderOrderInput, MarketplaceProviderOrderItemInput } from "./marketplace-profile.js";

export function normalizeMarketplaceProviderOrderRecord(
  provider: MarketplaceProvider,
  channelProfile: string,
  record: JsonObject,
): MarketplaceProviderOrderInput {
  const channel = requiredText(channelProfile, "channel_profile", 240);
  if (!record || typeof record !== "object" || Array.isArray(record)) throw errors.validation("Marketplace provider order record is invalid");
  switch (provider) {
    case "shopee": return normalizeShopee(channel, record);
    case "lazada": return normalizeLazada(channel, record);
    case "tiktok_shop": return normalizeTikTokShop(channel, record);
  }
}

function normalizeShopee(channel: string, record: JsonObject): MarketplaceProviderOrderInput {
  const externalOrderId = firstRequired(record, ["order_sn", "order_id"], "Shopee order id", 240);
  const externalStatus = firstRequired(record, ["order_status", "status"], "Shopee order status", 120);
  const occurredAt = dateTimeFrom(firstValue(record, ["update_time", "status_update_time", "create_time"]), "Shopee occurred_at");
  const transactionDate = dateTimeFrom(firstValue(record, ["create_time", "update_time"]), "Shopee transaction_date").slice(0, 10);
  const buyer = firstOptional(record, ["buyer_user_id", "buyer_username", "buyer_id"], 240);
  const rawItems = arrayFrom(record, ["item_list", "order_items", "items"], "Shopee item_list");
  const items = aggregateLines(rawItems.map((item, index) => providerLine(
    firstRequired(item, ["model_sku", "item_sku", "seller_sku", "item_id"], `Shopee item ${index + 1} SKU`, 200),
    firstOptional(item, ["model_id", "variation_id", "sku_id"], 200),
    positiveQuantity(firstValue(item, ["model_quantity_purchased", "quantity", "qty"]), `Shopee item ${index + 1} quantity`),
  )));
  return {
    channel_profile: channel,
    external_order_id: externalOrderId,
    external_status: externalStatus,
    occurred_at: occurredAt,
    transaction_date: transactionDate,
    ...(buyer ? { external_buyer_id: buyer } : {}),
    items,
  };
}

function normalizeLazada(channel: string, record: JsonObject): MarketplaceProviderOrderInput {
  const externalOrderId = firstRequired(record, ["order_id", "order_number"], "Lazada order id", 240);
  const statusValue = record.statuses;
  const externalStatus = Array.isArray(statusValue)
    ? boundedStatus(statusValue.map((value) => scalarText(value)).filter((value): value is string => Boolean(value)).sort().join("|"), "Lazada order status")
    : firstRequired(record, ["status", "order_status"], "Lazada order status", 120);
  const occurredAt = dateTimeFrom(firstValue(record, ["updated_at", "update_time", "created_at", "created_time"]), "Lazada occurred_at");
  const transactionDate = dateTimeFrom(firstValue(record, ["created_at", "created_time", "updated_at"]), "Lazada transaction_date").slice(0, 10);
  const buyer = firstOptional(record, ["customer_id", "buyer_id"], 240);
  const rawItems = arrayFrom(record, ["items", "order_items"], "Lazada order items");
  const items = aggregateLines(rawItems.map((item, index) => providerLine(
    firstRequired(item, ["shop_sku", "seller_sku", "sku"], `Lazada item ${index + 1} SKU`, 200),
    firstOptional(item, ["sku_id", "variation_id", "seller_sku_id"], 200),
    positiveQuantity(firstValue(item, ["quantity", "qty"]), `Lazada item ${index + 1} quantity`, 1),
  )));
  return {
    channel_profile: channel,
    external_order_id: externalOrderId,
    external_status: externalStatus,
    occurred_at: occurredAt,
    transaction_date: transactionDate,
    ...(buyer ? { external_buyer_id: buyer } : {}),
    items,
  };
}

function normalizeTikTokShop(channel: string, record: JsonObject): MarketplaceProviderOrderInput {
  const externalOrderId = firstRequired(record, ["id", "order_id"], "TikTok Shop order id", 240);
  const externalStatus = firstRequired(record, ["status", "order_status"], "TikTok Shop order status", 120);
  const occurredAt = dateTimeFrom(firstValue(record, ["update_time", "updated_at", "create_time", "created_at"]), "TikTok Shop occurred_at");
  const transactionDate = dateTimeFrom(firstValue(record, ["create_time", "created_at", "update_time"]), "TikTok Shop transaction_date").slice(0, 10);
  const buyer = firstOptional(record, ["user_id", "buyer_user_id", "buyer_id"], 240);
  const rawItems = arrayFrom(record, ["line_items", "items"], "TikTok Shop line_items");
  const items = aggregateLines(rawItems.map((item, index) => {
    const sellerSku = firstOptional(item, ["seller_sku", "platform_sku"], 200);
    const skuId = firstOptional(item, ["sku_id", "product_sku_id"], 200);
    return providerLine(
      sellerSku ?? requireValue(skuId, `TikTok Shop item ${index + 1} SKU`),
      sellerSku ? skuId : undefined,
      positiveQuantity(firstValue(item, ["quantity", "qty"]), `TikTok Shop item ${index + 1} quantity`, 1),
    );
  }));
  return {
    channel_profile: channel,
    external_order_id: externalOrderId,
    external_status: externalStatus,
    occurred_at: occurredAt,
    transaction_date: transactionDate,
    ...(buyer ? { external_buyer_id: buyer } : {}),
    items,
  };
}

function providerLine(externalSku: string, externalVariantKey: string | undefined, quantity: number): MarketplaceProviderOrderItemInput {
  return {
    external_sku: externalSku,
    ...(externalVariantKey ? { external_variant_key: externalVariantKey } : {}),
    quantity,
  };
}

function aggregateLines(lines: MarketplaceProviderOrderItemInput[]): MarketplaceProviderOrderItemInput[] {
  if (lines.length === 0 || lines.length > 500) throw errors.validation("Marketplace provider order requires 1..500 items");
  const aggregated = new Map<string, MarketplaceProviderOrderItemInput>();
  for (const line of lines) {
    const variant = line.external_variant_key?.trim() || "BASE";
    const key = `${line.external_sku}\u0000${variant}`;
    const previous = aggregated.get(key);
    const quantity = (previous?.quantity ?? 0) + line.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000) throw errors.validation("Aggregated marketplace quantity is invalid");
    aggregated.set(key, {
      external_sku: line.external_sku,
      ...(variant === "BASE" ? {} : { external_variant_key: variant }),
      quantity,
    });
  }
  return [...aggregated.values()];
}

function arrayFrom(root: JsonObject, keys: string[], field: string): JsonObject[] {
  for (const key of keys) {
    const value = root[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length === 0 || value.length > 500) throw errors.validation(`${field} is invalid`);
    return value.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw errors.validation(`${field}[${index}] is invalid`);
      return item as JsonObject;
    });
  }
  throw errors.validation(`${field} is required`);
}

function firstRequired(root: JsonObject, keys: string[], field: string, max: number): string {
  const value = firstOptional(root, keys, max);
  if (!value) throw errors.validation(`${field} is required`);
  return value;
}
function firstOptional(root: JsonObject, keys: string[], max: number): string | undefined {
  return scalarText(firstValue(root, keys), max);
}
function firstValue(root: JsonObject, keys: string[]): JsonValue | undefined {
  for (const key of keys) if (root[key] !== undefined && root[key] !== null && root[key] !== "") return root[key];
  return undefined;
}
function scalarText(value: JsonValue | undefined, max = 240): string | undefined {
  const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
  if (raw === undefined) return undefined;
  const normalized = raw.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) return undefined;
  return normalized;
}
function requireValue(value: string | undefined, field: string): string {
  if (!value) throw errors.validation(`${field} is required`);
  return value;
}
function boundedStatus(value: string, field: string): string {
  if (!value) throw errors.validation(`${field} is required`);
  return requiredText(value.slice(0, 120), field, 120);
}
function positiveQuantity(value: JsonValue | undefined, field: string, defaultValue?: number): number {
  const parsed = value === undefined && defaultValue !== undefined ? defaultValue : typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 1_000_000) throw errors.validation(`${field} is invalid`);
  return parsed;
}
function dateTimeFrom(value: JsonValue | undefined, field: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1_000;
    const date = new Date(millis);
    if (!Number.isFinite(date.getTime())) throw errors.validation(`${field} is invalid`);
    return date.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (trimmed && Number.isFinite(numeric) && numeric > 0) return dateTimeFrom(numeric, field);
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  throw errors.validation(`${field} is invalid`);
}
function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}
