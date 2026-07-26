/**
 * Password hashing with PBKDF2-HMAC-SHA256 via WebCrypto.
 *
 * PBKDF2 is the only password KDF available in the Workers runtime — there is no
 * scrypt or Argon2 — so the work factor is the single defence and it is stored
 * per record rather than hardcoded, letting the cost be raised later without
 * invalidating existing hashes.
 *
 * The iteration count is a deliberate compromise with the Workers CPU budget: a
 * dispatched tenant Worker runs under a per-plan cpuMs limit, and a login that
 * exceeds it is killed rather than slow. The gateway therefore grants the login
 * path a larger budget (see gateway-worker), and this count is chosen to fit
 * inside that budget with margin.
 *
 * The work factor is reached by CHAINED ROUNDS, not one deriveBits call — see
 * MAX_ITERATIONS_PER_CALL. Do not "simplify" that back into a single call.
 */

import { errors, timingSafeEqualString } from "../../core/src/index.js";

export const PASSWORD_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

/**
 * The most iterations production Workers will accept in ONE `deriveBits` call.
 *
 * Above this the call throws, and because the throw happens before any password
 * comparison, EVERY login fails — including wrong ones, with a masked 500 rather
 * than a 401. Measured on the live deployment: a hash at 100,000 iterations logs in
 * (HTTP 200), the identical account at 210,000 answers 500.
 *
 * Local workerd does NOT enforce the limit. That is why the Node suite, the Workerd
 * suite and the local HTTP smoke were all green while the deployed product could not
 * authenticate anybody — no test that stops at workerd can catch this.
 *
 * So the work factor is built from repeated rounds of at most this many iterations,
 * each round's output becoming the next round's input key material. An attacker still
 * pays the full PASSWORD_ITERATIONS of HMAC-SHA256, so the cost is unchanged.
 *
 * A count at or below this limit derives in exactly one round, which is bit-identical
 * to the single-call form this replaced — so hashes stored before the change still
 * verify. Only counts above it produce different bits, and those could never be
 * verified in production anyway.
 */
const MAX_ITERATIONS_PER_CALL = 100_000;

export interface PasswordHash {
  algorithm: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  hash: string;
}

/** Serialised form stored in one column: `pbkdf2-sha256$iterations$salt$hash`. */
export function serializePasswordHash(value: PasswordHash): string {
  return `${value.algorithm}$${value.iterations}$${value.salt}$${value.hash}`;
}

export function parsePasswordHash(value: string): PasswordHash {
  const parts = value.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") throw errors.authentication("Stored credential is unusable");
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) throw errors.authentication("Stored credential is unusable");
  return { algorithm: "pbkdf2-sha256", iterations, salt: parts[2]!, hash: parts[3]! };
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  assertPasswordShape(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return serializePasswordHash({ algorithm: "pbkdf2-sha256", iterations, salt: toBase64(salt), hash });
}

/**
 * Verifies a password against a stored hash.
 *
 * Comparison is constant-time so a caller cannot learn the hash prefix by
 * timing repeated attempts.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let parsed: PasswordHash;
  try {
    parsed = parsePasswordHash(stored);
  } catch {
    return false;
  }
  const salt = fromBase64(parsed.salt);
  if (!salt) return false;
  const candidate = await derive(password, salt, parsed.iterations);
  return timingSafeEqualString(candidate, parsed.hash);
}

/**
 * Rejects credentials that cannot be hashed meaningfully.
 *
 * The upper bound matters: PBKDF2 cost is independent of password length, but an
 * unbounded input would still be copied and encoded, so an enormous password is
 * refused rather than processed.
 */
export function assertPasswordShape(password: string): void {
  if (typeof password !== "string" || password.length < 8) throw errors.validation("Password must be at least 8 characters");
  if (password.length > 256) throw errors.validation("Password must be at most 256 characters");
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  // Rounds of at most MAX_ITERATIONS_PER_CALL, each fed the previous round's output.
  // The same salt throughout: it exists to make the derivation account-specific, and
  // varying it per round would add nothing while making the scheme harder to state.
  let material: Uint8Array = new TextEncoder().encode(password);
  let remaining = iterations;
  while (remaining > 0) {
    const round = Math.min(remaining, MAX_ITERATIONS_PER_CALL);
    const key = await crypto.subtle.importKey("raw", material as unknown as BufferSource, "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: round, hash: "SHA-256" },
      key,
      KEY_BITS,
    );
    material = new Uint8Array(bits);
    remaining -= round;
  }
  return toBase64(material);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
