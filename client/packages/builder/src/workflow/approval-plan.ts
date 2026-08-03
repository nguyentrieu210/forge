export type ApprovalStageMode = "any" | "all" | "quorum";

export interface ApprovalSelectorModel {
  role?: string;
  user?: string;
}

export interface ApprovalEscalationModel {
  key: string;
  afterMinutes: number;
}

export interface ApprovalStageModel {
  key: string;
  label: string;
  mode: ApprovalStageMode;
  quorum?: number;
  approvers: ApprovalSelectorModel[];
  dueAfterMinutes?: number;
  escalations?: ApprovalEscalationModel[];
}

export interface ApprovalPlanModel {
  distinctActorAcrossStages: boolean;
  stages: ApprovalStageModel[];
}

export interface ApprovalPlanValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ApprovalPlanValidationResult {
  ok: boolean;
  issues: ApprovalPlanValidationIssue[];
}

export interface ApprovalPlanPayload {
  schema_version: 1;
  stages: Array<{
    key: string;
    label: string;
    mode: ApprovalStageMode;
    quorum?: number;
    approvers: Array<{ role?: string; user?: string }>;
  }>;
  distinct_actor_across_stages: boolean;
}

export interface ApprovalTimerPayload {
  schema_version: 1;
  stages: Array<{
    stage_key: string;
    due_after_minutes: number;
    escalations: Array<{ key: string; after_minutes: number }>;
  }>;
}

const KEY = /^[a-z][a-z0-9-]{0,63}$/;

export function blankApprovalPlan(): ApprovalPlanModel {
  return { distinctActorAcrossStages: false, stages: [] };
}

export function newApprovalStage(index: number): ApprovalStageModel {
  return {
    key: `stage-${index + 1}`,
    label: `Bước ${index + 1}`,
    mode: "any",
    approvers: [{ role: "System Manager" }],
  };
}

