/**
 * Turning a committed domain event into in-app notifications.
 *
 * Rule matching is pure; this runner owns delivery authority. A recipient must still be
 * an active tenant user, must be able to read the committed document, and may suppress an
 * event through Notification Preference. A rule is never an ACL grant.
 */

import { D1UserStore } from "../../auth/src/index.js";
import type { DomainEvent, JsonObject } from "../../contracts/src/index.js";
import { D1MutationStore } from "../../document-kernel/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  MetadataPermissionService,
  notificationsFor,
  type NotificationRule,
} from "../../frappe-model/src/index.js";
import type { D1DeskViewStore } from "./desk-views.js";

/** The event suffix a rule subscribes to. */
function eventSuffix(eventType: string): string {
  const separator = eventType.lastIndexOf(".");
  return separator === -1 ? eventType : eventType.slice(separator + 1);
}

export interface NotificationRunResult {
  matched: number;
  delivered: number;
  skipped: number;
}

/** Injectable only so delivery authority can be tested without rebuilding D1 in every unit test. */
export interface NotificationDeliveryAuthorizer {
  canReceive(userId: string): Promise<boolean>;
  allowsInApp(userId: string, eventKey: string): Promise<boolean>;
}

/**
 * Evaluates every enabled rule for this event and records the resulting alerts.
 *
 * Never throws: this runs AFTER the write is committed, so a broken rule or a stale
 * preference must not make a successful save look like a failure.
 */
export async function runNotificationRules(
  db: D1Database,
  deskViews: D1DeskViewStore,
  tenantId: string,
  event: DomainEvent,
  now: string,
  authorizer?: NotificationDeliveryAuthorizer,
): Promise<NotificationRunResult> {
  const suffix = eventSuffix(event.event_type);
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

  const document = (event.payload ?? {}) as JsonObject;
  const pending = notificationsFor(rules, suffix, event.aggregate.doctype, document);
  if (!pending.length) return { matched: 0, delivered: 0, skipped: 0 };

  const deliveryAuthority = authorizer ?? await d1DeliveryAuthorizer(db, tenantId, event);
  let delivered = 0;
  let skipped = 0;
  for (const notification of pending) {
    if (notification.skipped_reason) {
      console.warn(JSON.stringify({
        level: "warn", code: "NOTIFICATION_CHANNEL_UNAVAILABLE",
        tenant_id: tenantId, rule: notification.rule, channel: notification.channel,
        detail: notification.skipped_reason,
      }));
      skipped += 1;
      continue;
    }

    // A notification carries both a subject and an exact document identifier. Delivering
    // it to someone who cannot open that document is an information leak even if the
    // eventual GET would return 404. The rule names recipients; it does NOT grant access.
    if (!await deliveryAuthority.canReceive(notification.for_user)) {
      skipped += 1;
      console.warn(JSON.stringify({
        level: "warn", code: "NOTIFICATION_RECIPIENT_NOT_AUTHORIZED",
        tenant_id: tenantId, rule: notification.rule,
      }));
      continue;
    }

    if (!await deliveryAuthority.allowsInApp(notification.for_user, suffix)) {
      skipped += 1;
      continue;
    }

    try {
      await deskViews.notify(tenantId, {
        // Deterministic: a redelivered event must not produce a second copy.
        name: `${event.event_id}:${notification.rule}:${notification.for_user}`,
        forUser: notification.for_user,
        subject: notification.subject,
        documentType: event.aggregate.doctype,
        documentName: event.aggregate.name,
        fromUser: event.actor,
      }, now);
      delivered += 1;
    } catch (error) {
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

/**
 * Builds the default authority from the SAME user directory and permission service used
 * by document reads. No notification-specific ACL is allowed to drift beside it.
 */
async function d1DeliveryAuthorizer(
  db: D1Database,
  tenantId: string,
  event: DomainEvent,
): Promise<NotificationDeliveryAuthorizer> {
  const users = new D1UserStore(db);
  const metadata = new D1MetadataStore(db);
  const access = new D1DocumentAccessStore(db);
  const permissions = new MetadataPermissionService(metadata, undefined, access);
  const documents = new D1MutationStore(db);
  const committed = await documents.getDocument(tenantId, event.aggregate.doctype, event.aggregate.name);
  const accessCache = new Map<string, Promise<boolean>>();
  const preferenceCache = new Map<string, Promise<boolean>>();

  const canReceive = (userId: string): Promise<boolean> => {
    const cached = accessCache.get(userId);
    if (cached) return cached;
    const pending = (async () => {
      if (!committed) return false;
      const user = await users.get(tenantId, userId);
      if (!user?.enabled || user.user_type !== "System User") return false;
      const actor = { user_id: userId, roles: await users.listRoles(tenantId, userId) };
      return permissions.canReadDocument(actor, tenantId, committed);
    })().catch(() => false);
    accessCache.set(userId, pending);
    return pending;
  };

  const allowsInApp = (userId: string, eventKey: string): Promise<boolean> => {
    const key = `${userId}\u0000${eventKey}`;
    const cached = preferenceCache.get(key);
    if (cached) return cached;
    const pending = loadInAppPreference(db, tenantId, userId, eventKey).catch(() => true);
    preferenceCache.set(key, pending);
    return pending;
  };

  return { canReceive, allowsInApp };
}

/** Exact event wins over the wildcard. No row means the backwards-compatible default: on. */
async function loadInAppPreference(
  db: D1Database,
  tenantId: string,
  userId: string,
  eventKey: string,
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT payload_json FROM documents
     WHERE tenant_id=?1 AND doctype='Notification Preference' AND docstatus<>2
       AND json_extract(payload_json,'$.user_id')=?2
       AND json_extract(payload_json,'$.event_type') IN (?3,'*')
     ORDER BY CASE WHEN json_extract(payload_json,'$.event_type')=?3 THEN 0 ELSE 1 END, modified_at DESC
     LIMIT 1`,
  ).bind(tenantId, userId, eventKey).first<{ payload_json: string }>();
  if (!row) return true;
  const preference = JSON.parse(row.payload_json) as JsonObject;
  if (preference.muted === true || preference.muted === 1) return false;
  if (preference.in_app === false || preference.in_app === 0) return false;
  return true;
}
