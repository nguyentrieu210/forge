import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { parseAppManifestWithInputTables } from "./action-input-table-compat.js";
import type { AppManifest } from "./manifest.js";
import { satisfiesVersion } from "./manifest.js";

export type RollbackIssueSeverity = "block" | "review";

export interface AppRollbackIssue extends JsonObject {
  severity: RollbackIssueSeverity;
  code: string;
  path: string;
  message: string;
}

export interface AppRollbackPlan extends JsonObject {
  app_id: string;
  from_version: string;
  to_version: string;
  automatable: boolean;
  issues: AppRollbackIssue[];
}

function issue(
  issues: AppRollbackIssue[],
  severity: RollbackIssueSeverity,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity, code, path, message });
}

function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((entry) => [entry.name, entry]));
}

function fieldMap(doctype: AppManifest["doctypes"][number]): Map<string, AppManifest["doctypes"][number]["fields"][number]> {
  return new Map(doctype.fields.map((field) => [field.fieldname, field]));
}

function permissionSignature(permission: AppManifest["doctypes"][number]["permissions"][number]): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(permission)
      .filter(([key, value]) => key !== "role" && value === true)
      .sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reviewDrift(
  issues: AppRollbackIssue[],
  current: unknown,
  target: unknown,
  code: string,
  path: string,
  message: string,
): void {
  if (!jsonEqual(current, target)) issue(issues, "review", code, path, message);
}

/**
 * Conservative metadata preflight for an application rollback.
 *
 * It does not touch storage and deliberately treats uncertainty as a gate. App data can outlive
 * app code, so removing a field/workflow/custom field is not "just metadata": existing documents
 * may still contain or depend on it. A future rollback executor may automate only plans with no
 * block/review issue; everything else needs an explicit migration/reconciliation strategy.
 *
 * Presentation-only drift (nav/report/chart/print/client copy/layout) may be automated because it
 * does not change server write behavior or stored shape. Executable/write-policy surfaces are
 * review-gated even when the schema is identical: a pretty rollback that calls an old method
 * contract against a new Worker is still a broken rollback, merely with excellent typography.
 */
