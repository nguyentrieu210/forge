import {
  buildShopeeSellerAuthorizationUrl,
  buildTikTokShopSellerAuthorizationUrl,
  exchangeShopeeAuthorizationCode,
} from "../../../packages/integration-hub/src/marketplace-authorization.js";
import {
  buildLazadaAuthorizationUrl,
  exchangeLazadaAuthorizationCode,
  exchangeTikTokShopAuthorizationCode,
} from "../../../packages/integration-hub/src/marketplace-signing.js";

type MarketplaceProvider = "shopee" | "lazada" | "tiktok_shop";

export interface MarketplaceOAuthEnv {
  CONTROL_DB: D1Database;
  DISPATCHER: DispatchNamespace;
  INTERNAL_SERVICE_TOKEN: string;
  PUBLIC_ORIGIN: string;
  SHOPEE_PARTNER_ID?: string;
  SHOPEE_PARTNER_KEY?: string;
  LAZADA_APP_KEY?: string;
  LAZADA_APP_SECRET?: string;
  TIKTOK_SHOP_APP_KEY?: string;
  TIKTOK_SHOP_APP_SECRET?: string;
  TIKTOK_SHOP_SERVICE_ID?: string;
  TIKTOK_SHOP_MARKET?: string;
}

interface TenantRoute {
  tenant_id: string;
  worker_name: string;
  status: string;
}

interface MarketplaceOAuthDescriptor {
  connection_id: string;
  provider: MarketplaceProvider;
  connection_status: string;
  scope: Record<string, unknown>;
}

interface MarketplaceOAuthRow {
  state_hash: string;
  tenant_id: string;
  provider: MarketplaceProvider;
  redirect_uri: string;
  expires_at: string;
  worker_name: string;
  return_url: string;
  actor_id: string;
  connection_id: string;
}

/**
 * Control-plane OAuth broker for marketplace seller authorization.
 *
 * State/TTL/routing live in the existing oauth_transactions authority. Platform app
 * registration secrets are Worker secrets. Seller tokens are exchanged in memory and
 * immediately sent to the tenant's encrypted credential vault; they are never persisted
 * in CONTROL_DB or returned to the browser.
 */
export async function routeMarketplaceOAuth(
  request: Request,
  url: URL,
  env: MarketplaceOAuthEnv,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/internal/oauth/marketplace/start") {
    return startMarketplaceOAuth(request, env);
  }
  const callback = url.pathname.match(/^\/oauth\/marketplace\/(shopee|lazada|tiktok_shop)\/callback$/);
  if (request.method === "GET" && callback) {
    return finishMarketplaceOAuth(url, callback[1] as MarketplaceProvider, env);
  }
  return null;
}

