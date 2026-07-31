import { errors } from "../../core/src/index.js";
import { readFrappeArgs } from "./args.js";
import { faultResponse, methodResponse } from "./envelope.js";
import { isAccessAdministrator, userPermissionIdentity } from "./access-control.js";
import { routeFrappeApi as routeRbacFrappeApi } from "./router-rbac.js";
import type { FrappeRouterContext } from "./router.js";

const REMOVE_PERMISSION_PATH = "/api/method/metaforge.api.remove_user_permission";

/**
 * Public package entrypoint for the corrected RBAC routes.
 *
 * The existing client already posts the stable scope `id` as `name`. Accept that form,
 * while also accepting the explicit composite fields used by new callers. Both forms
 * resolve to the same tenant-bound delete key; the id is not an authority token.
 */
export async function routeFrappeApi(
  request: Request,
  url: URL,
  context: FrappeRouterContext,
): Promise<Response | null> {
  if (url.pathname !== REMOVE_PERMISSION_PATH) {
    return routeRbacFrappeApi(request, url, context);
  }

  try {
    if (!isAccessAdministrator(context.actor)) {
      throw errors.permission("System Manager is required to manage user access");
    }
    const args = await readFrappeArgs(request, url);
    const encoded = args.text("name")?.trim();
    const key = encoded
      ? parseUserPermissionIdentity(encoded)
      : {
          user: args.requireText("user", 320),
          allow: args.requireText("allow", 160),
          forValue: args.requireText("for_value", 320),
          applicableFor: args.text("applicable_for")?.trim() ?? "",
        };

    await context.access.deleteUserPermission?.(
      context.tenantId,
      key.user,
      key.allow,
      key.forValue,
      key.applicableFor,
    );
    return methodResponse({
      id: userPermissionIdentity(key),
      removed: true,
    });
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}

export function parseUserPermissionIdentity(value: string): {
  user: string;
  allow: string;
  forValue: string;
  applicableFor: string;
} {
  const parts = value.split("|");
  if (parts.length !== 4) throw errors.validation("User Permission id is invalid");
  let decoded: string[];
  try {
    decoded = parts.map((part) => decodeURIComponent(part));
  } catch {
    throw errors.validation("User Permission id is invalid");
  }
  const [user = "", allow = "", forValue = "", applicableFor = ""] = decoded;
  if (!user || !allow || !forValue) throw errors.validation("User Permission id is invalid");
  return { user, allow, forValue, applicableFor };
}
