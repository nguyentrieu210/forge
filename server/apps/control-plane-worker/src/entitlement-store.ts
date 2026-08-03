import { errors, randomId } from "../../../packages/core/src/index.js";
import {
  validatePlanEntitlement,
  type PlanEntitlement,
  type SaaSPlan,
} from "./entitlements.js";

export interface StoredPlanEntitlement {
  plan: SaaSPlan;
  entitlement: PlanEntitlement;
  version: number;
  modified_at: string;
  modified_by: string;
}

interface EntitlementRow {
  plan: SaaSPlan;
  entitlement_key: string;
  kind: "feature" | "quota";
  enabled: number | null;
  quota_limit: number | null;
  quota_unit: string | null;
  version: number;
  modified_at: string;
  modified_by: string;
}

export class D1PlanEntitlementStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async get(plan: SaaSPlan, key: string): Promise<StoredPlanEntitlement | null> {
    const row = await this.db.prepare(
      `SELECT plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
         FROM control_plan_entitlements WHERE plan=?1 AND entitlement_key=?2`,
    ).bind(plan, key).first<EntitlementRow>();
    return row ? fromRow(row) : null;
  }

  async list(plan: SaaSPlan): Promise<StoredPlanEntitlement[]> {
    const result = await this.db.prepare(
      `SELECT plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
         FROM control_plan_entitlements WHERE plan=?1 ORDER BY entitlement_key`,
    ).bind(plan).all<EntitlementRow>();
    return (result.results ?? []).map(fromRow);
  }

  async put(input: {
    plan: SaaSPlan;
    entitlement: PlanEntitlement;
    actorKey: string;
    traceId: string;
    reason: string;
    now: string;
    expectedVersion?: number;
  }): Promise<StoredPlanEntitlement> {
    const entitlement = validatePlanEntitlement(input.entitlement);
    const reason = requireReason(input.reason);
    const actor = requireText(input.actorKey, "actorKey", 320);
    const trace = requireText(input.traceId, "traceId", 320);
    requireIso(input.now);
    const current = await this.get(input.plan, entitlement.key);
    if (input.expectedVersion !== undefined && current?.version !== input.expectedVersion) {
      throw errors.version(current?.version);
    }
    const nextVersion = (current?.version ?? 0) + 1;
    const eventId = randomId("entitlement");
    const rowValues = entitlement.kind === "feature"
      ? { enabled: entitlement.enabled ? 1 : 0, quotaLimit: null, quotaUnit: null }
      : { enabled: null, quotaLimit: entitlement.limit, quotaUnit: entitlement.unit };

    await this.db.batch([
      this.db.prepare(
        `INSERT INTO control_plan_entitlements(
           plan,entitlement_key,kind,enabled,quota_limit,quota_unit,version,modified_at,modified_by
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(plan,entitlement_key) DO UPDATE SET
           kind=excluded.kind,enabled=excluded.enabled,quota_limit=excluded.quota_limit,
           quota_unit=excluded.quota_unit,version=excluded.version,
           modified_at=excluded.modified_at,modified_by=excluded.modified_by`,
      ).bind(
        input.plan,
        entitlement.key,
        entitlement.kind,
        rowValues.enabled,
        rowValues.quotaLimit,
        rowValues.quotaUnit,
        nextVersion,
        input.now,
        actor,
      ),
      this.db.prepare(
        `INSERT INTO control_plan_entitlement_audit(
           event_id,plan,entitlement_key,action,actor_key,reason,before_json,after_json,trace_id,created_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(
        eventId,
        input.plan,
        entitlement.key,
        current ? "entitlement.update" : "entitlement.create",
        actor,
        reason,
        current ? JSON.stringify(current) : null,
        JSON.stringify({ plan: input.plan, entitlement, version: nextVersion }),
        trace,
        input.now,
      ),
    ]);
    return {
      plan: input.plan,
      entitlement,
      version: nextVersion,
      modified_at: input.now,
      modified_by: actor,
    };
  }

  async remove(input: {
    plan: SaaSPlan;
    key: string;
    actorKey: string;
    traceId: string;
    reason: string;
    now: string;
    expectedVersion?: number;
  }): Promise<boolean> {
    const current = await this.get(input.plan, input.key);
    if (!current) return false;
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      throw errors.version(current?.version);
    }
    const reason = requireReason(input.reason);
    const actor = requireText(input.actorKey, "actorKey", 320);
    const trace = requireText(input.traceId, "traceId", 320);
    requireIso(input.now);
    const eventId = randomId("entitlement");
    const results = await this.db.batch([
      this.db.prepare(
        `DELETE FROM control_plan_entitlements
          WHERE plan=?1 AND entitlement_key=?2 AND version=?3`,
      ).bind(input.plan, input.key, current.version),
      this.db.prepare(
        `INSERT INTO control_plan_entitlement_audit(
           event_id,plan,entitlement_key,action,actor_key,reason,before_json,after_json,trace_id,created_at
         )
         SELECT ?1,?2,?3,'entitlement.remove',?4,?5,?6,NULL,?7,?8
          WHERE NOT EXISTS(
            SELECT 1 FROM control_plan_entitlements WHERE plan=?2 AND entitlement_key=?3
          )`,
      ).bind(eventId, input.plan, input.key, actor, reason, JSON.stringify(current), trace, input.now),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }
}

function fromRow(row: EntitlementRow): StoredPlanEntitlement {
  const entitlement: PlanEntitlement = row.kind === "feature"
    ? { kind: "feature", key: row.entitlement_key, enabled: row.enabled === 1 }
    : {
      kind: "quota",
      key: row.entitlement_key,
      limit: Number(row.quota_limit),
      unit: row.quota_unit ?? "",
    };
  return {
    plan: row.plan,
    entitlement: validatePlanEntitlement(entitlement),
    version: row.version,
    modified_at: row.modified_at,
    modified_by: row.modified_by,
  };
}

function requireReason(value: string): string {
  const reason = value.trim();
  if (!reason || reason.length > 500) throw errors.validation("reason is required and must be at most 500 characters");
  return reason;
}

function requireText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw errors.validation(`${field} is required and too long`);
  return normalized;
}

function requireIso(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw errors.validation("now must be an ISO timestamp");
}
