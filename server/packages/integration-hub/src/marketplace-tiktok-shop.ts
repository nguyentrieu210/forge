import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import type { ConnectorManifest } from "./catalog.js";
import {
  requireSignedProviderRequest,
  validateProviderSignedRequest,
  type ConnectorProviderAdapter,
  type ProviderSyncContext,
  type ProviderSignedResponse,
} from "./adapter.js";
import { validateSyncPage, type ExternalSyncPage } from "./sync.js";

const DEFAULT_API_BASE_URL = "https://open-api.tiktokglobalshop.com";
const DEFAULT_LOOKBACK_SECONDS = 3_600;
const DEFAULT_OVERLAP_SECONDS = 300;
const MAX_LOOKBACK_SECONDS = 15 * 24 * 60 * 60;
const MAX_OVERLAP_SECONDS = 6 * 60 * 60;
const CURSOR_PREFIX = "tts1";

export const TIKTOK_SHOP_MARKETPLACE_MANIFEST: ConnectorManifest = {
  schema_version: 1,
  connector_key: "tiktok-shop-orders",
  version: "0.1.0",
  provider: "tiktok_shop",
  display_name: "TikTok Shop Orders",
  category: "marketplace",
  auth_kinds: ["oauth2"],
  capabilities: ["poll", "pull_records", "cursor_sync"],
  config_schema_version: 1,
  description: "Pull TikTok Shop seller orders through the WS11 signed-request credential boundary.",
  docs_url: "https://partner.tiktokshop.com/docv2/page/get-order-list-202309",
};

interface TikTokShopAdapterOptions {
  now?: () => number;
}

interface TikTokShopConfig {
  api_base_url: string;
  shop_cipher: string;
  lookback_seconds: number;
  overlap_seconds: number;
}

interface TikTokCursor {
  watermark: number;
  window_end: number;
  page_token: string | null;
}

/**
 * TikTok Shop marketplace adapter.
 *
 * App secrets, access tokens and refresh tokens never enter this module. The adapter
 * describes a credential-free HTTPS request and delegates signing/token injection to
 * ProviderSignedRequestExecutor (WS11). This keeps provider auth separate from WS16
 * business normalization and ERP authority.
 */
export function createTikTokShopMarketplaceAdapter(options: TikTokShopAdapterOptions = {}): ConnectorProviderAdapter {
  const now = options.now ?? (() => Date.now());
  return {
    manifest: TIKTOK_SHOP_MARKETPLACE_MANIFEST,
    validateConfig(config) {
      parseConfig(config);
    },
    async fetchPage(context) {
      return fetchTikTokShopOrderPage(context, now);
    },
  };
}

async function fetchTikTokShopOrderPage(
  context: ProviderSyncContext,
  now: () => number,
): Promise<ExternalSyncPage<JsonObject>> {
  if (context.stream !== "orders") throw new Error("TikTok Shop adapter supports only the orders stream");
  if (!Number.isSafeInteger(context.limit) || context.limit <= 0 || context.limit > 100) {
    throw new Error("TikTok Shop order page limit must be 1..100");
  }

  const config = parseConfig(context.config ?? {});
  const signedRequest = requireSignedProviderRequest(context);
  const current = parseCursor(context.cursor);
  const nowSeconds = Math.floor(now() / 1_000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new Error("TikTok Shop sync clock is invalid");

  let watermark: number;
  let windowEnd: number;
  let pageToken: string | null;
  if (current && current.window_end > 0) {
    watermark = current.watermark;
    windowEnd = current.window_end;
    pageToken = current.page_token;
  } else {
    const previousWatermark = current?.watermark ?? Math.max(0, nowSeconds - config.lookback_seconds);
    watermark = Math.max(0, previousWatermark - config.overlap_seconds);
    windowEnd = nowSeconds;
    pageToken = null;
  }
  if (windowEnd < watermark) throw new Error("TikTok Shop sync cursor window is invalid");

  const url = new URL("/order/202309/orders/search", `${config.api_base_url}/`);
  url.searchParams.set("shop_cipher", config.shop_cipher);
  url.searchParams.set("page_size", String(context.limit));
  url.searchParams.set("sort_field", "update_time");
  url.searchParams.set("sort_order", "ASC");
  if (pageToken) url.searchParams.set("page_token", pageToken);

  const request = validateProviderSignedRequest({
    operation: "tiktok_shop.order.list.202309",
    method: "POST",
    url: url.toString(),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ update_time_ge: watermark, update_time_lt: windowEnd }),
  });
  const response = await signedRequest(request);
  const payload = parseTikTokResponse(response);
  const records = orderRecords(payload);
  if (records.length > context.limit) throw new Error("TikTok Shop returned more orders than requested");
  const nextPageToken = optionalText(readPath(payload, ["data", "next_page_token"]), 4_096);
  const hasMore = Boolean(nextPageToken);
  const nextCursor = hasMore
    ? encodeCursor({ watermark, window_end: windowEnd, page_token: nextPageToken! })
    : encodeCursor({ watermark: windowEnd, window_end: 0, page_token: null });

  return validateSyncPage({ records, next_cursor: nextCursor, has_more: hasMore }, context.limit);
}

