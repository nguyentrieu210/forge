import { errors } from "../../core/src/index.js";
import { readFrappeArgs } from "./args.js";
import { faultResponse, methodResponse } from "./envelope.js";
import {
  routeFrappeApi as routeCoreFrappeApi,
  type FrappeRouterContext,
} from "./router.js";
import { listSecurityAlerts } from "./security-alerts.js";
import { isSessionManagementPath, routeSessionManagementApi } from "./session-manager.js";
import { WEBSITE_MANIFEST, WEBSITE_PAGE, websiteManifest, websitePage } from "./website.js";

// Preserve every existing router export for package consumers. The explicit
// `routeFrappeApi` below shadows the star-exported name with the Website-aware wrapper.
export * from "./router.js";

export const RECENT_SECURITY_AUTH_MAX_AGE_SECONDS = 15 * 60;
const RECENT_SECURITY_AUTH_CLOCK_SKEW_SECONDS = 60;
const METHOD_PREFIX = "/api/method/";
const RESOURCE_PREFIX = "/api/resource/";
const ADMIN_PASSWORD_METHOD = "frappe.core.doctype.user.user.update_password";
const SECURITY_ALERTS_PATH = "/api/method/metaforge.api.security_alerts";

/**
 * Privileged Frappe methods that must not be authorized by a long-lived browser session.
 *
 * This includes tenant-access administration and platform-shaping operations. A stolen
 * but otherwise valid System Manager session is insufficient: the administrator must
 * have completed a password login recently. Reads stay outside this set so ordinary
 * inspection does not turn into a reauthentication treadmill.
 */
const RECENT_AUTH_ADMIN_METHODS = new Set([
  "metaforge.api.add_user_permission",
  "metaforge.api.remove_user_permission",
  "metaforge.api.set_user_roles",
  "metaforge.api.create_user",
  "metaforge.api.set_user_enabled",
  "frappe.custom.doctype.customize_form.customize_form.save_customization",
  "forge.apps.install",
  "forge.apps.uninstall",
]);

/** Platform-shaping Frappe resources whose writes are equivalent to native admin writes. */
const RECENT_AUTH_METADATA_RESOURCES = new Set([
  "DocType",
  "Custom Field",
  "Property Setter",
  "Workflow",
  "Print Format",
]);

function isTenantAccessAdministrator(context: FrappeRouterContext): boolean {
  const { user_id: userId, roles } = context.actor;
  return userId === "Administrator" || roles.includes("Administrator") || roles.includes("System Manager");
}

export function requiresRecentSecurityAuthentication(
  methodName: string,
  actorUserId: string,
  targetUser?: string,
): boolean {
  if (RECENT_AUTH_ADMIN_METHODS.has(methodName)) return true;
  return methodName === ADMIN_PASSWORD_METHOD && Boolean(targetUser && targetUser !== actorUserId);
}

export function requiresRecentSecurityAuthenticationForResource(
  httpMethod: string,
  pathname: string,
): boolean {
  const method = httpMethod.toUpperCase();
  if (!["POST", "PUT", "DELETE"].includes(method) || !pathname.startsWith(RESOURCE_PREFIX)) return false;
  const remainder = pathname.slice(RESOURCE_PREFIX.length);
  const encodedDoctype = remainder.split("/", 1)[0] ?? "";
  if (!encodedDoctype) return false;
  let doctype: string;
  try { doctype = decodeURIComponent(encodedDoctype); }
  catch { return false; }
  return RECENT_AUTH_METADATA_RESOURCES.has(doctype);
}

/**
 * Verifies that a password login happened recently enough for a security-sensitive act.
 *
 * The timestamp is sealed inside the signed session and deliberately survives sliding
 * renewal, so refreshing a cookie cannot manufacture a fresh authentication event.
 * App callbacks and development actors carry no password-auth timestamp and fail closed.
 */
export function assertRecentSecurityAuthentication(
  authenticatedAt: number | undefined,
  nowIso: string,
): void {
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) throw errors.misconfigured("Server clock is invalid");
  const authTime = Number(authenticatedAt ?? 0);
  const ageSeconds = Math.floor(nowMs / 1000) - authTime;
  if (
    !Number.isFinite(authTime)
    || authTime <= 0
    || ageSeconds < -RECENT_SECURITY_AUTH_CLOCK_SKEW_SECONDS
    || ageSeconds > RECENT_SECURITY_AUTH_MAX_AGE_SECONDS
  ) {
    throw errors.authentication("Please sign in again before changing tenant access controls");
  }
}