async function startMarketplaceOAuth(request: Request, env: MarketplaceOAuthEnv): Promise<Response> {
  if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${env.INTERNAL_SERVICE_TOKEN}`)) {
    return json({ error: { code: "INTERNAL_AUTH_REQUIRED" } }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: { code: "INVALID_JSON" } }, 400); }
  const tenantId = safeText(body.tenant_id, "tenant_id", 128);
  const actorId = safeText(body.actor_id, "actor_id", 320);
  const connectionId = safeText(body.connection_id, "connection_id", 160);
  const returnUrl = safeHttpsUrl(body.return_url, "return_url", 1_024);

  const route = await env.CONTROL_DB.prepare(
    "SELECT tenant_id,worker_name,status FROM tenant_routes WHERE route_key=?1",
  ).bind(returnUrl.hostname).first<TenantRoute>();
  if (!route || route.tenant_id !== tenantId || route.status !== "active") {
    return json({ error: { code: "TENANT_ROUTE_MISMATCH" } }, 403);
  }

  let descriptor: MarketplaceOAuthDescriptor;
  try { descriptor = await fetchDescriptor(env, route.worker_name, tenantId, connectionId); }
  catch { return json({ error: { code: "MARKETPLACE_CONNECTION_UNAVAILABLE" } }, 409); }
  if (descriptor.connection_status === "disabled") {
    return json({ error: { code: "MARKETPLACE_CONNECTION_DISABLED" } }, 409);
  }

  let authorizationUrl: string;
  const callbackUrl = `${origin(env.PUBLIC_ORIGIN)}/oauth/marketplace/${descriptor.provider}/callback`;
  const state = randomToken(32);
  try {
    authorizationUrl = await buildAuthorizationUrl(descriptor.provider, state, callbackUrl, env);
  } catch {
    return json({ error: { code: "MARKETPLACE_PROVIDER_NOT_CONFIGURED" } }, 503);
  }

  const stateHash = await sha256(state);
  const now = new Date();
  await env.CONTROL_DB.prepare(`
    INSERT INTO oauth_transactions(
      state_hash,tenant_id,provider,redirect_uri,expires_at,created_at,
      worker_name,return_url,actor_id,connection_id
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
  `).bind(
    stateHash,
    tenantId,
    descriptor.provider,
    callbackUrl,
    new Date(now.getTime() + 10 * 60_000).toISOString(),
    now.toISOString(),
    route.worker_name,
    returnUrl.toString(),
    actorId,
    connectionId,
  ).run();

  return json({
    authorization_url: authorizationUrl,
    expires_in: 600,
    provider: descriptor.provider,
    connection_id: connectionId,
  });
}

async function finishMarketplaceOAuth(
  url: URL,
  provider: MarketplaceProvider,
  env: MarketplaceOAuthEnv,
): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  if (!state || state.length > 1_000 || /[\r\n\0]/.test(state)) {
    return new Response("OAuth state is invalid", { status: 400 });
  }
  const stateHash = await sha256(state);
  const transaction = await env.CONTROL_DB.prepare(`
    SELECT state_hash,tenant_id,provider,redirect_uri,expires_at,worker_name,return_url,actor_id,connection_id
    FROM oauth_transactions
    WHERE state_hash=?1 AND provider=?2 AND connection_id IS NOT NULL AND consumed_at IS NULL
    LIMIT 1
  `).bind(stateHash, provider).first<MarketplaceOAuthRow>();
  if (!transaction || transaction.expires_at <= new Date().toISOString()) {
    return new Response("OAuth state is invalid or expired", { status: 400 });
  }

  const consumed = await env.CONTROL_DB.prepare(
    "UPDATE oauth_transactions SET consumed_at=?3 WHERE state_hash=?1 AND provider=?2 AND consumed_at IS NULL",
  ).bind(stateHash, provider, new Date().toISOString()).run();
  if ((consumed.meta?.changes ?? 0) !== 1) return new Response("OAuth state was already used", { status: 409 });

  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 4_096 || /[\r\n\0]/.test(code)) {
    return redirectResult(transaction.return_url, provider, "denied");
  }

  try {
    const descriptor = await fetchDescriptor(
      env,
      transaction.worker_name,
      transaction.tenant_id,
      transaction.connection_id,
    );
    if (descriptor.provider !== provider || descriptor.connection_id !== transaction.connection_id || descriptor.connection_status === "disabled") {
      return redirectResult(transaction.return_url, provider, "scope_changed");
    }

    const credentials = await exchangeCredentials(provider, code, url, descriptor, env);
    const response = await env.DISPATCHER.get(transaction.worker_name).fetch(
      `https://tenant.internal/internal/marketplace/connections/${encodeURIComponent(transaction.connection_id)}/credential`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
          "x-cloudforge-tenant": transaction.tenant_id,
        },
        body: JSON.stringify({ actor_id: transaction.actor_id, credentials }),
      },
    );
    if (!response.ok) return redirectResult(transaction.return_url, provider, "vault_error");
    return redirectResult(transaction.return_url, provider, "connected");
  } catch {
    return redirectResult(transaction.return_url, provider, "error");
  }
}

async function fetchDescriptor(
  env: MarketplaceOAuthEnv,
  workerName: string,
  tenantId: string,
  connectionId: string,
): Promise<MarketplaceOAuthDescriptor> {
  const response = await env.DISPATCHER.get(workerName).fetch(
    `https://tenant.internal/internal/marketplace/connections/${encodeURIComponent(connectionId)}/oauth-descriptor`,
    {
      method: "GET",
      headers: {
        "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
        "x-cloudforge-tenant": tenantId,
      },
    },
  );
  if (!response.ok) throw new Error("Marketplace OAuth descriptor request failed");
  const raw = await response.json() as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Marketplace OAuth descriptor is invalid");
  const value = raw as Record<string, unknown>;
  const provider = marketplaceProvider(value.provider);
  const observedConnectionId = safeText(value.connection_id, "connection_id", 160);
  if (observedConnectionId !== connectionId) throw new Error("Marketplace OAuth descriptor connection mismatch");
  const scope = value.scope && typeof value.scope === "object" && !Array.isArray(value.scope)
    ? value.scope as Record<string, unknown>
    : {};
  return {
    connection_id: observedConnectionId,
    provider,
    connection_status: safeText(value.connection_status, "connection_status", 40),
    scope,
  };
}

async function buildAuthorizationUrl(
  provider: MarketplaceProvider,
  state: string,
  redirectUri: string,
  env: MarketplaceOAuthEnv,
): Promise<string> {
  if (provider === "shopee") {
    return buildShopeeSellerAuthorizationUrl({
      partner_id: envText(env.SHOPEE_PARTNER_ID, "SHOPEE_PARTNER_ID"),
      partner_key: envSecret(env.SHOPEE_PARTNER_KEY, "SHOPEE_PARTNER_KEY"),
      redirect_uri: redirectUri,
      state,
    });
  }
  if (provider === "lazada") {
    return buildLazadaAuthorizationUrl({
      app_key: envText(env.LAZADA_APP_KEY, "LAZADA_APP_KEY"),
      redirect_uri: redirectUri,
      state,
    });
  }
  return buildTikTokShopSellerAuthorizationUrl({
    service_id: envText(env.TIKTOK_SHOP_SERVICE_ID, "TIKTOK_SHOP_SERVICE_ID"),
    state,
    market: tiktokMarket(env.TIKTOK_SHOP_MARKET),
  });
}