function parseConfig(config: JsonObject): TikTokShopConfig {
  assertNoCredentialMaterial(config);
  const apiBaseUrl = optionalText(config.api_base_url, 512) ?? DEFAULT_API_BASE_URL;
  const parsedBase = safeApiBase(apiBaseUrl);
  const shopCipher = requiredText(config.shop_cipher, "shop_cipher", 320);
  const lookbackSeconds = integerOption(config.lookback_seconds, DEFAULT_LOOKBACK_SECONDS, 60, MAX_LOOKBACK_SECONDS, "lookback_seconds");
  const overlapSeconds = integerOption(config.overlap_seconds, DEFAULT_OVERLAP_SECONDS, 0, MAX_OVERLAP_SECONDS, "overlap_seconds");
  if (overlapSeconds > lookbackSeconds) throw new Error("TikTok Shop overlap_seconds must not exceed lookback_seconds");
  return {
    api_base_url: parsedBase,
    shop_cipher: shopCipher,
    lookback_seconds: lookbackSeconds,
    overlap_seconds: overlapSeconds,
  };
}

function safeApiBase(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("TikTok Shop api_base_url is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new Error("TikTok Shop api_base_url must be credential-free HTTPS");
  }
  if (url.hostname.toLowerCase() !== "open-api.tiktokglobalshop.com") {
    throw new Error("TikTok Shop api_base_url host is not allowed");
  }
  if (url.pathname !== "/" && url.pathname !== "") throw new Error("TikTok Shop api_base_url must not contain a path");
  return url.origin;
}

function parseTikTokResponse(response: ProviderSignedResponse): JsonObject {
  if (!Number.isSafeInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw new Error(`TikTok Shop order request failed with HTTP ${response.status}`);
  }
  let payload: unknown;
  try { payload = JSON.parse(response.body); } catch { throw new Error("TikTok Shop returned invalid JSON"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("TikTok Shop returned an invalid response envelope");
  const object = payload as JsonObject;
  const code = object.code;
  if (typeof code !== "number" || !Number.isSafeInteger(code)) throw new Error("TikTok Shop response code is invalid");
  if (code !== 0) {
    const message = optionalText(object.message, 320) ?? "provider error";
    throw new Error(`TikTok Shop API error ${code}: ${message}`);
  }
  return object;
}

function orderRecords(payload: JsonObject): JsonObject[] {
  const value = readPath(payload, ["data", "orders"]);
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("TikTok Shop response orders is invalid");
  if (value.length > 100) throw new Error("TikTok Shop response orders exceeds provider page maximum");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`TikTok Shop order ${index + 1} is invalid`);
    return entry as JsonObject;
  });
}

function encodeCursor(cursor: TikTokCursor): string {
  const token = cursor.page_token === null ? "-" : encodeURIComponent(cursor.page_token);
  return `${CURSOR_PREFIX}:${cursor.watermark}:${cursor.window_end}:${token}`;
}

function parseCursor(value: string | null): TikTokCursor | null {
  if (value === null) return null;
  if (value.length > 4_096 || /[\r\n\0]/.test(value)) throw new Error("TikTok Shop sync cursor is invalid");
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== CURSOR_PREFIX) throw new Error("TikTok Shop sync cursor version is invalid");
  const watermark = parseCursorInteger(parts[1], "watermark");
  const windowEnd = parseCursorInteger(parts[2], "window_end");
  let pageToken: string | null = null;
  if (parts[3] !== "-") {
    try { pageToken = decodeURIComponent(parts[3]!); } catch { throw new Error("TikTok Shop page token is invalid"); }
    if (!pageToken || pageToken.length > 4_096 || /[\r\n\0]/.test(pageToken)) throw new Error("TikTok Shop page token is invalid");
  }
  if (windowEnd === 0 && pageToken !== null) throw new Error("TikTok Shop stable cursor cannot contain a page token");
  return { watermark, window_end: windowEnd, page_token: pageToken };
}

function parseCursorInteger(value: string | undefined, field: string): number {
  if (!value || !/^\d{1,12}$/.test(value)) throw new Error(`TikTok Shop cursor ${field} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`TikTok Shop cursor ${field} is invalid`);
  return parsed;
}

function assertNoCredentialMaterial(config: JsonObject): void {
  for (const key of Object.keys(config)) {
    if (/access[-_]?token|refresh[-_]?token|app[-_]?secret|secret|private[-_]?key|authorization/i.test(key)) {
      throw new Error("TikTok Shop credentials must use the WS11 credential boundary");
    }
  }
}

function readPath(root: JsonObject, segments: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function integerOption(value: JsonValue | undefined, fallback: number, min: number, max: number, field: string): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`TikTok Shop ${field} is invalid`);
  return parsed;
}

function requiredText(value: JsonValue | undefined, field: string, max: number): string {
  const normalized = optionalText(value, max);
  if (!normalized) throw new Error(`TikTok Shop ${field} is required`);
  return normalized;
}

function optionalText(value: JsonValue | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) return undefined;
  return normalized;
}
