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

export type MarketplaceConnectorKey = "shopee-marketplace" | "lazada-marketplace" | "tiktok-shop-marketplace";

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

interface ShopeeConfig extends JsonObject {
  api_base: string;
  shop_id: string;
  lookback_seconds?: number;
}
interface LazadaConfig extends JsonObject {
  api_base: string;
  lookback_seconds?: number;
}
interface TikTokShopConfig extends JsonObject {
  api_base: string;
  shop_cipher: string;
  lookback_seconds?: number;
}
interface TimeCursor {
  from: number;
  to: number;
  provider_cursor: string | null;
}

async function fetchShopeeOrders(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>> {
  assertOrdersStream(context);
  const config = asShopeeConfig(context.config);
  const execute = requireSignedProviderRequest(context);
  const cursor = parseTimeCursor(context.cursor, config.lookback_seconds ?? 86_400);
  const pageSize = boundedLimit(context.limit, 100);
  const url = new URL("/api/v2/order/get_order_list", config.api_base);
  url.searchParams.set("shop_id", config.shop_id);
  url.searchParams.set("time_range_field", "update_time");
  url.searchParams.set("time_from", String(cursor.from));
  url.searchParams.set("time_to", String(cursor.to));
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("response_optional_fields", "order_status");
  if (cursor.provider_cursor) url.searchParams.set("cursor", cursor.provider_cursor);
  const response = await execute(validateProviderSignedRequest({
    operation: "shopee.order.list",
    method: "GET",
    url: url.href,
    headers: { accept: "application/json" },
  }));
  const body = successfulJson(response, "Shopee order list");
  const root = objectAt(body, "response");
  const records = objectArray(root.order_list, "Shopee response.order_list", pageSize);
  const more = root.more === true;
  const nextProviderCursor = optionalScalarText(root.next_cursor, "Shopee next_cursor", 4_096);
  const next = more ? encodeTimeCursor({ ...cursor, provider_cursor: requireNonEmpty(nextProviderCursor, "Shopee next_cursor") }) : null;
  return validateSyncPage({ records, next_cursor: next, has_more: more }, pageSize);
}

async function fetchLazadaOrders(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>> {
  assertOrdersStream(context);
  const config = asLazadaConfig(context.config);
  const execute = requireSignedProviderRequest(context);
  const cursor = parseOffsetCursor(context.cursor, config.lookback_seconds ?? 86_400);
  const pageSize = boundedLimit(context.limit, 100);
  const url = new URL("/orders/get", config.api_base);
  url.searchParams.set("created_after", new Date(cursor.from * 1_000).toISOString());
  url.searchParams.set("status", "all");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(cursor.offset));
  const response = await execute(validateProviderSignedRequest({
    operation: "lazada.order.list",
    method: "GET",
    url: url.href,
    headers: { accept: "application/json" },
  }));
  const body = successfulJson(response, "Lazada order list");
  const data = objectAt(body, "data");
  const records = objectArray(data.orders, "Lazada data.orders", pageSize);
  const hasMore = records.length === pageSize && cursor.offset + pageSize <= 5_000;
  const next = hasMore ? encodeOffsetCursor({ from: cursor.from, offset: cursor.offset + pageSize }) : null;
  return validateSyncPage({ records, next_cursor: next, has_more: hasMore }, pageSize);
}

async function fetchTikTokShopOrders(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>> {
  assertOrdersStream(context);
  const config = asTikTokShopConfig(context.config);
  const execute = requireSignedProviderRequest(context);
  const pageSize = boundedLimit(context.limit, 50);
  const cursor = parseOpaqueCursor(context.cursor);
  const url = new URL("/order/202309/orders/search", config.api_base);
  url.searchParams.set("shop_cipher", config.shop_cipher);
  url.searchParams.set("page_size", String(pageSize));
  if (cursor) url.searchParams.set("page_token", cursor);
  const response = await execute(validateProviderSignedRequest({
    operation: "tiktok_shop.order.list",
    method: "POST",
    url: url.href,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sort_field: "update_time", sort_order: "ASC" }),
  }));
  const body = successfulJson(response, "TikTok Shop order list");
  const data = objectAt(body, "data");
  const records = objectArray(data.orders, "TikTok Shop data.orders", pageSize);
  const nextToken = optionalScalarText(data.next_page_token, "TikTok Shop next_page_token", 4_096);
  const hasMore = Boolean(nextToken);
  return validateSyncPage({ records, next_cursor: hasMore ? nextToken! : null, has_more: hasMore }, pageSize);
}

async function normalizeShopeeInbound(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]> {
  const body = parseJsonObject(rawBody, "Shopee webhook");
  const data = optionalObject(body.data) ?? {};
  const orderId = firstText([data.order_sn, data.ordersn, data.order_id], 240);
  const occurred = unixOrIso(body.timestamp ?? data.update_time ?? data.status_update_time, context.received_at);
  const eventId = firstText([body.event_id, body.request_id, body.code && orderId ? `${body.code}:${orderId}:${occurred}` : undefined], 320)
    ?? `shopee:${await sha256Hex(rawBody)}`;
  const eventType = orderId ? "shopee.order_status_change" : "shopee.webhook";
  return validateNormalizedProviderEvents([{
    external_event_id: eventId.startsWith("shopee:") ? eventId : `shopee:${eventId}`,
    event_type: eventType,
    occurred_at: occurred,
    payload: structuredClone(body),
  }]);
}

