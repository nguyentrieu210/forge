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
 * Validation runs through the SAME server-authoritative parser view used by forge-app,
 * including rolling-compatibility support for first-class AppAction input tables.
 * Packing is refused on any error rather than emitting a package that fails later on a
 * customer's tenant.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseAppManifestWithInputTables } from "../dist/packages/app-registry/src/index.js";
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
const sourceRoot = path.resolve(sourceDir);

let pkg;
try {
  pkg = await readAppSource(sourceRoot);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let manifest;
try {
  // Reuse the server parser view instead of teaching the CLI a second manifest dialect.
  // The view lowers first-class input_tables through the compatibility transport for the
  // canonical parser, then decorates the parsed result for tooling/read consumers.
  manifest = parseAppManifestWithInputTables(pkg);
} catch (error) {
  console.error(`PACK_FAILED ${pkg?.id ?? "?"}: ${error.message}`);
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

/**
 * Write the CLEAN SOURCE PACKAGE, not the decorated parser view.
 *
 * `parseAppManifestWithInputTables()` deliberately preserves the compatibility Text field
 * in its read/tooling view so old clients can survive a rolling upgrade. Serialising that
 * view would bake both representations into the artifact and make a later install see a
 * scalar/table key collision. `forge-app --out` follows this same rule.
 */
const serialized = `${JSON.stringify(canonicalize(pkg), null, 2)}\n`;
const target = outFile ?? path.join(sourceRoot, `${manifest.id}-${manifest.version}.json`);
await writeFile(target, serialized, "utf8");
console.log(`PACK_PASS ${summary} out=${target}`);
