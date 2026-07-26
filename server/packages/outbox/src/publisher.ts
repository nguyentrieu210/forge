import type { DomainEvent } from "../../contracts/src/index.js";

interface OutboxRow {
  event_id: string;
  payload_json: string;
  attempts: number;
}

export async function publishPendingOutbox(
  db: D1Database,
  queue: Queue<DomainEvent>,
  tenantId: string,
  limit = 50,
): Promise<{ published: number; failed: number; skipped: number }> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 60_000).toISOString();
  const rows = await db.prepare(
    `SELECT event_id, payload_json, attempts FROM outbox
     WHERE tenant_id=?1
       AND (status IN ('pending','failed') OR (status='publishing' AND lease_until<?2))
     ORDER BY occurred_at LIMIT ?3`,
  ).bind(tenantId, now.toISOString(), limit).all<OutboxRow>();
  let published = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows.results ?? []) {
    const claim = await db.prepare(
      `UPDATE outbox SET status='publishing', lease_until=?3, attempts=attempts+1
       WHERE tenant_id=?1 AND event_id=?2
         AND (status IN ('pending','failed') OR (status='publishing' AND lease_until<?4))`,
    ).bind(tenantId, row.event_id, leaseUntil, now.toISOString()).run();
    if ((claim.meta?.changes ?? 0) !== 1) {
      skipped += 1;
      continue;
    }
    try {
      const event = JSON.parse(row.payload_json) as DomainEvent;
      await queue.send(event);
      await db.prepare(
        `UPDATE outbox SET status='published', published_at=?3, lease_until=NULL
         WHERE tenant_id=?1 AND event_id=?2 AND status='publishing'`,
      ).bind(tenantId, row.event_id, new Date().toISOString()).run();
      published += 1;
    } catch {
      await db.prepare(
        `UPDATE outbox SET status='failed', lease_until=NULL WHERE tenant_id=?1 AND event_id=?2`,
      ).bind(tenantId, row.event_id).run();
      failed += 1;
    }
  }
  return { published, failed, skipped };
}
