import type { D1MfaService } from "../../auth/src/index.js";
import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { readFrappeArgs } from "./args.js";
import { methodResponse } from "./envelope.js";

export const MFA_STATUS_PATH = "/api/method/metaforge.api.mfa_status";
export const MFA_BEGIN_TOTP_PATH = "/api/method/metaforge.api.mfa_begin_totp";
export const MFA_CONFIRM_TOTP_PATH = "/api/method/metaforge.api.mfa_confirm_totp";
export const MFA_DISABLE_PATH = "/api/method/metaforge.api.mfa_disable";

const MFA_PATHS = new Set([
  MFA_STATUS_PATH,
  MFA_BEGIN_TOTP_PATH,
  MFA_CONFIRM_TOTP_PATH,
  MFA_DISABLE_PATH,
]);
const RECENT_AUTH_MAX_AGE_SECONDS = 15 * 60;
const FUTURE_CLOCK_SKEW_SECONDS = 60;

export interface MfaRouteContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  authenticatedAt?: number;
  now: string;
  mfa: D1MfaService;
}

export function isMfaRoutePath(pathname: string): boolean {
  return MFA_PATHS.has(pathname);
}

export async function routeMfaApi(
  request: Request,
  url: URL,
  context: MfaRouteContext,
): Promise<Response | null> {
  if (!isMfaRoutePath(url.pathname)) return null;
  requireBrowserSession(context);

  if (url.pathname === MFA_STATUS_PATH) {
    if (request.method.toUpperCase() !== "GET") throw errors.validation("mfa_status requires GET");
    return methodResponse(await context.mfa.status(context.tenantId, context.actor.user_id));
  }

  assertRecentPasswordAuthentication(context);
  const args = await readFrappeArgs(request, url);
  if (url.pathname === MFA_BEGIN_TOTP_PATH) {
    if (request.method.toUpperCase() !== "POST") throw errors.validation("mfa_begin_totp requires POST");
    return methodResponse(await context.mfa.beginTotpEnrollment(
      context.tenantId,
      context.actor.user_id,
      context.now,
      "Forge",
    ));
  }

  const code = args.requireText("code", 128);
  if (url.pathname === MFA_CONFIRM_TOTP_PATH) {
    if (request.method.toUpperCase() !== "POST") throw errors.validation("mfa_confirm_totp requires POST");
    return methodResponse(await context.mfa.confirmTotpEnrollment(
      context.tenantId,
      context.actor.user_id,
      code,
      {
        actorUserId: context.actor.user_id,
        traceId: context.traceId,
        source: "mfa-self-service",
        reason: "self-service MFA enrollment confirmation",
      },
      context.now,
    ));
  }

  if (request.method.toUpperCase() !== "POST") throw errors.validation("mfa_disable requires POST");
  const reason = args.text("reason")?.trim() ?? "";
  if (reason.length > 500) throw errors.validation("reason must be at most 500 characters");
  return methodResponse({
    disabled: await context.mfa.disable(
      context.tenantId,
      context.actor.user_id,
      code,
      {
        actorUserId: context.actor.user_id,
        traceId: context.traceId,
        source: "mfa-self-service",
        reason: reason || "self-service MFA disable",
      },
      context.now,
    ),
  });
}

function requireBrowserSession(context: MfaRouteContext): void {
  if (!context.authenticatedAt || context.actor.user_id === "Guest") {
    throw errors.permission("A browser session is required for MFA management");
  }
}

function assertRecentPasswordAuthentication(context: MfaRouteContext): void {
  const nowMs = Date.parse(context.now);
  if (!Number.isFinite(nowMs)) throw errors.misconfigured("Server clock is invalid");
  const age = Math.floor(nowMs / 1000) - Number(context.authenticatedAt ?? 0);
  if (age < -FUTURE_CLOCK_SKEW_SECONDS || age > RECENT_AUTH_MAX_AGE_SECONDS) {
    throw errors.authentication("Please sign in again before changing multi-factor authentication");
  }
}
