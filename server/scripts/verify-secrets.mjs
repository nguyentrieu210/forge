#!/usr/bin/env node
// Guardrail: fail if a secret (or a secret-looking value) is committed into
// source-controlled deploy config. Real secrets must live in Cloudflare
// encrypted secrets (non-dispatch workers) or be injected at deploy time — never
// checked in. This runs in `npm run verify` / `npm run check`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Keys whose NAME implies a secret value.
const SUSPICIOUS_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE[_-]?KEY|API[_-]?KEY|ACCESS[_-]?KEY)/i;
// Names that contain a suspicious substring but are safe identifiers, not secrets.
const ALLOW_KEYS = new Set(["INTERNAL_AUTH_KEY_ID", "INTERNAL_AUTH_KEY_ID_PREVIOUS"]);
// Values that look like a random secret (long hex / base64), regardless of key name.
const HIGH_ENTROPY = /^(?:[A-Fa-f0-9]{24,}|[A-Za-z0-9+/_-]{32,}={0,2})$/;
// Files that should never appear inside the repo tree.
const FORBIDDEN_FILES = /^(\.dev\.vars|deploy-secrets\.env|secrets\.env|.*\.secrets)$/i;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".wrangler", "coverage"]);

const violations = [];

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
      violations.push(`${rel}: a secrets file must not be committed to the repository`);
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
console.log(JSON.stringify({ ok: true, check: "no plaintext secrets in source-controlled config" }));
