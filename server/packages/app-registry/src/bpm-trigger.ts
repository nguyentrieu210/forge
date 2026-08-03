import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  evaluateDecisionExpression,
  parseDecisionRuleSet,
  type DecisionExpression,
} from "./bpm-rule.js";
import { hookMatches } from "./manifest.js";

export interface BpmEventTrigger extends JsonObject {
  key: string;
  event: string;
  action: string;
  when?: DecisionExpression;
}

export interface BpmScheduleOnce extends JsonObject {
  kind: "once";
  at: string;
}

export interface BpmScheduleInterval extends JsonObject {
  kind: "interval";
  anchor: string;
  every_minutes: number;
}

export type BpmScheduleSpec = BpmScheduleOnce | BpmScheduleInterval;

export interface BpmScheduledAction extends JsonObject {
  key: string;
  action: string;
  schedule: BpmScheduleSpec;
}

export interface BpmTriggerSet extends JsonObject {
  schema_version: 1;
  event_triggers: BpmEventTrigger[];
  scheduled_actions: BpmScheduledAction[];
}

export interface BpmScheduledOccurrence extends JsonObject {
  occurrence_key: string;
  schedule_key: string;
  action: string;
  scheduled_at: string;
}

const KEY = /^[a-z][a-z0-9-]{0,63}$/;
const EVENT = /^(?:\*|[a-z0-9_]+(?:\.[a-z0-9_]+)*(?:\.\*)?)$/;
const MAX_TRIGGERS = 500;
const MAX_INTERVAL_MINUTES = 525_600;
const MAX_OCCURRENCES = 100;

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
  const raw = text(value, where, 64);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw errors.validation(`${where} must be an ISO datetime`);
  return parsed;
}

function parseCondition(value: unknown, where: string, knownFields?: ReadonlySet<string>): DecisionExpression {
  // Reuse the decision-rule parser rather than maintain a second expression grammar.
  return parseDecisionRuleSet({
    rules: [{ key: "trigger-condition", when: value, outcome: {} }],
  }, knownFields).rules[0]!.when;
}

export function parseBpmTriggerSet(
  value: unknown,
  declaredActions?: ReadonlySet<string>,
  knownFields?: ReadonlySet<string>,
): BpmTriggerSet {
  const input = object(value, "bpm_triggers");
  const schemaVersion = input.schema_version === undefined
    ? 1
    : integer(input.schema_version, "bpm_triggers.schema_version", 1, 1);
  const eventRaw = input.event_triggers === undefined ? [] : array(input.event_triggers, "bpm_triggers.event_triggers");
  const scheduleRaw = input.scheduled_actions === undefined ? [] : array(input.scheduled_actions, "bpm_triggers.scheduled_actions");
  if (eventRaw.length + scheduleRaw.length > MAX_TRIGGERS) throw errors.validation(`bpm_triggers may contain at most ${MAX_TRIGGERS} triggers`);
  const seen = new Set<string>();

  const validateKey = (raw: unknown, where: string): string => {
    const key = text(raw, where, 64);
    if (!KEY.test(key)) throw errors.validation(`${where} must be kebab-case`);
    if (seen.has(key)) throw errors.validation(`Duplicate BPM trigger key: ${key}`);
    seen.add(key);
    return key;
  };
  const validateAction = (raw: unknown, where: string): string => {
    const action = text(raw, where, 160);
    if (declaredActions && !declaredActions.has(action)) throw errors.validation(`${where} references undeclared action ${action}`);
    return action;
  };

  const eventTriggers = eventRaw.map((raw, index): BpmEventTrigger => {
    const where = `bpm_triggers.event_triggers[${index}]`;
    const entry = object(raw, where);
    const key = validateKey(entry.key, `${where}.key`);
    const event = text(entry.event, `${where}.event`, 160);
    if (!EVENT.test(event)) throw errors.validation(`${where}.event is not a supported exact/prefix event pattern`);
    return {
      key,
      event,
      action: validateAction(entry.action, `${where}.action`),
      ...(entry.when === undefined ? {} : { when: parseCondition(entry.when, `${where}.when`, knownFields) }),
    };
  });

  const scheduledActions = scheduleRaw.map((raw, index): BpmScheduledAction => {
    const where = `bpm_triggers.scheduled_actions[${index}]`;
    const entry = object(raw, where);
    const key = validateKey(entry.key, `${where}.key`);
    const schedule = object(entry.schedule, `${where}.schedule`);
    if (schedule.kind === "once") {
      const at = text(schedule.at, `${where}.schedule.at`, 64);
      timestamp(at, `${where}.schedule.at`);
      return { key, action: validateAction(entry.action, `${where}.action`), schedule: { kind: "once", at } };
    }
    if (schedule.kind === "interval") {
      const anchor = text(schedule.anchor, `${where}.schedule.anchor`, 64);
      timestamp(anchor, `${where}.schedule.anchor`);
      return {
        key,
        action: validateAction(entry.action, `${where}.action`),
        schedule: {
          kind: "interval",
          anchor,
          every_minutes: integer(schedule.every_minutes, `${where}.schedule.every_minutes`, 1, MAX_INTERVAL_MINUTES),
        },
      };
    }
    throw errors.validation(`${where}.schedule.kind must be once or interval`);
  });

  return { schema_version: schemaVersion as 1, event_triggers: eventTriggers, scheduled_actions: scheduledActions };
}

