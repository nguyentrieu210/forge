#!/usr/bin/env node
/**
 * Creates ONE administrator in a REMOTE tenant, with a freshly generated password.
 *
 *   node scripts/seed-remote-admin.mjs --config apps/tenant-worker/wrangler.jsonc \
 *     --tenant demo --user admin@example.com
 *
 * Deliberately NOT a `--remote` flag on `seed-local.mjs`: that script seeds a fixed,
 * documented password plus demo documents, and pointing it at a real tenant would
 * hand a working account to anyone who read the file. It refuses `--remote` and
 * should keep refusing.
 *
 * So this script does the one thing a real deployment needs and nothing more:
 * - the password is generated here from `crypto.randomBytes`, never defaulted, and
 *   never written to disk. It is printed once. Losing it means running this again.
 * - the password is hashed with the SERVER'S OWN `hashPassword`, so the record is
 *   whatever the login path actually verifies rather than a second implementation
 *   that could drift.
 * - only `roles`, `users` and `user_roles` are touched. No demo documents.
 * - the hash travels as a `--command` argument, so no file containing it is ever
 *   created and left behind.
 *
 * Re-running rotates the password of an existing user and bumps `session_epoch`,
 * which is how this codebase revokes outstanding sessions — otherwise a stolen
 * cookie would outlive the password it was issued against.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { d1BindingOf, d1Query, fail, quote, serverRoot } from "./wrangler-cli.mjs";
import { hashPassword } from "../dist/packages/frappe-api/src/index.js";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const configArg = argOf("config");
if (!configArg) fail("seed-remote-admin: --config <path to wrangler.jsonc> is required");

const tenant = argOf("tenant", "demo");
const user = argOf("user", "admin@example.com");
const fullName = argOf("name", "Administrator");
const role = argOf("role", "System Manager");

if (!/^[^\s@]+@[^\s@]+$/.test(user)) fail(`--user must be an email address, got "${user}"`);

const database = d1BindingOf(path.resolve(serverRoot, configArg));

/**
 * 32 bytes of base64url — ~192 bits. Long enough that the account is not the weak
 * point, and safe to paste through a shell or a browser field unquoted.
 */
const password = randomBytes(24).toString("base64url");
const hash = await hashPassword(password);
const now = new Date().toISOString();

console.log(`database ${database.name} (${database.id ?? "id not pinned"})`);
console.log(`tenant   ${tenant}`);
console.log(`user     ${user}\n`);

d1Query(database, `INSERT INTO roles(tenant_id,role,is_standard,modified_at)
  VALUES('${quote(tenant)}','${quote(role)}',1,'${now}')
  ON CONFLICT(tenant_id,role) DO NOTHING`);

d1Query(database, `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
  VALUES('${quote(tenant)}','${quote(user)}','${quote(fullName)}','${quote(user)}','${quote(hash)}','vi','Asia/Ho_Chi_Minh','${now}','${now}')
  ON CONFLICT(tenant_id,user_id) DO UPDATE SET
    password_hash=excluded.password_hash,
    enabled=1,
    session_epoch=users.session_epoch+1,
    modified_at=excluded.modified_at`);

d1Query(database, `INSERT INTO user_roles(tenant_id,user_id,role)
  VALUES('${quote(tenant)}','${quote(user)}','${quote(role)}')
  ON CONFLICT DO NOTHING`);

const rows = d1Query(database, `SELECT enabled, session_epoch, LENGTH(password_hash) AS hash_length
  FROM users WHERE tenant_id='${quote(tenant)}' AND user_id='${quote(user)}'`);
if (rows.length !== 1 || rows[0].enabled !== 1 || rows[0].hash_length < 40) {
  fail(`the account did not land as expected: ${JSON.stringify(rows)}`);
}

console.log(`role     ${role}`);
console.log(`session_epoch now ${rows[0].session_epoch} (any earlier session is revoked)\n`);
console.log("  PASSWORD (shown once, not stored anywhere):\n");
console.log(`    ${password}\n`);
console.log("  Store it in a password manager now. Re-running this script issues a new one.");
