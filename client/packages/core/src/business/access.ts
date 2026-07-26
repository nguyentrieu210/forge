export interface AccessScopeValue {
  doctype: string;
  values: Array<{
    id?: string;
    value: string;
    label: string;
    applicableFor?: string;
    isDefault?: boolean;
    hideDescendants?: boolean;
  }>;
}

export interface AccessProfileSummary {
  user: string;
  fullName?: string;
  /** Effective roles after Role Profile/system expansion. */
  roles: string[];
  /** Roles physically assigned on User.roles. */
  assignedRoles?: string[];
  /** Native Frappe Role Profile currently selected. */
  roleProfile?: string;
  scopes: AccessScopeValue[];
  applications?: string[];
  workspaces?: string[];
  canManage?: boolean;
}

export interface PermissionTraceItem {
  source: "role" | "user_permission" | "document" | "workflow" | "share" | "owner" | "field" | "system";
  effect: "allow" | "deny" | "info";
  label: string;
  detail?: string;
}

export interface EffectivePermissionResult {
  user?: string;
  doctype: string;
  name?: string;
  capabilities: Record<string, boolean>;
  trace: PermissionTraceItem[];
  fieldRules?: Array<{ fieldname: string; read: boolean; write: boolean; masked?: boolean; reason?: string }>;
}
