#!/usr/bin/env node
/**
 * Self-contained secret scanner (no network, no deps) — gate against P0-SEC-01 regressions.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs            # scan all tracked files (CI)
 *   node scripts/scan-secrets.mjs --staged   # scan staged files only (pre-commit hook)
 *
 * Exit 0 = clean, 1 = secret(s) found. A line containing `scan-secrets:allow` is skipped
 * (use for intentional example patterns). .env.example is always allowed.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const staged = process.argv.includes("--staged");

/** @type {{name:string, re:RegExp}[]} */
const RULES = [
  // Frappe API token hard-coded as "token <key>:<secret>" or bare <15hex>:<15hex>. scan-secrets:allow
  { name: "frappe-token-literal", re: /["'`]\s*token\s+[0-9a-f]{10,}:[0-9a-f]{6,}\s*["'`]/i },
  { name: "frappe-keypair", re: /\b[0-9a-f]{14,32}:[0-9a-f]{14,32}\b/ },
  // api_key / api_secret / password / token assigned a quoted literal (env reads are NOT quoted). scan-secrets:allow
  { name: "assigned-secret-literal", re: /\b(api[_-]?secret|api[_-]?key|password|passwd|secret|token|access[_-]?token|auth[_-]?token)\b["'`]?\s*[:=]\s*["'`][^"'`$\s]{8,}["'`]/i },
  { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "known-rotated-token", re: /c2bceeabade77ef|546b1417ecb9f0e/ },
];

// Directories/files never scanned (build output, deps, lockfiles, this scanner, binaries).
const SKIP_RE =
  /(^|\/)(node_modules|dist|\.turbo|test-results|playwright-report|blob-report|coverage)\//;
const SKIP_FILE_RE =
  /(pnpm-lock\.yaml|package-lock\.json|\.env\.example|scan-secrets\.mjs|\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|woff2?|ttf|eot)$)/i;

function listFiles() {
  const filter = (files) => files
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !SKIP_RE.test("/" + f) && !SKIP_FILE_RE.test(f));
  if (existsSync(".git")) {
    const cmd = staged
      ? "git diff --cached --name-only --diff-filter=ACM"
      : "git ls-files";
    return filter(execSync(cmd, { encoding: "utf8" }).split("\n"));
  }
  if (staged) {
    console.error("--staged cần Git checkout; archive/source tree không có .git");
    process.exit(2);
  }
  // ZIP/library handoff không có .git: quét trực tiếp cây source thay vì bỏ qua gate.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(".", full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (SKIP_RE.test("/" + rel + "/") || entry.name === ".git") continue;
        walk(full);
      } else {
        files.push(rel);
      }
    }
  };
  walk(".");
  return filter(files);
}

const findings = [];
for (const file of listFiles()) {
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue; // skip huge files
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue; // binary (NUL byte)
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("scan-secrets:allow")) continue;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.name, text: line.trim().slice(0, 160) });
      }
    }
  }
}

if (findings.length) {
  console.error(`\n✗ SECRET SCAN FAILED — ${findings.length} potential secret(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
    console.error(`    ${f.text}`);
  }
  console.error(
    `\nRemove the secret and read it from an env var instead. If this is a false positive,\n` +
      `append \`scan-secrets:allow\` to the line. Never commit real credentials.\n`,
  );
  process.exit(1);
}
console.log(`✓ secret scan: 0 findings (${staged ? "staged" : existsSync(".git") ? "tracked" : "source-tree"} files)`);
