import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { readFrappeArgs, type FrappeArgs } from "./args.js";
import { faultResponse, methodResponse } from "./envelope.js";
import {
  assertExactUserPermission,
  evaluatePermissionCapabilities,
  isAccessAdministrator,
  resolveAccessInspectionActor,
  userPermissionIdentity,
} from "./access-control.js";
import {
  routeFrappeApi as routeBaseFrappeApi,
  type FrappeRouterContext,
} from "./router.js";

const ACCESS_METHODS = new Set([
  "metaforge.api.get_access_profile",
  "metaforge.api.explain_permission",
  "metaforge.api.add_user_permission",
  "metaforge.api.remove_user_permission",
]);

/**
 * Narrow RBAC correction layer.
 *
 * Four existing endpoints had a cross-layer contract mismatch. They are intercepted
 * here while every other Frappe route remains on the established router unchanged.
 * Keeping the correction separate avoids duplicating or destabilising the large
 * compatibility router while still making this module the package's public entrypoint.
 */
export async function routeFrappeApi(
  request: Request,
  url: URL,
  context: FrappeRouterContext,
): Promise<Response | null> {
  const methodName = methodFromPath(url.pathname);
  if (!methodName || !ACCESS_METHODS.has(methodName)) {
    return routeBaseFrappeApi(request, url, context);
  }

  try {
    const args = await readFrappeArgs(request, url);
    switch (methodName) {
      case "metaforge.api.get_access_profile":
        return methodResponse(await accessProfile(args, context));
      case "metaforge.api.explain_permission":
        return methodResponse(await explainPermission(args, context));
      case "metaforge.api.add_user_permission":
        return methodResponse(await addUserPermission(args, context));
      case "metaforge.api.remove_user_permission":
        return methodResponse(await removeUserPermission(args, context));
      default:
        return routeBaseFrappeApi(request, url, context);
    }
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}

function methodFromPath(pathname: string): string | null {
  const prefix = "/api/method/";
  if (!pathname.startsWith(prefix)) return null;
  const method = pathname.slice(prefix.length);
  return /^[A-Za-z0-9_.]+$/.test(method) ? method : null;
}

async function accessProfile(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.text("user")?.trim();
  const actor = await resolveAccessInspectionActor({
    ...(requested ? { requestedUser: requested } : {}),
    caller: context.actor,
    tenantId: context.tenantId,
    users: context.users,
  });
  const user = await context.users.get(context.tenantId, actor.user_id);
  if (!user) throw errors.notFound("User not found");
  const permissions = await context.access.listUserPermissions(context.tenantId, actor.user_id);
  const byDoctype = new Map<string, JsonObject[]>();

  for (const record of permissions) {
    const applicableFor = record.applicable_for_doctype || "";
    const values = byDoctype.get(record.allow_doctype) ?? [];
    values.push({
      id: userPermissionIdentity({
        user: actor.user_id,
        allow: record.allow_doctype,
        forValue: record.allow_name,
        applicableFor,
      }),
      value: record.allow_name,
      label: record.allow_name,
      ...(applicableFor ? { applicableFor } : {}),
      ...(record.is_default ? { isDefault: true } : {}),
      ...(record.hide_descendants ? { hideDescendants: true } : {}),
    });
    byDoctype.set(record.allow_doctype, values);
  }

  return {
    user: actor.user_id,
    fullName: user.full_name || actor.user_id,
    roles: actor.roles as unknown as JsonValue,
    assignedRoles: actor.roles as unknown as JsonValue,
    scopes: [...byDoctype].map(([doctype, values]) => ({ doctype, values })) as unknown as JsonValue,
    canManage: isAccessAdministrator(context.actor),
    user_permissions: permissions.map((record) => ({
      id: userPermissionIdentity({
        user: actor.user_id,
        allow: record.allow_doctype,
        forValue: record.allow_name,
        applicableFor: record.applicable_for_doctype || "",
      }),
      allow: record.allow_doctype,
      for_value: record.allow_name,
      applicable_for: record.applicable_for_doctype || null,
      is_default: record.is_default ? 1 : 0,
      hide_descendants: record.hide_descendants ? 1 : 0,
    })) as unknown as JsonValue,
  };
}

async function explainPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const requestedUser = args.text("user")?.trim();
  const actor = await resolveAccessInspectionActor({
    ...(requestedUser ? { requestedUser } : {}),
    caller: context.actor,
    tenantId: context.tenantId,
    users: context.users,
  });
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) throw errors.notFound(`DocType does not exist: ${doctype}`);

  const name = args.text("name")?.trim();
  const document = name
    ? await context.documents.getDocument(context.tenantId, doctype, name)
    : null;
  if (name && !document) throw errors.notFound();

  const scope = await context.permissions
    .getReadScope(actor, context.tenantId, doctype)
    .catch(() => null);
  const evaluated = await evaluatePermissionCapabilities({
    actor,
    tenantId: context.tenantId,
    doctype,
    meta,
    document,
    permissions: context.permissions,
  });

  const trace = [...evaluated.trace];
  if (scope?.user_permissions.length) {
    trace.push({
      source: "user_permission",
      effect: "info",
      label: "Phạm vi dữ liệu hiệu lực",
      detail: scope.user_permissions
        .map((constraint) => `${constraint.allow_doctype}: ${constraint.allowed_values.join(", ")}`)
        .join("; "),
    });
  }
  if (document) {
    trace.push({
      source: "document",
      effect: "info",
      label: "Bản ghi được kiểm tra",
      detail: `${doctype} ${document.name}; trạng thái ${document.docstatus}; chủ sở hữu ${document.owner}.`,
    });
  }

  return {
    user: actor.user_id,
    doctype,
    ...(name ? { name } : {}),
    roles: actor.roles as unknown as JsonValue,
    read_scope: scope?.mode ?? "denied",
    user_permissions: (scope?.user_permissions ?? []).map((constraint) => ({
      allow: constraint.allow_doctype,
      fields: constraint.fields,
      allowed_values: constraint.allowed_values,
    })) as unknown as JsonValue,
    capabilities: evaluated.capabilities,
    trace: trace as unknown as JsonValue,
  };
}

