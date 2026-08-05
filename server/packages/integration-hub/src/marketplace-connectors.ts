import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import {
  requireSignedProviderRequest,
  validateNormalizedProviderEvents,
  validateProviderSignedRequest,
  type ConnectorProviderAdapter,
  type NormalizedProviderEvent,
  type ProviderInboundContext,
  type ProviderSignedResponse,
  type ProviderSyncContext,
} from "./adapter.js";
import type { ConnectorManifest } from "./catalog.js";
import { validateSyncPage, type ExternalSyncPage } from "./sync.js";

export const SHOPEE_MARKETPLACE_MANIFEST: ConnectorManifest = {
  schema_version: 1,
  connector_key: "shopee-marketplace",
  version: "1.0.0",
  provider: "shopee",
  display_name: "Shopee Marketplace",
  category: "marketplace",
  auth_kinds: ["oauth2"],
  capabilities: ["oauth_flow", "inbound_webhook", "push_events", "poll", "pull_records", "cursor_sync"],
  config_schema_version: 1,
  event_patterns: ["shopee.*"],
  description: "Shopee order synchronization through the secretless signed-request boundary.",
  docs_url: "https://open.shopee.com/",
};

export const LAZADA_MARKETPLACE_MANIFEST: ConnectorManifest = {
  schema_version: 1,
  connector_key: "lazada-marketplace",
  version: "1.0.0",
  provider: "lazada",
  display_name: "Lazada Open Platform",
  category: "marketplace",
  auth_kinds: ["oauth2"],
  capabilities: ["oauth_flow", "inbound_webhook", "push_events", "poll", "pull_records", "cursor_sync"],
  config_schema_version: 1,
  event_patterns: ["lazada.*"],
  description: "Lazada order synchronization through signed Open Platform requests and order push events.",
  docs_url: "https://open.lazada.com/apps/doc/getting_started",
};

export const TIKTOK_SHOP_MARKETPLACE_MANIFEST: ConnectorManifest = {
  schema_version: 1,
  connector_key: "tiktok-shop-marketplace",
  version: "1.0.0",
  provider: "tiktok_shop",
  display_name: "TikTok Shop",
  category: "marketplace",
  auth_kinds: ["oauth2"],
  capabilities: ["oauth_flow", "inbound_webhook", "push_events", "poll", "pull_records", "cursor_sync"],
  config_schema_version: 1,
  event_patterns: ["tiktok_shop.*"],
  description: "TikTok Shop order synchronization with Partner Center signing kept behind WS11.",
  docs_url: "https://partner.tiktokshop.com/docv2/page/tts-developer-guide",
};

export const SHOPEE_MARKETPLACE_ADAPTER: ConnectorProviderAdapter = {
  manifest: SHOPEE_MARKETPLACE_MANIFEST,
  validateConfig: validateShopeeConfig,
  normalizeInbound: normalizeShopeeInbound,
  fetchPage: fetchShopeeOrders,
};
export const LAZADA_MARKETPLACE_ADAPTER: ConnectorProviderAdapter = {
  manifest: LAZADA_MARKETPLACE_MANIFEST,
  validateConfig: validateLazadaConfig,
  normalizeInbound: normalizeLazadaInbound,
  fetchPage: fetchLazadaOrders,
};
export const TIKTOK_SHOP_MARKETPLACE_ADAPTER: ConnectorProviderAdapter = {
  manifest: TIKTOK_SHOP_MARKETPLACE_MANIFEST,
  validateConfig: validateTikTokShopConfig,
  normalizeInbound: normalizeTikTokShopInbound,
  fetchPage: fetchTikTokShopOrders,
};
export const MARKETPLACE_PROVIDER_ADAPTERS = Object.freeze([
  SHOPEE_MARKETPLACE_ADAPTER,
  LAZADA_MARKETPLACE_ADAPTER,
  TIKTOK_SHOP_MARKETPLACE_ADAPTER,
]);

