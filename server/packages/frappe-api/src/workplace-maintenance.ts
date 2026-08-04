/**
 * Scheduled Digital Workplace / DMS / CLM alerts.
 *
 * This module deliberately DOES NOT create another scheduler. The tenant maintenance
 * loop is the platform scheduler authority; this is a bounded domain runner for that
 * loop to call. It also does not invent a notification ACL: every recipient is
 * re-checked through MetadataPermissionService against the committed document before
 * any title/name reaches their inbox.
 *
 * External email/SMS/Zalo/push and e-sign remain Integration Hub/provider concerns.
 */

import { D1UserStore } from "../../auth/src/user-store.js";
import type { JsonObject } from "../../contracts/src/index.js";
import { D1MutationStore } from "../../document-kernel/src/d1-store.js";
import { D1DocumentAccessStore, MetadataPermissionService } from "../../frappe-model/src/permission.js";
import { D1MetadataStore } from "../../frappe-model/src/store.js";
import { D1DeskViewStore } from "./desk-views.js";

export const WORKPLACE_ALERT_EVENTS = {
  taskReminder: "workplace.task.reminder",
  documentExpiry: "workplace.document.expiry",
  contractRenewal: "workplace.contract.renewal",
  contractExpiry: "workplace.contract.expiry",
  obligationDue: "workplace.contract.obligation_due",
} as const;

export type WorkplaceAlertEvent = typeof WORKPLACE_ALERT_EVENTS[keyof typeof WORKPLACE_ALERT_EVENTS];

export interface WorkplaceScheduledAlert {
  event_key: WorkplaceAlertEvent;
  doctype: "Workplace Task" | "Managed Document" | "Contract" | "Contract Obligation";
  name: string;
  owner: string;
  anchor: string;
  subject: string;
  recipient_hints: string[];
  payload: JsonObject;
}

export interface WorkplaceMaintenanceResult {
  candidates: number;
  /** Notifications that are guaranteed to exist after this sweep; retries may be no-ops. */
  recorded: number;
  skipped: number;
  failed: number;
}

interface CandidateRow {
  doctype: WorkplaceScheduledAlert["doctype"];
  name: string;
  owner: string;
  payload_json: string;
}

/**
 * Pure domain decision used by both the runner and focused regression tests.
 *
 * A due item produces a stable event anchored to its configured due/reminder date.
 * That anchor is part of the notification key, so repeated maintenance sweeps are
 * idempotent while a genuinely changed due date creates a new alert.
 */
export function scheduledAlertsForDocument(
  row: { doctype: WorkplaceScheduledAlert["doctype"]; name: string; owner: string; payload: JsonObject },
  now: string,
): WorkplaceScheduledAlert[] {
  const today = now.slice(0, 10);
  const data = row.payload;
  const alerts: WorkplaceScheduledAlert[] = [];

  if (row.doctype === "Workplace Task") {
    const status = text(data.status);
    const reminderAt = text(data.reminder_at);
    if (reminderAt && status !== "Done" && status !== "Cancelled" && dueDateTime(reminderAt, now)) {
      alerts.push({
        event_key: WORKPLACE_ALERT_EVENTS.taskReminder,
        doctype: row.doctype,
        name: row.name,
        owner: row.owner,
        anchor: reminderAt,
        subject: `Nhắc việc: ${label(data.subject, row.name)}`,
        recipient_hints: compactUsers([row.owner, text(data.assigned_to)]),
        payload: data,
      });
    }
    return alerts;
  }

  if (row.doctype === "Managed Document") {
    const expiryDate = dateText(data.expiry_date);
    if (expiryDate && expiryDate <= today) {
      alerts.push({
        event_key: WORKPLACE_ALERT_EVENTS.documentExpiry,
        doctype: row.doctype,
        name: row.name,
        owner: row.owner,
        anchor: expiryDate,
        subject: `Tài liệu đến hạn ${expiryDate}: ${label(data.title, row.name)}`,
        recipient_hints: compactUsers([row.owner]),
        payload: data,
      });
    }
    return alerts;
  }

  if (row.doctype === "Contract") {
    const endDate = dateText(data.end_date);
    const renewalStatus = text(data.renewal_status);
    if (!endDate || renewalStatus === "Renewed" || renewalStatus === "Terminated") return alerts;

    const noticeDays = boundedInteger(data.renewal_notice_days, 0, 3650, 30);
    const renewalDate = shiftDate(endDate, -noticeDays);
    if (renewalDate <= today) {
      alerts.push({
        event_key: WORKPLACE_ALERT_EVENTS.contractRenewal,
        doctype: row.doctype,
        name: row.name,
        owner: row.owner,
        anchor: renewalDate,
        subject: `Hợp đồng cần rà soát gia hạn: ${label(data.contract_title, row.name)} · hết hạn ${endDate}`,
        recipient_hints: compactUsers([row.owner]),
        payload: data,
      });
    }
    if (endDate <= today) {
      alerts.push({
        event_key: WORKPLACE_ALERT_EVENTS.contractExpiry,
        doctype: row.doctype,
        name: row.name,
        owner: row.owner,
        anchor: endDate,
        subject: `Hợp đồng đến hạn ${endDate}: ${label(data.contract_title, row.name)}`,
        recipient_hints: compactUsers([row.owner]),
        payload: data,
      });
    }
    return alerts;
  }

  const status = text(data.status);
  const dueDate = dateText(data.due_date);
  if (dueDate && dueDate <= today && status !== "Done" && status !== "Waived") {
    alerts.push({
      event_key: WORKPLACE_ALERT_EVENTS.obligationDue,
      doctype: row.doctype,
      name: row.name,
      owner: row.owner,
      anchor: dueDate,
      subject: `Nghĩa vụ đến hạn ${dueDate}: ${label(data.obligation, row.name)}`,
      recipient_hints: compactUsers([row.owner, text(data.owner_user)]),
      payload: data,
    });
  }
  return alerts;
}

