import type { MarketplaceHttpClient, SignerOptions } from "./marketplace-signing.js";

export function buildTikTokShopSellerAuthorizationUrl(input: {
  service_id: string;
  state: string;
  market?: "row" | "us";
}): string {
  const serviceId = requiredText(input.service_id, "TikTok Shop service_id", 240);
  const state = requiredText(input.state, "OAuth state", 1_000);
  const origin = input.market === "us" ? "https://services.us.tiktokshop.com" : "https://services.tiktokshop.com";
  const url = new URL("/open/authorize", origin);
  url.searchParams.set("service_id", serviceId);
  url.searchParams.set("state", state);
  return url.href;
}

export interface ShopeeAuthorizationCredentials {
  partner_id: string;
  partner_key: string;
}

export function buildShopeeSellerAuthorizationUrl(
  input: ShopeeAuthorizationCredentials & { redirect_uri: string; state?: string },
  options: Pick<SignerOptions, "now"> = {},
): Promise<string> {
  return buildShopeeAuthorizationUrlInternal(input, options);
}

export async function exchangeShopeeAuthorizationCode(
  input: ShopeeAuthorizationCredentials & { code: string; shop_id: string },
  options: SignerOptions = {},
): Promise<Record<string, unknown>> {
  return callShopeeAuthApi("/api/v2/auth/token/get", {
    code: requiredText(input.code, "Shopee authorization code", 2_000),
    shop_id: integerText(input.shop_id, "Shopee shop_id"),
    partner_id: Number(integerText(input.partner_id, "Shopee partner_id")),
  }, input, options);
}

export async function refreshShopeeAccessToken(
  input: ShopeeAuthorizationCredentials & { refresh_token: string; shop_id: string },
  options: SignerOptions = {},
): Promise<Record<string, unknown>> {
  return callShopeeAuthApi("/api/v2/auth/access_token/get", {
    refresh_token: secretText(input.refresh_token, "Shopee refresh_token"),
    shop_id: integerText(input.shop_id, "Shopee shop_id"),
    partner_id: Number(integerText(input.partner_id, "Shopee partner_id")),
  }, input, options);
}

async function buildShopeeAuthorizationUrlInternal(
  input: ShopeeAuthorizationCredentials & { redirect_uri: string; state?: string },
  options: Pick<SignerOptions, "now">,
): Promise<string> {
  const partnerId = integerText(input.partner_id, "Shopee partner_id");
  const partnerKey = secretText(input.partner_key, "Shopee partner_key");
  const timestamp = Math.floor((options.now ?? Date.now)() / 1_000);
  const path = "/api/v2/shop/auth_partner";
  const sign = await hmacHex(partnerKey, `${partnerId}${path}${timestamp}`);
  const url = new URL(path, "https://partner.shopeemobile.com");
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  url.searchParams.set("redirect", callbackUrl(input.redirect_uri, "Shopee redirect_uri"));
  if (input.state) url.searchParams.set("state", requiredText(input.state, "OAuth state", 1_000));
  return url.href;
}

async function callShopeeAuthApi(
  path: "/api/v2/auth/token/get" | "/api/v2/auth/access_token/get",
  body: Record<string, string | number>,
  rawCredentials: ShopeeAuthorizationCredentials,
  options: SignerOptions,
): Promise<Record<string, unknown>> {
  const partnerId = integerText(rawCredentials.partner_id, "Shopee partner_id");
  const partnerKey = secretText(rawCredentials.partner_key, "Shopee partner_key");
  const timestamp = Math.floor((options.now ?? Date.now)() / 1_000);
  const sign = await hmacHex(partnerKey, `${partnerId}${path}${timestamp}`);
  const url = new URL(path, "https://partner.shopeemobile.com");
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  const response = await (options.http ?? globalHttpClient()).fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseProviderJson(response, "Shopee authorization");
}

async function parseProviderJson(response: Response, label: string): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (raw.length === 0 || raw.length > 1_000_000) throw new Error(`${label} returned an invalid body`);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${label} returned invalid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} returned an invalid payload`);
  const result = parsed as Record<string, unknown>;
  if (typeof result.error === "string" && result.error) throw new Error(`${label} was rejected by provider`);
  return result;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function globalHttpClient(): MarketplaceHttpClient {
  return { fetch: (input, init) => globalThis.fetch(input, init) };
}
function integerText(value: string, field: string): string {
  const normalized = requiredText(value, field, 40);
  if (!/^\d+$/.test(normalized)) throw new Error(`${field} must be numeric`);
  return normalized;
}
function secretText(value: string, field: string): string {
  if (typeof value !== "string" || value.length < 4 || value.length > 8_192 || /[\r\n\0]/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}
function requiredText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
function callbackUrl(value: string, field: string): string {
  let url: URL;
  try { url = new URL(requiredText(value, field, 2_000)); } catch { throw new Error(`${field} is invalid`); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error(`${field} is invalid`);
  if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error(`${field} must use HTTPS outside localhost`);
  return url.href;
}
