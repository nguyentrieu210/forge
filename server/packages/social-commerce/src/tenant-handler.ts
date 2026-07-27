import { sha256Hex, type SocialEventInput, type SocialQueueMessage } from "./index.js";

export interface SocialIngestResult { inserted: number; duplicates: number; cart_updates: number }

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
