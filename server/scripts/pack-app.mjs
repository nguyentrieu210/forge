#!/usr/bin/env node
/**
 * Packs an app source directory into a single installable package.
 *
 *   node scripts/pack-app.mjs <source-dir> [--out app.json] [--check]
 *
 * The source layout mirrors the manifest, one file per object, because a directory
 * of small files is reviewable in a diff while one giant JSON is not:
 *
 *   app.json            manifest header (id, name, version, requires, nav, hooks, worker)
 *   doctypes/*.json     DocType definitions
 *   workflows/*.json    workflows
 *   prints/*.json       print formats
 *   roles.json          roles
 *   fixtures/*.json     seed master records (one object, or an array of them)
 *
 * Validation runs through the SAME parser the server uses, so a package that packs
 * clean cannot be rejected at install for a shape reason. Packing is refused on any
 * error rather than emitting a package that fails later on a customer's tenant.
 */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";

const args = process.argv.slice(2);
const sourceDir = args.find((value) => !value.startsWith("--"));
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const checkOnly = args.includes("--check");

if (!sourceDir) {
  console.error("usage: node scripts/pack-app.mjs <source-dir> [--out app.json] [--check]");
  process.exit(2);
}

/** Reads every .json file in a directory. Missing directory means "none of these". */
async function readJsonDir(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }
  const documents = [];
  // Sorted so the packed output is byte-identical between runs: the installer
  // treats a changed content hash as a changed package, so a non-deterministic
  // order would look like an edit on every pack.
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const full = path.join(directory, entry);
    if (!(await stat(full)).isFile()) continue;
    try {
      documents.push({ file: full, value: JSON.parse(await readFile(full, "utf8")) });
    } catch (error) {
      throw new Error(`${full}: not valid JSON — ${error.message}`);
    }
  }
  return documents;
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`${file}: not valid JSON — ${error.message}`);
  }
}

const root = path.resolve(sourceDir);
const header = await readJsonFile(path.join(root, "app.json"), null);
if (!header) {
  console.error(`${root}/app.json is required and must hold the manifest header`);
  process.exit(1);
}

const doctypes = await readJsonDir(path.join(root, "doctypes"));
const workflows = await readJsonDir(path.join(root, "workflows"));
const prints = await readJsonDir(path.join(root, "prints"));
const fixtureFiles = await readJsonDir(path.join(root, "fixtures"));
const roles = await readJsonFile(path.join(root, "roles.json"), []);

// A fixture file may hold one record or a list, because a category list wants to be
// one file while a large seed set wants several.
const fixtures = fixtureFiles.flatMap(({ value }) => (Array.isArray(value) ? value : [value]));

const pkg = {
  ...header,
  roles,
  doctypes: doctypes.map(({ value }) => value),
  workflows: workflows.map(({ value }) => value),
  print_formats: prints.map(({ value }) => value),
  fixtures,
};

let manifest;
try {
  // The server's own parser, not a copy of its rules: a second implementation would
  // eventually disagree, and the disagreement would surface as a failed install on a
  // customer's tenant rather than here.
  manifest = parseAppManifest(pkg);
} catch (error) {
  console.error(`PACK_FAILED ${header.id ?? "?"}: ${error.message}`);
  process.exit(1);
}

const summary = [
  `app=${manifest.id}@${manifest.version}`,
  `doctypes=${manifest.doctypes.length}`,
  `workflows=${manifest.workflows.length}`,
  `prints=${manifest.print_formats.length}`,
  `roles=${manifest.roles.length}`,
  `fixtures=${manifest.fixtures.length}`,
  `nav=${manifest.nav.length}`,
  `hooks=${manifest.hooks.length}`,
].join(" ");

if (checkOnly) {
  console.log(`PACK_CHECK_PASS ${summary}`);
  process.exit(0);
}

// Emitted with sorted keys and a trailing newline so two packs of the same source
// produce identical bytes, and therefore an identical content hash at install.
const serialized = `${JSON.stringify(manifest, Object.keys(manifest).sort(), 2)}\n`;
const target = outFile ?? path.join(root, `${manifest.id}-${manifest.version}.json`);
await writeFile(target, serialized, "utf8");
console.log(`PACK_PASS ${summary} out=${target}`);
