#!/usr/bin/env node
/**
 * Provisions a NEW tenant end to end: migrations, Worker, secrets, route, administrator.
 *
 *   FORGE_INTERNAL_AUTH_SECRET=… FORGE_INTERNAL_SERVICE_TOKEN=… FORGE_CONTROL_TOKEN=… \
 *   node scripts/provision-tenant.mjs --tenant hrm --database-id <uuid> \
 *     --route hrm.example.com --account <id> --control-url https://control…workers.dev
 *
 * A tenant is not one thing. It is a D1 database with every migration applied, a Worker
 * script of its own inside the dispatch namespace, three secrets that must MATCH the
 * platform's, a route in two KV keys, and an administrator. Doing that by hand teaches
 * nobody how to do it again, and each step that gets skipped fails later as something
 * that does not look like a missing step: a 500 with no session secret, a 404 with no
 * route, an outbox that never drains.
 *
 * Every step is idempotent except the administrator password, which is reissued each
 * run and printed once.
 *
 * WHY THE SECRETS COME FROM THE ENVIRONMENT. A Cloudflare secret is write-only, so a
 * tenant added later cannot read what the gateway is using. Either the operator still
 * holds the values `bootstrap-remote-secrets.mjs` printed, or the whole platform must
 * be re-keyed — logging every existing user out — just to add one customer. This script
 * refuses to run rather than quietly generate a mismatched value, because the failure
 * that produces is an authentication error on every request, which reads like a code
 * fault and not like a provisioning mistake.
 *
 * WHAT IT DOES NOT DO: DNS. Pointing a hostname at the gateway needs a credential with
 * DNS edit rights on the zone, which is deliberately not required here. The route is
 * registered under the hostname given, so the tenant goes live the moment that name
 * resolves to the gateway.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fail, serverRoot, wrangler } from "./wrangler-cli.mjs";
import { removeTenantConfig, tenantScriptName, writeTenantConfig } from "./tenant-wrangler.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const tenant = argOf("tenant");
const databaseId = argOf("database-id");
const route = argOf("route");
const account = argOf("account", process.env.CLOUDFLARE_ACCOUNT_ID);
const namespace = argOf("namespace", "cloudforge-production");
const controlUrl = (argOf("control-url") ?? "").replace(/\/$/, "");
const adminUser = argOf("admin");
const plan = argOf("plan", "pro");

if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required (lowercase, starting with a letter)");
if (!databaseId) fail(`--database-id is required — create it first: npx wrangler d1 create cloudforge-${tenant}`);
if (!route) fail("--route <hostname> is required — the host the gateway matches on");
if (!account) fail("--account <id> (or CLOUDFLARE_ACCOUNT_ID) is required");
if (!controlUrl) fail("--control-url <https://…> is required — the deployed control plane");
if (!adminUser) fail("--admin <email> is required — the tenant's first administrator");

for (const name of ["FORGE_INTERNAL_AUTH_SECRET", "FORGE_INTERNAL_SERVICE_TOKEN", "FORGE_CONTROL_TOKEN"]) {
  if (!process.env[name]) {
    fail(`${name} is required in the environment.\n  These are the values bootstrap-remote-secrets.mjs printed. A Cloudflare secret cannot be read back, so a tenant that generates its own would never authenticate against the gateway.`);
  }
}

const script = tenantScriptName(tenant);
const database = `cloudforge-${tenant}`;

// Shared with `deploy-tenant.mjs`, so a tenant redeployed for a platform change can
// never end up shaped differently from how it was provisioned.
const { configPath, relativeConfig } = writeTenantConfig({ tenant, databaseId });

function runScript(name, scriptArgs, env = {}) {
  const result = spawnSync(process.execPath, [path.join(serverRoot, "scripts", name), ...scriptArgs], {
    cwd: serverRoot, encoding: "utf8", env: { ...process.env, ...env },
  });
  if (result.status !== 0) fail(`${name} exited ${result.status}\n\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  return result.stdout ?? "";
}

console.log(`tenant   ${tenant}`);
console.log(`database ${database} (${databaseId})`);
console.log(`script   ${script} in ${namespace}`);
console.log(`route    ${route}\n`);

let adminOutput = "";
try {
  process.stdout.write("1 migrations                  … ");
  const migrated = runScript("d1-migrate-remote.mjs", ["--config", relativeConfig]);
  console.log(migrated.match(/applied (\d+) migration/)?.[0] ?? "already up to date");

  process.stdout.write("2 deploy into dispatch ns      … ");
  wrangler(["deploy", "--config", relativeConfig, "--name", script, "--dispatch-namespace", namespace]);
  console.log("ok");

  process.stdout.write("3 secrets (shared + fresh sid) … ");
  runScript("bootstrap-remote-secrets.mjs", [
    "--account", account, "--namespace", namespace, "--tenant-script", script, "--tenant-only",
  ]);
  console.log("ok");

  process.stdout.write("4 route via control plane      … ");
  const response = await fetch(`${controlUrl}/v1/routes/${encodeURIComponent(route)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${process.env.FORGE_CONTROL_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: tenant, worker_name: script, status: "active", plan }),
  });
  const body = await response.text();
  if (!response.ok) fail(`control plane refused the route (${response.status}): ${body}`);
  console.log(body.trim());

  process.stdout.write("5 administrator                … ");
  adminOutput = runScript("seed-remote-admin.mjs", ["--config", relativeConfig, "--tenant", tenant, "--user", adminUser]);
  console.log("ok");
} finally {
  removeTenantConfig(configPath);
}

console.log(`\n${adminOutput.trim()}`);
console.log(`\ntenant ${tenant} is live once ${route} resolves to the gateway.`);
