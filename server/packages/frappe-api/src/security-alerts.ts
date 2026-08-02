import type { Actor, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type SecurityAlertSeverity = "critical" | "high" | "medium";

export interface SecurityAuditEvent extends JsonObject {
  event_id: string;
  correlation_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_name: string;
  before_json: JsonValue;
  after_json: JsonValue;
  occurred_at: string;
  source: "document_version" | "rbac";
}

export interface SecurityAlert extends JsonObject {
  alert_id: string;
  severity: SecurityAlertSeverity;
  category: "identity" | "access" | "credential" | "session" | "policy" | "delegation";
  actor: string;
  action: string;
  entity_type: string;
  entity_name: string;
  correlation_id: string;
  occurred_at: string;
  evidence_source: SecurityAuditEvent["source"];
}

export interface SecurityAuditReader {
  listAuditEvents(tenantId: string, actor: Actor, input?: {
    entity_type?: string;
    entity_name?: string;
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ events: JsonObject[]; next_cursor: string | null }>;
}

const SECURITY_DOCUMENT_TYPES = new Set([
  "Role Policy",
  "SoD Rule",
  "Approval Policy",
  "Delegation",
  "Organization Assignment",
]);

const RBAC_CLASSIFICATION: Record<string, Pick<SecurityAlert, "severity" | "category">> = {
  "roles.replace": { severity: "critical", category: "access" },
  "password.reset": { severity: "critical", category: "credential" },
  "user.disable": { severity: "high", category: "identity" },
  "user.enable": { severity: "high", category: "identity" },
  "user.create": { severity: "high", category: "identity" },
  "session.revoke": { severity: "medium", category: "session" },
  "user_permission.upsert": { severity: "high", category: "access" },
  "user_permission.remove": { severity: "high", category: "access" },
  // Compatibility aliases for pre-canonical audit fixtures/imports. Current writes use
  // upsert/remove; keeping old labels readable costs nothing and preserves evidence.
  "user_permission.put": { severity: "high", category: "access" },
  "user_permission.add": { severity: "high", category: "access" },
  "user_permission.delete": { severity: "high", category: "access" },
};

export function classifySecurityAuditEvent(event: SecurityAuditEvent): SecurityAlert | null {
  let classification: Pick<SecurityAlert, "severity" | "category"> | undefined;

  if (event.source === "rbac") {
    classification = RBAC_CLASSIFICATION[event.action];
    // A user's own password change is security evidence, but not an alert by itself.
    if (event.action === "password.change") return null;
  } else if (SECURITY_DOCUMENT_TYPES.has(event.entity_type)) {
    classification = event.entity_type === "Delegation"
      ? { severity: "high", category: "delegation" }
      : { severity: "high", category: "policy" };
  }

  if (!classification) return null;
  return {
    alert_id: `security:${event.event_id}`,
    ...classification,
    actor: event.actor,
    action: event.action,
    entity_type: event.entity_type,
    entity_name: event.entity_name,
    correlation_id: event.correlation_id,
    occurred_at: event.occurred_at,
    evidence_source: event.source,
  };
}

export async function listSecurityAlerts(input: {
  tenantId: string;
  actor: Actor;
  audit: SecurityAuditReader | undefined;
  cursor?: string;
  limit?: number;
}): Promise<{ alerts: SecurityAlert[]; next_cursor: string | null }> {
  if (!input.audit) throw errors.notFound("Security audit service is unavailable");
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  // Fetch extra immutable evidence because low-risk events are intentionally filtered.
  // Cursor remains the source audit cursor, so no second pagination state is invented.
  const source = await input.audit.listAuditEvents(input.tenantId, input.actor, {
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: Math.min(limit * 5, 1000),
  });
  const alerts: SecurityAlert[] = [];
  for (const raw of source.events) {
    const event = normalizeAuditEvent(raw);
    const alert = classifySecurityAuditEvent(event);
    if (alert) alerts.push(alert);
    if (alerts.length >= limit) break;
  }
  return { alerts, next_cursor: source.next_cursor };
}

function normalizeAuditEvent(value: JsonObject): SecurityAuditEvent {
  const required = (key: string): string => {
    const raw = value[key];
    if (typeof raw !== "string" || !raw) throw errors.validation(`Audit event is missing ${key}`);
    return raw;
  };
  const source = required("source");
  if (source !== "rbac" && source !== "document_version") throw errors.validation("Audit event source is invalid");
  return {
    event_id: required("event_id"),
    correlation_id: required("correlation_id"),
    actor: required("actor"),
    action: required("action"),
    entity_type: required("entity_type"),
    entity_name: required("entity_name"),
    before_json: value.before_json ?? null,
    after_json: value.after_json ?? null,
    occurred_at: required("occurred_at"),
    source,
  };
}