interface ShopeeConfig extends JsonObject { api_base: string; shop_id: string; lookback_seconds?: number }
interface LazadaConfig extends JsonObject { api_base: string; lookback_seconds?: number }
interface TikTokShopConfig extends JsonObject { api_base: string; shop_cipher: string; lookback_seconds?: number }
interface TimeCursor { from: number; to: number; provider_cursor: string | null }

/** Shopee list records do not carry complete SKU lines, so detail hydration is mandatory. */
async function fetchShopeeOrders(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>> {
  assertOrdersStream(context);
  const config = asShopeeConfig(context.config);
  const execute = requireSignedProviderRequest(context);
  const cursor = parseTimeCursor(context.cursor, config.lookback_seconds ?? 86_400);
  const pageSize = boundedLimit(context.limit, 50);
  const url = new URL("api/v2/order/get_order_list", config.api_base);
  url.searchParams.set("shop_id", config.shop_id);
  url.searchParams.set("time_range_field", "update_time");
  url.searchParams.set("time_from", String(cursor.from));
  url.searchParams.set("time_to", String(cursor.to));
  url.searchParams.set("page_size", String(pageSize));
  if (cursor.provider_cursor) url.searchParams.set("cursor", cursor.provider_cursor);
  const listBody = successfulJson(await execute(validateProviderSignedRequest({
    operation: "shopee.order.list",
    method: "GET",
    url: url.href,
    headers: { accept: "application/json" },
  })), "Shopee order list");
  const response = objectAt(listBody, "response");
  const summaries = objectArray(response.order_list, "Shopee response.order_list", pageSize);
  const more = response.more === true;
  const nextProviderCursor = optionalScalarText(response.next_cursor, "Shopee next_cursor", 4_096);
  const next = more ? encodeTimeCursor({ ...cursor, provider_cursor: requireNonEmpty(nextProviderCursor, "Shopee next_cursor") }) : null;
  if (summaries.length === 0) return validateSyncPage({ records: [], next_cursor: next, has_more: more }, pageSize);

  const orderSns = summaries.map((record, index) => firstRequired(record, ["order_sn", "order_id"], `Shopee order ${index + 1} id`, 240));
  const detailUrl = new URL("api/v2/order/get_order_detail", config.api_base);
  detailUrl.searchParams.set("shop_id", config.shop_id);
  detailUrl.searchParams.set("order_sn_list", orderSns.join(","));
  detailUrl.searchParams.set("response_optional_fields", "buyer_user_id,buyer_username,item_list,order_status,create_time,update_time");
  const detailBody = successfulJson(await execute(validateProviderSignedRequest({
    operation: "shopee.order.detail",
    method: "GET",
    url: detailUrl.href,
    headers: { accept: "application/json" },
  })), "Shopee order detail");
  const details = objectArray(objectAt(detailBody, "response").order_list, "Shopee detail order_list", pageSize);
  assertHydratedIds(orderSns, details, ["order_sn", "order_id"], "Shopee");
  return validateSyncPage({ records: details, next_cursor: next, has_more: more }, pageSize);
}

/** Lazada requires GetOrderItems after GetOrders; duplicate item objects are kept for the commerce normalizer to aggregate. */
async function fetchLazadaOrders(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>> {
  assertOrdersStream(context);
  const config = asLazadaConfig(context.config);
  const execute = requireSignedProviderRequest(context);
  const cursor = parseOffsetCursor(context.cursor, config.lookback_seconds ?? 86_400);
  const pageSize = boundedLimit(context.limit, 25);
  const url = new URL("orders/get", config.api_base);
  url.searchParams.set("created_after", new Date(cursor.from * 1_000).toISOString());
  url.searchParams.set("status", "all");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(cursor.offset));
  const body = successfulJson(await execute(validateProviderSignedRequest({
    operation: "lazada.order.list",
    method: "GET",
    url: url.href,
    headers: { accept: "application/json" },
  })), "Lazada order list");
  const summaries = objectArray(objectAt(body, "data").orders, "Lazada data.orders", pageSize);
  const records: JsonObject[] = [];
  for (const [index, summary] of summaries.entries()) {
    const orderId = firstRequired(summary, ["order_id", "order_number"], `Lazada order ${index + 1} id`, 240);
    const itemUrl = new URL("order/items/get", config.api_base);
    itemUrl.searchParams.set("order_id", orderId);
    const itemBody = successfulJson(await execute(validateProviderSignedRequest({
      operation: "lazada.order.items",
      method: "GET",
      url: itemUrl.href,
      headers: { accept: "application/json" },
    })), `Lazada order ${orderId} items`);
    const items = jsonObjectArrayAtRoot(itemBody.data, `Lazada order ${orderId} items`, 500);
    if (items.length === 0) throw new Error(`Lazada order ${orderId} returned no item detail`);
    records.push({ ...structuredClone(summary), items });
  }
  const hasMore = summaries.length === pageSize && cursor.offset + pageSize <= 5_000;
  const next = hasMore ? encodeOffsetCursor({ from: cursor.from, offset: cursor.offset + pageSize }) : null;
  return validateSyncPage({ records, next_cursor: next, has_more: hasMore }, pageSize);
}

/** TikTok Shop v202309 Get Order List includes line_items on the Order resource. */
async function fetchTikTokShopOrders(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>> {
  assertOrdersStream(context);
  const config = asTikTokShopConfig(context.config);
  const execute = requireSignedProviderRequest(context);
  const pageSize = boundedLimit(context.limit, 50);
  const cursor = parseOpaqueCursor(context.cursor);
  const url = new URL("order/202309/orders/search", config.api_base);
  url.searchParams.set("shop_cipher", config.shop_cipher);
  url.searchParams.set("page_size", String(pageSize));
  if (cursor) url.searchParams.set("page_token", cursor);
  const body = successfulJson(await execute(validateProviderSignedRequest({
    operation: "tiktok_shop.order.list",
    method: "POST",
    url: url.href,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sort_field: "update_time", sort_order: "ASC" }),
  })), "TikTok Shop order list");
  const data = objectAt(body, "data");
  const records = objectArray(data.orders, "TikTok Shop data.orders", pageSize);
  for (const [index, record] of records.entries()) {
    if (!Array.isArray(record.line_items) || record.line_items.length === 0) throw new Error(`TikTok Shop order ${index + 1} has no line_items`);
  }
  const nextToken = optionalScalarText(data.next_page_token, "TikTok Shop next_page_token", 4_096);
  const hasMore = Boolean(nextToken);
  return validateSyncPage({ records, next_cursor: hasMore ? nextToken! : null, has_more: hasMore }, pageSize);
}

