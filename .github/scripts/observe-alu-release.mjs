import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const evidenceDir = process.env.EVIDENCE_DIR;
const cutoff = new Date(process.env.RELEASE_NOT_BEFORE ?? "2026-07-30T18:40:00Z").getTime();

if (!token || !accountId || !evidenceDir) {
  throw new Error("Missing Cloudflare credential, account id, or evidence directory");
}
mkdirSync(evidenceDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runWrangler(sql, outputName) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "cloudforge-alu", "--remote", "--json", "--command", sql],
    { cwd: path.resolve("server"), encoding: "utf8", env: process.env },
  );
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeFileSync(path.join(evidenceDir, outputName), text);
  if (result.status !== 0) return [];
  const start = text.indexOf("[");
  if (start < 0) return [];
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return [];
  }
}

async function getJson(url, outputName) {
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const text = await response.text();
    writeFileSync(path.join(evidenceDir, outputName), text);
    if (!response.ok) return null;
    return JSON.parse(text);
  } catch (error) {
    writeFileSync(path.join(evidenceDir, outputName), String(error));
    return null;
  }
}

async function getStatus(url, outputName) {
  try {
    const response = await fetch(url);
    writeFileSync(path.join(evidenceDir, outputName), await response.text());
    return response.status;
  } catch (error) {
    writeFileSync(path.join(evidenceDir, outputName), String(error));
    return 0;
  }
}

let lastSummary = null;
for (let attempt = 1; attempt <= 45; attempt += 1) {
  console.log(`Observation attempt ${attempt}/45`);

  const deploymentResponse = await getJson(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/cloudforge-tenant-alu/deployments`,
    "deployments.json",
  );
  const result = deploymentResponse?.result;
  const deployments = Array.isArray(result) ? result : result?.deployments ?? [];
  const latest = deployments[0] ?? null;
  const deploymentFresh = Boolean(latest?.created_on) && new Date(latest.created_on).getTime() >= cutoff;

  const migrationPayload = runWrangler(
    "SELECT name FROM d1_migrations WHERE name IN ('0027_purchase_receipt_allocation.sql','0028_purchase_allocation_cancel_guard.sql','0029_purchase_allocation_rollout.sql') ORDER BY name;",
    "migrations.json",
  );
  const migrationRows = migrationPayload[0]?.results ?? [];
  const names = new Set(migrationRows.map((row) => row.name));
  const migrationsOk = [
    "0027_purchase_receipt_allocation.sql",
    "0028_purchase_allocation_cancel_guard.sql",
    "0029_purchase_allocation_rollout.sql",
  ].every((name) => names.has(name));

  const rolloutPayload = runWrangler(
    "SELECT enabled, unresolved_count FROM purchase_allocation_rollout_state;",
    "rollout.json",
  );
  const rolloutRows = rolloutPayload[0]?.results ?? [];
  const rolloutDisabled = rolloutRows.length === 0 || rolloutRows.every((row) => Number(row.enabled) !== 1);

  const healthStatus = await getStatus("https://alu.kairo.vn/health", "health.json");
  const guestBootStatus = await getStatus(
    "https://alu.kairo.vn/api/method/metaforge.api.get_boot",
    "guest-boot.json",
  );

  lastSummary = {
    deployment_id: latest?.id ?? null,
    deployment_created_on: latest?.created_on ?? null,
    deployment_fresh: deploymentFresh,
    migrations_ok: migrationsOk,
    rollout_disabled: rolloutDisabled,
    health_status: healthStatus,
    guest_boot_status: guestBootStatus,
  };
  lastSummary.passed =
    lastSummary.deployment_fresh
    && lastSummary.migrations_ok
    && lastSummary.rollout_disabled
    && lastSummary.health_status === 200
    && lastSummary.guest_boot_status === 403;

  writeFileSync(path.join(evidenceDir, "summary.json"), `${JSON.stringify(lastSummary, null, 2)}\n`);
  console.log(lastSummary);
  if (lastSummary.passed) break;
  await sleep(20_000);
}

if (!lastSummary?.passed) {
  throw new Error("Production release evidence did not converge in time");
}

const markdown = [
  "# alu FIFO core release",
  "",
  `- Deployment ID: \`${lastSummary.deployment_id}\``,
  `- Deployment time: \`${lastSummary.deployment_created_on}\``,
  `- Migrations 0027–0029: ${lastSummary.migrations_ok ? "PASS" : "FAIL"}`,
  `- FIFO rollout disabled: ${lastSummary.rollout_disabled ? "PASS" : "FAIL"}`,
  `- Health: ${lastSummary.health_status}`,
  `- Guest boot: ${lastSummary.guest_boot_status}`,
  "",
  "**Overall: PASS**",
].join("\n");
writeFileSync(path.join(evidenceDir, "summary.md"), `${markdown}\n`);
console.log(markdown);
