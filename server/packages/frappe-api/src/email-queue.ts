/**
 * Durable Email Queue and provider-neutral transport seam.
 *
 * Frappe queues mail after commit and lets a separate worker perform physical delivery.
 * Forge keeps that boundary: business/notification code only enqueues, tenant maintenance
 * claims due rows, and a trusted deployment-provided HTTPS relay performs the send.
 */

import { sha256Hex } from "../../core/src/index.js";

export interface EmailQueueInput {
  dedupeKey: string;
  sourceKind: "notification" | "workflow";
  sourceName: string;
  recipientUser: string;
  recipientEmail: string;
  subject: string;
  message: string;
  senderEmail?: string;
  referenceDoctype?: string;
  referenceName?: string;
  maxAttempts?: number;
}

export interface QueuedEmail {
  name: string;
  recipient_user: string;
  recipient_email: string;
  sender_email: string | null;
  subject: string;
  message: string;
  reference_doctype: string | null;
  reference_name: string | null;
  attempt_count: number;
  max_attempts: number;
}

export interface EmailTransportMessage {
  queueName: string;
  to: string;
  from?: string;
  subject: string;
  message: string;
  referenceDoctype?: string;
  referenceName?: string;
}

export interface EmailTransport {
  send(message: EmailTransportMessage): Promise<{ providerMessageId?: string }>;
}

