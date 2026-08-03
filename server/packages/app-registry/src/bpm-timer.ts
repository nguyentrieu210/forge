import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  evaluateApprovalPlan,
  parseApprovalPlan,
  type ApprovalDecisionFact,
  type ApprovalPlan,
} from "./bpm-approval.js";

export interface ApprovalEscalationRule extends JsonObject {
  key: string;
  after_minutes: number;
}

export interface ApprovalStageTimerPolicy extends JsonObject {
  stage_key: string;
  due_after_minutes: number;
  escalations: ApprovalEscalationRule[];
}

export interface ApprovalTimerPlan extends JsonObject {
  schema_version: 1;
  stages: ApprovalStageTimerPolicy[];
}

export type ApprovalTimerEventKind = "due" | "escalation";

export interface ApprovalTimerEvent extends JsonObject {
  event_key: string;
  kind: ApprovalTimerEventKind;
  stage_key: string;
  scheduled_at: string;
  escalation_key?: string;
}

export interface ApprovalTimerEvaluation extends JsonObject {
  open_stage: string | null;
  opened_at: string | null;
  due_at: string | null;
  overdue: boolean;
  elapsed_minutes: number;
  due_events: ApprovalTimerEvent[];
  future_events: ApprovalTimerEvent[];
}

const STAGE_KEY = /^[a-z][a-z0-9-]{0,63}$/;
const TIMER_KEY = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_TIMER_MINUTES = 525_600; // one year; longer is configuration drift, not an SLA.
const MAX_ESCALATIONS_PER_STAGE = 16;

