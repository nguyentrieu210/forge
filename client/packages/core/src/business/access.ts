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

/**
 * Một tài khoản đăng nhập của tenant, như màn quản trị nhìn thấy nó.
 *
 * `enabled` là thứ quan trọng nhất trong danh sách này: tài khoản bị khoá vẫn còn nguyên
 * (user id là `owner` của mọi chứng từ họ đã lập, xoá đi là làm hỏng lịch sử), nên nếu
 * màn hình không hiện trạng thái thì một tài khoản đã đóng trông y hệt một tài khoản đang mở.
 */
export interface TenantUser {
  user: string;
  full_name?: string;
  email?: string;
  enabled: boolean;
  user_type?: string;
  roles: string[];
  last_login_at?: string;
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
