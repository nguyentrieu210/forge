export interface InboundWebhookPolicy {
  provider: string;
  endpoint_key: string;
  signature_header: string;
  max_body_bytes: number;
  secret_ref: string;
}

const TOKEN_RE = /^[A-Za-z0-9_.-]{2,96}$/;
const HEADER_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function validateInboundWebhookPolicy(policy: InboundWebhookPolicy): InboundWebhookPolicy {
  if (!TOKEN_RE.test(policy.provider)) throw new Error("Invalid inbound webhook provider");
  if (!TOKEN_RE.test(policy.endpoint_key)) throw new Error("Invalid inbound webhook endpoint_key");
  if (!HEADER_RE.test(policy.signature_header) || policy.signature_header.length > 128) throw new Error("Invalid signature header");
  if (!Number.isSafeInteger(policy.max_body_bytes) || policy.max_body_bytes <= 0 || policy.max_body_bytes > 10_000_000) {
    throw new Error("Invalid max_body_bytes");
  }
  if (!policy.secret_ref || policy.secret_ref.length > 320 || /[\r\n\0]/.test(policy.secret_ref)) throw new Error("Invalid secret_ref");
  return policy;
}

export async function verifyHmacSha256Signature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!secret || secret.length < 16 || !signatureHeader) return false;
  const supplied = normalizeSha256Signature(signatureHeader);
  if (!supplied) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqualHex(supplied, expected);
}

export async function deriveInboundDeliveryId(provider: string, endpointKey: string, rawBody: string): Promise<string> {
  if (!TOKEN_RE.test(provider) || !TOKEN_RE.test(endpointKey)) throw new Error("Invalid inbound delivery identity");
  return `inb_${(await sha256Hex(`${provider}\n${endpointKey}\n${rawBody}`)).slice(0, 48)}`;
}

export function assertInboundBodySize(rawBody: string, maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 10_000_000) throw new Error("Invalid inbound body limit");
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) throw new Error("Inbound webhook payload too large");
}

export function parseInboundJson(rawBody: string, maxBytes: number): unknown {
  assertInboundBodySize(rawBody, maxBytes);
  try { return JSON.parse(rawBody) as unknown; } catch { throw new Error("Invalid inbound webhook JSON"); }
}

export function normalizeSha256Signature(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.startsWith("sha256=") ? normalized.slice(7) : normalized;
  return /^[a-f0-9]{64}$/.test(hex) ? hex : null;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return hex(new Uint8Array(signature));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function constantTimeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
