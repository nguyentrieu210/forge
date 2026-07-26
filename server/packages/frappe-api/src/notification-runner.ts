/**
 * Turning a committed domain event into in-app notifications.
 *
 * The rules themselves are pure (`notificationsFor` in frappe-model). This is the part
 * that reads them from the tenant's database and writes the results — kept separate so
 * the decision stays testable without a database, and so a delivery failure can never be
 * mistaken for a rule that did not match.
 *
 * WHY THIS FILE EXISTS AT ALL: the rules module and its migration landed first, with
 * tests, and NOTHING CALLED IT. That is the same failure this codebase already found
 * twice — `is_single` and `track_seen` were both validated, stored, and read by nobody.
 * A mechanism with no caller passes every test it has and does nothing in production.
 */

import type { DomainEvent, JsonObject } from "../../contracts/src/index.js";
import { notificationsFor, type NotificationRule } from "../../frappe-model/src/index.js";
import type { D1DeskViewStore } from "./desk-views.js";

/**
 * The event suffix a rule subscribes to.
 *
 * Domain events are named `<aggregate>.<what happened>`; a rule names only the second
 * half, because a rule already says which doctype it is about.
 */
function eventSuffix(eventType: string): string {
  const separator = eventType.lastIndexOf(".");
  return separator === -1 ? eventType : eventType.slice(separator + 1);
}

export interface NotificationRunResult {
  matched: number;
  delivered: number;
  skipped: number;
}

/**
 * Evaluates every enabled rule for this event and records the resulting alerts.
 *
 * Never throws: this runs AFTER the write is committed, so a broken rule must not make a
 * successful save look like a failure — the caller has already told the client the
 * document exists. Failures are counted and logged rather than propagated.
 */
export async function runNotificationRules(
  db: D1Database,
  deskViews: D1DeskViewStore,
  tenantId: string,
  event: DomainEvent,
  now: string,
): Promise<NotificationRunResult> {
  const suffix = eventSuffix(event.event_type);
  // The rule BODY lives in `rule_json` — the shape 0004 created and nothing ever read.
  // Reusing it beats adding a rival table: two schemas for one feature drift, and the
  // older one is the one that stays behind in every database already deployed.
  const rows = await db.prepare(
    `SELECT name, document_type, event, rule_json, enabled
     FROM notification_rules
     WHERE tenant_id=?1 AND document_type=?2 AND event=?3 AND enabled=1`,
  ).bind(tenantId, event.aggregate.doctype, suffix).all<{
    name: string; document_type: string; event: string; rule_json: string; enabled: number;
  }>();

  const rules: NotificationRule[] = [];
  for (const row of rows.results ?? []) {
    let body: Partial<NotificationRule>;
    try {
      body = JSON.parse(row.rule_json) as Partial<NotificationRule>;
    } catch {
      // A rule nobody can parse cannot be honoured, and must not take the others down
      // with it. Logged rather than thrown: the write it reacts to has already committed.
      console.error(JSON.stringify({
        level: "error", code: "NOTIFICATION_RULE_UNREADABLE", tenant_id: tenantId, rule: row.name,
      }));
      continue;
    }
    rules.push({
      name: row.name,
      document_type: row.document_type,
      event: row.event,
      condition: body.condition ?? "",
      subject: body.subject ?? "",
      message: body.message ?? "",
      channel: body.channel ?? "Notification",
      recipients: body.recipients ?? [],
      enabled: row.enabled === 1,
    });
  }
  if (!rules.length) return { matched: 0, delivered: 0, skipped: 0 };

  // The event payload is what the rule's condition sees. It is the committed document,
  // so a condition can never be evaluated against a state that was never stored.
  const document = (event.payload ?? {}) as JsonObject;
  const pending = notificationsFor(rules, suffix, event.aggregate.doctype, document);

  let delivered = 0;
  let skipped = 0;
  for (const notification of pending) {
    if (notification.skipped_reason) {
      // Recorded in the log stream, not the user's inbox: the tenant asked for something
      // this platform cannot do, and that must be visible rather than look like delivery.
      console.warn(JSON.stringify({
        level: "warn", code: "NOTIFICATION_CHANNEL_UNAVAILABLE",
        tenant_id: tenantId, rule: notification.rule, channel: notification.channel,
        detail: notification.skipped_reason,
      }));
      skipped += 1;
      continue;
    }
    try {
      await deskViews.notify(tenantId, {
        // Deterministic: a redelivered event must not produce a second copy of the same
        // alert in someone's inbox.
        name: `${event.event_id}:${notification.rule}:${notification.for_user}`,
        forUser: notification.for_user,
        subject: notification.subject,
        documentType: event.aggregate.doctype,
        documentName: event.aggregate.name,
        fromUser: event.actor,
      }, now);
      delivered += 1;
    } catch (error) {
      // One rule failing must not stop the rest, and must not fail the event.
      skipped += 1;
      console.error(JSON.stringify({
        level: "error", code: "NOTIFICATION_DELIVERY_FAILED",
        tenant_id: tenantId, rule: notification.rule,
        detail: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return { matched: pending.length, delivered, skipped };
}
