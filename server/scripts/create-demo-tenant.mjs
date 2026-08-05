#!/usr/bin/env node
/**
 * Customer Demo Factory: brief + customer/slug -> a live isolated tenant URL.
 *
 * This is an orchestrator, not a second provisioning implementation. It reuses:
 * - Cloudflare D1 as the tenant database authority;
 * - provision-tenant.mjs for migrations/Worker/secrets/route/admin;
 * - forge-app.mjs for metadata install + browser-path verification;
 * - seed-demo-data.mjs for optional synthetic canonical demo documents.
 *
 * It deliberately does NOT create or rewrite DNS/Worker routes. The platform wildcard
 * (*.kairo.vn -> cloudforge-gateway) is shared production infrastructure and must be
 * bootstrapped separately under provider governance. A missing wildcard therefore fails
 * during the readiness probe instead of being silently repaired here.
 */
import { existsSync } from "node:fs";
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
import {
  resolveCloudflareAccountId,
  resolveDemoPlatformSecrets,
} from "./lib/demo-provider-credentials.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const briefArg = args[0] && !args[0].startsWith("--") ? args[0] : null;
if (!briefArg) fail("usage: node scripts/create-demo-tenant.mjs <brief.json> --customer <name> [--slug thuy] [--admin admin] [--plan pro] [--seed seed.json] [--dry-run]");
// Child scripts run with cwd=serverRoot. Resolve the caller's path NOW so both
// `server/briefs/x.json` (repo-root workflow) and `briefs/x.json` (server cwd) work.
const briefPath = path.resolve(process.cwd(), briefArg);
if (!existsSync(briefPath)) fail(`brief not found: ${briefPath}`);
const explicitSeed = argOf("seed");
const autoSeed = path.join(serverRoot, "demo-seeds", `${path.basename(briefPath, path.extname(briefPath))}.json`);
const seedPath = explicitSeed ? path.resolve(process.cwd(), explicitSeed) : (existsSync(autoSeed) ? autoSeed : null);
if (explicitSeed && !existsSync(seedPath)) fail(`seed manifest not found: ${seedPath}`);

const customer = argOf("customer", "");
const slug = normalizeDemoSlug(argOf("slug", customer));
const domain = argOf("domain", process.env.FORGE_DEMO_BASE_DOMAIN ?? "kairo.vn");
const hostname = demoHostname(slug, domain);
const origin = `https://${hostname}`;
const databaseName = demoDatabaseName(slug);
const accountHint = argOf("account", process.env.CLOUDFLARE_ACCOUNT_ID ?? "");
const namespace = argOf("namespace", process.env.FORGE_DISPATCH_NAMESPACE ?? "cloudforge-production");
const referenceTenantScript = argOf("reference-tenant-script", process.env.FORGE_REFERENCE_TENANT_SCRIPT ?? "cloudforge-tenant-alu");
const adminUser = argOf("admin", process.env.FORGE_ADMIN_USER ?? "admin");
const plan = argOf("plan", "pro");
const explicitControlUrl = (argOf("control-url", process.env.FORGE_CONTROL_URL) ?? "").replace(/\/$/, "");
const dryRun = args.includes("--dry-run");
const provisionStandard = args.includes("--provision-standard");

if (!customer && !argOf("slug")) fail("--customer <name> or --slug <slug> is required");
if (!/^(free|pro|enterprise)$/.test(plan)) fail("--plan must be free, pro or enterprise");

const sensitiveValues = [];
function addSensitive(value) {
  const text = String(value ?? "");
  if (text && !sensitiveValues.includes(text)) sensitiveValues.push(text);
}
for (const name of [
  "CLOUDFLARE_API_TOKEN",
  "FORGE_INTERNAL_AUTH_SECRET",
  "INTERNAL_AUTH_SECRET",
  "FORGE_INTERNAL_SERVICE_TOKEN",
  "INTERNAL_SERVICE_TOKEN",
  "FORGE_CONTROL_TOKEN",
  "CONTROL_TOKEN",
  "FORGE_ADMIN_PASSWORD",
]) addSensitive(process.env[name]);

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
console.log(`seed     ${seedPath ?? "(none)"}`);
console.log(`plan     ${plan}\n`);

if (dryRun) {
  runNode("forge-app.mjs", [briefPath, "--dry-run"]);
  if (seedPath) runNode("seed-demo-data.mjs", [seedPath, "--dry-run"]);
  console.log(`\nDEMO_PLAN_PASS ${origin}`);
  process.exit(0);
}

const token = String(process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
if (!token) fail("CLOUDFLARE_API_TOKEN is required");
if (!process.env.FORGE_ADMIN_PASSWORD) fail("FORGE_ADMIN_PASSWORD is required");

// Provider identity + shared credential resolution happen BEFORE the first D1/provider
// mutation. The account can be selected from the token-visible account containing the
// canonical gateway. Existing shared secret values are reused only when supplied by the
// environment or actually returned by the provider; metadata-only secret reads fail closed.
let accountResolution;
let platformSecrets;
try {
  accountResolution = await resolveCloudflareAccountId({ token, accountHint });
  platformSecrets = await resolveDemoPlatformSecrets({
    token,
    accountId: accountResolution.accountId,
    namespace,
    referenceTenantScript,
    env: process.env,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const accountId = accountResolution.accountId;
const providerEnv = {
  CLOUDFLARE_ACCOUNT_ID: accountId,
  ...platformSecrets.values,
};
for (const value of Object.values(platformSecrets.values)) addSensitive(value);
console.log(`0 provider  ${accountResolution.selection}`);
console.log(`  secrets   ${Object.entries(platformSecrets.source).map(([name, source]) => `${name}:${source}`).join(", ")}`);

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
runNode("provision-tenant.mjs", provisionArgs, providerEnv);

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

if (seedPath) {
  console.log("6 seed      synthetic canonical demo data");
  runNode("seed-demo-data.mjs", [seedPath, "--origin", origin, "--admin", adminUser]);
}

console.log(`\nLIVE ${origin}`);
console.log(`tenant=${slug} database=${database.name} admin=${adminUser}`);
console.log(`seed=${seedPath ? path.basename(seedPath) : "none"}`);
console.log("No DNS/resource cleanup was attempted. Failed runs retain evidence for diagnosis and safe retry.");