/** Match already-committed domain events to declared AppAction keys. */
export function matchBpmEventTriggers(
  triggerSetValue: BpmTriggerSet | unknown,
  eventType: string,
  document: JsonObject,
): BpmEventTrigger[] {
  const triggers = parseBpmTriggerSet(triggerSetValue);
  return triggers.event_triggers.filter((trigger) =>
    hookMatches(trigger.event, eventType) && (!trigger.when || evaluateDecisionExpression(trigger.when, document)));
}

/**
 * Return every due scheduled occurrence after the caller's durable watermark and through `now`.
 * Occurrence keys are deterministic, allowing WS10/WS12 delivery to deduplicate safely.
 */
export function dueBpmScheduledActions(
  triggerSetValue: BpmTriggerSet | unknown,
  afterValue: string | null,
  nowValue: string,
): BpmScheduledOccurrence[] {
  const triggers = parseBpmTriggerSet(triggerSetValue);
  const after = afterValue ? timestamp(afterValue, "after") : Number.NEGATIVE_INFINITY;
  const now = timestamp(nowValue, "now");
  if (now < after) throw errors.validation("now must not precede schedule watermark");
  const occurrences: BpmScheduledOccurrence[] = [];

  for (const entry of triggers.scheduled_actions) {
    if (entry.schedule.kind === "once") {
      const at = timestamp(entry.schedule.at, `schedule ${entry.key}`);
      if (at > after && at <= now) {
        occurrences.push({ occurrence_key: `${entry.key}@${new Date(at).toISOString()}`, schedule_key: entry.key, action: entry.action, scheduled_at: new Date(at).toISOString() });
      }
      continue;
    }

    const anchor = timestamp(entry.schedule.anchor, `schedule ${entry.key}`);
    const step = entry.schedule.every_minutes * 60_000;
    if (now < anchor) continue;
    let index = Math.max(0, Math.floor((after - anchor) / step) + 1);
    if (!Number.isFinite(index)) index = 0;
    for (;; index += 1) {
      const at = anchor + index * step;
      if (at > now) break;
      if (at <= after) continue;
      occurrences.push({ occurrence_key: `${entry.key}@${new Date(at).toISOString()}`, schedule_key: entry.key, action: entry.action, scheduled_at: new Date(at).toISOString() });
      if (occurrences.length > MAX_OCCURRENCES) {
        throw errors.validation(`Scheduled action catch-up exceeds ${MAX_OCCURRENCES} occurrences; advance in smaller windows`);
      }
    }
  }

  return occurrences.sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at) || left.schedule_key.localeCompare(right.schedule_key));
}
