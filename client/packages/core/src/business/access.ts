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
  source: "role" | "role_policy" | "organization_scope" | "delegation" | "user_permission" | "document" | "workflow" | "share" | "owner" | "field" | "system";
  effect: "allow" | "deny" | "info";
  label: string;
  detail?: string;
}

export interface ApprovalInboxAction {
  action: string;
  next_state: string;
  role: string;
  delegation?: string;
  delegated_by?: string;
}

export interface ApprovalInboxItem {
  doctype: string;
  name: string;
  title: string;
  owner: string;
  state: string;
  docstatus: number;
  version: number;
  modified_at: string;
  actions: ApprovalInboxAction[];
}

export interface ApprovalInboxResult {
  items: ApprovalInboxItem[];
  total: number;
  limit: number;
}

export interface AuditEventItem {
  event_id: string;
  correlation_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_name: string;
  before_json: unknown;
  after_json: unknown;
  occurred_at: string;
  source: "document_version" | "rbac";
}

export interface AuditEventResult {
  events: AuditEventItem[];
  next_cursor: string | null;
}

export interface AuditEvidenceExport {
  file_name: string;
  content_type: string;
  content: string;
  checksum_sha256: string;
  row_count: number;
  reason: string;
  generated_at: string;
}

export interface SoDCheckResult {
  allowed: boolean;
  conflicts: Array<{ rule?: string; severity?: string; left_action?: string; right_action?: string; reason?: string }>;
}

export interface EffectivePermissionResult {
  user?: string;
  doctype: string;
  name?: string;
  capabilities: Record<string, boolean>;
  trace: PermissionTraceItem[];
  fieldRules?: Array<{ fieldname: string; read: boolean; write: boolean; masked?: boolean; reason?: string }>;
}