export interface EmailQueueRunResult {
  configured: boolean;
  pending: number;
  claimed: number;
  sent: number;
  failed: number;
  exhausted: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function boundedText(value: string, field: string, max: number): string {
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} must be 1..${max} characters`);
  return text;
}

function emailAddress(value: string, field: string): string {
  const normalized = boundedText(value, field, 320).toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new Error(`${field} is not a valid email address`);
  return normalized;
}

export class D1EmailQueueStore {
  constructor(private readonly db: D1Database) {}

  async enqueue(tenantId: string, input: EmailQueueInput, now: string): Promise<{ name: string; created: boolean }> {
    const dedupeKey = boundedText(input.dedupeKey, "dedupeKey", 1000);
    const name = `EMAIL-${(await sha256Hex(`${tenantId}\u0000${dedupeKey}`)).slice(0, 40)}`;
    const recipientEmail = emailAddress(input.recipientEmail, "recipientEmail");
    const subject = boundedText(input.subject, "subject", 998);
    const message = boundedText(input.message, "message", 200_000);
    const maxAttempts = Math.min(Math.max(input.maxAttempts ?? 5, 1), 20);
    const result = await this.db.prepare(
      `INSERT INTO email_queue(
         tenant_id,name,dedupe_key,source_kind,source_name,recipient_user,recipient_email,
         sender_email,subject,message,reference_doctype,reference_name,status,attempt_count,
         max_attempts,send_after,created_at,modified_at
       ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'Pending',0,?13,?14,?14,?14)
       ON CONFLICT(tenant_id,dedupe_key) DO NOTHING`,
    ).bind(
      tenantId,
      name,
      dedupeKey,
      input.sourceKind,
      boundedText(input.sourceName, "sourceName", 320),
      boundedText(input.recipientUser, "recipientUser", 320),
      recipientEmail,
      input.senderEmail ? emailAddress(input.senderEmail, "senderEmail") : null,
      subject,
      message,
      input.referenceDoctype ?? null,
      input.referenceName ?? null,
      maxAttempts,
      now,
    ).run();
    return { name, created: (result.meta?.changes ?? 0) === 1 };
  }

  async pendingCount(tenantId: string): Promise<number> {
    const row = await this.db.prepare(
      `SELECT COUNT(*) AS count FROM email_queue
        WHERE tenant_id=?1 AND status<>'Sent' AND attempt_count<max_attempts`,
    ).bind(tenantId).first<{ count: number }>();
    return Number(row?.count ?? 0);
  }
}

/**
 * A trusted HTTPS relay contract, not a vendor-specific API.
 *
 * Deployment may point this at an internal provider worker or gateway adapter. The token
 * stays in Worker secrets and is never persisted in Email Queue rows or provider evidence.
 */
export class HttpEmailTransport implements EmailTransport {
  private readonly endpoint: string;

  constructor(
    endpoint: string,
    private readonly defaultFrom: string,
    private readonly bearerToken?: string,
  ) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") throw new Error("Email transport endpoint must use HTTPS");
    this.endpoint = url.toString();
    emailAddress(defaultFrom, "EMAIL_FROM");
  }

  async send(message: EmailTransportMessage): Promise<{ providerMessageId?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
        },
        body: JSON.stringify({
          from: message.from ?? this.defaultFrom,
          to: message.to,
          subject: message.subject,
          message: message.message,
          idempotency_key: message.queueName,
          reference: message.referenceDoctype && message.referenceName
            ? { doctype: message.referenceDoctype, name: message.referenceName }
            : undefined,
        }),
      });
      if (!response.ok) throw new Error(`Email relay returned HTTP ${response.status}`);
      const headerId = response.headers.get("x-message-id")?.trim();
      let bodyId: string | undefined;
      if (!headerId && (response.headers.get("content-type") ?? "").includes("application/json")) {
        try {
          const body = await response.json() as { id?: unknown; message_id?: unknown };
          const candidate = typeof body.id === "string" ? body.id : typeof body.message_id === "string" ? body.message_id : undefined;
          if (candidate?.trim()) bodyId = candidate.trim().slice(0, 320);
        } catch {
          // Delivery success does not depend on a provider returning JSON evidence.
        }
      }
      return { ...(headerId ? { providerMessageId: headerId.slice(0, 320) } : bodyId ? { providerMessageId: bodyId } : {}) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function retryAt(now: string, attempt: number): string {
  const base = Date.parse(now);
  if (!Number.isFinite(base)) throw new Error("Invalid Email Queue clock");
  const seconds = Math.min(6 * 60 * 60, 60 * (2 ** Math.max(0, attempt - 1)));
  return new Date(base + seconds * 1000).toISOString();
}

/** Claims and delivers a bounded batch. A crashed Sending row is reclaimable after 15m. */
export async function runEmailQueue(
  db: D1Database,
  tenantId: string,
  transport: EmailTransport | null,
  now: string,
  limit = 50,
): Promise<EmailQueueRunResult> {
  if (!transport) {
    return {
      configured: false,
      pending: await new D1EmailQueueStore(db).pendingCount(tenantId),
      claimed: 0,
      sent: 0,
      failed: 0,
      exhausted: 0,
    };
  }

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid Email Queue clock");
  const stale = new Date(nowMs - 15 * 60 * 1000).toISOString();
  await db.prepare(
    `UPDATE email_queue SET status='Error',send_after=?3,last_error='Recovered stale Sending claim',modified_at=?3
      WHERE tenant_id=?1 AND status='Sending' AND modified_at<=?2 AND attempt_count<max_attempts`,
  ).bind(tenantId, stale, now).run();

  const bounded = Math.min(Math.max(limit, 1), 200);
  const candidates = await db.prepare(
    `SELECT name FROM email_queue
      WHERE tenant_id=?1 AND status IN ('Pending','Error') AND attempt_count<max_attempts
        AND send_after<=?2
      ORDER BY send_after,created_at,name
      LIMIT ?3`,
  ).bind(tenantId, now, bounded).all<{ name: string }>();

  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let exhausted = 0;

  for (const candidate of candidates.results ?? []) {
    const row = await db.prepare(
      `UPDATE email_queue
          SET status='Sending',attempt_count=attempt_count+1,modified_at=?3,last_error=NULL
        WHERE tenant_id=?1 AND name=?2 AND status IN ('Pending','Error')
          AND attempt_count<max_attempts AND send_after<=?3
        RETURNING name,recipient_user,recipient_email,sender_email,subject,message,
                  reference_doctype,reference_name,attempt_count,max_attempts`,
    ).bind(tenantId, candidate.name, now).first<QueuedEmail>();
    if (!row) continue;
    claimed += 1;

    try {
      const result = await transport.send({
        queueName: row.name,
        to: row.recipient_email,
        ...(row.sender_email ? { from: row.sender_email } : {}),
        subject: row.subject,
        message: row.message,
        ...(row.reference_doctype ? { referenceDoctype: row.reference_doctype } : {}),
        ...(row.reference_name ? { referenceName: row.reference_name } : {}),
      });
      await db.prepare(
        `UPDATE email_queue
            SET status='Sent',provider_message_id=?3,last_error=NULL,sent_at=?4,modified_at=?4
          WHERE tenant_id=?1 AND name=?2 AND status='Sending'`,
      ).bind(tenantId, row.name, result.providerMessageId ?? null, now).run();
      sent += 1;
    } catch (error) {
      const exhaustedNow = row.attempt_count >= row.max_attempts;
      await db.prepare(
        `UPDATE email_queue
            SET status='Error',last_error=?3,send_after=?4,modified_at=?5
          WHERE tenant_id=?1 AND name=?2 AND status='Sending'`,
      ).bind(
        tenantId,
        row.name,
        (error instanceof Error ? error.message : String(error)).slice(0, 1000),
        exhaustedNow ? now : retryAt(now, row.attempt_count),
        now,
      ).run();
      failed += 1;
      if (exhaustedNow) exhausted += 1;
    }
  }

  return {
    configured: true,
    pending: await new D1EmailQueueStore(db).pendingCount(tenantId),
    claimed,
    sent,
    failed,
    exhausted,
  };
}
