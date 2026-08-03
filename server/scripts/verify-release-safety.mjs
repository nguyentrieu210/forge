#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { serverRoot } from "./wrangler-cli.mjs";

const repoRoot = path.resolve(serverRoot, "..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");
const canonicalWorkflowName = "alu-build-deploy.yml";
const workflowPath = path.join(workflowsDir, canonicalWorkflowName);
const workflow = readFileSync(workflowPath, "utf8");

const required = [
  "name: ALU Build and Deploy",
  'branches:\n      - main',
  'paths:\n      - "client/**"',
  "inputs.scope == 'full' && inputs.confirm == 'alu'",
  "git merge-base --is-ancestor \"$TARGET_SHA\" origin/main",
  "node server/scripts/verify-tenant-backup.mjs",
  "node scripts/migrate-tenant.mjs --tenant \"$TENANT\" --execute --confirm \"$TENANT\"",
  "name: Verify exact production convergence",
  "ref: main",
  "node server/scripts/sre-health-snapshot.mjs",
  "--expected-release-sha \"$TARGET_SHA\"",
  "--confirm-host alu.kairo.vn",
];
for (const invariant of required) {
  if (!workflow.includes(invariant)) throw new Error(`release safety invariant missing: ${invariant}`);
}

const backupIndex = workflow.indexOf("node server/scripts/backup-tenant.mjs");
const verifyIndex = workflow.indexOf("node server/scripts/verify-tenant-backup.mjs");
const migrateIndex = workflow.indexOf('node scripts/migrate-tenant.mjs --tenant "$TENANT" --execute');
const tenantDeployIndex = workflow.indexOf('node scripts/deploy-tenant.mjs --tenant "$TENANT" --execute');
if (!(backupIndex >= 0 && backupIndex < verifyIndex && verifyIndex < migrateIndex && migrateIndex < tenantDeployIndex)) {
  throw new Error("full release order must remain backup -> replay verify -> migrate -> tenant deploy");
}

const verifyJobIndex = workflow.indexOf("verify-production:");
const currentMainCheckout = workflow.indexOf("ref: main", verifyJobIndex);
const healthProbeIndex = workflow.indexOf("node server/scripts/sre-health-snapshot.mjs", verifyJobIndex);
if (!(verifyJobIndex >= 0 && currentMainCheckout > verifyJobIndex && healthProbeIndex > currentMainCheckout)) {
  throw new Error("production convergence must run from current main SRE control-plane code");
}

const uploadBlocks = [...workflow.matchAll(/uses: actions\/upload-artifact@v4[\s\S]*?(?=\n\s{2,}- name:|\n\S|$)/g)]
  .map((match) => match[0]);
for (const block of uploadBlocks) {
  if (/\.sql(?:\s|$|['"])/m.test(block) || /alu-backup\//.test(block)) {
    throw new Error("release artifact upload must never include plaintext SQL backups");
  }
}

const automaticGuardIndex = workflow.indexOf("Guard automatic main push as UI-only");
if (automaticGuardIndex < 0 || !workflow.includes('client/*) has_client=true')) {
  throw new Error("automatic production UI lane must retain explicit client-only guard");
}

const workflowFiles = readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();
for (const name of workflowFiles) {
  if (/^tmp-/i.test(name)) {
    throw new Error(`temporary workflow must not remain active in root workflow topology: ${name}`);
  }
  if (name === canonicalWorkflowName) continue;

  const source = readFileSync(path.join(workflowsDir, name), "utf8");
  const deploysGateway = source.includes("apps/gateway-worker/wrangler.jsonc") && source.includes("wrangler deploy");
  if (deploysGateway) {
    throw new Error(`Gateway production deploy must live only in ${canonicalWorkflowName}; found ${name}`);
  }

  const productionMutation = source.includes("environment: production") && [
    "--execute",
    "wrangler deploy",
    "deploy-tenant.mjs",
    "migrate-tenant.mjs",
    "reset-remote-admin-password.mjs",
  ].some((needle) => source.includes(needle));
  if (!productionMutation) continue;

  if (hasTopLevelWorkflowEvent(source, "push") || hasTopLevelWorkflowEvent(source, "pull_request")) {
    throw new Error(`production-mutating maintenance workflow must not run automatically: ${name}`);
  }
  if (!hasTopLevelWorkflowEvent(source, "workflow_dispatch")) {
    throw new Error(`production-mutating maintenance workflow must be explicit workflow_dispatch: ${name}`);
  }
}

console.log(
  `RELEASE_SAFETY_PASS merged-main-target backup-before-migration current-main-verifier no-sql-artifact topology=${workflowFiles.join(",")}`,
);

function hasTopLevelWorkflowEvent(source, event) {
  const lines = source.split(/\r?\n/);
  let insideOn = false;
  for (const line of lines) {
    if (/^on:\s*$/.test(line)) {
      insideOn = true;
      continue;
    }
    if (!insideOn) continue;
    if (/^\S/.test(line) && line.trim()) break;
    if (new RegExp(`^\\s{2}${event}:`).test(line)) return true;
  }
  return false;
}
