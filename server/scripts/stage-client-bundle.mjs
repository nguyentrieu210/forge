#!/usr/bin/env node
/**
 * Stages the generic client bundle where the gateway can deploy it.
 *
 *   node scripts/stage-client-bundle.mjs [--source <dir>] [--check]
 *
 * The gateway's `assets.directory` has to be a real directory next to its config at
 * deploy time, and the bundle is built in another workspace entirely. Copying it here
 * rather than pointing wrangler across the repo keeps the deployable unit self-contained:
 * whatever is in `public/` is exactly what went live, and `--check` can assert that a
 * deploy is not about to ship a stale or missing UI.
 *
 * Refuses on a source that has no `index.html`, because a bundle without a shell deploys
 * successfully and then serves nothing — the worst of both outcomes.
 */
import { cp, mkdir, rm, readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fail, serverRoot } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const source = path.resolve(argOf("source", path.join(serverRoot, "..", "client", "apps", "runtime", "dist")));
const target = path.join(serverRoot, "apps", "gateway-worker", "public");
const checkOnly = args.includes("--check");

async function isDirectory(dir) {
  try { return (await stat(dir)).isDirectory(); } catch { return false; }
}

/** Content hash over every file, so "the deployed UI" is a value we can compare. */
async function hashTree(dir) {
  const hash = createHash("sha256");
  const walk = async (current, prefix) => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { await walk(full, relative); continue; }
      hash.update(relative);
      hash.update(await readFile(full));
    }
  };
  await walk(dir, "");
  return hash.digest("hex").slice(0, 16);
}

if (checkOnly) {
  if (!(await isDirectory(target))) fail(`no client bundle staged at ${target}\n  run: node scripts/stage-client-bundle.mjs`);
  try { await stat(path.join(target, "index.html")); } catch { fail(`${target} has no index.html — the staged bundle would serve nothing`); }
  console.log(`STAGED_OK ${target} hash=${await hashTree(target)}`);
  process.exit(0);
}

if (!(await isDirectory(source))) {
  fail(`no built bundle at ${source}\n  build it first: pnpm --filter runtime run build   (in ../client)`);
}
try { await stat(path.join(source, "index.html")); } catch { fail(`${source} has no index.html — not a built client bundle`); }

// Replaced wholesale rather than merged: a leftover hashed asset from an older build is
// dead weight that also makes the staged hash meaningless as a version.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

console.log(`STAGE_PASS ${path.relative(serverRoot, target)} <- ${source} hash=${await hashTree(target)}`);
