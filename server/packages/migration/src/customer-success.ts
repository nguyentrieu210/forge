import { errors, sha256Hex } from "../../core/src/index.js";

export interface TrainingRequirement {
  key: string;
  role: string;
  topic: string;
  required: boolean;
}

export interface TrainingEvidence {
  requirement_key: string;
  completed_by: string;
  completed_at: string;
  evidence_ref: string;
}

export interface KnowledgeReference {
  key: string;
  title: string;
  kind: "help" | "knowledge_base" | "runbook";
  reference: string;
  audience_roles?: string[];
}

export interface SupportHandoff {
  provider: string;
  channel_ref: string;
  escalation_ref?: string;
}

export interface AdoptionCounter {
  actor_id: string;
  capability: string;
  successful_actions: number;
}

export interface AdoptionTarget {
  capability: string;
  minimum_active_actors: number;
  minimum_successful_actions: number;
}

export interface CustomerSuccessPlan {
  training: TrainingRequirement[];
  knowledge: KnowledgeReference[];
  support?: SupportHandoff;
  adoption_targets: AdoptionTarget[];
}

export interface CustomerSuccessReadiness {
  ready: boolean;
  training_open: string[];
  missing_knowledge: string[];
  support_configured: boolean;
  adoption_gaps: Array<{ capability: string; active_actors: number; successful_actions: number; target_active_actors: number; target_successful_actions: number }>;
}

export interface CustomerSuccessSnapshot extends CustomerSuccessReadiness {
  snapshot_id: string;
  plan_fingerprint: string;
}

/**
 * Evaluates post-implementation enablement without owning a second Helpdesk.
 * `support.provider/channel_ref` points at the service/helpdesk boundary owned elsewhere;
 * WS13 only gates go-live/adoption on that handoff being configured when requested.
 */
export function evaluateCustomerSuccess(input: {
  plan: CustomerSuccessPlan;
  training_evidence: TrainingEvidence[];
  adoption: AdoptionCounter[];
}): CustomerSuccessReadiness {
  const plan = normalizePlan(input.plan);
  const evidence = normalizeTrainingEvidence(input.training_evidence);
  const evidenceKeys = new Set(evidence.map((entry) => entry.requirement_key));
  const trainingOpen = plan.training.filter((requirement) => requirement.required && !evidenceKeys.has(requirement.key)).map((requirement) => requirement.key);
  const knowledgeKeys = new Set(plan.knowledge.map((entry) => entry.key));
  const missingKnowledge = plan.training
    .filter((requirement) => requirement.required && !plan.knowledge.some((knowledge) => !knowledge.audience_roles?.length || knowledge.audience_roles.includes(requirement.role)))
    .map((requirement) => requirement.key);

  // Keep this explicit so a future plan may refer to knowledge keys from another source
  // without silently accepting duplicate/malformed records today.
  if (knowledgeKeys.size !== plan.knowledge.length) throw errors.validation("Duplicate knowledge reference key");

  const adoptionRows = normalizeAdoption(input.adoption);
  const adoptionGaps = plan.adoption_targets.flatMap((target) => {
    const forCapability = adoptionRows.filter((entry) => entry.capability === target.capability);
    const activeActors = new Set(forCapability.filter((entry) => entry.successful_actions > 0).map((entry) => entry.actor_id)).size;
    const successfulActions = forCapability.reduce((sum, entry) => sum + entry.successful_actions, 0);
    if (activeActors >= target.minimum_active_actors && successfulActions >= target.minimum_successful_actions) return [];
    return [{
      capability: target.capability,
      active_actors: activeActors,
      successful_actions: successfulActions,
      target_active_actors: target.minimum_active_actors,
      target_successful_actions: target.minimum_successful_actions,
    }];
  });

  const supportConfigured = plan.support === undefined || Boolean(plan.support.provider && plan.support.channel_ref);
  return {
    ready: trainingOpen.length === 0 && missingKnowledge.length === 0 && supportConfigured && adoptionGaps.length === 0,
    training_open: trainingOpen,
    missing_knowledge: missingKnowledge,
    support_configured: supportConfigured,
    adoption_gaps: adoptionGaps,
  };
}

