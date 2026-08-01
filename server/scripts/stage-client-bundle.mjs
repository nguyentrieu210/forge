#!/usr/bin/env node
/**
 * Stages the generic runtime plus the phone warehouse PWA where the Gateway can deploy
 * both from the same origin as the API.
 *
 *   node scripts/stage-client-bundle.mjs [--source <dir>] [--mobile-source <dir>] [--check]
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
const mobileSource = path.resolve(argOf("mobile-source", path.join(serverRoot, "..", "client", "apps", "kho", "dist-mobile")));
const target = path.join(serverRoot, "apps", "gateway-worker", "public");
const mobileTarget = path.join(target, "mobile", "warehouse");
const checkOnly = args.includes("--check");

async function isDirectory(dir) {
  try { return (await stat(dir)).isDirectory(); } catch { return false; }
}

async function requireFile(file, message) {
  try { await stat(file); } catch { fail(message); }
}

/** Content hash over every staged file, so the deployed UI is one auditable value. */
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
  await requireFile(path.join(target, "index.html"), `${target} has no index.html — the staged runtime would serve nothing`);
  await requireFile(path.join(mobileTarget, "index.html"), `${mobileTarget} has no index.html — warehouse PWA is missing from the release`);
  await requireFile(path.join(mobileTarget, "manifest.webmanifest"), `${mobileTarget} has no manifest.webmanifest`);
  await requireFile(path.join(mobileTarget, "warehouse-sw.js"), `${mobileTarget} has no warehouse-sw.js`);
  console.log(`STAGED_OK ${target} hash=${await hashTree(target)} mobile=/mobile/warehouse/`);
  process.exit(0);
}

if (!(await isDirectory(source))) {
  fail(`no built runtime at ${source}\n  build it first: pnpm --filter runtime run build   (in ../client)`);
}
if (!(await isDirectory(mobileSource))) {
  fail(`no built warehouse PWA at ${mobileSource}\n  build it first: pnpm --filter kho run build   (in ../client)`);
}
await requireFile(path.join(source, "index.html"), `${source} has no index.html — not a built runtime bundle`);
await requireFile(path.join(mobileSource, "index.html"), `${mobileSource} has no index.html — not a built warehouse PWA`);
await requireFile(path.join(mobileSource, "manifest.webmanifest"), `${mobileSource} has no manifest.webmanifest`);
await requireFile(path.join(mobileSource, "warehouse-sw.js"), `${mobileSource} has no warehouse-sw.js`);

// Replace wholesale so stale hashed assets from previous releases cannot remain reachable.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await mkdir(mobileTarget, { recursive: true });
await cp(mobileSource, mobileTarget, { recursive: true });

console.log(`STAGE_PASS ${path.relative(serverRoot, target)} <- runtime + warehouse PWA hash=${await hashTree(target)}`);