export function planAppRollback(currentValue: unknown, targetValue: unknown): AppRollbackPlan {
  const current = parseAppManifestWithInputTables(currentValue);
  const target = parseAppManifestWithInputTables(targetValue);
  const issues: AppRollbackIssue[] = [];

  if (current.id !== target.id) {
    issue(issues, "block", "APP_ID_MISMATCH", "id", `Cannot roll back ${current.id} to different app ${target.id}`);
  }
  if (!satisfiesVersion(current.version, target.version)) {
    issue(issues, "block", "NOT_OLDER_REVISION", "version", `Target ${target.version} is newer than current ${current.version}`);
  }

  const currentDoctypes = byName(current.doctypes);
  const targetDoctypes = byName(target.doctypes);
  for (const [name, currentDocType] of currentDoctypes) {
    const targetDocType = targetDoctypes.get(name);
    if (!targetDocType) {
      issue(issues, "block", "DOCTYPE_REMOVED", `doctypes.${name}`, `${name} is absent from rollback target`);
      continue;
    }
    for (const [property, label] of [
      ["is_child", "child-table mode"],
      ["is_submittable", "submission lifecycle"],
      ["is_single", "single-record mode"],
      ["is_tree", "tree mode"],
    ] as const) {
      if (Boolean(currentDocType[property]) !== Boolean(targetDocType[property])) {
        issue(issues, "block", "DOCTYPE_LIFECYCLE_CHANGED", `doctypes.${name}.${property}`, `${name} changes ${label}`);
      }
    }
    if ((currentDocType.autoname ?? null) !== (targetDocType.autoname ?? null)) {
      issue(issues, "block", "AUTONAME_CHANGED", `doctypes.${name}.autoname`, `${name} changes document naming during rollback`);
    }

    const currentFields = fieldMap(currentDocType);
    const targetFields = fieldMap(targetDocType);
    for (const [fieldname, currentField] of currentFields) {
      const targetField = targetFields.get(fieldname);
      if (!targetField) {
        issue(issues, "block", "FIELD_REMOVED", `doctypes.${name}.fields.${fieldname}`, `${name}.${fieldname} is absent from rollback target`);
        continue;
      }
      if (currentField.fieldtype !== targetField.fieldtype) {
        issue(issues, "block", "FIELD_TYPE_CHANGED", `doctypes.${name}.fields.${fieldname}.fieldtype`, `${name}.${fieldname} changes ${currentField.fieldtype} -> ${targetField.fieldtype}`);
      }
      if ((currentField.options ?? null) !== (targetField.options ?? null)) {
        issue(issues, "block", "FIELD_OPTIONS_CHANGED", `doctypes.${name}.fields.${fieldname}.options`, `${name}.${fieldname} changes options/link target`);
      }
      if (Boolean(currentField.required) && !Boolean(targetField.required)) {
        // Relaxing required is data-safe; no issue.
      } else if (!Boolean(currentField.required) && Boolean(targetField.required)) {
        issue(issues, "block", "FIELD_BECOMES_REQUIRED", `doctypes.${name}.fields.${fieldname}.required`, `${name}.${fieldname} becomes required in rollback target`);
      }
    }

    const currentPermissions = new Map(currentDocType.permissions.map((entry) => [entry.role, permissionSignature(entry)]));
    const targetPermissions = new Map(targetDocType.permissions.map((entry) => [entry.role, permissionSignature(entry)]));
    for (const [role, signature] of targetPermissions) {
      const before = currentPermissions.get(role);
      if (before !== signature) {
        issue(issues, "review", "PERMISSION_POLICY_CHANGED", `doctypes.${name}.permissions.${role}`, `${name} permissions for ${role} differ in rollback target`);
      }
    }
    for (const role of currentPermissions.keys()) {
      if (!targetPermissions.has(role)) {
        issue(issues, "review", "PERMISSION_ROLE_REMOVED", `doctypes.${name}.permissions.${role}`, `${name} drops permission row for ${role}`);
      }
    }
  }

  for (const name of targetDoctypes.keys()) {
    if (!currentDoctypes.has(name)) {
      issue(issues, "review", "DOCTYPE_ADDED_BY_TARGET", `doctypes.${name}`, `${name} exists only in rollback target; revision history is not a strict ancestor`);
    }
  }

  const currentWorkflows = byName(current.workflows);
  const targetWorkflows = byName(target.workflows);
  for (const [name, workflow] of currentWorkflows) {
    const targetWorkflow = targetWorkflows.get(name);
    if (!targetWorkflow) {
      issue(issues, "block", "WORKFLOW_REMOVED", `workflows.${name}`, `${name} is absent from rollback target`);
      continue;
    }
    if (workflow.document_type !== targetWorkflow.document_type || workflow.state_field !== targetWorkflow.state_field) {
      issue(issues, "block", "WORKFLOW_BINDING_CHANGED", `workflows.${name}`, `${name} changes document type or state field`);
    }
    const targetStates = new Map(targetWorkflow.states.map((state) => [state.state, state.docstatus]));
    for (const state of workflow.states) {
      if (!targetStates.has(state.state)) {
        issue(issues, "block", "WORKFLOW_STATE_REMOVED", `workflows.${name}.states.${state.state}`, `${name} removes state ${state.state}`);
      } else if (targetStates.get(state.state) !== state.docstatus) {
        issue(issues, "block", "WORKFLOW_DOCSTATUS_CHANGED", `workflows.${name}.states.${state.state}`, `${name}.${state.state} changes docstatus`);
      }
    }
    reviewDrift(
      issues,
      workflow.transitions,
      targetWorkflow.transitions,
      "WORKFLOW_TRANSITIONS_CHANGED",
      `workflows.${name}.transitions`,
      `${name} transition policy differs in rollback target`,
    );
  }
  for (const name of targetWorkflows.keys()) {
    if (!currentWorkflows.has(name)) {
      issue(issues, "review", "WORKFLOW_ADDED_BY_TARGET", `workflows.${name}`, `${name} exists only in rollback target`);
    }
  }

  const currentCustomFields = new Map(current.custom_fields.map((entry) => [entry.name, entry]));
  const targetCustomFields = new Map(target.custom_fields.map((entry) => [entry.name, entry]));
  for (const [name, field] of currentCustomFields) {
    const targetField = targetCustomFields.get(name);
    if (!targetField) {
      issue(issues, "block", "CUSTOM_FIELD_REMOVED", `custom_fields.${name}`, `${name} is absent from rollback target`);
      continue;
    }
    if (!jsonEqual(field, targetField)) {
      issue(issues, "block", "CUSTOM_FIELD_CHANGED", `custom_fields.${name}`, `${name} definition differs in rollback target`);
    }
  }
  for (const name of targetCustomFields.keys()) {
    if (!currentCustomFields.has(name)) {
      issue(issues, "review", "CUSTOM_FIELD_ADDED_BY_TARGET", `custom_fields.${name}`, `${name} exists only in rollback target`);
    }
  }

  reviewDrift(issues, current.requires, target.requires, "DEPENDENCIES_CHANGED", "requires", "Application dependencies differ in rollback target");
  reviewDrift(issues, current.roles, target.roles, "ROLES_CHANGED", "roles", "Application role declarations differ in rollback target");
  reviewDrift(issues, current.fixtures, target.fixtures, "FIXTURES_CHANGED", "fixtures", "Rollback would rewrite app-owned fixture/master data");
  reviewDrift(issues, current.externalDocTypes, target.externalDocTypes, "EXTERNAL_DEPENDENCIES_CHANGED", "externalDocTypes", "External DocType dependencies differ in rollback target");

  if ((current.worker ?? null) !== (target.worker ?? null)) {
    issue(issues, "block", "WORKER_CHANGED", "worker", "Rollback target uses a different app Worker binding");
  }
  reviewDrift(issues, current.validators, target.validators, "VALIDATORS_CHANGED", "validators", "Pre-commit validation policy differs in rollback target");
  reviewDrift(issues, current.hooks, target.hooks, "HOOKS_CHANGED", "hooks", "After-commit event subscriptions differ in rollback target");
  reviewDrift(issues, current.actions, target.actions, "ACTIONS_CHANGED", "actions", "Callable AppAction contract differs in rollback target");
  reviewDrift(issues, current.screens, target.screens, "SCREENS_CHANGED", "screens", "Composed screen/action contract differs in rollback target");
  reviewDrift(issues, current.storefront ?? null, target.storefront ?? null, "STOREFRONT_CHANGED", "storefront", "Public catalog/order contract differs in rollback target");

  return {
    app_id: current.id,
    from_version: current.version,
    to_version: target.version,
    automatable: issues.length === 0,
    issues,
  };
}

export function assertAppRollbackAutomatable(plan: AppRollbackPlan): void {
  if (!plan.automatable) {
    const summary = plan.issues.map((entry) => `${entry.code}@${entry.path}`).join(", ");
    throw errors.validation(`App rollback requires review/migration: ${summary}`);
  }
}
