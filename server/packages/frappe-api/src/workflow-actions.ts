/**
 * Durable Workflow Action projection.
 *
 * Frappe persists actionable workflow work separately from the document. Forge keeps
 * the same operational fact as an AFTER-COMMIT projection: workflow metadata and the
 * Document Kernel remain the only authority for whether a transition is legal.
 *
 * Reconciliation is idempotent. A repeated domain event can complete/create the same
 * projection again without duplicating an approval task.
 */

import { D1UserStore } from "../../auth/src/index.js";
import type { DomainEvent, JsonObject } from "../../contracts/src/index.js";
import { D1MutationStore } from "../../document-kernel/src/index.js";
import {
  D1MetadataStore,
  evaluateWorkflowCondition,
  type WorkflowMeta,
} from "../../frappe-model/src/index.js";

export interface WorkflowActionSyncResult {
  completed: number;
  created: number;
  open: number;
}

interface WorkflowActionRow {
  name: string;
  workflow_state: string;
  permitted_roles_json: string;
}

function outgoingRoles(workflow: WorkflowMeta, state: string, document: JsonObject): string[] {
  const roles = new Set<string>();
  for (const transition of workflow.transitions) {
    if (transition.state !== state) continue;
    if (transition.condition && !evaluateWorkflowCondition(transition.condition, document, document)) continue;
    roles.add(transition.allowed_role);
  }
  return [...roles].sort();
}

function completedRole(rows: WorkflowActionRow[], actorRoles: readonly string[]): string | null {
  const allowed = new Set<string>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.permitted_roles_json) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const role of parsed) if (typeof role === "string") allowed.add(role);
    } catch {
      // A corrupt projection row cannot widen authority. Leave the completion role empty.
    }
  }
  return actorRoles.find((role) => allowed.has(role)) ?? null;
}

/**
 * Reconcile durable actions from one committed document event.
 *
 * - entering a state with outgoing eligible transitions creates one Open action;
 * - leaving that state completes every previous Open action for the document;
 * - an ordinary save inside the same state keeps the existing action;
 * - terminal states leave no Open action.
 */
export async function syncWorkflowActions(
  db: D1Database,
  tenantId: string,
  event: DomainEvent,
  now: string,
): Promise<WorkflowActionSyncResult> {
  if (event.tenant_id !== tenantId) throw new Error("Workflow Action event tenant mismatch");

  const metadata = new D1MetadataStore(db);
  const documents = new D1MutationStore(db);
  const document = await documents.getDocument<JsonObject>(
    tenantId,
    event.aggregate.doctype,
    event.aggregate.name,
  );

  const open = await db.prepare(
    `SELECT name,workflow_state,permitted_roles_json
       FROM workflow_actions
      WHERE tenant_id=?1 AND reference_doctype=?2 AND reference_name=?3 AND status='Open'
      ORDER BY created_at,name`,
  ).bind(tenantId, event.aggregate.doctype, event.aggregate.name).all<WorkflowActionRow>();
  const openRows = open.results ?? [];

  // Trash/missing documents or a removed workflow must not leave an approval task that
  // can never be acted on.
  const workflow = document
    ? await metadata.getWorkflow(tenantId, event.aggregate.doctype)
    : null;
  if (!document || !workflow) {
    if (!openRows.length) return { completed: 0, created: 0, open: 0 };
    const result = await db.prepare(
      `UPDATE workflow_actions
          SET status='Completed',completed_by=?1,completed_by_role=NULL,modified_at=?2
        WHERE tenant_id=?3 AND reference_doctype=?4 AND reference_name=?5 AND status='Open'`,
    ).bind(event.actor, now, tenantId, event.aggregate.doctype, event.aggregate.name).run();
    return { completed: result.meta?.changes ?? 0, created: 0, open: 0 };
  }

  const state = String(document.data[workflow.state_field] ?? workflow.states[0]?.state ?? "");
  const sameState = openRows.filter((row) => row.workflow_state === state);
  const stale = openRows.filter((row) => row.workflow_state !== state);

  let completed = 0;
  if (stale.length) {
    const actorRoles = await new D1UserStore(db).listRoles(tenantId, event.actor).catch(() => []);
    const role = completedRole(stale, actorRoles);
    const result = await db.prepare(
      `UPDATE workflow_actions
          SET status='Completed',completed_by=?1,completed_by_role=?2,modified_at=?3
        WHERE tenant_id=?4 AND reference_doctype=?5 AND reference_name=?6
          AND status='Open' AND workflow_state<>?7`,
    ).bind(
      event.actor,
      role,
      now,
      tenantId,
      event.aggregate.doctype,
      event.aggregate.name,
      state,
    ).run();
    completed = result.meta?.changes ?? 0;
  }

  // Same-state writes do not create another Workflow Action. This mirrors Frappe's
  // "already created" guard and prevents edits/comments from multiplying approvals.
  if (sameState.length) {
    return { completed, created: 0, open: sameState.length };
  }

  const roles = outgoingRoles(workflow, state, document.data);
  if (!roles.length || document.docstatus === 2) {
    return { completed, created: 0, open: 0 };
  }

  const stateMeta = workflow.states.find((candidate) => candidate.state === state);
  const emailRequested = Boolean(workflow.send_email_alert && stateMeta?.send_email);
  const actionName = `WFA-${event.event_id}`;
  const result = await db.prepare(
    `INSERT INTO workflow_actions(
       tenant_id,name,reference_doctype,reference_name,workflow_name,workflow_state,
       source_version,source_event_id,permitted_roles_json,email_requested,status,created_at,modified_at
     ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'Open',?11,?11)
     ON CONFLICT(tenant_id,source_event_id) DO NOTHING`,
  ).bind(
    tenantId,
    actionName,
    event.aggregate.doctype,
    event.aggregate.name,
    workflow.name,
    state,
    document.version,
    event.event_id,
    JSON.stringify(roles),
    emailRequested ? 1 : 0,
    now,
  ).run();

  return {
    completed,
    created: result.meta?.changes ?? 0,
    open: (result.meta?.changes ?? 0) === 1 ? 1 : 0,
  };
}
