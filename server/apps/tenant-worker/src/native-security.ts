import {
  assertRecentAuthenticationContext,
  verifyTrustedIdentity,
  type TrustedIdentityKey,
} from "../../../packages/auth/src/index.js";
import type { TenantEnv } from "./env.js";

const EXACT_PRIVILEGED_NATIVE_WRITES = new Set([
  "POST /api/v1/social/facebook/oauth/start",
  "POST /api/v1/setup/provision-standard-metadata",
  "PUT /api/v1/user-permissions",
  "DELETE /api/v1/user-permissions",
]);

/**
 * Privileged native control surfaces that change tenant access or executable metadata.
 *
 * Ordinary document mutations continue to rely on the existing server-side permission,
 * organization-security and kernel paths. This guard is deliberately narrow: step-up is
 * for administration, not a second authorization system bolted onto every business save.
 */
export function requiresRecentNativeSecurityAuthentication(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (EXACT_PRIVILEGED_NATIVE_WRITES.has(`${normalizedMethod} ${pathname}`)) return true;
  if (normalizedMethod !== "PUT") return false;
  return /^\/api\/v1\/meta\/[^/]+$/.test(pathname)
    || /^\/api\/v1\/workflows\/[^/]+$/.test(pathname)
    || /^\/api\/v1\/print-formats\/[^/]+$/.test(pathname);
}

/**
 * Verifies issuer-authenticated `auth_time` carried inside the gateway-signed identity.
 *
 * The trusted identity's own `issued_at` is intentionally NOT accepted as step-up
 * evidence: the gateway can mint a fresh envelope for an old bearer token. Only the
 * upstream identity provider's signed `auth_time` says when the human authenticated.
 */
export async function assertRecentNativeSecurityAuthentication(
  request: Request,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (env.AUTH_MODE === "development") return;

  const keys = trustedIdentityKeys(env);
  const identity = await verifyTrustedIdentity(request, {
    tenantId,
    traceId,
    ...(keys.length > 0 ? { keys } : { masterSecret: env.INTERNAL_AUTH_SECRET }),
    nowSeconds,
  });
  assertRecentAuthenticationContext(identity.authentication, nowSeconds);
}

function trustedIdentityKeys(env: TenantEnv): TrustedIdentityKey[] {
  const keys: TrustedIdentityKey[] = [];
  if (env.INTERNAL_AUTH_KEY_ID) {
    keys.push({ key_id: env.INTERNAL_AUTH_KEY_ID, secret: env.INTERNAL_AUTH_SECRET });
  }
  if (env.INTERNAL_AUTH_KEY_ID_PREVIOUS && env.INTERNAL_AUTH_SECRET_PREVIOUS) {
    keys.push({
      key_id: env.INTERNAL_AUTH_KEY_ID_PREVIOUS,
      secret: env.INTERNAL_AUTH_SECRET_PREVIOUS,
    });
  }
  return keys;
}
