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
  "name: Reconcile frozen-install worktree",
  "pnpm-lock.yaml)",
  "git restore --source=HEAD --staged --worktree -- pnpm-lock.yaml",
  "name: Guard full-release generated worktree",
  "client/apps/kho/dist-mobile/*|server/apps/gateway-worker/public/*)",
  "node server/scripts/verify-tenant-backup.mjs",
  "node scripts/migrate-tenant.mjs --tenant \"$TENANT\" --execute --confirm \"$TENANT\" --allow-dirty",
  "node scripts/deploy-tenant.mjs --tenant \"$TENANT\" --execute --confirm \"$TENANT\" --allow-dirty",
  "name: Verify exact production convergence",
  "ref: main",
  "node server/scripts/sre-health-snapshot.mjs",
  "--expected-release-sha \"$TARGET_SHA\"",
  "--confirm-host alu.kairo.vn",
];
for (const invariant of required) {
  if (!workflow.includes(invariant)) throw new Error(`release safety invariant missing: ${invariant}`);
}

const buildDeployIndex = workflow.indexOf("build-deploy:");
const installIndex = workflow.indexOf("- name: Install dependencies", buildDeployIndex);
const installGuardIndex = workflow.indexOf("- name: Reconcile frozen-install worktree", buildDeployIndex);
const buildIndex = workflow.indexOf("- name: Build once", buildDeployIndex);
const generatedGuardIndex = workflow.indexOf("- name: Guard full-release generated worktree", buildDeployIndex);
const backupIndex = workflow.indexOf("node server/scripts/backup-tenant.mjs", buildDeployIndex);
const verifyIndex = workflow.indexOf("node server/scripts/verify-tenant-backup.mjs", buildDeployIndex);
const migrateIndex = workflow.indexOf('node scripts/migrate-tenant.mjs --tenant "$TENANT" --execute', buildDeployIndex);
const tenantDeployIndex = workflow.indexOf('node scripts/deploy-tenant.mjs --tenant "$TENANT" --execute', buildDeployIndex);
if (!(buildDeployIndex >= 0 && installIndex > buildDeployIndex && installIndex < installGuardIndex && installGuardIndex < buildIndex)) {
  throw new Error("full release must reconcile frozen-install source changes before exact build");
}
if (!(buildIndex < generatedGuardIndex && generatedGuardIndex < backupIndex)) {
  throw new Error("generated release worktree must be narrowed immediately after exact build and before production data operations");
}
if (!(backupIndex >= 0 && backupIndex < verifyIndex && verifyIndex < migrateIndex && migrateIndex < tenantDeployIndex)) {
  throw new Error("full release order must remain backup -> replay verify -> migrate -> tenant deploy");
}

const installGuardBlock = workflow.slice(installGuardIndex, buildIndex);
if (!installGuardBlock.includes("pnpm-lock.yaml)")) {
  throw new Error("frozen-install worktree reconciliation must remain limited to pnpm-lock.yaml");
}
for (const forbidden of ["client/*)", "server/*)", "*) git restore", "git reset --hard", "git clean -fd"]) {
  if (installGuardBlock.includes(forbidden)) throw new Error(`frozen-install source reconciliation is too broad: ${forbidden}`);
}
if (!installGuardBlock.includes('test -z "$(git status --porcelain --untracked-files=all)"')) {
  throw new Error("frozen-install reconciliation must end with an exact clean-worktree assertion");
}

const generatedGuardBlock = workflow.slice(generatedGuardIndex, backupIndex);
const approvedGeneratedRoots = [
  "client/apps/kho/dist-mobile/*",
  "server/apps/gateway-worker/public/*",
];
for (const root of approvedGeneratedRoots) {
  if (!generatedGuardBlock.includes(root)) throw new Error(`generated release guard must allow deterministic output root: ${root}`);
}
for (const broadRoot of ["client/*)", "server/*)", "client/apps/kho/*)", "server/apps/gateway-worker/*)"]) {
  if (generatedGuardBlock.includes(broadRoot)) throw new Error(`generated release guard is too broad: ${broadRoot}`);
}

const migrationLine = workflow.split(/\r?\n/).find((line) => line.includes('migrate-tenant.mjs --tenant "$TENANT" --execute')) ?? "";
const tenantDeployLine = workflow.split(/\r?\n/).find((line) => line.includes('deploy-tenant.mjs --tenant "$TENANT" --execute')) ?? "";
if (!migrationLine.includes("--allow-dirty") || !tenantDeployLine.includes("--allow-dirty")) {
  throw new Error("full release mutation may bypass the generic dirty guard only after both exact-source reconciliation guards");
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
  const liveDeployLines = source.split(/\r?\n/)
    .filter((line) => line.includes("wrangler deploy") && !line.includes("--dry-run"));
  const deploysGateway = source.includes("apps/gateway-worker/wrangler.jsonc") && liveDeployLines.length > 0;
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
  `RELEASE_SAFETY_PASS merged-main-target frozen-install-reconciled deterministic-generated-roots backup-before-migration current-main-verifier no-sql-artifact topology=${workflowFiles.join(",")}`,
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
