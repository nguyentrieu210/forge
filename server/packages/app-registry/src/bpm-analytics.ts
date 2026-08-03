import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type BpmStageOutcome = "approved" | "rejected" | "cancelled";

export interface BpmStageTimingFact extends JsonObject {
  process_key: string;
  instance_id: string;
  stage_key: string;
  run_id: string;
  opened_at: string;
  closed_at?: string;
  outcome?: BpmStageOutcome;
}

export interface BpmStageMetric extends JsonObject {
  stage_key: string;
  total_runs: number;
  completed_runs: number;
  open_runs: number;
  rejected_runs: number;
  average_minutes: number | null;
  p50_minutes: number | null;
  p95_minutes: number | null;
  max_minutes: number | null;
  oldest_open_minutes: number | null;
}

export interface BpmProcessAnalytics extends JsonObject {
  process_key: string;
  instance_count: number;
  stage_metrics: BpmStageMetric[];
  bottlenecks: BpmStageMetric[];
}

const KEY = /^[a-z][a-z0-9_.:-]{0,159}$/;
const MAX_FACTS = 100_000;

function object(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${where} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, where: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${where} must be an array`);
  return value as JsonValue[];
}

function text(value: unknown, where: string, max = 320): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${where} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function key(value: unknown, where: string): string {
  const normalized = text(value, where, 160);
  if (!KEY.test(normalized)) throw errors.validation(`${where} has unsupported characters`);
  return normalized;
}

function timestamp(value: unknown, where: string): { raw: string; ms: number } {
  const raw = text(value, where, 64);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw errors.validation(`${where} must be an ISO datetime`);
  return { raw: new Date(ms).toISOString(), ms };
}

export function parseBpmStageTimingFacts(value: unknown): BpmStageTimingFact[] {
  const rawFacts = array(value, "bpm_stage_facts");
  if (rawFacts.length > MAX_FACTS) throw errors.validation(`bpm_stage_facts may contain at most ${MAX_FACTS} rows`);
  const identities = new Set<string>();
  return rawFacts.map((raw, index): BpmStageTimingFact => {
    const where = `bpm_stage_facts[${index}]`;
    const input = object(raw, where);
    const processKey = key(input.process_key, `${where}.process_key`);
    const instanceId = key(input.instance_id, `${where}.instance_id`);
    const stageKey = key(input.stage_key, `${where}.stage_key`);
    const runId = key(input.run_id, `${where}.run_id`);
    const identity = `${processKey}\u0000${instanceId}\u0000${runId}`;
    if (identities.has(identity)) throw errors.validation(`Duplicate BPM stage run: ${processKey}/${instanceId}/${runId}`);
    identities.add(identity);
    const opened = timestamp(input.opened_at, `${where}.opened_at`);
    const closed = input.closed_at === undefined ? undefined : timestamp(input.closed_at, `${where}.closed_at`);
    if (closed && closed.ms < opened.ms) throw errors.validation(`${where}.closed_at precedes opened_at`);
    const outcome = input.outcome as BpmStageOutcome | undefined;
    if (outcome !== undefined && !new Set<BpmStageOutcome>(["approved", "rejected", "cancelled"]).has(outcome)) {
      throw errors.validation(`${where}.outcome must be approved, rejected or cancelled`);
    }
    if (Boolean(closed) !== Boolean(outcome)) throw errors.validation(`${where} must declare closed_at and outcome together`);
    return {
      process_key: processKey,
      instance_id: instanceId,
      stage_key: stageKey,
      run_id: runId,
      opened_at: opened.raw,
      ...(closed ? { closed_at: closed.raw, outcome: outcome! } : {}),
    };
  });
}

function minutes(ms: number): number {
  return Math.round((ms / 60_000) * 1000) / 1000;
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.min(index, sorted.length - 1)]!;
}

/**
 * Analyze stage timing facts without owning storage. Callers may derive these rows from approval
 * decision/stage persistence, audit history or a warehouse. This keeps analytics replayable and
 * prevents the dashboard from becoming the source of truth for the process itself.
 */
export function analyzeBpmProcess(
  factsValue: BpmStageTimingFact[] | unknown,
  processKeyValue: string,
  nowValue: string,
): BpmProcessAnalytics {
  const facts = parseBpmStageTimingFacts(factsValue);
  const processKey = key(processKeyValue, "process_key");
  const now = timestamp(nowValue, "now").ms;
  const selected = facts.filter((fact) => fact.process_key === processKey);
  const instanceCount = new Set(selected.map((fact) => fact.instance_id)).size;
  const stageKeys = [...new Set(selected.map((fact) => fact.stage_key))].sort();
  const stageMetrics = stageKeys.map((stageKey): BpmStageMetric => {
    const runs = selected.filter((fact) => fact.stage_key === stageKey);
    const completedDurations = runs
      .filter((fact) => fact.closed_at)
      .map((fact) => Date.parse(fact.closed_at!) - Date.parse(fact.opened_at))
      .sort((left, right) => left - right);
    const openDurations = runs
      .filter((fact) => !fact.closed_at)
      .map((fact) => {
        const opened = Date.parse(fact.opened_at);
        if (now < opened) throw errors.validation(`now precedes open BPM stage fact ${fact.run_id}`);
        return now - opened;
      });
    const average = completedDurations.length
      ? completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length
      : null;
    const p50 = percentile(completedDurations, 0.50);
    const p95 = percentile(completedDurations, 0.95);
    const max = completedDurations.length ? completedDurations.at(-1)! : null;
    const oldestOpen = openDurations.length ? Math.max(...openDurations) : null;
    return {
      stage_key: stageKey,
      total_runs: runs.length,
      completed_runs: completedDurations.length,
      open_runs: openDurations.length,
      rejected_runs: runs.filter((fact) => fact.outcome === "rejected").length,
      average_minutes: average === null ? null : minutes(average),
      p50_minutes: p50 === null ? null : minutes(p50),
      p95_minutes: p95 === null ? null : minutes(p95),
      max_minutes: max === null ? null : minutes(max),
      oldest_open_minutes: oldestOpen === null ? null : minutes(oldestOpen),
    };
  });

  // Bottleneck ranking prefers completed p95 evidence, then oldest live queue age. Stages with
  // no timing evidence stay last instead of receiving a made-up zero-duration score.
  const bottlenecks = [...stageMetrics].sort((left, right) => {
    const leftScore = left.p95_minutes ?? left.oldest_open_minutes ?? -1;
    const rightScore = right.p95_minutes ?? right.oldest_open_minutes ?? -1;
    return rightScore - leftScore || right.open_runs - left.open_runs || left.stage_key.localeCompare(right.stage_key);
  });

  return { process_key: processKey, instance_count: instanceCount, stage_metrics: stageMetrics, bottlenecks };
}