export function validateApprovalPlan(model: ApprovalPlanModel): ApprovalPlanValidationResult {
  const issues: ApprovalPlanValidationIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ severity: "error" as const, code, path, message });
  const warning = (code: string, path: string, message: string) => issues.push({ severity: "warning" as const, code, path, message });

  if (!Array.isArray(model.stages) || model.stages.length === 0) error("stages", "stages", "Approval plan cần ít nhất một stage");
  if ((model.stages ?? []).length > 32) error("stages_max", "stages", "Approval plan tối đa 32 stage");
  const stageKeys = new Set<string>();

  for (const [index, stage] of (model.stages ?? []).entries()) {
    const path = `stages[${index}]`;
    if (!KEY.test(stage.key ?? "")) error("stage_key", `${path}.key`, "Stage key phải là kebab-case");
    if (stageKeys.has(stage.key)) error("stage_key_dup", `${path}.key`, `Stage key trùng: ${stage.key}`);
    stageKeys.add(stage.key);
    if (!stage.label?.trim()) error("stage_label", `${path}.label`, "Stage cần nhãn");
    if (!["any", "all", "quorum"].includes(stage.mode)) error("stage_mode", `${path}.mode`, "Mode phải là any/all/quorum");
    if (!Array.isArray(stage.approvers) || stage.approvers.length === 0) error("approvers", `${path}.approvers`, "Stage cần ít nhất một approver");
    if ((stage.approvers ?? []).length > 32) error("approvers_max", `${path}.approvers`, "Stage tối đa 32 selector");

    const selectors = new Set<string>();
    for (const [selectorIndex, selector] of (stage.approvers ?? []).entries()) {
      const selectorPath = `${path}.approvers[${selectorIndex}]`;
      const role = selector.role?.trim();
      const user = selector.user?.trim();
      if (Boolean(role) === Boolean(user)) {
        error("approver_exactly_one", selectorPath, "Approver phải chọn đúng một role hoặc user");
        continue;
      }
      const key = role ? `role:${role}` : `user:${user}`;
      if (selectors.has(key)) error("approver_dup", selectorPath, `Approver trùng: ${key}`);
      selectors.add(key);
    }

    if (stage.mode === "quorum") {
      if (!Number.isInteger(stage.quorum) || Number(stage.quorum) < 1 || Number(stage.quorum) > 50) {
        error("quorum", `${path}.quorum`, "Quorum phải là số nguyên 1..50");
      }
    } else if (stage.quorum !== undefined) {
      error("quorum_mode", `${path}.quorum`, "Chỉ mode quorum mới được khai quorum");
    }

    if (stage.dueAfterMinutes !== undefined) {
      if (!Number.isInteger(stage.dueAfterMinutes) || stage.dueAfterMinutes < 1 || stage.dueAfterMinutes > 525_600) {
        error("sla", `${path}.dueAfterMinutes`, "SLA phải là số phút nguyên từ 1 đến 525600");
      }
      const escalationKeys = new Set<string>();
      let previous = stage.dueAfterMinutes;
      for (const [escIndex, escalation] of (stage.escalations ?? []).entries()) {
        const escPath = `${path}.escalations[${escIndex}]`;
        if (!KEY.test(escalation.key ?? "")) error("escalation_key", `${escPath}.key`, "Escalation key phải là kebab-case");
        if (escalationKeys.has(escalation.key)) error("escalation_dup", `${escPath}.key`, `Escalation trùng: ${escalation.key}`);
        escalationKeys.add(escalation.key);
        if (!Number.isInteger(escalation.afterMinutes) || escalation.afterMinutes <= stage.dueAfterMinutes || escalation.afterMinutes > 525_600) {
          error("escalation_time", `${escPath}.afterMinutes`, "Escalation phải sau SLA và không quá 525600 phút");
        }
        if (escalation.afterMinutes < previous) warning("escalation_order", escPath, "Escalation sẽ được serialize theo thời gian tăng dần");
        previous = escalation.afterMinutes;
      }
    } else if ((stage.escalations ?? []).length) {
      error("escalation_without_sla", `${path}.escalations`, "Phải khai SLA trước khi thêm escalation");
    }
  }

  return { ok: !issues.some((entry) => entry.severity === "error"), issues };
}

export function serializeApprovalPlan(model: ApprovalPlanModel): { approval_plan: ApprovalPlanPayload; timer_plan?: ApprovalTimerPayload } {
  const validation = validateApprovalPlan(model);
  if (!validation.ok) {
    throw new Error(`Approval plan invalid: ${validation.issues.filter((entry) => entry.severity === "error").map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
  }
  const approval_plan: ApprovalPlanPayload = {
    schema_version: 1,
    distinct_actor_across_stages: model.distinctActorAcrossStages,
    stages: model.stages.map((stage) => ({
      key: stage.key.trim(),
      label: stage.label.trim(),
      mode: stage.mode,
      ...(stage.mode === "quorum" ? { quorum: stage.quorum } : {}),
      approvers: stage.approvers.map((selector) => selector.role?.trim()
        ? { role: selector.role.trim() }
        : { user: selector.user!.trim() }),
    })),
  };

  const timed = model.stages.filter((stage) => stage.dueAfterMinutes !== undefined);
  const timer_plan: ApprovalTimerPayload | undefined = timed.length
    ? {
      schema_version: 1,
      stages: timed.map((stage) => ({
        stage_key: stage.key.trim(),
        due_after_minutes: stage.dueAfterMinutes!,
        escalations: [...(stage.escalations ?? [])]
          .sort((left, right) => left.afterMinutes - right.afterMinutes || left.key.localeCompare(right.key))
          .map((entry) => ({ key: entry.key.trim(), after_minutes: entry.afterMinutes })),
      })),
    }
    : undefined;

  return { approval_plan, ...(timer_plan ? { timer_plan } : {}) };
}
