import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type ApprovalStageMode = "any" | "all" | "quorum";
export type ApprovalDecision = "approve" | "reject";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "blocked";

export interface ApprovalSelector extends JsonObject {
  key: string;
  role?: string;
  user?: string;
}

export interface ApprovalStage extends JsonObject {
  key: string;
  label: string;
  mode: ApprovalStageMode;
  quorum?: number;
  approvers: ApprovalSelector[];
}

export interface ApprovalPlan extends JsonObject {
  schema_version: 1;
  stages: ApprovalStage[];
  /** Explicit opt-in. Existing SoD/ownership policy remains authoritative outside this engine. */
  distinct_actor_across_stages: boolean;
}

export interface ApprovalDecisionFact extends JsonObject {
  decision_id: string;
  stage_key: string;
  actor_id: string;
  decision: ApprovalDecision;
  matched_approver: string;
  occurred_at: string;
  delegation_id?: string;
}

export interface ApprovalStageEvaluation extends JsonObject {
  key: string;
  status: ApprovalStatus;
  approvals: number;
  required: number;
  approver_keys_satisfied: string[];
  actor_ids: string[];
  rejected_by: string | null;
}

export interface ApprovalEvaluation extends JsonObject {
  status: Exclude<ApprovalStatus, "blocked">;
  open_stage: string | null;
  stages: ApprovalStageEvaluation[];
}

const STAGE_KEY = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_STAGES = 32;
const MAX_APPROVERS = 32;
const MAX_QUORUM = 50;

function object(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`${where} must be an object`);
  }
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

function boolean(value: unknown, where: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw errors.validation(`${where} must be boolean`);
  return value;
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function selectorKey(role?: string, user?: string): string {
  return role ? `role:${role}` : `user:${user}`;
}

function parseSelector(value: JsonValue, where: string): ApprovalSelector {
  const input = object(value, where);
  const role = input.role === undefined ? undefined : text(input.role, `${where}.role`, 160);
  const user = input.user === undefined ? undefined : text(input.user, `${where}.user`, 320);
  if (Boolean(role) === Boolean(user)) {
    throw errors.validation(`${where} must declare exactly one of role or user`);
  }
  return {
    key: selectorKey(role, user),
    ...(role ? { role } : {}),
    ...(user ? { user } : {}),
  };
}

/**
 * Parse the generic staged approval contract.
 *
 * Authorization is deliberately not performed here. WS11 resolves live role/user/delegation
 * eligibility and hands this engine the selector key that justified a persisted decision.
 * That separation keeps BPM deterministic and prevents a later role edit from rewriting
 * history retroactively.
 */
export function parseApprovalPlan(value: unknown): ApprovalPlan {
  const input = object(value, "approval_plan");
  const schemaVersion = input.schema_version === undefined ? 1 : integer(input.schema_version, "approval_plan.schema_version", 1, 1);
  const rawStages = array(input.stages, "approval_plan.stages");
  if (!rawStages.length || rawStages.length > MAX_STAGES) {
    throw errors.validation(`approval_plan.stages must contain 1 to ${MAX_STAGES} stages`);
  }

  const seenStages = new Set<string>();
  const stages = rawStages.map((rawStage, index): ApprovalStage => {
    const where = `approval_plan.stages[${index}]`;
    const stage = object(rawStage, where);
    const key = text(stage.key, `${where}.key`, 64);
    if (!STAGE_KEY.test(key)) throw errors.validation(`${where}.key must be kebab-case`);
    if (seenStages.has(key)) throw errors.validation(`Duplicate approval stage: ${key}`);
    seenStages.add(key);

    const mode = (stage.mode ?? "any") as ApprovalStageMode;
    if (!new Set<ApprovalStageMode>(["any", "all", "quorum"]).has(mode)) {
      throw errors.validation(`${where}.mode must be any, all or quorum`);
    }
    const rawApprovers = array(stage.approvers, `${where}.approvers`);
    if (!rawApprovers.length || rawApprovers.length > MAX_APPROVERS) {
      throw errors.validation(`${where}.approvers must contain 1 to ${MAX_APPROVERS} selectors`);
    }
    const approvers = rawApprovers.map((entry, approverIndex) =>
      parseSelector(entry, `${where}.approvers[${approverIndex}]`));
    const selectorKeys = new Set<string>();
    for (const selector of approvers) {
      if (selectorKeys.has(selector.key)) throw errors.validation(`${where} repeats approver ${selector.key}`);
      selectorKeys.add(selector.key);
    }

    const quorum = mode === "quorum"
      ? integer(stage.quorum, `${where}.quorum`, 1, MAX_QUORUM)
      : undefined;
    if (mode !== "quorum" && stage.quorum !== undefined) {
      throw errors.validation(`${where}.quorum is only valid when mode is quorum`);
    }

    return {
      key,
      label: stage.label === undefined ? key : text(stage.label, `${where}.label`, 160),
      mode,
      ...(quorum === undefined ? {} : { quorum }),
      approvers,
    };
  });

  return {
    schema_version: schemaVersion as 1,
    stages,
    distinct_actor_across_stages: boolean(
      input.distinct_actor_across_stages,
      "approval_plan.distinct_actor_across_stages",
      false,
    ),
  };
}

/**
 * Compatibility compiler for the current Approval Policy `steps_json` shape.
 * Each historical `{role}` / `{user}` entry becomes one sequential `any` stage.
 */
export function approvalPlanFromPolicySteps(
  value: unknown,
  options: { distinct_actor_across_stages?: boolean } = {},
): ApprovalPlan {
  const steps = array(value, "approval policy steps");
  if (!steps.length) throw errors.validation("approval policy steps must not be empty");
  return parseApprovalPlan({
    schema_version: 1,
    distinct_actor_across_stages: options.distinct_actor_across_stages ?? false,
    stages: steps.map((raw, index) => {
      const step = object(raw, `approval policy steps[${index}]`);
      return {
        key: `step-${index + 1}`,
        label: typeof step.label === "string" && step.label.trim() ? step.label.trim() : `Bước ${index + 1}`,
        mode: "any",
        approvers: [{
          ...(step.role === undefined ? {} : { role: step.role }),
          ...(step.user === undefined ? {} : { user: step.user }),
        }],
      };
    }),
  });
}

function requiredApprovals(stage: ApprovalStage): number {
  if (stage.mode === "any") return 1;
  if (stage.mode === "all") return stage.approvers.length;
  return stage.quorum ?? 1;
}

function normalizeFact(value: ApprovalDecisionFact, index: number): ApprovalDecisionFact {
  const where = `approval_decisions[${index}]`;
  const input = object(value, where);
  const decision = input.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw errors.validation(`${where}.decision must be approve or reject`);
  }
  return {
    decision_id: text(input.decision_id, `${where}.decision_id`, 160),
    stage_key: text(input.stage_key, `${where}.stage_key`, 64),
    actor_id: text(input.actor_id, `${where}.actor_id`, 320),
    decision,
    matched_approver: text(input.matched_approver, `${where}.matched_approver`, 480),
    occurred_at: text(input.occurred_at, `${where}.occurred_at`, 64),
    ...(input.delegation_id === undefined ? {} : { delegation_id: text(input.delegation_id, `${where}.delegation_id`, 160) }),
  };
}

