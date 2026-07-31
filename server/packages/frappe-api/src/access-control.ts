import type { Actor, CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { D1UserStore } from "../../auth/src/index.js";
import type {
  DocTypeMeta,
  ExtendedPermissionAction,
  MetadataPermissionService,
} from "../../frappe-model/src/index.js";
import { permissionAllows } from "../../frappe-model/src/index.js";

export type PermissionTraceSource =
  | "role"
  | "user_permission"
  | "document"
  | "workflow"
  | "share"
  | "owner"
  | "field"
  | "system";

export interface PermissionTraceRecord extends JsonObject {
  source: PermissionTraceSource;
  effect: "allow" | "deny" | "info";
  label: string;
  detail?: string;
}

export interface PermissionCapabilityEvaluation {
  capabilities: JsonObject;
  trace: PermissionTraceRecord[];
}

/** Tenant-level access administrators retain the compatibility bypass approved in RBAC D1. */
export function isAccessAdministrator(actor: Actor): boolean {
  return actor.user_id === "Administrator"
    || actor.roles.includes("Administrator")
    || actor.roles.includes("System Manager");
}

/**
 * Resolves the actor whose access is being inspected.
 *
 * The browser may name a user to inspect, but never their roles. Roles and locale are
 * loaded from the tenant user directory, and only an access administrator may inspect
 * somebody else. This keeps the diagnostic endpoint from becoming a role-simulation API.
 */
export async function resolveAccessInspectionActor(input: {
  requestedUser?: string;
  caller: Actor;
  tenantId: string;
  users: D1UserStore;
}): Promise<Actor> {
  const requested = input.requestedUser?.trim();
  if (!requested || requested === input.caller.user_id) return input.caller;
  if (!isAccessAdministrator(input.caller)) {
    throw errors.permission("System Manager is required to inspect another user's access");
  }

  const user = await input.users.get(input.tenantId, requested);
  if (!user) throw errors.notFound("User not found");
  if (!user.enabled) throw errors.permission("User account is disabled");
  const roles = await input.users.listRoles(input.tenantId, user.user_id);
  return {
    user_id: user.user_id,
    roles,
    ...(user.language ? { locale: user.language } : {}),
    ...(user.time_zone ? { timezone: user.time_zone } : {}),
  };
}

/** Stable, reversible identity for a User Permission composite key. */
export function userPermissionIdentity(input: {
  user: string;
  allow: string;
  forValue: string;
  applicableFor?: string;
}): string {
  return [input.user, input.allow, input.forValue, input.applicableFor ?? ""]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

/** Decodes the stable User Permission identity without trusting browser-supplied roles or tenant. */
export function parseUserPermissionIdentity(identity: string): {
  user: string;
  allow: string;
  forValue: string;
  applicableFor?: string;
} {
  const parts = identity.split("|");
  if (parts.length !== 4) throw errors.validation("User Permission id is invalid");
  let decoded: string[];
  try {
    decoded = parts.map((part) => decodeURIComponent(part));
  } catch {
    throw errors.validation("User Permission id is invalid");
  }
  const user = decoded[0] ?? "";
  const allow = decoded[1] ?? "";
  const forValue = decoded[2] ?? "";
  const applicableFor = decoded[3] ?? "";
  if (!user || !allow || !forValue) throw errors.validation("User Permission id is invalid");
  return { user, allow, forValue, ...(applicableFor ? { applicableFor } : {}) };
}

/** D3: exact-value scope only until a hierarchy contract and evaluator exist. */
export function assertExactUserPermission(hideDescendants: boolean): void {
  if (hideDescendants) {
    throw errors.validation("Phạm vi phân cấp chưa được hỗ trợ; hãy chọn đúng từng giá trị cần cấp quyền.");
  }
}

/**
 * Computes capabilities and their explanation through the same permission service.
 *
 * Each boolean is produced by `MetadataPermissionService.assert`. The trace records the
 * outcome of that exact call rather than attempting to recreate permission rules in a
 * second evaluator. List-level write is the one deliberate exception already used by the
 * Desk: without a concrete row, owner-only rules remain false and ordinary DocPerm write
 * is checked directly; the selected row is still re-checked by the server on mutation.
 */
export async function evaluatePermissionCapabilities(input: {
  actor: Actor;
  tenantId: string;
  doctype: string;
  meta: DocTypeMeta;
  document: CanonicalDocument | null;
  permissions: MetadataPermissionService;
}): Promise<PermissionCapabilityEvaluation> {
  const { actor, tenantId, doctype, meta, document, permissions } = input;
  const trace: PermissionTraceRecord[] = [];
  const sourceForActor: PermissionTraceSource = isAccessAdministrator(actor) ? "system" : "role";

  if (isAccessAdministrator(actor)) {
    trace.push({
      source: "system",
      effect: "info",
      label: "Quản trị tenant",
      detail: "Tài khoản này có quyền superadmin tenant theo quyết định tương thích RBAC D1.",
    });
  } else {
    trace.push({
      source: "role",
      effect: "info",
      label: "Vai trò hiệu lực",
      detail: actor.roles.length ? actor.roles.join(", ") : "Không có vai trò hiệu lực",
    });
  }

  const check = async (action: ExtendedPermissionAction): Promise<boolean> => {
    try {
      await permissions.assert({
        actor,
        tenantId,
        doctype,
        ...(document ? {
          name: document.name,
          owner: document.owner,
          data: document.data,
        } : {}),
        action,
      });
      trace.push({
        source: sourceForActor,
        effect: "allow",
        label: `${action}: được phép`,
        detail: `Permission evaluator cho phép ${actor.user_id} thực hiện ${action} trên ${doctype}.`,
      });
      return true;
    } catch (error) {
      const classified = classifyPermissionFailure(error);
      trace.push({
        source: classified.source,
        effect: "deny",
        label: `${action}: bị từ chối`,
        detail: classified.detail,
      });
      return false;
    }
  };

  const submittable = Boolean(meta.is_submittable);
  const [read, create, checkedWrite, submit, cancel, amend] = await Promise.all([
    check("read"),
    check("create"),
    document ? check("save") : Promise.resolve(false),
    submittable ? check("submit") : Promise.resolve(false),
    submittable ? check("cancel") : Promise.resolve(false),
    submittable ? check("amend") : Promise.resolve(false),
  ]);

  const write = document
    ? checkedWrite
    : isAccessAdministrator(actor) || meta.permissions.some((permission) =>
      permissionAllows(permission, actor, "save"),
    );

  if (!document) {
    trace.push({
      source: sourceForActor,
      effect: write ? "allow" : "deny",
      label: `save: ${write ? "được phép ở cấp loại chứng từ" : "bị từ chối ở cấp loại chứng từ"}`,
      detail: write
        ? "Chưa chọn bản ghi cụ thể; quyền owner và trạng thái bản ghi sẽ được kiểm tra lại khi ghi."
        : "Không có DocPerm write phù hợp ở cấp loại chứng từ.",
    });
  }

  const canDelete = document ? document.docstatus === 0 && write : write;
  trace.push({
    source: "document",
    effect: canDelete ? "allow" : "deny",
    label: `delete: ${canDelete ? "được phép" : "bị từ chối"}`,
    detail: document
      ? (document.docstatus === 0 ? "Bản nháp và quyền ghi cho phép xoá." : "Chỉ bản nháp mới được xoá.")
      : "Chưa chọn bản ghi; trạng thái sẽ được kiểm tra lại khi xoá.",
  });

  return {
    capabilities: {
      read,
      write,
      create,
      delete: canDelete,
      submit,
      cancel,
      amend,
    },
    trace,
  };
}

function classifyPermissionFailure(error: unknown): { source: PermissionTraceSource; detail: string } {
  const message = error instanceof Error ? error.message : "";
  if (/permitted values|user permission/i.test(message)) {
    return { source: "user_permission", detail: "Bản ghi nằm ngoài phạm vi dữ liệu được cấp." };
  }
  if (/field permission|field .* denied/i.test(message)) {
    return { source: "field", detail: "Quyền ở cấp trường dữ liệu không cho phép thao tác này." };
  }
  if (/owner|owned/i.test(message)) {
    return { source: "owner", detail: "Luật chỉ-bản-ghi-mình-lập không khớp người dùng này." };
  }
  if (/share/i.test(message)) {
    return { source: "share", detail: "Không có chia sẻ tài liệu phù hợp cho thao tác này." };
  }
  return { source: "role", detail: "Không có quyền hiệu lực phù hợp theo permission evaluator." };
}