async function normalizeLazadaInbound(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]> {
  const body = parseJsonObject(rawBody, "Lazada webhook");
  const data = optionalObject(body.data) ?? {};
  const orderId = firstText([data.trade_order_id, data.order_id], 240);
  const lineId = firstText([data.trade_order_line_id, data.order_item_id], 240);
  const occurred = unixOrIso(data.status_update_time ?? body.timestamp, context.received_at);
  const eventIdentity = [orderId, lineId, firstText([data.order_status], 120), occurred].filter(Boolean).join(":");
  const eventId = eventIdentity ? `lazada:${eventIdentity}` : `lazada:${await sha256Hex(rawBody)}`;
  return validateNormalizedProviderEvents([{
    external_event_id: eventId.slice(0, 320),
    event_type: orderId ? "lazada.order_status_change" : "lazada.webhook",
    occurred_at: occurred,
    payload: structuredClone(body),
  }]);
}

async function normalizeTikTokShopInbound(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]> {
  const body = parseJsonObject(rawBody, "TikTok Shop webhook");
  const eventId = firstText([body.tts_notification_id, body.event_id], 300) ?? await sha256Hex(rawBody);
  const eventTypeRaw = firstText([body.event_type], 120) ?? scalarText(body.type);
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
  const apiBase = providerBase(value.api_base ?? "https://partner.shopeemobile.com", "Shopee", (host) => host === "partner.shopeemobile.com");
  return { api_base: apiBase, shop_id: requiredText(value.shop_id, "Shopee shop_id", 200), ...lookback(value.lookback_seconds) };
}
function asLazadaConfig(config: JsonObject | undefined): LazadaConfig {
  const value = requireConfig(config);
  const apiBase = providerBase(value.api_base, "Lazada", (host) => /^api\.lazada\.(?:com|vn|sg|my|co\.id|co\.th|com\.ph)$/.test(host));
  return { api_base: apiBase, ...lookback(value.lookback_seconds) };
}
function asTikTokShopConfig(config: JsonObject | undefined): TikTokShopConfig {
  const value = requireConfig(config);
  const apiBase = providerBase(value.api_base ?? "https://open-api.tiktokglobalshop.com", "TikTok Shop", (host) => host === "open-api.tiktokglobalshop.com");
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
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !allowedHost(url.hostname.toLowerCase())) {
    throw new Error(`${provider} api_base host is not allowed`);
  }
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
  if (!raw) {
    const to = Math.floor(Date.now() / 1_000);
    return { from: to - lookbackSeconds, to, provider_cursor: null };
  }
  const value = parseCursorObject(raw);
  const from = safeUnix(value.from, "cursor.from");
  const to = safeUnix(value.to, "cursor.to");
  if (from > to || to - from > 2_592_000) throw new Error("Marketplace sync time cursor is invalid");
  const providerCursor = value.provider_cursor === null ? null : requiredText(value.provider_cursor, "cursor.provider_cursor", 4_096);
  return { from, to, provider_cursor: providerCursor };
}
function encodeTimeCursor(value: TimeCursor): string { return JSON.stringify(value); }

function parseOffsetCursor(raw: string | null, lookbackSeconds: number): { from: number; offset: number } {
  if (!raw) return { from: Math.floor(Date.now() / 1_000) - lookbackSeconds, offset: 0 };
  const value = parseCursorObject(raw);
  const from = safeUnix(value.from, "cursor.from");
  const offset = Number(value.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5_000) throw new Error("Lazada offset cursor is invalid");
  return { from, offset };
}
function encodeOffsetCursor(value: { from: number; offset: number }): string { return JSON.stringify(value); }
function parseOpaqueCursor(raw: string | null): string | null {
  if (raw === null) return null;
  return requiredText(raw, "provider cursor", 4_096);
}
function parseCursorObject(raw: string): JsonObject {
  if (raw.length > 4_096) throw new Error("Marketplace cursor is too large");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Marketplace cursor is invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Marketplace cursor is invalid");
  return parsed as JsonObject;
}

function successfulJson(response: ProviderSignedResponse, label: string): JsonObject {
  if (!Number.isSafeInteger(response.status) || response.status < 200 || response.status >= 300) throw new Error(`${label} returned HTTP ${response.status}`);
  return parseJsonObject(response.body, label);
}
function parseJsonObject(raw: string, label: string): JsonObject {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 5_000_000) throw new Error(`${label} body is invalid`);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`${label} body is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} JSON root must be an object`);
  return value as JsonObject;
}
function objectAt(root: JsonObject, key: string): JsonObject {
  const value = root[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Provider response ${key} is invalid`);
  return value as JsonObject;
}
function optionalObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}
function objectArray(value: JsonValue | undefined, field: string, max: number): JsonObject[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field} is invalid`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${field}[${index}] is invalid`);
    return structuredClone(item as JsonObject);
  });
}
function requiredText(value: JsonValue | undefined, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
function requireNonEmpty(value: string | undefined, field: string): string { if (!value) throw new Error(`${field} is required`); return value; }
function optionalScalarText(value: JsonValue | undefined, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = scalarText(value);
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
function scalarText(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
function firstText(values: Array<JsonValue | undefined>, max: number): string | undefined {
  for (const value of values) {
    const text = scalarText(value);
    if (text && text.length <= max && !/[\r\n\0]/.test(text)) return text;
  }
  return undefined;
}
function safeUnix(value: JsonValue | undefined, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field} is invalid`);
  return parsed;
}
function unixOrIso(value: JsonValue | undefined, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1_000;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return unixOrIso(numeric, fallback);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const parsedFallback = Date.parse(fallback);
  if (!Number.isFinite(parsedFallback)) throw new Error("Provider received_at is invalid");
  return new Date(parsedFallback).toISOString();
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