/** Deterministically fold persisted approval facts into the current plan state. */
export function evaluateApprovalPlan(
  planValue: ApprovalPlan | unknown,
  decisionValues: ApprovalDecisionFact[] = [],
): ApprovalEvaluation {
  const plan = parseApprovalPlan(planValue);
  if (!Array.isArray(decisionValues)) throw errors.validation("approval_decisions must be an array");
  const facts = decisionValues.map(normalizeFact);
  const stageByKey = new Map(plan.stages.map((stage) => [stage.key, stage]));
  const factsByStage = new Map<string, ApprovalDecisionFact[]>();
  const seenDecisionIds = new Set<string>();
  for (const fact of facts) {
    if (seenDecisionIds.has(fact.decision_id)) throw errors.validation(`Duplicate approval decision id: ${fact.decision_id}`);
    seenDecisionIds.add(fact.decision_id);
    const stage = stageByKey.get(fact.stage_key);
    if (!stage) throw errors.validation(`Approval decision names unknown stage: ${fact.stage_key}`);
    if (!stage.approvers.some((selector) => selector.key === fact.matched_approver)) {
      throw errors.validation(`Approval decision ${fact.decision_id} cites selector not declared by ${fact.stage_key}: ${fact.matched_approver}`);
    }
    const bucket = factsByStage.get(fact.stage_key) ?? [];
    bucket.push(fact);
    factsByStage.set(fact.stage_key, bucket);
  }

  const actorSeenGlobally = new Set<string>();
  const evaluations: ApprovalStageEvaluation[] = [];
  let planStatus: ApprovalEvaluation["status"] = "pending";
  let openStage: string | null = null;
  let priorComplete = true;

  for (const stage of plan.stages) {
    const stageFacts = factsByStage.get(stage.key) ?? [];
    if (!priorComplete) {
      if (stageFacts.length) throw errors.validation(`Approval decisions exist for blocked future stage: ${stage.key}`);
      evaluations.push({
        key: stage.key,
        status: "blocked",
        approvals: 0,
        required: requiredApprovals(stage),
        approver_keys_satisfied: [],
        actor_ids: [],
        rejected_by: null,
      });
      continue;
    }

    const actorIds = new Set<string>();
    const selectorKeys = new Set<string>();
    let rejectedBy: string | null = null;
    for (const fact of stageFacts) {
      if (actorIds.has(fact.actor_id)) {
        throw errors.validation(`Actor ${fact.actor_id} has more than one decision in stage ${stage.key}`);
      }
      if (plan.distinct_actor_across_stages && actorSeenGlobally.has(fact.actor_id)) {
        throw errors.validation(`Actor ${fact.actor_id} is reused across approval stages`);
      }
      actorIds.add(fact.actor_id);
      actorSeenGlobally.add(fact.actor_id);
      if (fact.decision === "reject") rejectedBy ??= fact.actor_id;
      else selectorKeys.add(fact.matched_approver);
    }

    const approvals = [...stageFacts].filter((fact) => fact.decision === "approve").length;
    const required = requiredApprovals(stage);
    const approved = stage.mode === "all"
      ? stage.approvers.every((selector) => selectorKeys.has(selector.key))
      : approvals >= required;
    const status: ApprovalStageEvaluation["status"] = rejectedBy
      ? "rejected"
      : approved ? "approved" : "pending";

    evaluations.push({
      key: stage.key,
      status,
      approvals,
      required,
      approver_keys_satisfied: [...selectorKeys].sort(),
      actor_ids: [...actorIds].sort(),
      rejected_by: rejectedBy,
    });

    if (status === "rejected") {
      planStatus = "rejected";
      priorComplete = false;
    } else if (status === "pending") {
      openStage = stage.key;
      priorComplete = false;
    }
  }

  if (planStatus !== "rejected" && evaluations.every((stage) => stage.status === "approved")) {
    planStatus = "approved";
    openStage = null;
  }

  return { status: planStatus, open_stage: openStage, stages: evaluations };
}

