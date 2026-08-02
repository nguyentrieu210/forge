import {
  deriveFacebookEventId, extractFacebookPageIds, hmacHex, verifyMetaSignature,
  type SocialQueueMessage,
} from "../../../packages/social-commerce/src/index.js";

interface Env {
  CONTROL_DB: D1Database;
  ROUTES: KVNamespace;
  SOCIAL_EVENTS: Queue<SocialQueueMessage>;
  DISPATCHER: DispatchNamespace;
  META_APP_SECRET: string;
  META_APP_ID: string;
  META_VERIFY_TOKEN: string;
  META_GRAPH_VERSION?: string;
  PUBLIC_ORIGIN: string;
  PAGE_DIRECTORY_HMAC_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
}

interface SocialRoute { tenant_id: string; worker_name: string; status: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/oauth/facebook/start") {
      if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${env.INTERNAL_SERVICE_TOKEN}`)) {
        return json({ error: { code: "INTERNAL_AUTH_REQUIRED" } }, 401);
      }
      if (!env.META_APP_ID || !env.META_APP_SECRET || !env.PAGE_DIRECTORY_HMAC_SECRET) {
        return json({ error: { code: "FACEBOOK_NOT_CONFIGURED" } }, 503);
      }
      const body = await request.json() as Record<string, unknown>;
      const tenantId = requireText(body.tenant_id, "tenant_id", 128);
      const actorId = requireText(body.actor_id, "actor_id", 320);
      const returnUrl = new URL(requireText(body.return_url, "return_url", 1_024));
      if (returnUrl.protocol !== "https:") return json({ error: { code: "INVALID_RETURN_URL" } }, 422);
      const route = await env.CONTROL_DB.prepare(
        "SELECT tenant_id,worker_name,status FROM tenant_routes WHERE route_key=?1",
      ).bind(returnUrl.hostname).first<SocialRoute>();
      if (!route || route.tenant_id !== tenantId || route.status !== "active") {
        return json({ error: { code: "TENANT_ROUTE_MISMATCH" } }, 403);
      }
      const state = randomToken(32);
      const stateHash = await sha256(state);
      const now = new Date();
      await env.CONTROL_DB.prepare(
        `INSERT INTO oauth_transactions(state_hash,tenant_id,provider,redirect_uri,expires_at,created_at,worker_name,return_url,actor_id)
         VALUES(?1,?2,'facebook',?3,?4,?5,?6,?7,?8)`,
      ).bind(stateHash, tenantId, `${env.PUBLIC_ORIGIN}/oauth/facebook/callback`, new Date(now.getTime() + 10 * 60_000).toISOString(),
        now.toISOString(), route.worker_name, returnUrl.toString(), actorId).run();
      const authorize = new URL("https://www.facebook.com/dialog/oauth");
      authorize.searchParams.set("client_id", env.META_APP_ID);
      authorize.searchParams.set("redirect_uri", `${env.PUBLIC_ORIGIN}/oauth/facebook/callback`);
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", "pages_show_list,pages_manage_metadata,pages_read_engagement,pages_manage_engagement");
      return json({ authorization_url: authorize.toString(), expires_in: 600 });
    }
    if (request.method === "GET" && url.pathname === "/oauth/facebook/callback") {
      return finishFacebookOAuth(url, env);
    }
    if (request.method === "GET" && url.pathname === "/webhooks/facebook") {
      if (!env.META_VERIFY_TOKEN) return new Response("Facebook integration is not configured", { status: 503 });
      if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== env.META_VERIFY_TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(url.searchParams.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain" } });
    }
    if (request.method !== "POST" || url.pathname !== "/webhooks/facebook") return new Response("Not found", { status: 404 });
    if (!env.META_APP_SECRET || !env.PAGE_DIRECTORY_HMAC_SECRET) {
      return new Response("Facebook integration is not configured", { status: 503 });
    }
    const rawBody = await readBoundedBody(request, 1_000_000);
    if (!await verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET)) {
      return new Response("Invalid signature", { status: 401 });
    }
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const pageIds = extractFacebookPageIds(payload);
    const eventId = await deriveFacebookEventId(rawBody);
    const receivedAt = new Date().toISOString();
    for (const pageId of pageIds) {
      const pageKey = await hmacHex(env.PAGE_DIRECTORY_HMAC_SECRET, `facebook:${pageId}`);
      const route = await env.CONTROL_DB.prepare(
        "SELECT tenant_id,worker_name,status FROM social_page_routes WHERE page_key_hmac=?1 AND provider='facebook'",
      ).bind(pageKey).first<SocialRoute>();
      if (!route || route.status !== "active") continue;
      await env.SOCIAL_EVENTS.send({ schema_version: 1, tenant_id: route.tenant_id, worker_name: route.worker_name,
        provider: "facebook", page_key_hmac: pageKey, event_id: eventId, received_at: receivedAt, raw_body: rawBody });
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  },

  async queue(batch: MessageBatch<SocialQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      let tenantId = "unknown";
      let eventId = "unknown";
      try {
        const body = message.body;
        tenantId = body.tenant_id || "unknown";
        eventId = body.event_id || "unknown";
        if (body.schema_version !== 1 || body.provider !== "facebook") throw new Error("Unsupported social message");
        const routeRaw = await env.ROUTES.get(`__tenant__:${body.tenant_id}`);
        if (!routeRaw) throw new Error("Tenant route is missing");
        const route = JSON.parse(routeRaw) as SocialRoute;
        if (route.status !== "active" || route.worker_name !== body.worker_name || route.tenant_id !== body.tenant_id) {
          throw new Error("Tenant route changed or is inactive");
        }
        const response = await env.DISPATCHER.get(route.worker_name).fetch("https://tenant.internal/internal/social/events", {
          method: "POST", headers: { "content-type": "application/json", "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
            "x-cloudforge-tenant": body.tenant_id, "x-cloudforge-idempotency-key": body.event_id }, body: JSON.stringify(body),
        });
        if (!response.ok || response.headers.get("x-cloudforge-social-event-committed") !== body.event_id) {
          throw new Error(`Tenant social ingest failed with ${response.status}`);
        }
        message.ack();
      } catch (error) {
        const delaySeconds = Math.min(300, 2 ** Math.min(message.attempts, 8));
        console.error(JSON.stringify({
          level: "error",
          service: "social-ingress-worker",
          code: "SOCIAL_EVENT_RETRY",
          tenant_id: tenantId,
          event_id: eventId,
          attempts: message.attempts,
          retry_delay_seconds: delaySeconds,
          error_name: error instanceof Error ? error.name : "UnknownError",
        }));
        message.retry({ delaySeconds });
      }
    }
  },
};

async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Payload too large");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error("Payload too large");
  return body;
}

interface OAuthRow {
  state_hash: string; tenant_id: string; redirect_uri: string; expires_at: string;
  worker_name: string; return_url: string; actor_id: string;
}

async function finishFacebookOAuth(url: URL, env: Env): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || !code) return new Response("OAuth callback is incomplete", { status: 400 });
  const stateHash = await sha256(state);
  const transaction = await env.CONTROL_DB.prepare(
    `SELECT state_hash,tenant_id,redirect_uri,expires_at,worker_name,return_url,actor_id FROM oauth_transactions
     WHERE state_hash=?1 AND provider='facebook' AND consumed_at IS NULL`,
  ).bind(stateHash).first<OAuthRow>();
  if (!transaction || transaction.expires_at <= new Date().toISOString()) return new Response("OAuth state is invalid or expired", { status: 400 });
  const consumed = await env.CONTROL_DB.prepare(
    "UPDATE oauth_transactions SET consumed_at=?2 WHERE state_hash=?1 AND consumed_at IS NULL",
  ).bind(stateHash, new Date().toISOString()).run();
  if ((consumed.meta?.changes ?? 0) !== 1) return new Response("OAuth state was already used", { status: 409 });

  const version = env.META_GRAPH_VERSION ?? "v23.0";
  const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", env.META_APP_ID);
  tokenUrl.searchParams.set("client_secret", env.META_APP_SECRET);
  tokenUrl.searchParams.set("redirect_uri", transaction.redirect_uri);
  tokenUrl.searchParams.set("code", code);
  const tokenResponse = await fetch(tokenUrl, { headers: { accept: "application/json" } });
  if (!tokenResponse.ok) return redirectResult(transaction.return_url, "error");
  const tokenBody = await tokenResponse.json() as { access_token?: unknown };
  if (typeof tokenBody.access_token !== "string") return redirectResult(transaction.return_url, "error");

  const pagesUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,access_token");
  pagesUrl.searchParams.set("access_token", tokenBody.access_token);
  const pagesResponse = await fetch(pagesUrl, { headers: { accept: "application/json" } });
  if (!pagesResponse.ok) return redirectResult(transaction.return_url, "error");
  const pagesBody = await pagesResponse.json() as { data?: unknown };
  const pages = Array.isArray(pagesBody.data) ? pagesBody.data.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const page = item as Record<string, unknown>;
    return typeof page.id === "string" && typeof page.name === "string" && typeof page.access_token === "string"
      ? [{ id: page.id, name: page.name, access_token: page.access_token }] : [];
  }) : [];
  if (pages.length === 0) return redirectResult(transaction.return_url, "no_pages");
  const routedPages = await Promise.all(pages.map(async (page) => ({ ...page,
    page_key_hmac: await hmacHex(env.PAGE_DIRECTORY_HMAC_SECRET, `facebook:${page.id}`),
  })));
  const response = await env.DISPATCHER.get(transaction.worker_name).fetch("https://tenant.internal/internal/social/oauth/facebook", {
    method: "POST", headers: { "content-type": "application/json", "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
      "x-cloudforge-tenant": transaction.tenant_id },
    body: JSON.stringify({ actor_id: transaction.actor_id, pages: routedPages }),
  });
  if (!response.ok) return redirectResult(transaction.return_url, "error");
  for (const page of routedPages) {
    await env.CONTROL_DB.prepare(
      `INSERT INTO social_page_routes(page_key_hmac,tenant_id,worker_name,provider,status,routing_version,modified_at)
       VALUES(?1,?2,?3,'facebook','active',1,?4)
       ON CONFLICT(page_key_hmac) DO UPDATE SET tenant_id=excluded.tenant_id,worker_name=excluded.worker_name,
       status='active',routing_version=social_page_routes.routing_version+1,modified_at=excluded.modified_at`,
    ).bind(page.page_key_hmac, transaction.tenant_id, transaction.worker_name, new Date().toISOString()).run();
  }
  return redirectResult(transaction.return_url, "connected");
}

function redirectResult(returnUrl: string, result: string): Response {
  const target = new URL(returnUrl); target.searchParams.set("facebook", result);
  return Response.redirect(target.toString(), 302);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${field} is invalid`);
  return value.trim();
}

function randomToken(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = ""; for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
