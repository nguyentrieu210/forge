import { errors } from "../../../packages/core/src/index.js";

export type SaaSPlan = "free" | "pro" | "enterprise";
export type EntitlementKind = "feature" | "quota";

export interface FeatureEntitlement {
  kind: "feature";
  key: string;
  enabled: boolean;
}

export interface QuotaEntitlement {
  kind: "quota";
  key: string;
  limit: number;
  unit: string;
}

export type PlanEntitlement = FeatureEntitlement | QuotaEntitlement;

export interface EntitlementDecision {
  managed: boolean;
  allowed: boolean;
  plan: SaaSPlan;
  key: string;
  kind: EntitlementKind;
  limit?: number;
  used?: number;
  remaining?: number;
  unit?: string;
}

/**
 * Validates an explicit plan policy. No product limits are invented here.
 *
 * Absence of a policy means `managed:false`: existing tenants keep legacy behavior until
 * a reviewed plan rule is configured. Once a rule exists, it is authoritative and the
 * evaluator fails closed on malformed values.
 */
export function validatePlanEntitlement(value: PlanEntitlement): PlanEntitlement {
  if (!/^[a-z][a-z0-9._-]{1,120}$/.test(value.key)) {
    throw errors.validation("Entitlement key is invalid");
  }
  if (value.kind === "feature") {
    if (typeof value.enabled !== "boolean") throw errors.validation("Feature entitlement must be boolean");
    return { kind: "feature", key: value.key, enabled: value.enabled };
  }
  if (!Number.isSafeInteger(value.limit) || value.limit < 0) {
    throw errors.validation("Quota entitlement limit must be a non-negative safe integer");
  }
  if (!/^[A-Za-z][A-Za-z0-9 _./-]{0,31}$/.test(value.unit)) throw errors.validation("Quota entitlement unit is invalid");
  return { kind: "quota", key: value.key, limit: value.limit, unit: value.unit };
}

export function evaluateFeatureEntitlement(
  plan: SaaSPlan,
  key: string,
  policy: FeatureEntitlement | undefined,
): EntitlementDecision {
  if (!policy) return { managed: false, allowed: true, plan, key, kind: "feature" };
  const validated = validatePlanEntitlement(policy) as FeatureEntitlement;
  if (validated.key !== key) throw errors.validation("Feature entitlement key mismatch");
  return { managed: true, allowed: validated.enabled, plan, key, kind: "feature" };
}

export function evaluateQuotaEntitlement(
  plan: SaaSPlan,
  key: string,
  used: number,
  policy: QuotaEntitlement | undefined,
  requested = 1,
): EntitlementDecision {
  if (!Number.isSafeInteger(used) || used < 0) throw errors.validation("Quota usage must be a non-negative safe integer");
  if (!Number.isSafeInteger(requested) || requested < 0) throw errors.validation("Quota request must be a non-negative safe integer");
  if (!policy) return { managed: false, allowed: true, plan, key, kind: "quota", used };
  const validated = validatePlanEntitlement(policy) as QuotaEntitlement;
  if (validated.key !== key) throw errors.validation("Quota entitlement key mismatch");
  const remaining = Math.max(validated.limit - used, 0);
  return {
    managed: true,
    allowed: used + requested <= validated.limit,
    plan,
    key,
    kind: "quota",
    limit: validated.limit,
    used,
    remaining,
    unit: validated.unit,
  };
}

export function assertFeatureEntitled(decision: EntitlementDecision): void {
  if (decision.kind !== "feature") throw errors.validation("Expected a feature entitlement decision");
  if (!decision.allowed) throw errors.permission(`Feature ${decision.key} is not enabled for plan ${decision.plan}`);
}

export function assertQuotaAvailable(decision: EntitlementDecision): void {
  if (decision.kind !== "quota") throw errors.validation("Expected a quota entitlement decision");
  if (!decision.allowed) throw errors.permission(`Quota ${decision.key} has been reached for plan ${decision.plan}`);
}