export async function snapshotCustomerSuccess(input: {
  plan: CustomerSuccessPlan;
  training_evidence: TrainingEvidence[];
  adoption: AdoptionCounter[];
}): Promise<CustomerSuccessSnapshot> {
  const plan = normalizePlan(input.plan);
  const readiness = evaluateCustomerSuccess({ ...input, plan });
  const fingerprint = await sha256Hex(stableStringify(plan));
  const digest = await sha256Hex(stableStringify({ plan_fingerprint: fingerprint, readiness }));
  return { ...readiness, plan_fingerprint: fingerprint, snapshot_id: `customer-success-${digest.slice(0, 40)}` };
}

function normalizePlan(plan: CustomerSuccessPlan): CustomerSuccessPlan {
  const trainingKeys = new Set<string>();
  const training = plan.training.map((entry, index) => {
    const key = text(entry.key, `training[${index}].key`, 120);
    if (trainingKeys.has(key)) throw errors.validation(`Duplicate training requirement: ${key}`);
    trainingKeys.add(key);
    return {
      key,
      role: text(entry.role, `${key}.role`, 120),
      topic: text(entry.topic, `${key}.topic`, 240),
      required: entry.required === true,
    };
  });
  const knowledge = plan.knowledge.map((entry, index) => ({
    key: text(entry.key, `knowledge[${index}].key`, 120),
    title: text(entry.title, `knowledge[${index}].title`, 240),
    kind: entry.kind,
    reference: text(entry.reference, `knowledge[${index}].reference`, 1000),
    ...(entry.audience_roles?.length ? { audience_roles: [...new Set(entry.audience_roles.map((role) => text(role, `${entry.key}.audience_roles`, 120)))] } : {}),
  }));
  for (const entry of knowledge) {
    if (!(["help", "knowledge_base", "runbook"] as const).includes(entry.kind)) throw errors.validation(`Unknown knowledge reference kind: ${String(entry.kind)}`);
  }
  const targetKeys = new Set<string>();
  const adoptionTargets = plan.adoption_targets.map((target, index) => {
    const capability = text(target.capability, `adoption_targets[${index}].capability`, 160);
    if (targetKeys.has(capability)) throw errors.validation(`Duplicate adoption target: ${capability}`);
    targetKeys.add(capability);
    return {
      capability,
      minimum_active_actors: nonNegativeInt(target.minimum_active_actors, `${capability}.minimum_active_actors`),
      minimum_successful_actions: nonNegativeInt(target.minimum_successful_actions, `${capability}.minimum_successful_actions`),
    };
  });
  const support = plan.support === undefined ? undefined : {
    provider: text(plan.support.provider, "support.provider", 160),
    channel_ref: text(plan.support.channel_ref, "support.channel_ref", 1000),
    ...(plan.support.escalation_ref?.trim() ? { escalation_ref: text(plan.support.escalation_ref, "support.escalation_ref", 1000) } : {}),
  };
  return { training, knowledge, ...(support ? { support } : {}), adoption_targets: adoptionTargets };
}

function normalizeTrainingEvidence(entries: TrainingEvidence[]): TrainingEvidence[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const requirementKey = text(entry.requirement_key, `training_evidence[${index}].requirement_key`, 120);
    if (seen.has(requirementKey)) throw errors.validation(`Duplicate training evidence: ${requirementKey}`);
    seen.add(requirementKey);
    const completedAt = text(entry.completed_at, `${requirementKey}.completed_at`, 80);
    if (Number.isNaN(Date.parse(completedAt))) throw errors.validation(`Invalid training completion datetime: ${requirementKey}`);
    return {
      requirement_key: requirementKey,
      completed_by: text(entry.completed_by, `${requirementKey}.completed_by`, 240),
      completed_at: completedAt,
      evidence_ref: text(entry.evidence_ref, `${requirementKey}.evidence_ref`, 1000),
    };
  });
}

function normalizeAdoption(entries: AdoptionCounter[]): AdoptionCounter[] {
  return entries.map((entry, index) => ({
    actor_id: text(entry.actor_id, `adoption[${index}].actor_id`, 240),
    capability: text(entry.capability, `adoption[${index}].capability`, 160),
    successful_actions: nonNegativeInt(entry.successful_actions, `adoption[${index}].successful_actions`),
  }));
}

function nonNegativeInt(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw errors.validation(`${label} must be a non-negative integer`);
  return value as number;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const result = value.trim();
  if (result.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return result;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) output[key] = canonicalize(input[key]);
  return output;
}
