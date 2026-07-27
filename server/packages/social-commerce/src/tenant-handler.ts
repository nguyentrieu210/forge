import { sha256Hex, type SocialEventInput, type SocialQueueMessage } from "./index.js";
import { encryptCredential } from "./credentials.js";

export interface SocialIngestResult { inserted: number; duplicates: number; cart_updates: number }

export interface FacebookOAuthPage {
  id: string; name: string; access_token: string; page_key_hmac: string;
}

export async function storeFacebookOAuthPages(
  db: D1Database, tenantId: string, actorId: string, pages: FacebookOAuthPage[], kek: string,
): Promise<{ connected: number }> {
  if (!actorId || pages.length === 0 || pages.length > 500) throw new Error("Invalid Facebook OAuth payload");
  const now = new Date().toISOString();
  let connected = 0;
  for (const page of pages) {
    if (!page.id || !page.name || !page.access_token || !/^[a-f0-9]{64}$/.test(page.page_key_hmac)) throw new Error("Invalid Facebook Page payload");
    const connectionId = `facebook_${page.page_key_hmac.slice(0, 24)}`;
    const pageId = `page_${page.page_key_hmac.slice(0, 24)}`;
    const aad = `${tenantId}:${connectionId}:facebook`;
    const externalId = await encryptCredential(page.id, kek, `${aad}:external-id`);
    const accessToken = await encryptCredential(page.access_token, kek, `${aad}:access-token`);
    await db.prepare(
      `INSERT INTO social_connections(tenant_id,connection_id,provider,external_account_id_ciphertext,access_token_ciphertext,
       scopes_json,status,created_by,created_at,modified_at)
       VALUES(?1,?2,'facebook',?3,?4,?5,'active',?6,?7,?7)
       ON CONFLICT(tenant_id,connection_id) DO UPDATE SET external_account_id_ciphertext=excluded.external_account_id_ciphertext,
       access_token_ciphertext=excluded.access_token_ciphertext,scopes_json=excluded.scopes_json,status='active',modified_at=excluded.modified_at`,
    ).bind(tenantId, connectionId, externalId, accessToken,
      JSON.stringify(["pages_show_list", "pages_manage_metadata", "pages_read_engagement", "pages_manage_engagement"]), actorId, now).run();
    await db.prepare(
      `INSERT INTO social_pages(tenant_id,page_id,connection_id,provider,external_page_id_ciphertext,page_name,status,created_at,modified_at,page_key_hmac)
       VALUES(?1,?2,?3,'facebook',?4,?5,'active',?6,?6,?7)
       ON CONFLICT(tenant_id,page_id) DO UPDATE SET connection_id=excluded.connection_id,
       external_page_id_ciphertext=excluded.external_page_id_ciphertext,page_name=excluded.page_name,status='active',
       modified_at=excluded.modified_at,page_key_hmac=excluded.page_key_hmac`,
    ).bind(tenantId, pageId, connectionId, externalId, page.name.slice(0, 320), now, page.page_key_hmac).run();
    connected += 1;
  }
  return { connected };
}

export async function ingestFacebookMessage(db: D1Database, tenantId: string, message: SocialQueueMessage): Promise<SocialIngestResult> {
  if (message.schema_version !== 1 || message.provider !== "facebook" || message.tenant_id !== tenantId) {
    throw new Error("Social event tenant or schema mismatch");
  }
  const payload = JSON.parse(message.raw_body) as unknown;
  const events = await normalizeFacebookEvents(payload, message.event_id, message.received_at);
  let inserted = 0; let duplicates = 0; let cartUpdates = 0;
  for (const event of events) {
    const result = await db.prepare(
      `INSERT INTO social_events(tenant_id,event_id,provider,page_id,event_kind,external_actor_id,message_text,payload_json,occurred_at,received_at,processed_at)
       VALUES(?1,?2,'facebook',?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(tenant_id,event_id) DO NOTHING`,
    ).bind(tenantId, event.event_id, event.page_id, event.event_kind, event.external_actor_id ?? null,
      event.message_text ?? null, JSON.stringify(event.payload), event.occurred_at, message.received_at, new Date().toISOString()).run();
    if ((result.meta?.changes ?? 0) === 0) { duplicates += 1; continue; }
    inserted += 1;
    if (event.external_actor_id && event.message_text) cartUpdates += await applyKeywordRule(db, tenantId, event);
  }
  return { inserted, duplicates, cart_updates: cartUpdates };
}

