#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");

const args = new Set(process.argv.slice(2));
const modeArg = process.argv.find((value) => value.startsWith("--mode="));
const mode = modeArg?.slice("--mode=".length) ?? "bootstrap";
if (!new Set(["bootstrap", "converged"]).has(mode)) {
  throw new Error(`Unsupported --mode=${mode}; expected bootstrap|converged`);
}

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function requirePath(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Required convergence input missing: ${relativePath}`);
  return absolute;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(requirePath(relativePath), "utf8"));
}

const head = git("rev-parse", "HEAD");
const expected = process.env.UI_REC_EXPECTED_SHA?.trim();
if (expected && head !== expected) {
  throw new Error(`Exact-candidate mismatch: expected ${expected}, checked out ${head}`);
}

const bootstrapInputs = [
  "docs/agents/backend-ui-reconciliation/PROGRAM.md",
  "docs/agents/backend-ui-reconciliation/BACKEND_UI_SURFACE_MATRIX_CONTRACT.md",
  "docs/agents/backend-ui-reconciliation/UI-REC-05-QA.md",
  "server/scripts/verify-first-party-meta.mjs",
  "server/scripts/verify-alumdoor-meta-completeness.mjs",
  "server/tests/app-source-meta-contract.test.mjs",
  "server/tests/g03-generic-runtime-contract.test.mjs",
  "client/e2e-forge/playwright.purchase.config.ts",
  "client/e2e-forge/playwright.attendance.config.ts",
];
for (const input of bootstrapInputs) requirePath(input);

const convergenceInputs = [
  "docs/agents/backend-ui-reconciliation/BACKEND_UI_SURFACE_MATRIX.json",
  "docs/agents/backend-ui-reconciliation/BACKEND_UI_SURFACE_MATRIX_SUMMARY.md",
  "docs/agents/backend-ui-reconciliation/PROJECT_UI_COVERAGE_SUMMARY.md",
  "server/scripts/lib/backend-ui-contract-validator.mjs",
  "server/scripts/verify-backend-ui-contracts.mjs",
  "server/tests/backend-ui-contract-validator.test.mjs",
  "server/tests/backend-ui-reconciliation.test.mjs",
  "server/briefs/alumdoor-ui-rec-02-navigation.plan.json",
  "server/scripts/build-alumdoor-ui-rec-02-sidebar.mjs",
  "server/tests/alumdoor-ui-rec-02-navigation.test.mjs",
  "server/tests/alumdoor-attendance-form-projection.test.mjs",
  "client/packages/views/tests/grid-parity-convergence.test.mjs",
  ".github/workflows/grid-parity-qa.yml",
];

if (mode === "converged") {
  for (const input of convergenceInputs) requirePath(input);

  const matrix = readJson("docs/agents/backend-ui-reconciliation/BACKEND_UI_SURFACE_MATRIX.json");
  if (matrix?.program !== "backend-ui-reconciliation-20260811") {
    throw new Error("Surface matrix is not bound to backend-ui-reconciliation-20260811");
  }
  if (!Array.isArray(matrix.rows) || matrix.rows.length === 0) {
    throw new Error("Surface matrix has no auditable rows");
  }

  const ids = new Set();
  for (const row of matrix.rows) {
    if (!row?.id || !row?.doctype || !row?.schema || !row?.projection || !Array.isArray(row?.classification)) {
      throw new Error(`Incomplete surface-matrix row: ${JSON.stringify(row?.id ?? null)}`);
    }
    if (ids.has(row.id)) throw new Error(`Duplicate surface-matrix id: ${row.id}`);
    ids.add(row.id);
  }
}

if (args.has("--check-diff")) {
  const base = process.env.UI_REC_BASE_SHA?.trim();
  if (!base) throw new Error("--check-diff requires UI_REC_BASE_SHA");
  execFileSync("git", ["diff", "--check", `${base}...HEAD`], { cwd: repoRoot, stdio: "inherit" });
  const changed = git("diff", "--name-only", `${base}...HEAD`).split(/\r?\n/).filter(Boolean);
  const forbidden = changed.filter((file) =>
    /(^|\/)(\.env($|\.)|\.dev\.vars$|wrangler\.toml$|deploy-evidence\/|backups\/)/i.test(file),
  );
  if (forbidden.length) {
    throw new Error(`UI reconciliation candidate crossed production/provider boundary: ${forbidden.join(", ")}`);
  }
}

console.log(`UI_REC_05_CANDIDATE_PASS mode=${mode} sha=${head} convergence_inputs=${mode === "converged" ? convergenceInputs.length : 0}`);
