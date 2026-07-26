#!/usr/bin/env node
/**
 * Installs a local pre-commit hook that runs the secret scanner on staged files.
 * No framework dependency (husky etc.) — just writes into .git/hooks directly.
 * Runs automatically via the "prepare" npm script after `pnpm install`.
 * Silently no-ops outside a git checkout (e.g. CI, or the extracted zip archive).
 */
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const gitDir = join(process.cwd(), ".git");
if (!existsSync(gitDir)) {
  console.log("install-hooks: not a git checkout, skipping.");
  process.exit(0);
}

const hooksDir = join(gitDir, "hooks");
mkdirSync(hooksDir, { recursive: true });

const hookPath = join(hooksDir, "pre-commit");
const hookBody = `#!/bin/sh
# Installed by scripts/install-hooks.mjs — blocks commits containing hard-coded secrets.
node "$(git rev-parse --show-toplevel)/scripts/scan-secrets.mjs" --staged
exit $?
`;

writeFileSync(hookPath, hookBody, { encoding: "utf8" });
try {
  chmodSync(hookPath, 0o755);
} catch {
  // chmod is a no-op on Windows filesystems; git respects the file when run via Git Bash regardless.
}
console.log(`install-hooks: pre-commit secret scan installed at ${hookPath}`);
