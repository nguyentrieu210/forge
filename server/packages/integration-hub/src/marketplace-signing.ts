import {
  validateProviderSignedRequest,
  type ProviderSignedRequest,
  type ProviderSignedRequestExecutor,
  type ProviderSignedResponse,
} from "./adapter.js";

export interface MarketplaceHttpClient {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface SignerOptions {
  http?: MarketplaceHttpClient;
  now?: () => number;
}

export interface ShopeeSignerCredentials {
  partner_id: string;
  partner_key: string;
  access_token: string;
  shop_id: string;
}

export interface LazadaSignerCredentials {
  app_key: string;
  app_secret: string;
  access_token: string;
}

export interface TikTokShopSignerCredentials {
  app_key: string;
  app_secret: string;
  access_token: string;
}

/**
 * Shopee OpenAPI v2 shop-level signer. Secrets are captured by this closure and are
 * never placed into ProviderSyncContext or handed to the provider adapter.
 */
export function createShopeeSignedRequestExecutor(
  rawCredentials: ShopeeSignerCredentials,
  options: SignerOptions = {},
): ProviderSignedRequestExecutor {
  const credentials = {
    partner_id: integerText(rawCredentials.partner_id, "Shopee partner_id"),
    partner_key: secretText(rawCredentials.partner_key, "Shopee partner_key"),
    access_token: secretText(rawCredentials.access_token, "Shopee access_token"),
    shop_id: integerText(rawCredentials.shop_id, "Shopee shop_id"),
  };
  const http = options.http ?? globalHttpClient();
  const now = options.now ?? Date.now;
  return async (rawRequest) => {
    const request = validateProviderSignedRequest(rawRequest);
    const url = checkedUrl(request.url, "Shopee", (host) => host === "partner.shopeemobile.com");
    rejectReservedParams(url, ["partner_id", "timestamp", "access_token", "sign"]);
    const existingShop = url.searchParams.get("shop_id");
    if (existingShop && existingShop !== credentials.shop_id) throw new Error("Shopee request shop_id does not match credential scope");
    url.searchParams.set("partner_id", credentials.partner_id);
    url.searchParams.set("timestamp", String(Math.floor(now() / 1_000)));
    url.searchParams.set("access_token", credentials.access_token);
    url.searchParams.set("shop_id", credentials.shop_id);
    const base = `${credentials.partner_id}${url.pathname}${url.searchParams.get("timestamp")!}${credentials.access_token}${credentials.shop_id}`;
    url.searchParams.set("sign", await hmacHex(credentials.partner_key, base, false));
    return execute(http, request, url, request.headers ?? {});
  };
}

/** Lazada LAZOP HMAC-SHA256 signer (uppercase hexadecimal result). */
export function createLazadaSignedRequestExecutor(
  rawCredentials: LazadaSignerCredentials,
  options: SignerOptions = {},
): ProviderSignedRequestExecutor {
  const credentials = {
    app_key: requiredText(rawCredentials.app_key, "Lazada app_key", 240),
    app_secret: secretText(rawCredentials.app_secret, "Lazada app_secret"),
    access_token: secretText(rawCredentials.access_token, "Lazada access_token"),
  };
  const http = options.http ?? globalHttpClient();
  const now = options.now ?? Date.now;
  return async (rawRequest) => {
    const request = validateProviderSignedRequest(rawRequest);
    const url = checkedUrl(request.url, "Lazada", lazadaApiHost);
    rejectReservedParams(url, ["app_key", "access_token", "timestamp", "sign_method", "sign"]);
    url.searchParams.set("app_key", credentials.app_key);
    url.searchParams.set("access_token", credentials.access_token);
    url.searchParams.set("timestamp", String(now()));
    url.searchParams.set("sign_method", "sha256");
    const apiName = lazadaApiName(url.pathname);
    const signingText = `${apiName}${sortedParameterText(url.searchParams)}${request.body ?? ""}`;
    url.searchParams.set("sign", await hmacHex(credentials.app_secret, signingText, true));
    return execute(http, request, url, request.headers ?? {});
  };
}

/** TikTok Shop HMAC-SHA256 signer with x-tts-access-token injection. */
export function createTikTokShopSignedRequestExecutor(
  rawCredentials: TikTokShopSignerCredentials,
  options: SignerOptions = {},
): ProviderSignedRequestExecutor {
  const credentials = {
    app_key: requiredText(rawCredentials.app_key, "TikTok Shop app_key", 240),
    app_secret: secretText(rawCredentials.app_secret, "TikTok Shop app_secret"),
    access_token: secretText(rawCredentials.access_token, "TikTok Shop access_token"),
  };
  const http = options.http ?? globalHttpClient();
  const now = options.now ?? Date.now;
  return async (rawRequest) => {
    const request = validateProviderSignedRequest(rawRequest);
    const url = checkedUrl(request.url, "TikTok Shop", (host) => host === "open-api.tiktokglobalshop.com");
    rejectReservedParams(url, ["app_key", "timestamp", "sign", "access_token"]);
    url.searchParams.set("app_key", credentials.app_key);
    url.searchParams.set("timestamp", String(Math.floor(now() / 1_000)));
    const headers = new Headers(request.headers ?? {});
    if (headers.has("x-tts-access-token")) throw new Error("TikTok Shop adapter must not inject access token");
    headers.set("x-tts-access-token", credentials.access_token);
    const contentType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const params = sortedParameterText(url.searchParams, new Set(["sign", "access_token"]));
    const body = contentType === "multipart/form-data" ? "" : request.body ?? "";
    const unsigned = `${url.pathname}${params}${body}`;
    const wrapped = `${credentials.app_secret}${unsigned}${credentials.app_secret}`;
    url.searchParams.set("sign", await hmacHex(credentials.app_secret, wrapped, false));
    return execute(http, request, url, Object.fromEntries(headers.entries()));
  };
}

/**
 * Lazada token APIs use the same LAZOP signature algorithm but do not yet have an
 * access_token. This helper deliberately returns token JSON to its caller and owns no
 * persistence; encrypted storage/rotation remains the credential-vault boundary.
 */
export async function exchangeLazadaAuthorizationCode(
  input: { app_key: string; app_secret: string; code: string },
  options: SignerOptions = {},
): Promise<Record<string, unknown>> {
  return callLazadaTokenApi("/auth/token/create", { code: requiredText(input.code, "Lazada authorization code", 2_000) }, input, options);
}

export async function refreshLazadaAccessToken(
  input: { app_key: string; app_secret: string; refresh_token: string },
  options: SignerOptions = {},
): Promise<Record<string, unknown>> {
  return callLazadaTokenApi("/auth/token/refresh", { refresh_token: secretText(input.refresh_token, "Lazada refresh_token") }, input, options);
}

/** TikTok Shop token endpoints are separate from signed business OpenAPI calls. */
export async function exchangeTikTokShopAuthorizationCode(
  input: { app_key: string; app_secret: string; auth_code: string },
  options: SignerOptions = {},
): Promise<Record<string, unknown>> {
  return callTikTokTokenApi("/api/v2/token/get", {
    app_key: requiredText(input.app_key, "TikTok Shop app_key", 240),
    app_secret: secretText(input.app_secret, "TikTok Shop app_secret"),
    auth_code: requiredText(input.auth_code, "TikTok Shop auth_code", 2_000),
    grant_type: "authorized_code",
  }, options);
}

export async function refreshTikTokShopAccessToken(
  input: { app_key: string; app_secret: string; refresh_token: string },
  options: SignerOptions = {},
): Promise<Record<string, unknown>> {
  return callTikTokTokenApi("/api/v2/token/refresh", {
    app_key: requiredText(input.app_key, "TikTok Shop app_key", 240),
    app_secret: secretText(input.app_secret, "TikTok Shop app_secret"),
    refresh_token: secretText(input.refresh_token, "TikTok Shop refresh_token"),
    grant_type: "refresh_token",
  }, options);
}

export function buildLazadaAuthorizationUrl(input: { app_key: string; redirect_uri: string; state?: string }): string {
  const redirect = callbackUrl(input.redirect_uri, "Lazada redirect_uri");
  const url = new URL("https://auth.lazada.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("force_auth", "true");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("client_id", requiredText(input.app_key, "Lazada app_key", 240));
  if (input.state) url.searchParams.set("state", requiredText(input.state, "OAuth state", 1_000));
  return url.href;
}

async function callLazadaTokenApi(
  apiName: "/auth/token/create" | "/auth/token/refresh",
  business: Record<string, string>,
  rawCredentials: { app_key: string; app_secret: string },
  options: SignerOptions,
): Promise<Record<string, unknown>> {
  const appKey = requiredText(rawCredentials.app_key, "Lazada app_key", 240);
  const appSecret = secretText(rawCredentials.app_secret, "Lazada app_secret");
  const now = options.now ?? Date.now;
  const url = new URL(`https://auth.lazada.com/rest${apiName}`);
  for (const [key, value] of Object.entries(business)) url.searchParams.set(key, value);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("sign_method", "sha256");
  url.searchParams.set("timestamp", String(now()));
  url.searchParams.set("sign", await hmacHex(appSecret, `${apiName}${sortedParameterText(url.searchParams)}`, true));
  const response = await (options.http ?? globalHttpClient()).fetch(url, { method: "GET", headers: { accept: "application/json" } });
  return parseTokenResponse(response, "Lazada token exchange");
}

async function callTikTokTokenApi(pathname: string, parameters: Record<string, string>, options: SignerOptions): Promise<Record<string, unknown>> {
  const url = new URL(`https://auth.tiktok-shops.com${pathname}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await (options.http ?? globalHttpClient()).fetch(url, { method: "GET", headers: { accept: "application/json" } });
  return parseTokenResponse(response, "TikTok Shop token exchange");
}

async function execute(
  http: MarketplaceHttpClient,
  request: ProviderSignedRequest,
  url: URL,
  headerValues: Readonly<Record<string, string>>,
): Promise<ProviderSignedResponse> {
  const response = await http.fetch(url, {
    method: request.method,
    headers: headerValues,
    ...(request.body === undefined ? {} : { body: request.body }),
  });
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error("Marketplace provider response exceeds limit");
  return { status: response.status, body, headers: safeResponseHeaders(response.headers) };
}

async function parseTokenResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (body.length === 0 || body.length > 1_000_000) throw new Error(`${label} returned an invalid body`);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error(`${label} returned invalid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} returned an invalid payload`);
  const value = parsed as Record<string, unknown>;
  const providerCode = value.code;
  if (providerCode !== undefined && providerCode !== 0 && providerCode !== "0") throw new Error(`${label} was rejected by provider`);
  return value;
}

function safeResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ["content-type", "date", "retry-after", "x-request-id", "request-id"]) {
    const value = headers.get(name);
    if (value) result[name] = value.slice(0, 2_000);
  }
  return result;
}

function sortedParameterText(params: URLSearchParams, excluded = new Set<string>(["sign"])): string {
  const entries = [...params.entries()].filter(([key]) => !excluded.has(key));
  const seen = new Set<string>();
  for (const [key] of entries) {
    if (seen.has(key)) throw new Error(`Duplicate provider query parameter ${key}`);
    seen.add(key);
  }
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return entries.map(([key, value]) => `${key}${value}`).join("");
}

function lazadaApiName(pathname: string): string {
  if (!pathname.startsWith("/rest/")) throw new Error("Lazada API path must be under /rest/");
  return `/${pathname.slice("/rest/".length)}`;
}

function rejectReservedParams(url: URL, names: readonly string[]): void {
  for (const name of names) if (url.searchParams.has(name)) throw new Error(`Provider adapter must not inject reserved parameter ${name}`);
}

function checkedUrl(raw: string, provider: string, hostAllowed: (host: string) => boolean): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${provider} request URL is invalid`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !hostAllowed(url.hostname.toLowerCase())) {
    throw new Error(`${provider} request host is not allowed`);
  }
  return url;
}

function lazadaApiHost(host: string): boolean {
  return /^api\.lazada\.(?:com|vn|sg|my|co\.id|co\.th|com\.ph)$/.test(host);
}

async function hmacHex(secret: string, message: string, uppercase: boolean): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return uppercase ? hex.toUpperCase() : hex;
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
