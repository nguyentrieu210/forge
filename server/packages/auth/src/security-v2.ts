const encoder = new TextEncoder();

/**
 * Security Generation V2 service credential.
 *
 * The V2 master exists only on the platform control/jobs plane. Tenant Workers receive
 * only this derived token, bound to one tenant id, so compromise of one tenant cannot
 * authenticate internal service calls to another tenant.
 */
export async function deriveInternalServiceTokenV2(masterSecret: string, tenantId: string): Promise<string> {
  if (!masterSecret || masterSecret.length < 32) throw new Error("V2 service master must contain at least 32 characters");
  if (!/^[a-z][a-z0-9-]*$/.test(tenantId)) throw new Error("tenantId must be a normalized tenant identifier");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`cf-internal-service:v2:${tenantId}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
