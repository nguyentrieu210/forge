import type { MfaKeyRing } from "../../../packages/auth/src/index.js";
import type { TenantEnv } from "./env.js";

type TenantMfaBindings = TenantEnv & {
  MFA_KEY_ID?: string;
  MFA_KEK?: string;
  MFA_KEY_ID_PREVIOUS?: string;
  MFA_KEK_PREVIOUS?: string;
};

/**
 * Returns a dedicated MFA keyring only when the current generation is complete.
 *
 * Partial/missing configuration does not take the whole tenant offline. Enrollment will
 * refuse to start, and an already-enabled factor will fail closed when verification tries
 * to decrypt its seed. Previous generation support gives operators a rotation window.
 */
export function mfaKeyRingFromEnv(env: TenantEnv): MfaKeyRing | undefined {
  const bindings = env as TenantMfaBindings;
  if (!bindings.MFA_KEY_ID || !bindings.MFA_KEK) return undefined;
  const previous = bindings.MFA_KEY_ID_PREVIOUS && bindings.MFA_KEK_PREVIOUS
    ? [{ keyId: bindings.MFA_KEY_ID_PREVIOUS, kekBase64: bindings.MFA_KEK_PREVIOUS }]
    : undefined;
  return {
    current: { keyId: bindings.MFA_KEY_ID, kekBase64: bindings.MFA_KEK },
    ...(previous ? { previous } : {}),
  };
}
