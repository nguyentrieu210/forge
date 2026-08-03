#!/usr/bin/env node
/**
 * Reset one existing remote tenant administrator password without ever printing it.
 *
 * The desired password is read only from FORGE_ADMIN_PASSWORD. The script updates the
 * existing row in D1, re-enables the account, increments session_epoch to revoke old
 * sessions, and optionally verifies the new credential against the tenant login route.
 *
 * Live execution requires BOTH --execute and --confirm <tenant>.
 */
import process from "node:process";
import { d1BindingOf, d1Query, fail, quote, wrangler } from "./wrangler-cli.mjs";
import {
  findTenantDatabaseId,
  findTenantOrigin,
  removeTenantConfig,
  writeTenantConfig,
} from "./tenant-wrangler.mjs";
import { hashPassword } from "../dist/packages/frappe-api/src/index.js";

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
const explicitOrigin = valueOf("origin")?.trim();

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
const discoveredOrigin = findTenantOrigin(tenant, wrangler);
const origin = (explicitOrigin || discoveredOrigin || "").replace(/\/$/, "");
const { configPath } = writeTenantConfig({ tenant, databaseId, ...(origin ? { publicOrigin: origin } : {}) });

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
    `SELECT user_id, enabled, session_epoch, LENGTH(password_hash) AS hash_length
       FROM users WHERE tenant_id='${quote(tenant)}' AND user_id='${quote(user)}'`,
  );
  if (after.length !== 1 || Number(after[0].enabled) !== 1 || Number(after[0].hash_length) < 40) {
    fail(`password reset verification failed for ${tenant}/${user}`);
  }
  if (Number(after[0].session_epoch) <= Number(before[0].session_epoch)) {
    fail(`session_epoch did not advance for ${tenant}/${user}`);
  }

  if (origin) {
    const response = await fetch(`${origin}/api/method/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usr: user, pwd: desiredPassword }),
    });
    if (!response.ok) fail(`credential verification failed at ${origin}: HTTP ${response.status}`);
    console.log(`LOGIN_VERIFY_OK tenant=${tenant} user=${user} origin=${origin}`);
  } else {
    console.log(`PASSWORD_RESET_OK tenant=${tenant} user=${user}; public origin not discovered, login probe skipped`);
  }

  console.log(`SESSION_REVOKE_OK tenant=${tenant} user=${user} session_epoch=${after[0].session_epoch}`);
} finally {
  removeTenantConfig(configPath);
}
