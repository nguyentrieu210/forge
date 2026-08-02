import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter } from "./index.js";
import type { SemanticInsightRegistry } from "./insights.js";
import type { SemanticQueryExecutor, SemanticQueryResult } from "./service.js";

export type SemanticSubscriptionCadence = "daily" | "weekly" | "monthly";

export interface SemanticSubscriptionSchedule {
  cadence: SemanticSubscriptionCadence;
  timezone: string;
  /** HH:mm in the declared IANA timezone. */
  localTime: string;
  /** 1=Monday ... 7=Sunday, required only for weekly. */
  weekday?: number;
  /** 1..28, required only for monthly to avoid ambiguous short-month semantics. */
  dayOfMonth?: number;
}

export interface SemanticReportSubscription {
  id: string;
  label: string;
  ownerUserId: string;
  insight: string;
  scopeFilters?: SemanticFilter[];
  schedule: SemanticSubscriptionSchedule;
  /** Current safe delivery contract. Shared/email recipients require a separate permission contract. */
  delivery: "in_app_owner";
  enabled: boolean;
}

export interface SemanticSubscriptionExecutorFactory {
  /** Must bind permission evaluation to this exact tenant + owner identity. */
  forOwner(tenantId: string, ownerUserId: string): Promise<SemanticQueryExecutor>;
}

export interface SemanticSubscriptionRun {
  schemaVersion: 1;
  subscription: string;
  runId: string;
  tenantId: string;
  ownerUserId: string;
  generatedAt: string;
  delivery: "in_app_owner";
  result: SemanticQueryResult;
}

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE = /^[A-Za-z0-9_+\-/]{1,100}$/;

function text(value: string, field: string, max: number): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
}

export function validateSemanticSubscription(subscription: SemanticReportSubscription): void {
  if (!ID.test(subscription.id)) throw errors.validation("subscription.id must be a stable lowercase id");
  text(subscription.label, `Subscription ${subscription.id} label`, 160);
  text(subscription.ownerUserId, `Subscription ${subscription.id} ownerUserId`, 200);
  if (!ID.test(subscription.insight)) throw errors.validation(`Subscription ${subscription.id} insight is invalid`);
  if (subscription.delivery !== "in_app_owner") throw errors.validation(`Subscription ${subscription.id} delivery is unsupported`);
  if (typeof subscription.enabled !== "boolean") throw errors.validation(`Subscription ${subscription.id} enabled must be boolean`);
  if (!Array.isArray(subscription.scopeFilters ?? []) || (subscription.scopeFilters?.length ?? 0) > 20) throw errors.validation(`Subscription ${subscription.id} has too many scope filters`);

  const schedule = subscription.schedule;
  if (!schedule || !["daily", "weekly", "monthly"].includes(schedule.cadence)) throw errors.validation(`Subscription ${subscription.id} cadence is unsupported`);
  if (!TIME.test(schedule.localTime)) throw errors.validation(`Subscription ${subscription.id} localTime must be HH:mm`);
  if (!TIMEZONE.test(schedule.timezone)) throw errors.validation(`Subscription ${subscription.id} timezone is invalid`);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: schedule.timezone }).format(new Date(0));
  } catch {
    throw errors.validation(`Subscription ${subscription.id} timezone is not recognized`);
  }

  if (schedule.cadence === "weekly") {
    if (!Number.isSafeInteger(schedule.weekday) || schedule.weekday! < 1 || schedule.weekday! > 7) throw errors.validation(`Subscription ${subscription.id} weekly schedule requires weekday 1..7`);
    if (schedule.dayOfMonth !== undefined) throw errors.validation(`Subscription ${subscription.id} weekly schedule must not set dayOfMonth`);
  } else if (schedule.cadence === "monthly") {
    if (!Number.isSafeInteger(schedule.dayOfMonth) || schedule.dayOfMonth! < 1 || schedule.dayOfMonth! > 28) throw errors.validation(`Subscription ${subscription.id} monthly schedule requires dayOfMonth 1..28`);
    if (schedule.weekday !== undefined) throw errors.validation(`Subscription ${subscription.id} monthly schedule must not set weekday`);
  } else if (schedule.weekday !== undefined || schedule.dayOfMonth !== undefined) {
    throw errors.validation(`Subscription ${subscription.id} daily schedule must not set weekday/dayOfMonth`);
  }
}

/**
 * Executes one scheduler-selected subscription. It deliberately does not decide WHEN a run
 * is due and does not enqueue delivery. WS12 can reuse its jobs/prepared-report machinery.
 * Every run creates an executor bound to the subscription owner, so stale permissions are
 * re-evaluated instead of trusting permission from subscription creation time.
 */
export class SemanticSubscriptionExecutionService {
  constructor(
    private readonly insights: SemanticInsightRegistry,
    private readonly executors: SemanticSubscriptionExecutorFactory,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async execute(input: {
    tenantId: string;
    runId: string;
    subscription: SemanticReportSubscription;
  }): Promise<SemanticSubscriptionRun> {
    if (!input.tenantId.trim()) throw errors.validation("tenantId is required");
    text(input.runId, "runId", 200);
    validateSemanticSubscription(input.subscription);
    if (!input.subscription.enabled) throw errors.validation(`Subscription ${input.subscription.id} is disabled`);

    const executor = await this.executors.forOwner(input.tenantId, input.subscription.ownerUserId);
    const query = this.insights.query(
      input.subscription.insight,
      input.tenantId,
      input.subscription.scopeFilters ?? [],
    );
    const result = await executor.run(query);
    return {
      schemaVersion: 1,
      subscription: input.subscription.id,
      runId: input.runId,
      tenantId: input.tenantId,
      ownerUserId: input.subscription.ownerUserId,
      generatedAt: this.now(),
      delivery: "in_app_owner",
      result,
    };
  }
}

/** Safe persistence/audit shape. Result delivery may serialize this without raw schema. */
export function semanticSubscriptionAudit(subscription: SemanticReportSubscription): Record<string, JsonValue> {
  validateSemanticSubscription(subscription);
  return {
    id: subscription.id,
    owner_user_id: subscription.ownerUserId,
    insight: subscription.insight,
    schedule: {
      cadence: subscription.schedule.cadence,
      timezone: subscription.schedule.timezone,
      local_time: subscription.schedule.localTime,
      ...(subscription.schedule.weekday !== undefined ? { weekday: subscription.schedule.weekday } : {}),
      ...(subscription.schedule.dayOfMonth !== undefined ? { day_of_month: subscription.schedule.dayOfMonth } : {}),
    },
    delivery: subscription.delivery,
    enabled: subscription.enabled,
  };
}
