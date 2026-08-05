#!/usr/bin/env node
/**
 * Provisions a NEW Security Generation V2 tenant without legacy platform secret values.
 *
 * Order is intentional and fail-closed:
 *   migrate -> deploy isolated Worker -> Control Plane derives/installs tenant secrets
 *   -> seed administrator -> publish active route LAST.
 *
 * GitHub carries the Cloudflare provider token transiently. The V2 masters remain only
 * on shared platform Workers; the tenant receives derived credentials for itself.
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
const route = String(argOf("route", "")).trim().toLowerCase();
const account = argOf("account", process.env.CLOUDFLARE_ACCOUNT_ID);
const namespace = argOf("namespace", "cloudforge-production");
const controlUrl = String(argOf("control-url", "")).replace(/\/$/, "");
const adminUser = argOf("admin");
const plan = argOf("plan", "pro");
const sourceSha = argOf("source-sha", process.env.FORGE_SOURCE_SHA);
const providerToken = String(process.env.CLOUDFLARE_API_TOKEN ?? "").trim();

if (!tenant || !/^[a-z][a-z0-9-]*$/.test(tenant)) fail("--tenant <id> is required (lowercase, starting with a letter)");
if (!databaseId) fail("--database-id is required");
if (!route || route.length > 253 || !/^[a-z0-9.-]+$/.test(route) || route.includes("..")) fail("--route <hostname> is required");
if (!account || !/^[a-f0-9]{32}$/i.test(account)) fail("--account <32-char Cloudflare account id> is required");
if (namespace !== "cloudforge-production") fail("--namespace must be cloudforge-production for Security Generation V2");
if (!controlUrl.startsWith("https://")) fail("--control-url <https://…> is required");
if (!adminUser) fail("--admin <user> is required");
if (!/^(free|pro|enterprise)$/.test(plan)) fail("--plan must be free, pro or enterprise");
if (!sourceSha || !/^[a-f0-9]{40}$/i.test(sourceSha)) fail("--source-sha <40-char merged commit SHA> (or FORGE_SOURCE_SHA) is required");
if (!providerToken) fail("CLOUDFLARE_API_TOKEN is required");

const script = tenantScriptName(tenant);
const database = `cloudforge-${tenant}`;
const publicOrigin = `https://${route}`;
const { configPath, relativeConfig } = writeTenantConfig({
  tenant,
  databaseId,
  publicOrigin,
  securityGeneration: 2,
});

function runScript(name, scriptArgs, env = {}) {
  const result = spawnSync(process.execPath, [path.join(serverRoot, "scripts", name), ...scriptArgs], {
    cwd: serverRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) fail(`${name} exited ${result.status}\n\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  return result.stdout ?? "";
}

async function controlProvider(pathname, method, body) {
  const response = await fetch(`${controlUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${providerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) fail(`control plane provider endpoint refused ${pathname} (${response.status}): ${text}`);
  return text.trim();
}

console.log(`tenant   ${tenant}`);
console.log(`database ${database} (${databaseId})`);
console.log(`script   ${script} in ${namespace}`);
console.log(`route    ${route}`);
console.log(`security generation=2 key_id=k2\n`);

let adminOutput = "";
try {
  process.stdout.write("1 migrations                         … ");
  const migrated = runScript("d1-migrate-remote.mjs", ["--config", relativeConfig]);
  console.log(migrated.match(/applied (\d+) migration/)?.[0] ?? "already up to date");

  process.stdout.write("2 deploy isolated tenant Worker     … ");
  wrangler(["deploy", "--config", relativeConfig, "--name", script, "--dispatch-namespace", namespace, "--strict"]);
  console.log("ok");

  process.stdout.write("3 derive/install V2 tenant secrets  … ");
  const security = await controlProvider(`/v1/provider/tenant-secrets/${encodeURIComponent(tenant)}`, "POST", {
    account_id: account,
    namespace,
    worker_name: script,
    source_sha: sourceSha,
  });
  console.log(security || "ok");

  process.stdout.write("4 administrator                     … ");
  adminOutput = runScript("seed-remote-admin.mjs", [
    "--config", relativeConfig,
    "--tenant", tenant,
    "--user", adminUser,
  ]);
  console.log("ok");

  process.stdout.write("5 publish active route LAST         … ");
  const routeResult = await controlProvider(`/v1/provider/routes/${encodeURIComponent(route)}`, "PUT", {
    account_id: account,
    tenant_id: tenant,
    worker_name: script,
    status: "active",
    plan,
    reason: "Security Generation V2 tenant provisioning completed",
  });
  console.log(routeResult || "ok");
} finally {
  removeTenantConfig(configPath);
}

console.log(`\n${adminOutput.trim()}`);
console.log(`\ntenant ${tenant} is Security Generation V2 and routed at ${publicOrigin}.`);
