#!/usr/bin/env node
/**
 * Customer Demo Factory: brief + customer/slug -> a live isolated tenant URL.
 *
 * This is an orchestrator, not a second provisioning implementation. It reuses:
 * - Cloudflare D1 as the tenant database authority;
 * - provision-tenant.mjs for migrations/Worker/secrets/route/admin;
 * - forge-app.mjs for metadata install + browser-path verification.
 *
 * It deliberately does NOT create or rewrite DNS/Worker routes. The platform wildcard
 * (*.kairo.vn -> cloudforge-gateway) is shared production infrastructure and must be
 * bootstrapped separately under provider governance. A missing wildcard therefore fails
 * during the readiness probe instead of being silently repaired here.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fail, serverRoot } from "./wrangler-cli.mjs";
import {
  demoDatabaseName,
  demoHostname,
  ensureDemoDatabase,
  normalizeDemoSlug,
  resolveWorkersDevOrigin,
  waitForTenantShell,
} from "./lib/demo-provisioning.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const briefPath = args[0] && !args[0].startsWith("--") ? args[0] : null;
const customer = argOf("customer", "");
const slug = normalizeDemoSlug(argOf("slug", customer));
const domain = argOf("domain", process.env.FORGE_DEMO_BASE_DOMAIN ?? "kairo.vn");
const hostname = demoHostname(slug, domain);
const origin = `https://${hostname}`;
const databaseName = demoDatabaseName(slug);
const accountId = argOf("account", process.env.CLOUDFLARE_ACCOUNT_ID);
const namespace = argOf("namespace", process.env.FORGE_DISPATCH_NAMESPACE ?? "cloudforge-production");
const adminUser = argOf("admin", process.env.FORGE_ADMIN_USER ?? "admin");
const plan = argOf("plan", "pro");
const explicitControlUrl = (argOf("control-url", process.env.FORGE_CONTROL_URL) ?? "").replace(/\/$/, "");
const dryRun = args.includes("--dry-run");
const provisionStandard = args.includes("--provision-standard");

if (!briefPath) fail("usage: node scripts/create-demo-tenant.mjs <brief.json> --customer <name> [--slug thuy] [--admin admin] [--plan pro] [--dry-run]");
if (!customer && !argOf("slug")) fail("--customer <name> or --slug <slug> is required");
if (!accountId && !dryRun) fail("CLOUDFLARE_ACCOUNT_ID (or --account) is required");
if (!/^(free|pro|enterprise)$/.test(plan)) fail("--plan must be free, pro or enterprise");

const secrets = [
  "CLOUDFLARE_API_TOKEN",
  "FORGE_INTERNAL_AUTH_SECRET",
  "FORGE_INTERNAL_SERVICE_TOKEN",
  "FORGE_CONTROL_TOKEN",
  "FORGE_ADMIN_PASSWORD",
];
if (!dryRun) {
  for (const name of secrets) if (!process.env[name]) fail(`${name} is required`);
}

const sensitiveValues = secrets.map((name) => process.env[name]).filter(Boolean);
function redact(value) {
  let out = String(value ?? "");
  for (const secret of sensitiveValues) out = out.split(secret).join("***");
  return out;
}

function runNode(scriptName, scriptArgs, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(serverRoot, "scripts", scriptName), ...scriptArgs], {
    cwd: serverRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) fail(`${scriptName}: ${result.error.message}`);
  if (result.status !== 0) fail(`${scriptName} exited ${result.status}\n\n${redact(combined)}`);
  process.stdout.write(redact(result.stdout ?? ""));
  if (result.stderr) process.stderr.write(redact(result.stderr));
}

console.log(`customer ${customer || "(slug-only)"}`);
console.log(`tenant   ${slug}`);
console.log(`origin   ${origin}`);
console.log(`brief    ${briefPath}`);
console.log(`plan     ${plan}\n`);

if (dryRun) {
  runNode("forge-app.mjs", [briefPath, "--dry-run"]);
  console.log(`\nDEMO_PLAN_PASS ${origin}`);
  process.exit(0);
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const database = await ensureDemoDatabase({ accountId, token, databaseName });
console.log(`1 database  ${database.name} (${database.id}) ${database.created ? "created" : "reused"}`);

const controlUrl = explicitControlUrl || await resolveWorkersDevOrigin({
  accountId,
  token,
  scriptName: "cloudforge-control-plane",
});
console.log(`2 control   ${controlUrl}`);

const provisionArgs = [
  "--tenant", slug,
  "--database-id", database.id,
  "--route", hostname,
  "--account", accountId,
  "--namespace", namespace,
  "--control-url", controlUrl,
  "--admin", adminUser,
  "--plan", plan,
];
console.log("3 provision tenant lifecycle");
runNode("provision-tenant.mjs", provisionArgs);

process.stdout.write("4 readiness tenant shell … ");
const ready = await waitForTenantShell(origin);
console.log(`ok (attempt ${ready.attempt}, HTTP ${ready.status})`);

console.log("5 install   app metadata + verify browser path");
runNode("forge-app.mjs", [
  briefPath,
  "--origin", origin,
  "--admin", adminUser,
  ...(provisionStandard ? ["--provision-standard"] : []),
]);

console.log(`\nLIVE ${origin}`);
console.log(`tenant=${slug} database=${database.name} admin=${adminUser}`);
console.log("No DNS/resource cleanup was attempted. Failed runs retain evidence for diagnosis and safe retry.");