export interface NewApprovalDecision {
  decision_id: string;
  stage_key: string;
  actor_id: string;
  decision: ApprovalDecision;
  /** Selector keys WS11 proved this actor may satisfy right now, including delegation. */
  eligible_approvers: string[];
  matched_approver: string;
  occurred_at: string;
  delegation_id?: string;
}

/**
 * Validate one new decision against current deterministic state and authorization evidence.
 * Returns the normalized fact to persist; it never writes storage itself.
 */
export function createApprovalDecisionFact(
  planValue: ApprovalPlan | unknown,
  currentFacts: ApprovalDecisionFact[],
  inputValue: NewApprovalDecision,
): ApprovalDecisionFact {
  const plan = parseApprovalPlan(planValue);
  const current = evaluateApprovalPlan(plan, currentFacts);
  const input = object(inputValue, "approval_decision");
  const stageKey = text(input.stage_key, "approval_decision.stage_key", 64);
  if (current.status !== "pending" || current.open_stage !== stageKey) {
    throw errors.validation(`Approval stage ${stageKey} is not open`);
  }
  const stage = plan.stages.find((candidate) => candidate.key === stageKey)!;
  const matchedApprover = text(input.matched_approver, "approval_decision.matched_approver", 480);
  if (!stage.approvers.some((selector) => selector.key === matchedApprover)) {
    throw errors.permission(`Approver selector ${matchedApprover} is not allowed for stage ${stageKey}`);
  }
  const eligible = Array.isArray(input.eligible_approvers)
    ? input.eligible_approvers.map((value, index) => text(value, `approval_decision.eligible_approvers[${index}]`, 480))
    : [];
  if (!eligible.includes(matchedApprover)) {
    throw errors.permission(`Actor is not currently eligible for ${matchedApprover}`);
  }

  const decision = input.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw errors.validation("approval_decision.decision must be approve or reject");
  }
  const actorId = text(input.actor_id, "approval_decision.actor_id", 320);
  if (currentFacts.some((fact) => fact.stage_key === stageKey && fact.actor_id === actorId)) {
    throw errors.validation(`Actor ${actorId} already decided stage ${stageKey}`);
  }
  if (plan.distinct_actor_across_stages && currentFacts.some((fact) => fact.actor_id === actorId)) {
    throw errors.validation(`Actor ${actorId} already decided another approval stage`);
  }

  return normalizeFact({
    decision_id: text(input.decision_id, "approval_decision.decision_id", 160),
    stage_key: stageKey,
    actor_id: actorId,
    decision,
    matched_approver: matchedApprover,
    occurred_at: text(input.occurred_at, "approval_decision.occurred_at", 64),
    ...(input.delegation_id === undefined ? {} : { delegation_id: text(input.delegation_id, "approval_decision.delegation_id", 160) }),
  }, currentFacts.length);
}