async function applyKeywordRule(db: D1Database, tenantId: string, event: SocialEventInput): Promise<number> {
  const normalized = event.message_text!.trim();
  const rule = await db.prepare(
    `SELECT sku, quantity FROM social_keyword_rules
     WHERE tenant_id=?1 AND page_id=?2 AND status='active' AND keyword=?3 COLLATE NOCASE`,
  ).bind(tenantId, event.page_id, normalized).first<{ sku: string; quantity: number }>();
  if (!rule) return 0;
  const cartId = `cart_${(await sha256Hex(`${tenantId}:${event.page_id}:${event.external_actor_id}`)).slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO social_carts(tenant_id,cart_id,page_id,external_actor_id,status,created_at,modified_at)
     VALUES(?1,?2,?3,?4,'open',?5,?5)
     ON CONFLICT(tenant_id,cart_id) DO UPDATE SET modified_at=excluded.modified_at`,
  ).bind(tenantId, cartId, event.page_id, event.external_actor_id, now).run();
  await db.prepare(
    `INSERT INTO social_cart_items(tenant_id,cart_id,sku,quantity,source_event_id,modified_at)
     VALUES(?1,?2,?3,?4,?5,?6)
     ON CONFLICT(tenant_id,cart_id,sku) DO UPDATE SET quantity=quantity+excluded.quantity,
       source_event_id=excluded.source_event_id, modified_at=excluded.modified_at`,
  ).bind(tenantId, cartId, rule.sku, rule.quantity, event.event_id, now).run();
  return 1;
}

export async function normalizeFacebookEvents(payload: unknown, envelopeId: string, receivedAt: string): Promise<SocialEventInput[]> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];
  const output: SocialEventInput[] = [];
  let sequence = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const source = entry as { id?: unknown; time?: unknown; changes?: unknown; messaging?: unknown };
    if (typeof source.id !== "string") continue;
    const candidates = [
      ...(Array.isArray(source.changes) ? source.changes : []),
      ...(Array.isArray(source.messaging) ? source.messaging : []),
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const record = candidate as Record<string, unknown>;
      const value = record.value && typeof record.value === "object" && !Array.isArray(record.value)
        ? record.value as Record<string, unknown> : record;
      const from = value.from && typeof value.from === "object" && !Array.isArray(value.from)
        ? (value.from as Record<string, unknown>).id : undefined;
      const sender = record.sender && typeof record.sender === "object" && !Array.isArray(record.sender)
        ? (record.sender as Record<string, unknown>).id : undefined;
      const message = record.message && typeof record.message === "object" && !Array.isArray(record.message)
        ? (record.message as Record<string, unknown>).text : undefined;
      const text = typeof value.message === "string" ? value.message : typeof message === "string" ? message : undefined;
      const actor = typeof from === "string" ? from : typeof sender === "string" ? sender : undefined;
      const occurred = typeof source.time === "number" ? new Date(source.time * 1000).toISOString() : receivedAt;
      output.push({
        event_id: `${envelopeId}:${sequence++}`,
        provider: "facebook", page_id: source.id,
        event_kind: typeof record.field === "string" ? record.field : "message",
        ...(actor ? { external_actor_id: actor } : {}), ...(text ? { message_text: text } : {}),
        occurred_at: occurred, payload: record,
      });
    }
  }
  return output;
}
