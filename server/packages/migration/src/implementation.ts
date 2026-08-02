import { errors, sha256Hex } from "../../core/src/index.js";

export type ImplementationStage = "setup" | "master_data" | "opening_data" | "reconciliation" | "training" | "go_live";
export type ImplementationItemStatus = "pending" | "in_progress" | "blocked" | "done" | "waived";

export interface ImplementationChecklistItem {
  key: string;
  label: string;
  stage: ImplementationStage;
  required: boolean;
  status: ImplementationItemStatus;
  depends_on?: string[];
  evidence?: string[];
  blocker?: string;
  waiver_reason?: string;
}

export interface ImplementationStageSummary {
  stage: ImplementationStage;
  total: number;
  completed: number;
  required_open: number;
}

export interface ImplementationReadiness {
  ready_for_go_live: boolean;
  completed: number;
  total: number;
  required_open: string[];
  dependency_blocked: string[];
  stages: ImplementationStageSummary[];
}

export interface ImplementationReadinessSnapshot extends ImplementationReadiness {
  snapshot_id: string;
  checklist_fingerprint: string;
}

const STAGES: readonly ImplementationStage[] = [
  "setup", "master_data", "opening_data", "reconciliation", "training", "go_live",
];

/**
 * Validates and evaluates a customer implementation checklist without inventing domain
 * truth. Finance/stock/payroll owners provide their own required items/evidence; WS13
 * orchestrates dependencies and refuses go-live while a required item is unresolved.
 */
export function evaluateImplementationReadiness(
  items: readonly ImplementationChecklistItem[],
): ImplementationReadiness {
  const normalized = normalizeChecklist(items);
  const byKey = new Map(normalized.map((item) => [item.key, item]));
  assertAcyclic(byKey);

  const requiredOpen: string[] = [];
  const dependencyBlocked: string[] = [];
  let completed = 0;
  for (const item of normalized) {
    const isComplete = item.status === "done" || item.status === "waived";
    if (isComplete) completed += 1;
    if (item.required && !isComplete) requiredOpen.push(item.key);
    const unmet = (item.depends_on ?? []).some((dependency) => {
      const dependencyItem = byKey.get(dependency)!;
      return dependencyItem.status !== "done" && dependencyItem.status !== "waived";
    });
    if (unmet && !isComplete) dependencyBlocked.push(item.key);
  }

  const stages = STAGES.map((stage) => {
    const stageItems = normalized.filter((item) => item.stage === stage);
    return {
      stage,
      total: stageItems.length,
      completed: stageItems.filter((item) => item.status === "done" || item.status === "waived").length,
      required_open: stageItems.filter((item) => item.required && item.status !== "done" && item.status !== "waived").length,
    };
  });

  return {
    ready_for_go_live: requiredOpen.length === 0 && dependencyBlocked.length === 0,
    completed,
    total: normalized.length,
    required_open: requiredOpen,
    dependency_blocked: dependencyBlocked,
    stages,
  };
}

/** Creates immutable evidence identity for a reviewed checklist state. */
export async function snapshotImplementationReadiness(
  items: readonly ImplementationChecklistItem[],
): Promise<ImplementationReadinessSnapshot> {
  const normalized = normalizeChecklist(items);
  const readiness = evaluateImplementationReadiness(normalized);
  const canonical = stableStringify(normalized);
  const checklistFingerprint = await sha256Hex(canonical);
  const snapshotDigest = await sha256Hex(stableStringify({ checklist_fingerprint: checklistFingerprint, readiness }));
  return {
    ...readiness,
    checklist_fingerprint: checklistFingerprint,
    snapshot_id: `implementation-${snapshotDigest.slice(0, 40)}`,
  };
}

export function assertImplementationStatusTransition(
  current: ImplementationItemStatus,
  next: ImplementationItemStatus,
): ImplementationItemStatus {
  const allowed: Readonly<Record<ImplementationItemStatus, readonly ImplementationItemStatus[]>> = {
    pending: ["in_progress", "blocked", "done", "waived"],
    in_progress: ["blocked", "done", "waived"],
    blocked: ["in_progress", "done", "waived"],
    done: ["in_progress"],
    waived: ["in_progress"],
  };
  if (!allowed[current].includes(next)) {
    throw errors.lifecycle(`Implementation item cannot move from ${current} to ${next}`);
  }
  return next;
}

function normalizeChecklist(items: readonly ImplementationChecklistItem[]): ImplementationChecklistItem[] {
  const keys = new Set<string>();
  const output = items.map((item, index) => {
    const key = requireText(item.key, `items[${index}].key`, 120);
    if (keys.has(key)) throw errors.validation(`Duplicate implementation checklist key: ${key}`);
    keys.add(key);
    const label = requireText(item.label, `items[${index}].label`, 240);
    if (!STAGES.includes(item.stage)) throw errors.validation(`Unknown implementation stage: ${item.stage}`);
    const dependencies = [...new Set((item.depends_on ?? []).map((value) => requireText(value, `${key}.depends_on`, 120)))];
    if (dependencies.includes(key)) throw errors.validation(`Implementation item cannot depend on itself: ${key}`);
    const evidence = [...new Set((item.evidence ?? []).map((value) => requireText(value, `${key}.evidence`, 1000)))];
    if (item.status === "blocked" && !item.blocker?.trim()) {
      throw errors.validation(`Blocked implementation item requires blocker: ${key}`);
    }
    if (item.status === "waived" && !item.waiver_reason?.trim()) {
      throw errors.validation(`Waived implementation item requires waiver_reason: ${key}`);
    }
    return {
      key,
      label,
      stage: item.stage,
      required: item.required === true,
      status: item.status,
      ...(dependencies.length ? { depends_on: dependencies } : {}),
      ...(evidence.length ? { evidence } : {}),
      ...(item.blocker?.trim() ? { blocker: item.blocker.trim() } : {}),
      ...(item.waiver_reason?.trim() ? { waiver_reason: item.waiver_reason.trim() } : {}),
    };
  });
  for (const item of output) {
    for (const dependency of item.depends_on ?? []) {
      if (!keys.has(dependency)) throw errors.validation(`Unknown implementation dependency ${dependency} for ${item.key}`);
    }
  }
  return output;
}

function assertAcyclic(items: ReadonlyMap<string, ImplementationChecklistItem>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw errors.validation(`Implementation checklist dependency cycle at ${key}`);
    visiting.add(key);
    const item = items.get(key)!;
    for (const dependency of item.depends_on ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of items.keys()) visit(key);
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) output[key] = canonicalize(source[key]);
  return output;
}
