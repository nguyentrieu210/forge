
import { stableStringify } from "./json.js";

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison for secrets/tokens (avoids early-exit timing leaks). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index]! ^ right[index]!;
  return diff === 0;
}

export async function commandPayloadHash(command: Record<string, unknown>): Promise<string> {
  const clone = { ...command };
  delete clone.payload_hash;
  // Actor is injected by the trusted server boundary and is not client-controlled payload.
  delete clone.actor;
  return sha256Hex(clone);
}
