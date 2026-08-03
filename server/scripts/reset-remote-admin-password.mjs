#!/usr/bin/env node
/**
 * Reset one existing remote tenant administrator password without ever printing it.
 *
 * The desired password is read only from FORGE_ADMIN_PASSWORD. The script updates the
 * existing row in D1, re-enables the account, increments session_epoch to revoke old
 * sessions, then cryptographically verifies the stored hash against that same secret.
 *
 * This script intentionally implements the CURRENT persisted Forge password format locally
 * instead of importing server/dist. Production reset must not be blocked by unrelated
 * TypeScript errors elsewhere in the monorepo. It also deliberately does NOT probe the
 * public login endpoint after reset: login attempts consume the same account limiter as a
 * human login and can lock the administrator out. D1 hash verification is the authoritative
 * credential proof for this maintenance operation.
 *
 * Live execution requires BOTH --execute and --confirm <tenant>.
 */
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import { d1BindingOf, d1Query, fail, quote, wrangler } from "./wrangler-cli.mjs";
import {
  findTenantDatabaseId,
  removeTenantConfig,
  writeTenantConfig,
} from "./tenant-wrangler.mjs";

const PASSWORD_ITERATIONS = 210_000;
const MAX_ITERATIONS_PER_CALL = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function derive(password, salt, iterations) {
  let material = new TextEncoder().encode(password);
  let remaining = iterations;
  while (remaining > 0) {
    const round = Math.min(remaining, MAX_ITERATIONS_PER_CALL);
    const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: round, hash: "SHA-256" },
      key,
      KEY_BITS,
    );
    material = new Uint8Array(bits);
    remaining -= round;
  }
  return material;
}

async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) fail("stored admin password must be at least 8 characters");
  if (password.length > 256) fail("stored admin password must be at most 256 characters");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[2], "base64");
    expected = Buffer.from(parts[3], "base64");
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;

  const candidate = Buffer.from(await derive(password, salt, iterations));
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const tenant = valueOf("tenant")?.trim();
const execute = args.includes("--execute");
const confirm = valueOf("confirm")?.trim();
const user = (valueOf("user") ?? process.env.FORGE_ADMIN_USER ?? "admin").trim();
const desiredPassword = process.env.FORGE_ADMIN_PASSWORD ?? "";

if (!tenant) fail("reset-remote-admin-password: --tenant <id> is required");
if (!/^[a-z0-9][a-z0-9-]*$/i.test(tenant)) fail("tenant id contains unsafe characters");
if (!user || /\s/.test(user)) fail("admin user must be a non-empty identifier without whitespace");
if (!desiredPassword) fail("FORGE_ADMIN_PASSWORD is required");
if (!execute) {
  console.log(JSON.stringify({ mode: "dry-run", tenant, user, action: "reset password + revoke prior sessions" }, null, 2));
  process.exit(0);
}
if (confirm !== tenant) fail(`refusing remote password reset: add --confirm ${tenant}`);

const databaseId = findTenantDatabaseId(tenant, wrangler);
if (!databaseId) fail(`no D1 database named cloudforge-${tenant}`);
const { configPath } = writeTenantConfig({ tenant, databaseId });

try {
  const database = d1BindingOf(configPath);
  const before = d1Query(
    database,
    `SELECT user_id, enabled, session_epoch FROM users WHERE tenant_id='${quote(tenant)}' AND user_id='${quote(user)}'`,
  );
  if (before.length !== 1) fail(`expected exactly one existing ${user} account in tenant ${tenant}; found ${before.length}`);

  const hash = await hashPassword(desiredPassword);
  const now = new Date().toISOString();
  d1Query(
    database,
    `UPDATE users
       SET password_hash='${quote(hash)}', enabled=1, session_epoch=session_epoch+1, modified_at='${quote(now)}'
     WHERE tenant_id='${quote(tenant)}' AND user_id='${quote(user)}'`,
  );

  const after = d1Query(
    database,
    `SELECT user_id, enabled, session_epoch, password_hash
       FROM users WHERE tenant_id='${quote(tenant)}' AND user_id='${quote(user)}'`,
  );
  if (after.length !== 1 || Number(after[0].enabled) !== 1) {
    fail(`password reset verification failed for ${tenant}/${user}`);
  }
  if (Number(after[0].session_epoch) <= Number(before[0].session_epoch)) {
    fail(`session_epoch did not advance for ${tenant}/${user}`);
  }
  if (!(await verifyPassword(desiredPassword, after[0].password_hash))) {
    fail(`stored credential does not verify against the requested production secret for ${tenant}/${user}`);
  }

  console.log(`D1_CREDENTIAL_VERIFY_OK tenant=${tenant} user=${user}`);
  console.log(`SESSION_REVOKE_OK tenant=${tenant} user=${user} session_epoch=${after[0].session_epoch}`);
} finally {
  removeTenantConfig(configPath);
}
