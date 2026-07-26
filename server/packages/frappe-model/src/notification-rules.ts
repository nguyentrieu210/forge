/**
 * Notification rules — Frappe's `Notification` doctype.
 *
 * "When a Leave Application is submitted and total_days > 5, tell the HR manager."
 * Declared as data, evaluated after commit, delivered to the in-app notification log.
 *
 * WHY AFTER COMMIT. A notification is a reaction, not a decision: nothing about it can
 * change whether the write should have happened, so running it before would only add
 * latency and a way for a rule to break a save.
 *
 * WHY NOT EMAIL. No mail transport is configured on this platform. A rule that claimed
 * to send mail would be a promise about something the user believes reached someone —
 * the same reason `communication.email.make` is refused outright rather than stubbed. A
 * rule may DECLARE `channel: "Email"`; it is then recorded and skipped, so the intent
 * survives for the day a transport exists and nobody is misled meanwhile.
 */

import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { evaluateFieldCondition, parseFieldCondition } from "./field-condition.js";

export interface NotificationRecipient {
  /** A named user, or a field on the document that holds one. */
  kind: "user" | "field";
  value: string;
}

export interface NotificationRule {
  name: string;
  document_type: string;
  event: string;
  condition: string;
  subject: string;
  message: string;
  channel: string;
  recipients: NotificationRecipient[];
  enabled: boolean;
}

const CHANNELS = new Set(["Notification", "Email", "System"]);

/**
 * Validates a rule at SAVE time.
 *
 * The condition is parsed here so an unparseable expression is refused while someone is
 * looking at it. Deferring to runtime would store a rule that quietly never fires — and
 * a notification that never arrives is not a visible failure, it is an absence nobody
 * reports until something goes unapproved for a week.
 */
export function parseNotificationRule(value: unknown): NotificationRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("Notification rule must be an object");
  const input = value as JsonObject;

  const name = text(input.name, "name", 140);
  const documentType = text(input.document_type, "document_type", 160);
  const event = text(input.event, "event", 64);
  if (!/^[a-z_]+$/.test(event)) throw errors.validation(`event must be a lowercase event name: ${event}`);

  const condition = input.condition === undefined || input.condition === "" ? "" : text(input.condition, "condition", 500);
  if (condition) {
    // Same restricted grammar as `mandatory_depends_on`; anything it cannot express is
    // refused rather than silently ignored.
    parseFieldCondition(condition);
  }

  const channel = input.channel === undefined ? "Notification" : text(input.channel, "channel", 32);
  if (!CHANNELS.has(channel)) throw errors.validation(`channel must be one of ${[...CHANNELS].join(", ")}`);

  const recipients = (Array.isArray(input.recipients) ? input.recipients : []).map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw errors.validation(`recipients[${index}] must be an object`);
    const record = entry as JsonObject;
    const kind = text(record.kind, `recipients[${index}].kind`, 16);
    if (kind !== "user" && kind !== "field") throw errors.validation(`recipients[${index}].kind must be "user" or "field"`);
    return { kind, value: text(record.value, `recipients[${index}].value`, 160) } as NotificationRecipient;
  });
  if (!recipients.length) {
    // A rule with nobody to tell does nothing at all, and looks configured.
    throw errors.validation("A notification rule needs at least one recipient");
  }

  return {
    name, document_type: documentType, event, condition, channel, recipients,
    subject: input.subject === undefined ? "" : text(input.subject, "subject", 240),
    message: input.message === undefined ? "" : text(input.message, "message", 4000),
    enabled: input.enabled !== false,
  };
}

export interface PendingNotification {
  rule: string;
  for_user: string;
  subject: string;
  channel: string;
  skipped_reason?: string;
}

/**
 * Which notifications a document event produces.
 *
 * Pure: it decides, the caller writes. That keeps the decision testable without a
 * database and stops a delivery failure from being mistaken for a rule that did not match.
 */
export function notificationsFor(
  rules: NotificationRule[],
  event: string,
  doctype: string,
  document: JsonObject,
): PendingNotification[] {
  const out: PendingNotification[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.document_type !== doctype || rule.event !== event) continue;
    if (rule.condition && !evaluateFieldCondition(rule.condition, document)) continue;

    for (const recipient of resolveRecipients(rule, document)) {
      out.push({
        rule: rule.name,
        for_user: recipient,
        subject: interpolate(rule.subject || `${doctype} ${event}`, document),
        channel: rule.channel,
        // Recorded, not silently dropped: the tenant declared an intent this platform
        // cannot honour, and that should be visible rather than look like delivery.
        ...(rule.channel === "Email" ? { skipped_reason: "No mail transport is configured on this platform" } : {}),
      });
    }
  }
  return out;
}

function resolveRecipients(rule: NotificationRule, document: JsonObject): string[] {
  const users = new Set<string>();
  for (const recipient of rule.recipients) {
    if (recipient.kind === "user") {
      users.add(recipient.value);
      continue;
    }
    // `field` reads a user id out of the document, which is how "notify the approver"
    // works without a person's name baked into the rule.
    const value = document[recipient.value];
    if (typeof value === "string" && value.trim()) users.add(value.trim());
  }
  return [...users];
}

/** `{{ fieldname }}` substitution, values only — no expressions, so a subject cannot compute. */
function interpolate(template: string, document: JsonObject): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const value = document[key] as JsonValue | undefined;
    return value === undefined || value === null ? "" : String(value);
  });
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${field} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}