/**
 * Runs the bounded, recovery-friendly alert sweep.
 *
 * The SQL lookback deliberately avoids resurfacing very stale business reminders while
 * still recovering from a normal maintenance outage. Contracts include a two-year
 * look-ahead because renewal notice periods may legitimately be long; the pure domain
 * rule still decides whether an individual contract is actually due.
 */
export async function runWorkplaceScheduledNotifications(
  db: D1Database,
  tenantId: string,
  now: string,
  limitPerFamily = 500,
): Promise<WorkplaceMaintenanceResult> {
  const limit = Math.min(Math.max(Math.trunc(limitPerFamily), 1), 2_000);
  const today = now.slice(0, 10);
  const rows: CandidateRow[] = [];

  rows.push(...await selectCandidates(db, tenantId, "Workplace Task",
    `COALESCE(json_extract(payload_json,'$.reminder_at'),'')<>''
     AND datetime(json_extract(payload_json,'$.reminder_at'))<=datetime(?2)
     AND datetime(json_extract(payload_json,'$.reminder_at'))>=datetime(?2,'-30 days')
     AND COALESCE(json_extract(payload_json,'$.status'),'') NOT IN ('Done','Cancelled')`, now, limit));

  rows.push(...await selectCandidates(db, tenantId, "Managed Document",
    `docstatus=1
     AND COALESCE(json_extract(payload_json,'$.expiry_date'),'')<>''
     AND date(json_extract(payload_json,'$.expiry_date'))<=date(?2)
     AND date(json_extract(payload_json,'$.expiry_date'))>=date(?2,'-90 days')`, today, limit));

  rows.push(...await selectCandidates(db, tenantId, "Contract",
    `docstatus=1
     AND COALESCE(json_extract(payload_json,'$.end_date'),'')<>''
     AND date(json_extract(payload_json,'$.end_date'))>=date(?2,'-90 days')
     AND date(json_extract(payload_json,'$.end_date'))<=date(?2,'+730 days')
     AND COALESCE(json_extract(payload_json,'$.renewal_status'),'None') NOT IN ('Renewed','Terminated')`, today, limit));

  rows.push(...await selectCandidates(db, tenantId, "Contract Obligation",
    `COALESCE(json_extract(payload_json,'$.due_date'),'')<>''
     AND date(json_extract(payload_json,'$.due_date'))<=date(?2)
     AND date(json_extract(payload_json,'$.due_date'))>=date(?2,'-90 days')
     AND COALESCE(json_extract(payload_json,'$.status'),'Open') NOT IN ('Done','Waived')`, today, limit));

  const result: WorkplaceMaintenanceResult = { candidates: 0, recorded: 0, skipped: 0, failed: 0 };
  const inbox = new D1DeskViewStore(db);
  const documents = new D1MutationStore(db);
  const users = new D1UserStore(db);
  const permissions = new MetadataPermissionService(
    new D1MetadataStore(db),
    undefined,
    new D1DocumentAccessStore(db),
  );

  for (const row of rows) {
    let payload: JsonObject;
    try {
      payload = JSON.parse(row.payload_json) as JsonObject;
    } catch {
      result.failed += 1;
      continue;
    }
    const alerts = scheduledAlertsForDocument({ ...row, payload }, now);
    result.candidates += alerts.length;

    for (const alert of alerts) {
      try {
        const committed = await documents.getDocument(tenantId, alert.doctype, alert.name);
        if (!committed) {
          result.skipped += 1;
          continue;
        }
        const recipients = new Set(alert.recipient_hints);
        for (const user of await sharedReaders(db, tenantId, alert.doctype, alert.name)) recipients.add(user);
        const eventId = scheduledEventId(alert);

        for (const userId of recipients) {
          try {
            const user = await users.get(tenantId, userId);
            if (!user?.enabled || user.user_type !== "System User") {
              result.skipped += 1;
              continue;
            }
            const actor = { user_id: userId, roles: await users.listRoles(tenantId, userId) };
            if (!await permissions.canReadDocument(actor, tenantId, committed)) {
              result.skipped += 1;
              continue;
            }
            if (!await allowsInApp(db, tenantId, userId, alert.event_key)) {
              result.skipped += 1;
              continue;
            }

            // D1DeskViewStore uses ON CONFLICT DO NOTHING. The deterministic name makes
            // maintenance retries safe; after notify returns this record exists even if
            // the insert itself was an idempotent no-op.
            await inbox.notify(tenantId, {
              name: `${eventId}:${userId}`,
              forUser: userId,
              subject: alert.subject,
              documentType: alert.doctype,
              documentName: alert.name,
              fromUser: alert.owner || "Administrator",
            }, now);
            result.recorded += 1;
          } catch {
            // One stale/invalid recipient must not prevent other authorized recipients
            // from receiving the same due alert.
            result.failed += 1;
          }
        }
      } catch {
        result.failed += 1;
      }
    }
  }

  return result;
}