async function normalizeShopeeInbound(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]> {
  const body = parseJsonObject(rawBody, "Shopee webhook");
  const data = optionalObject(body.data) ?? {};
  const orderId = firstOptional(data, ["order_sn", "ordersn", "order_id"], 240);
  const occurred = unixOrIso(body.timestamp ?? data.update_time ?? data.status_update_time, context.received_at);
  const eventId = firstOptional(body, ["event_id", "request_id"], 300) ?? await sha256Hex(rawBody);
  return validateNormalizedProviderEvents([{
    external_event_id: `shopee:${eventId}`.slice(0, 320),
    event_type: orderId ? "shopee.order_status_change" : "shopee.webhook",
    occurred_at: occurred,
    payload: structuredClone(body),
  }]);
}
async function normalizeLazadaInbound(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]> {
  const body = parseJsonObject(rawBody, "Lazada webhook");
  const data = optionalObject(body.data) ?? {};
  const orderId = firstOptional(data, ["trade_order_id", "order_id"], 240);
  const lineId = firstOptional(data, ["trade_order_line_id", "order_item_id"], 240);
  const occurred = unixOrIso(data.status_update_time ?? body.timestamp, context.received_at);
  const identity = [orderId, lineId, firstOptional(data, ["order_status"], 120), occurred].filter(Boolean).join(":");
  const eventId = identity || await sha256Hex(rawBody);
  return validateNormalizedProviderEvents([{
    external_event_id: `lazada:${eventId}`.slice(0, 320),
    event_type: orderId ? "lazada.order_status_change" : "lazada.webhook",
    occurred_at: occurred,
    payload: structuredClone(body),
  }]);
}
async function normalizeTikTokShopInbound(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]> {
  const body = parseJsonObject(rawBody, "TikTok Shop webhook");
  const eventId = firstOptional(body, ["tts_notification_id", "event_id"], 300) ?? await sha256Hex(rawBody);
  const eventTypeRaw = firstOptional(body, ["event_type", "type"], 120);
  const occurred = unixOrIso(body.timestamp, context.received_at);
  return validateNormalizedProviderEvents([{
    external_event_id: `tiktok_shop:${eventId}`.slice(0, 320),
    event_type: eventTypeRaw === "ORDER_STATUS_CHANGE" ? "tiktok_shop.order_status_change" : "tiktok_shop.webhook",
    occurred_at: occurred,
    payload: structuredClone(body),
  }]);
}