async function addUserPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireAccessAdministrator(context);
  const user = args.requireText("user", 320);
  if (!await context.users.get(context.tenantId, user)) throw errors.notFound("User not found");

  const allow = args.requireText("allow", 160);
  const forValue = args.requireText("for_value", 320);
  const applicableFor = args.text("applicable_for")?.trim() ?? "";
  const hideDescendants = args.bool("hide_descendants", false);
  assertExactUserPermission(hideDescendants);

  const exists = await context.documents.hasMasterRecord(context.tenantId, allow, forValue)
    || Boolean(await context.documents.getDocument(context.tenantId, allow, forValue));
  if (!exists) throw errors.reference(`${allow} ${forValue} does not exist`);

  if (applicableFor) {
    const target = await context.metadata.getDocType(context.tenantId, applicableFor);
    if (!target || !target.fields.some((field) => field.fieldtype === "Link" && field.options === allow)) {
      throw errors.validation(`${applicableFor} has no Link field to ${allow}`);
    }
  }

  const record = await context.access.putUserPermission?.(context.tenantId, {
    user,
    allow_doctype: allow,
    allow_name: forValue,
    applicable_for_doctype: applicableFor,
    is_default: args.bool("is_default", false),
    hide_descendants: false,
    created_by: context.actor.user_id,
    created_at: context.now(),
  });
  if (!record) throw errors.validation("User permissions are not writable on this deployment");

  return {
    id: userPermissionIdentity({ user, allow, forValue, applicableFor }),
    user,
    allow,
    for_value: forValue,
    applicable_for: applicableFor || null,
    is_default: record.is_default ? 1 : 0,
    hide_descendants: 0,
  };
}

async function removeUserPermission(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  requireAccessAdministrator(context);
  const user = args.requireText("user", 320);
  const allow = args.requireText("allow", 160);
  const forValue = args.requireText("for_value", 320);
  const applicableFor = args.text("applicable_for")?.trim() ?? "";

  await context.access.deleteUserPermission?.(
    context.tenantId,
    user,
    allow,
    forValue,
    applicableFor,
  );
  return {
    id: userPermissionIdentity({ user, allow, forValue, applicableFor }),
    removed: true,
  };
}

function requireAccessAdministrator(context: FrappeRouterContext): void {
  if (!isAccessAdministrator(context.actor)) {
    throw errors.permission("System Manager is required to manage user access");
  }
}
