#!/usr/bin/env node
// Guardrail: fail if a secret (or a secret-looking value) is committed into
// source-controlled deploy config. Real secrets must live in Cloudflare
// encrypted secrets (non-dispatch workers) or be injected at deploy time — never
// checked in. This runs in `npm run verify` / `npm run check`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Keys whose NAME implies a secret value.
const SUSPICIOUS_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE[_-]?KEY|API[_-]?KEY|ACCESS[_-]?KEY)/i;
// Names that contain a suspicious substring but are safe identifiers, not secrets.
const ALLOW_KEYS = new Set(["INTERNAL_AUTH_KEY_ID", "INTERNAL_AUTH_KEY_ID_PREVIOUS"]);
// Values that look like a random secret (long hex / base64), regardless of key name.
const HIGH_ENTROPY = /^(?:[A-Fa-f0-9]{24,}|[A-Za-z0-9+/_-]{32,}={0,2})$/;
// Files that must never be tracked by git.
const FORBIDDEN_FILES = /^(\.dev\.vars|deploy-secrets\.env|secrets\.env|.*\.secrets)$/i;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".wrangler", "coverage"]);

const violations = [];
const acknowledged = [];

/**
 * Decides whether a secrets file on disk is a violation.
 *
 * The rule is that such a file must never be COMMITTED — which is what this check
 * has always claimed. It previously tested only for the file's existence, which
 * flagged `.dev.vars`: the wrangler-sanctioned place for LOCAL secrets, and a file
 * `wrangler dev` cannot work without. Failing on it made a green gate and a working
 * local environment mutually exclusive, which pushes people toward disabling the gate.
 *
 * So the question asked of git is the one that matters: is it tracked, and is it
 * ignored? Tracked is a violation. Untracked-and-unignored is also a violation,
 * because the next `git add .` commits it. Only untracked-AND-ignored is acceptable,
 * and even then it is reported so it is never invisible.
 */
function classifySecretsFile(relativePath) {
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relativePath], {
    cwd: root, stdio: "ignore",
  }).status === 0;
  if (tracked) return { ok: false, reason: "is tracked by git — a secrets file must never be committed" };

  const ignored = spawnSync("git", ["check-ignore", "-q", relativePath], {
    cwd: root, stdio: "ignore",
  }).status === 0;
  if (!ignored) {
    return { ok: false, reason: "is neither tracked nor ignored — the next `git add .` would commit it" };
  }
  return { ok: true, reason: "untracked and git-ignored (local only)" };
}

function stripJsonc(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function scanVars(file, vars) {
  if (!vars || typeof vars !== "object") return;
  for (const [key, value] of Object.entries(vars)) {
    if (ALLOW_KEYS.has(key)) continue;
    if (SUSPICIOUS_KEY.test(key)) {
      violations.push(`${file}: var "${key}" has a secret-like name — move it to an encrypted Cloudflare secret`);
    }
    if (typeof value === "string" && HIGH_ENTROPY.test(value)) {
      violations.push(`${file}: var "${key}" holds a high-entropy value that looks like a secret`);
    }
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(root, full);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (FORBIDDEN_FILES.test(entry)) {
      const verdict = classifySecretsFile(rel);
      if (verdict.ok) acknowledged.push(`${rel}: ${verdict.reason}`);
      else violations.push(`${rel}: ${verdict.reason}`);
      continue;
    }
    if (/wrangler.*\.jsonc?$/.test(entry)) {
      try {
        const config = JSON.parse(stripJsonc(readFileSync(full, "utf8")));
        scanVars(rel, config.vars);
        if (Array.isArray(config.env)) for (const e of config.env) scanVars(rel, e?.vars);
        if (config.env && typeof config.env === "object") for (const e of Object.values(config.env)) scanVars(rel, e?.vars);
      } catch (error) {
        violations.push(`${rel}: could not parse config (${error.message})`);
      }
    }
  }
}

walk(root);

if (violations.length > 0) {
  console.error("SECRET_HYGIENE_FAIL");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
// Acknowledged local secrets files are always printed. A file holding secrets should
// never be silently tolerated, even when it is correctly ignored.
console.log(JSON.stringify({
  ok: true,
  check: "no plaintext secrets in source-controlled config",
  ...(acknowledged.length ? { local_secrets_files: acknowledged } : {}),
}));