async function exchangeCredentials(
  provider: MarketplaceProvider,
  code: string,
  callbackUrl: URL,
  descriptor: MarketplaceOAuthDescriptor,
  env: MarketplaceOAuthEnv,
): Promise<Record<string, unknown>> {
  if (provider === "shopee") {
    const expectedShop = safeText(descriptor.scope.shop_id, "Shopee shop_id", 200);
    const callbackShop = safeText(callbackUrl.searchParams.get("shop_id"), "Shopee callback shop_id", 200);
    if (callbackShop !== expectedShop) throw new Error("Shopee callback shop scope mismatch");
    const partnerId = envText(env.SHOPEE_PARTNER_ID, "SHOPEE_PARTNER_ID");
    const partnerKey = envSecret(env.SHOPEE_PARTNER_KEY, "SHOPEE_PARTNER_KEY");
    const token = await exchangeShopeeAuthorizationCode({
      partner_id: partnerId,
      partner_key: partnerKey,
      code,
      shop_id: expectedShop,
    });
    return compactCredential({
      partner_id: partnerId,
      partner_key: partnerKey,
      access_token: requiredProviderSecret(token.access_token, "Shopee access_token"),
      refresh_token: optionalProviderSecret(token.refresh_token, "Shopee refresh_token"),
      expire_in: optionalProviderScalar(token.expire_in),
    });
  }

  if (provider === "lazada") {
    const appKey = envText(env.LAZADA_APP_KEY, "LAZADA_APP_KEY");
    const appSecret = envSecret(env.LAZADA_APP_SECRET, "LAZADA_APP_SECRET");
    const token = await exchangeLazadaAuthorizationCode({ app_key: appKey, app_secret: appSecret, code });
    return compactCredential({
      app_key: appKey,
      app_secret: appSecret,
      access_token: requiredProviderSecret(token.access_token, "Lazada access_token"),
      refresh_token: optionalProviderSecret(token.refresh_token, "Lazada refresh_token"),
      expires_in: optionalProviderScalar(token.expires_in),
      refresh_expires_in: optionalProviderScalar(token.refresh_expires_in),
    });
  }

  const appKey = envText(env.TIKTOK_SHOP_APP_KEY, "TIKTOK_SHOP_APP_KEY");
  const appSecret = envSecret(env.TIKTOK_SHOP_APP_SECRET, "TIKTOK_SHOP_APP_SECRET");
  const token = await exchangeTikTokShopAuthorizationCode({ app_key: appKey, app_secret: appSecret, auth_code: code });
  const data = objectRecord(token.data, "TikTok Shop token data");
  return compactCredential({
    app_key: appKey,
    app_secret: appSecret,
    access_token: requiredProviderSecret(data.access_token, "TikTok Shop access_token"),
    refresh_token: optionalProviderSecret(data.refresh_token, "TikTok Shop refresh_token"),
    access_token_expire_in: optionalProviderScalar(data.access_token_expire_in),
    refresh_token_expire_in: optionalProviderScalar(data.refresh_token_expire_in),
  });
}

function compactCredential(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function objectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} is invalid`);
  return value as Record<string, unknown>;
}

function requiredProviderSecret(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length < 4 || value.length > 8_192 || /[\r\n\0]/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function optionalProviderSecret(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : requiredProviderSecret(value, field);
}

function optionalProviderScalar(value: unknown): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number") return value;
  throw new Error("Marketplace token expiry is invalid");
}

function redirectResult(returnUrl: string, provider: MarketplaceProvider, result: string): Response {
  const target = new URL(returnUrl);
  target.searchParams.set("marketplace_oauth", result);
  target.searchParams.set("marketplace_provider", provider);
  return Response.redirect(target.toString(), 302);
}

function marketplaceProvider(value: unknown): MarketplaceProvider {
  if (value === "shopee" || value === "lazada" || value === "tiktok_shop") return value;
  throw new Error("Marketplace OAuth provider is invalid");
}

function tiktokMarket(value: string | undefined): "row" | "us" {
  if (!value || value === "row") return "row";
  if (value === "us") return "us";
  throw new Error("TIKTOK_SHOP_MARKET is invalid");
}

function envText(value: string | undefined, field: string): string {
  return safeText(value, field, 320);
}

function envSecret(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.length < 4 || value.length > 8_192 || /[\r\n\0]/.test(value)) throw new Error(`${field} is not configured`);
  return value;
}

function safeText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is invalid`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}

function safeHttpsUrl(value: unknown, field: string, max: number): URL {
  let url: URL;
  try { url = new URL(safeText(value, field, max)); }
  catch { throw new Error(`${field} is invalid`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error(`${field} is invalid`);
  return url;
}

function origin(value: string): string {
  const url = safeHttpsUrl(value, "PUBLIC_ORIGIN", 1_024);
  return url.origin;
}

function randomToken(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