async function assertSecurityStepUp(
  request: Request,
  url: URL,
  context: FrappeRouterContext,
): Promise<void> {
  if (!isTenantAccessAdministrator(context)) return;

  if (requiresRecentSecurityAuthenticationForResource(request.method, url.pathname)) {
    assertRecentSecurityAuthentication(context.authenticatedAt, context.now());
    return;
  }

  if (!url.pathname.startsWith(METHOD_PREFIX)) return;
  const methodName = url.pathname.slice(METHOD_PREFIX.length);
  let targetUser: string | undefined;
  if (methodName === ADMIN_PASSWORD_METHOD) {
    // Clone before parsing: the core router still needs the original request body.
    const args = await readFrappeArgs(request.clone(), url);
    targetUser = args.text("user") ?? context.actor.user_id;
  }
  if (!requiresRecentSecurityAuthentication(methodName, context.actor.user_id, targetUser)) return;
  assertRecentSecurityAuthentication(context.authenticatedAt, context.now());
}

async function securityAlertsResponse(request: Request, url: URL, context: FrappeRouterContext): Promise<Response> {
  if (!context.organizationSecurity) throw errors.notFound("Security audit service is unavailable");
  if (!["GET", "POST"].includes(request.method.toUpperCase())) throw errors.validation("security_alerts accepts GET or POST");
  const args = await readFrappeArgs(request, url);
  const cursor = args.text("cursor")?.trim() || undefined;
  const limitText = args.text("limit")?.trim();
  const limit = limitText === undefined ? undefined : Number(limitText);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw errors.validation("limit must be an integer from 1 to 100");
  }
  return methodResponse(await listSecurityAlerts({
    tenantId: context.tenantId,
    actor: context.actor,
    audit: context.organizationSecurity,
    ...(cursor ? { cursor } : {}),
    ...(limit === undefined ? {} : { limit }),
  }));
}

function requireCookieSession(context: FrappeRouterContext): void {
  if (!context.authenticatedAt || context.actor.user_id === "Guest") {
    throw errors.permission("A browser session is required for session management");
  }
}

/**
 * Adds the tiny unauthenticated Website/CMS read surface without widening the core
 * router's generic document API. Keeping this as a wrapper also keeps the already-large
 * Frappe façade focused on Frappe compatibility while website publishing remains a
 * bounded Forge capability.
 *
 * The same edge is the narrowest place to enforce recent-auth for IAM, metadata and
 * app-lifecycle administration, expose security alerts derived from immutable evidence,
 * and keep session-management methods cookie-bound. Core router ownership of business
 * authorization and mutation semantics stays unchanged.
 */
export async function routeFrappeApi(
  request: Request,
  url: URL,
  context: FrappeRouterContext,
): Promise<Response | null> {
  if (url.pathname !== WEBSITE_MANIFEST && url.pathname !== WEBSITE_PAGE) {
    try {
      await assertSecurityStepUp(request, url, context);
      if (url.pathname === SECURITY_ALERTS_PATH) return await securityAlertsResponse(request, url, context);
      if (isSessionManagementPath(url.pathname)) {
        requireCookieSession(context);
        return await routeSessionManagementApi(request, url, {
          tenantId: context.tenantId,
          userId: context.actor.user_id,
          traceId: context.traceId,
          now: context.now(),
          sessions: context.users.sessions,
          revokeAllSessions: () => context.users.administration.revokeSessions(
            context.tenantId,
            context.actor.user_id,
            {
              actorUserId: context.actor.user_id,
              traceId: context.traceId,
              source: "metaforge.api.logout_other_sessions",
            },
            context.now(),
          ),
        });
      }
    } catch (error) {
      return faultResponse(error, context.traceId);
    }
    return routeCoreFrappeApi(request, url, context);
  }

  try {
    if (request.method.toUpperCase() !== "GET") {
      throw errors.validation("Website public API only accepts GET");
    }
    if (!context.webForms) throw errors.notFound("This deployment has no public surface");
    const website = { db: context.webForms.db, tenantId: context.tenantId };
    if (url.pathname === WEBSITE_MANIFEST) return methodResponse(await websiteManifest(website));

    const args = await readFrappeArgs(request, url);
    return methodResponse(await websitePage(website, args.text("slug") ?? ""));
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}
