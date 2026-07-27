export interface SocialQueueMessage {
  schema_version: 1;
  tenant_id: string;
  worker_name: string;
  provider: "facebook";
  page_key_hmac: string;
  event_id: string;
  received_at: string;
  raw_body: string;
}

export interface SocialEventInput {
  event_id: string;
  provider: "facebook";
  page_id: string;
  event_kind: string;
  external_actor_id?: string;
  message_text?: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  if (!secret) throw new Error("HMAC secret is required");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = await hmacHex(appSecret, rawBody);
  return constantTimeEqual(signatureHeader.slice(7).toLowerCase(), expected);
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function extractFacebookPageIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const id = (entry as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 && id.length <= 128 ? [id] : [];
  }))];
}

export async function deriveFacebookEventId(rawBody: string): Promise<string> {
  return `facebook:${await sha256Hex(rawBody)}`;
}
