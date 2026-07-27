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
  META_VERIFY_TOKEN: string;
  PAGE_DIRECTORY_HMAC_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
}

interface SocialRoute { tenant_id: string; worker_name: string; status: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/webhooks/facebook") {
      if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== env.META_VERIFY_TOKEN) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(url.searchParams.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain" } });
    }
    if (request.method !== "POST" || url.pathname !== "/webhooks/facebook") return new Response("Not found", { status: 404 });
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
      try {
        const body = message.body;
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
      } catch { message.retry({ delaySeconds: Math.min(300, 2 ** Math.min(message.attempts, 8)) }); }
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
