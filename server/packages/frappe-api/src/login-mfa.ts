import type { D1MfaService } from "../../auth/src/index.js";
import { errors } from "../../core/src/index.js";

export interface LoginMfaContext {
  tenantId: string;
  userId: string;
  traceId: string;
  now: string;
  mfa?: Pick<D1MfaService, "hasEnabledFactor" | "verifySecondFactor">;
}

/**
 * Enforces MFA after primary password verification but before any session is minted.
 *
 * This helper deliberately knows nothing about cookies or rate-limit persistence. The
 * login route owns ordering: call this before clearing a successful-login rate-limit and
 * before recordLogin/session issuance. When no MFA service exists (legacy unit fixture),
 * the helper preserves pre-MFA behavior. Production D1UserStore always supplies one.
 */
export async function assertLoginSecondFactor(
  context: LoginMfaContext,
  code: string | undefined,
): Promise<"password" | "totp" | "recovery"> {
  if (!context.mfa) return "password";
  if (!await context.mfa.hasEnabledFactor(context.tenantId, context.userId)) return "password";

  const normalized = code?.trim() ?? "";
  if (!normalized) throw errors.authentication("Multi-factor authentication code is required");
  const verified = await context.mfa.verifySecondFactor(
    context.tenantId,
    context.userId,
    normalized,
    {
      actorUserId: context.userId,
      traceId: context.traceId,
      source: "login",
      reason: "second factor verified for login",
    },
    context.now,
  );
  return verified.method;
}
