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
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
// Shared with `forge-app.mjs`, which installs the same package this writes. A second
// reader would eventually disagree about which files count, and the disagreement would
// surface as an app that packs one way and installs another.
import { canonicalize, readAppSource } from "./lib/read-app-source.mjs";

const args = process.argv.slice(2);
const sourceDir = args.find((value) => !value.startsWith("--"));
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const checkOnly = args.includes("--check");

if (!sourceDir) {
  console.error("usage: node scripts/pack-app.mjs <source-dir> [--out app.json] [--check]");
  process.exit(2);
}

let pkg;
try {
  pkg = await readAppSource(sourceDir);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

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

const serialized = `${JSON.stringify(canonicalize(manifest), null, 2)}\n`;
const target = outFile ?? path.join(root, `${manifest.id}-${manifest.version}.json`);
await writeFile(target, serialized, "utf8");
console.log(`PACK_PASS ${summary} out=${target}`);