function object(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${where} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, where: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${where} must be an array`);
  return value as JsonValue[];
}

function text(value: unknown, where: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${where} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function timestamp(value: unknown, where: string): number {
  const normalized = text(value, where, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw errors.validation(`${where} must be an ISO datetime`);
  return parsed;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Parse timer policy independently from the approval graph so scheduling can evolve without changing decision semantics. */
export function parseApprovalTimerPlan(value: unknown, approvalPlanValue: ApprovalPlan | unknown): ApprovalTimerPlan {
  const approvalPlan = parseApprovalPlan(approvalPlanValue);
  const knownStages = new Set(approvalPlan.stages.map((stage) => stage.key));
  const input = object(value, "approval_timer_plan");
  const schemaVersion = input.schema_version === undefined
    ? 1
    : integer(input.schema_version, "approval_timer_plan.schema_version", 1, 1);
  const rawStages = input.stages === undefined ? [] : array(input.stages, "approval_timer_plan.stages");
  const seenStages = new Set<string>();

  const stages = rawStages.map((rawStage, stageIndex): ApprovalStageTimerPolicy => {
    const where = `approval_timer_plan.stages[${stageIndex}]`;
    const stage = object(rawStage, where);
    const stageKey = text(stage.stage_key, `${where}.stage_key`, 64);
    if (!STAGE_KEY.test(stageKey) || !knownStages.has(stageKey)) {
      throw errors.validation(`${where}.stage_key must name a declared approval stage`);
    }
    if (seenStages.has(stageKey)) throw errors.validation(`Duplicate approval timer policy for stage ${stageKey}`);
    seenStages.add(stageKey);
    const dueAfter = integer(stage.due_after_minutes, `${where}.due_after_minutes`, 1, MAX_TIMER_MINUTES);
    const rawEscalations = stage.escalations === undefined ? [] : array(stage.escalations, `${where}.escalations`);
    if (rawEscalations.length > MAX_ESCALATIONS_PER_STAGE) {
      throw errors.validation(`${where}.escalations may contain at most ${MAX_ESCALATIONS_PER_STAGE} entries`);
    }
    const seenEscalations = new Set<string>();
    const escalations = rawEscalations.map((rawEscalation, escalationIndex): ApprovalEscalationRule => {
      const escalationWhere = `${where}.escalations[${escalationIndex}]`;
      const escalation = object(rawEscalation, escalationWhere);
      const key = text(escalation.key, `${escalationWhere}.key`, 64);
      if (!TIMER_KEY.test(key)) throw errors.validation(`${escalationWhere}.key must be kebab-case`);
      if (seenEscalations.has(key)) throw errors.validation(`${where} repeats escalation ${key}`);
      seenEscalations.add(key);
      const afterMinutes = integer(escalation.after_minutes, `${escalationWhere}.after_minutes`, 1, MAX_TIMER_MINUTES);
      if (afterMinutes <= dueAfter) {
        throw errors.validation(`${escalationWhere}.after_minutes must be later than stage due time ${dueAfter}`);
      }
      return { key, after_minutes: afterMinutes };
    }).sort((left, right) => left.after_minutes - right.after_minutes || left.key.localeCompare(right.key));

    return { stage_key: stageKey, due_after_minutes: dueAfter, escalations };
  });

  return { schema_version: schemaVersion as 1, stages };
}

/**
 * Evaluate due/escalation timestamps from persisted stage-open evidence.
 *
 * No cron, queue or notification side effect happens here. WS10/WS12 may poll/dispatch these
 * stable event keys with their existing delivery/idempotency machinery. That keeps time policy
 * in BPM while delivery reliability remains owned by the async/release streams.
 */
export function evaluateApprovalTimers(
  approvalPlanValue: ApprovalPlan | unknown,
  timerPlanValue: ApprovalTimerPlan | unknown,
  decisions: ApprovalDecisionFact[],
  stageOpenedAt: Record<string, string>,
  nowValue: string,
): ApprovalTimerEvaluation {
  const approvalPlan = parseApprovalPlan(approvalPlanValue);
  const timerPlan = parseApprovalTimerPlan(timerPlanValue, approvalPlan);
  const state = evaluateApprovalPlan(approvalPlan, decisions);
  const now = timestamp(nowValue, "now");
  if (!state.open_stage) {
    return {
      open_stage: null,
      opened_at: null,
      due_at: null,
      overdue: false,
      elapsed_minutes: 0,
      due_events: [],
      future_events: [],
    };
  }

  const policy = timerPlan.stages.find((stage) => stage.stage_key === state.open_stage);
  if (!policy) {
    return {
      open_stage: state.open_stage,
      opened_at: null,
      due_at: null,
      overdue: false,
      elapsed_minutes: 0,
      due_events: [],
      future_events: [],
    };
  }

  const openedRaw = stageOpenedAt[state.open_stage];
  if (!openedRaw) throw errors.validation(`Missing opened-at evidence for timed approval stage ${state.open_stage}`);
  const opened = timestamp(openedRaw, `stage_opened_at.${state.open_stage}`);
  if (now < opened) throw errors.validation(`Current time precedes opened-at evidence for stage ${state.open_stage}`);
  const dueAt = opened + policy.due_after_minutes * 60_000;
  const allEvents: ApprovalTimerEvent[] = [
    {
      event_key: `${state.open_stage}:due`,
      kind: "due",
      stage_key: state.open_stage,
      scheduled_at: iso(dueAt),
    },
    ...policy.escalations.map((rule): ApprovalTimerEvent => ({
      event_key: `${state.open_stage}:escalation:${rule.key}`,
      kind: "escalation",
      stage_key: state.open_stage!,
      escalation_key: rule.key,
      scheduled_at: iso(opened + rule.after_minutes * 60_000),
    })),
  ];
  const dueEvents = allEvents.filter((event) => Date.parse(event.scheduled_at) <= now);
  const futureEvents = allEvents.filter((event) => Date.parse(event.scheduled_at) > now);

  return {
    open_stage: state.open_stage,
    opened_at: iso(opened),
    due_at: iso(dueAt),
    overdue: now >= dueAt,
    elapsed_minutes: Math.floor((now - opened) / 60_000),
    due_events: dueEvents,
    future_events: futureEvents,
  };
}