async function selectCandidates(
  db: D1Database,
  tenantId: string,
  doctype: WorkplaceScheduledAlert["doctype"],
  where: string,
  clock: string,
  limit: number,
): Promise<CandidateRow[]> {
  const result = await db.prepare(
    `SELECT doctype,name,owner,payload_json
     FROM documents
     WHERE tenant_id=?1 AND doctype='${doctype}' AND docstatus<>2 AND ${where}
     ORDER BY modified_at DESC LIMIT ?3`,
  ).bind(tenantId, clock, limit).all<CandidateRow>();
  return result.results ?? [];
}

async function sharedReaders(
  db: D1Database,
  tenantId: string,
  doctype: string,
  name: string,
): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT user FROM document_shares
     WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND can_read=1
     ORDER BY user LIMIT 200`,
  ).bind(tenantId, doctype, name).all<{ user: string }>();
  return (rows.results ?? []).map((row) => row.user).filter(Boolean);
}

/** Exact event overrides wildcard; absence preserves the existing default-on behavior. */
async function allowsInApp(
  db: D1Database,
  tenantId: string,
  userId: string,
  eventKey: string,
): Promise<boolean> {
  try {
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
  } catch {
    // Matches the committed-event runner: preference storage trouble must not silently
    // eat an operational alert. Document authorization above remains fail-closed.
    return true;
  }
}

function scheduledEventId(alert: WorkplaceScheduledAlert): string {
  const safeAnchor = alert.anchor.replace(/[^0-9A-Za-z_.:-]/g, "_").slice(0, 80);
  return `scheduled:${alert.event_key}:${alert.doctype}:${alert.name}:${safeAnchor}`;
}

function compactUsers(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function label(value: unknown, fallback: string): string {
  const valueText = text(value);
  return (valueText || fallback).slice(0, 240);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateText(value: unknown): string {
  const valueText = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : "";
}

function dueDateTime(value: string, now: string): boolean {
  const parsed = Date.parse(value);
  const current = Date.parse(now);
  if (Number.isFinite(parsed) && Number.isFinite(current)) return parsed <= current;
  return value <= now;
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