function validateShopeeConfig(config: JsonObject): void { asShopeeConfig(config); }
function validateLazadaConfig(config: JsonObject): void { asLazadaConfig(config); }
function validateTikTokShopConfig(config: JsonObject): void { asTikTokShopConfig(config); }
function asShopeeConfig(config: JsonObject | undefined): ShopeeConfig {
  const value = requireConfig(config);
  const apiBase = providerBase(value.api_base ?? "https://partner.shopeemobile.com/", "Shopee", (host) => host === "partner.shopeemobile.com");
  return { api_base: apiBase, shop_id: requiredText(value.shop_id, "Shopee shop_id", 200), ...lookback(value.lookback_seconds) };
}
function asLazadaConfig(config: JsonObject | undefined): LazadaConfig {
  const value = requireConfig(config);
  const apiBase = providerBase(value.api_base, "Lazada", (host) => /^api\.lazada\.(?:com|vn|sg|my|co\.id|co\.th|com\.ph)$/.test(host));
  return { api_base: apiBase, ...lookback(value.lookback_seconds) };
}
function asTikTokShopConfig(config: JsonObject | undefined): TikTokShopConfig {
  const value = requireConfig(config);
  const apiBase = providerBase(value.api_base ?? "https://open-api.tiktokglobalshop.com/", "TikTok Shop", (host) => host === "open-api.tiktokglobalshop.com");
  return { api_base: apiBase, shop_cipher: requiredText(value.shop_cipher, "TikTok Shop shop_cipher", 300), ...lookback(value.lookback_seconds) };
}
function requireConfig(config: JsonObject | undefined): JsonObject {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Marketplace connector config is required");
  return config;
}
function lookback(value: JsonValue | undefined): { lookback_seconds?: number } {
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 60 || value > 2_592_000) throw new Error("Marketplace lookback_seconds is invalid");
  return { lookback_seconds: value };
}
function providerBase(value: JsonValue | undefined, provider: string, allowedHost: (host: string) => boolean): string {
  if (typeof value !== "string") throw new Error(`${provider} api_base is required`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${provider} api_base is invalid`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !allowedHost(url.hostname.toLowerCase())) throw new Error(`${provider} api_base host is not allowed`);
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

function assertOrdersStream(context: ProviderSyncContext): void {
  if (context.stream !== "orders") throw new Error(`Marketplace connector does not support stream ${context.stream}`);
  if (!Number.isSafeInteger(context.limit) || context.limit <= 0) throw new Error("Marketplace sync limit is invalid");
}
function boundedLimit(value: number, providerMax: number): number { return Math.min(Math.max(value, 1), providerMax); }
function parseTimeCursor(raw: string | null, lookbackSeconds: number): TimeCursor {
  if (!raw) { const to = Math.floor(Date.now() / 1_000); return { from: to - lookbackSeconds, to, provider_cursor: null }; }
  const value = parseCursorObject(raw);
  const from = safeUnix(value.from, "cursor.from"); const to = safeUnix(value.to, "cursor.to");
  if (from > to || to - from > 2_592_000) throw new Error("Marketplace sync time cursor is invalid");
  const providerCursor = value.provider_cursor === null ? null : requiredText(value.provider_cursor, "cursor.provider_cursor", 4_096);
  return { from, to, provider_cursor: providerCursor };
}
function encodeTimeCursor(value: TimeCursor): string { return JSON.stringify(value); }
function parseOffsetCursor(raw: string | null, lookbackSeconds: number): { from: number; offset: number } {
  if (!raw) return { from: Math.floor(Date.now() / 1_000) - lookbackSeconds, offset: 0 };
  const value = parseCursorObject(raw); const from = safeUnix(value.from, "cursor.from"); const offset = Number(value.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5_000) throw new Error("Lazada offset cursor is invalid");
  return { from, offset };
}
function encodeOffsetCursor(value: { from: number; offset: number }): string { return JSON.stringify(value); }
function parseOpaqueCursor(raw: string | null): string | null { return raw === null ? null : requiredText(raw, "provider cursor", 4_096); }
function parseCursorObject(raw: string): JsonObject {
  if (raw.length > 4_096) throw new Error("Marketplace cursor is too large");
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error("Marketplace cursor is invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Marketplace cursor is invalid");
  return parsed as JsonObject;
}

function successfulJson(response: ProviderSignedResponse, label: string): JsonObject {
  if (!Number.isSafeInteger(response.status) || response.status < 200 || response.status >= 300) throw new Error(`${label} returned HTTP ${response.status}`);
  return parseJsonObject(response.body, label);
}
function parseJsonObject(raw: string, label: string): JsonObject {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 5_000_000) throw new Error(`${label} body is invalid`);
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error(`${label} body is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} JSON root must be an object`);
  return value as JsonObject;
}
function objectAt(root: JsonObject, key: string): JsonObject {
  const value = root[key]; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Provider response ${key} is invalid`); return value as JsonObject;
}
function optionalObject(value: JsonValue | undefined): JsonObject | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined; }
function objectArray(value: JsonValue | undefined, field: string, max: number): JsonObject[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field} is invalid`);
  return value.map((item, index) => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${field}[${index}] is invalid`); return structuredClone(item as JsonObject); });
}
function jsonObjectArrayAtRoot(value: JsonValue | undefined, field: string, max: number): JsonObject[] { return objectArray(value, field, max); }
function requiredText(value: JsonValue | undefined, field: string, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${field} is required`);
  const normalized = String(value).normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
function firstRequired(root: JsonObject, keys: string[], field: string, max: number): string { const value = firstOptional(root, keys, max); if (!value) throw new Error(`${field} is required`); return value; }
function firstOptional(root: JsonObject, keys: string[], max: number): string | undefined { for (const key of keys) { const value = optionalScalarText(root[key], key, max); if (value) return value; } return undefined; }
function requireNonEmpty(value: string | undefined, field: string): string { if (!value) throw new Error(`${field} is required`); return value; }
function optionalScalarText(value: JsonValue | undefined, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${field} is invalid`);
  const normalized = String(value).normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
function safeUnix(value: JsonValue | undefined, field: string): number { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field} is invalid`); return parsed; }
function unixOrIso(value: JsonValue | undefined, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date((value > 10_000_000_000 ? value : value * 1_000)).toISOString();
  if (typeof value === "string") { const numeric = Number(value); if (value.trim() && Number.isFinite(numeric) && numeric > 0) return unixOrIso(numeric, fallback); const parsed = Date.parse(value); if (Number.isFinite(parsed)) return new Date(parsed).toISOString(); }
  const parsedFallback = Date.parse(fallback); if (!Number.isFinite(parsedFallback)) throw new Error("Provider received_at is invalid"); return new Date(parsedFallback).toISOString();
}
function assertHydratedIds(expected: string[], records: JsonObject[], keys: string[], provider: string): void {
  if (records.length !== expected.length) throw new Error(`${provider} detail hydration returned an incomplete order set`);
  const actual = new Set(records.map((record, index) => firstRequired(record, keys, `${provider} detail ${index + 1} id`, 240)));
  for (const id of expected) if (!actual.has(id)) throw new Error(`${provider} detail hydration omitted order ${id}`);
}
async function sha256Hex(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
