import type { JsonObject } from "../../contracts/src/index.js";

export type MarketplaceSlaState = "on_track" | "at_risk" | "met" | "breached" | "not_applicable" | "policy_invalid";

export interface MarketplaceSlaObservation {
  metric: "order_to_fulfillment";
  state: MarketplaceSlaState;
  target_minutes: number | null;
  warning_minutes: number | null;
  due_at: string | null;
  fulfilled_at: string | null;
  remaining_minutes: number | null;
}

/**
 * Evaluate one observational SLA from explicit policy metadata and canonical timestamps.
 *
 * - order_created_at is the immutable operational acceptance timestamp;
 * - fulfilled_at is the first shipment record created from canonical Delivery Note evidence;
 * - provider status and social_orders.modified_at are deliberately ignored;
 * - no policy means no SLA assertion rather than a hard-coded fallback threshold.
 */
export function evaluateMarketplaceFulfillmentSla(
  policyPayload: string | null,
  input: {
    order_status: string;
    order_created_at: string;
    fulfilled_at: string | null;
    now?: Date;
  },
): MarketplaceSlaObservation | null {
  if (!policyPayload) return null;
  const policy = parsePolicy(policyPayload);
  if (!policy) return invalidObservation(input.fulfilled_at);
  if (policy.disabled) return null;

  const createdAt = parseTime(input.order_created_at);
  const fulfilledAt = input.fulfilled_at ? parseTime(input.fulfilled_at) : null;
  if (createdAt === null || (input.fulfilled_at && fulfilledAt === null)) return invalidObservation(input.fulfilled_at);

  const dueMs = createdAt + policy.target_minutes * 60_000;
  const dueAt = new Date(dueMs).toISOString();
  if (input.order_status === "cancelled" || input.order_status === "returned") {
    return {
      metric: "order_to_fulfillment",
      state: "not_applicable",
      target_minutes: policy.target_minutes,
      warning_minutes: policy.warning_minutes,
      due_at: dueAt,
      fulfilled_at: input.fulfilled_at,
      remaining_minutes: null,
    };
  }

  if (fulfilledAt !== null) {
    return {
      metric: "order_to_fulfillment",
      state: fulfilledAt <= dueMs ? "met" : "breached",
      target_minutes: policy.target_minutes,
      warning_minutes: policy.warning_minutes,
      due_at: dueAt,
      fulfilled_at: new Date(fulfilledAt).toISOString(),
      remaining_minutes: Math.floor((dueMs - fulfilledAt) / 60_000),
    };
  }

  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return invalidObservation(null);
  const warningAt = dueMs - policy.warning_minutes * 60_000;
  return {
    metric: "order_to_fulfillment",
    state: nowMs >= dueMs ? "breached" : nowMs >= warningAt ? "at_risk" : "on_track",
    target_minutes: policy.target_minutes,
    warning_minutes: policy.warning_minutes,
    due_at: dueAt,
    fulfilled_at: null,
    remaining_minutes: Math.ceil((dueMs - nowMs) / 60_000),
  };
}

function parsePolicy(payload: string): { target_minutes: number; warning_minutes: number; disabled: boolean } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(payload) as unknown; }
  catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as JsonObject;
  if (value.metric !== "order_to_fulfillment") return null;
  const target = integer(value.target_minutes);
  const warning = integer(value.warning_minutes);
  if (target === null || warning === null || target < 1 || target > 525_600 || warning < 0 || warning >= target) return null;
  const disabled = check(value.disabled);
  if (disabled === null) return null;
  return { target_minutes: target, warning_minutes: warning, disabled };
}

function invalidObservation(fulfilledAt: string | null): MarketplaceSlaObservation {
  return {
    metric: "order_to_fulfillment",
    state: "policy_invalid",
    target_minutes: null,
    warning_minutes: null,
    due_at: null,
    fulfilled_at: fulfilledAt,
    remaining_minutes: null,
  };
}

function integer(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(number) ? number : null;
}

function check(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value === undefined || value === null || value === "") return false;
  return null;
}

function parseTime(value: string): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
