/**
 * Workflow serializer (Builder serializer #2) — WorkflowModel → payload Frappe Workflow doc.
 * Frappe: DocType "Workflow" + child "Workflow Document State" (state/doc_status/allow_edit) +
 * "Workflow Transition" (state→action→next_state, allowed role). THUẦN + test; apply/round-trip live.
 * KHÔNG nhồi chung serializer DocType — workflow là adapter riêng (state/transition/role/docstatus).
 */
import type { WorkflowModel, WFState, WFTransition } from "./WorkflowBuilder.js";

export interface WorkflowValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}
export interface WorkflowValidationResult {
  ok: boolean;
  issues: WorkflowValidationIssue[];
}

export function validateWorkflow(m: WorkflowModel): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });

  if (!m.document_type || !String(m.document_type).trim()) err("document_type", "Workflow phải gắn document_type");
  if (!m.name || !String(m.name).trim()) err("name", "Workflow phải có tên");
  if (!m.workflow_state_field || !String(m.workflow_state_field).trim()) err("state_field", "Thiếu workflow_state_field");
  if (!Array.isArray(m.states) || m.states.length === 0) err("states", "Workflow cần ≥1 state");

  const stateNames = new Set<string>();
  for (const s of m.states ?? []) {
    if (!s.state || !String(s.state).trim()) { err("state_empty", "State thiếu tên"); continue; }
    if (stateNames.has(s.state)) err("state_dup", `State trùng: "${s.state}"`);
    stateNames.add(s.state);
    if (![0, 1, 2].includes(s.doc_status)) err("doc_status", `State "${s.state}" doc_status không hợp lệ (0/1/2)`);
  }
  // transition phải trỏ tới state tồn tại + có action + role
  for (const t of m.transitions ?? []) {
    if (!t.state || !stateNames.has(t.state)) err("trans_from", `Transition từ state không tồn tại: "${t.state}"`);
    if (!t.next_state || !stateNames.has(t.next_state)) err("trans_to", `Transition tới state không tồn tại: "${t.next_state}"`);
    if (!t.action || !String(t.action).trim()) err("trans_action", `Transition (${t.state}→${t.next_state}) thiếu action`);
    if (!t.allowed || !String(t.allowed).trim()) warn("trans_role", `Transition "${t.action}" chưa gán role (allowed)`);
  }
  if ((m.transitions ?? []).length === 0) warn("no_transitions", "Workflow chưa có transition nào");

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

export interface WorkflowPayload {
  doctype: "Workflow";
  name: string;
  workflow_name: string;
  document_type: string;
  workflow_state_field: string;
  is_active: 0 | 1;
  states: Array<{ doctype: "Workflow Document State"; state: string; doc_status: string; allow_edit?: string }>;
  transitions: Array<{ doctype: "Workflow Transition"; state: string; action: string; next_state: string; allowed?: string; allow_self_approval?: 0 | 1 }>;
}

/**
 * workflowMasters — state/action master cần TỒN TẠI trước khi insert Workflow (Frappe: Workflow
 * Document State.state là Link "Workflow State", transition.action là Link "Workflow Action Master").
 * Apply layer insert-if-missing các master này TRƯỚC Workflow (phát hiện lúc round-trip live).
 */
export function workflowMasters(m: WorkflowModel): { states: string[]; actions: string[] } {
  const states = Array.from(new Set((m.states ?? []).map((s) => s.state).filter(Boolean)));
  const actions = Array.from(new Set((m.transitions ?? []).map((t) => t.action).filter(Boolean)));
  return { states, actions };
}

/** serializeWorkflow — WorkflowModel → doc Workflow (child-row đúng doctype; doc_status = chuỗi Frappe).
 * `allow_edit` (Workflow Document State) BẮT BUỘC ở Frappe: dùng của state, hoặc defaultEditRole. */
export function serializeWorkflow(m: WorkflowModel, opts?: { isActive?: 0 | 1; defaultEditRole?: string }): WorkflowPayload {
  const editRoleOf = (s: WFState): string | undefined => (s as WFState & { allow_edit?: string }).allow_edit ?? opts?.defaultEditRole;
  return {
    doctype: "Workflow",
    name: m.name,
    workflow_name: m.name,
    document_type: m.document_type,
    workflow_state_field: m.workflow_state_field || "workflow_state",
    is_active: opts?.isActive ?? 1,
    states: (m.states ?? []).map((s) => ({
      doctype: "Workflow Document State",
      state: s.state,
      doc_status: String(s.doc_status), // Frappe: Select "0"/"1"/"2"
      ...(editRoleOf(s) ? { allow_edit: editRoleOf(s) } : {}),
    })),
    transitions: (m.transitions ?? []).map((t: WFTransition) => ({
      doctype: "Workflow Transition",
      state: t.state,
      action: t.action,
      next_state: t.next_state,
      ...(t.allowed ? { allowed: t.allowed } : {}),
    })),
  };
}
