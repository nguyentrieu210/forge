/**
 * Reads an app SOURCE DIRECTORY into a package object.
 *
 *   app.json            manifest header (id, name, version, requires, nav, hooks, client)
 *   doctypes/*.json     DocType definitions
 *   workflows/*.json    workflows
 *   prints/*.json       print formats
 *   roles.json          roles
 *   fixtures/*.json     seed master records (one object, or an array of them)
 *
 * One file per object because a directory of small files is reviewable in a diff while one
 * giant JSON is not.
 *
 * Shared by `pack-app.mjs` (which writes the package to disk) and `forge-app.mjs` (which
 * installs it). Extracted rather than duplicated: a second reader would eventually disagree
 * about which files count, and the disagreement would show up as an app that packs but
 * installs differently.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalizeAppSourcePackage } from "./canonicalize-app-source.mjs";

/** Every .json file in a directory. A missing directory means "none of these". */
async function readJsonDir(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }
  const documents = [];
  // Sorted so the packed output is byte-identical between runs: the installer treats a
  // changed content hash as a changed package, so a non-deterministic order would look
  // like an edit on every pack.
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

export async function readAppSource(sourceDir) {
  const root = path.resolve(sourceDir);
  const header = await readJsonFile(path.join(root, "app.json"), null);
  if (!header) throw new Error(`${root}/app.json is required and must hold the manifest header`);

  const [doctypes, workflows, prints, fixtureFiles, roles] = await Promise.all([
    readJsonDir(path.join(root, "doctypes")),
    readJsonDir(path.join(root, "workflows")),
    readJsonDir(path.join(root, "prints")),
    readJsonDir(path.join(root, "fixtures")),
    readJsonFile(path.join(root, "roles.json"), []),
  ]);

  return canonicalizeAppSourcePackage({
    ...header,
    roles,
    doctypes: doctypes.map(({ value }) => value),
    workflows: workflows.map(({ value }) => value),
    print_formats: prints.map(({ value }) => value),
    // A fixture file may hold one record or a list, because a category list wants to be
    // one file while a large seed set wants several.
    fixtures: fixtureFiles.flatMap(({ value }) => (Array.isArray(value) ? value : [value])),
  });
}

/**
 * Recursively key-sorted clone, so two packs of the same source emit identical bytes and
 * therefore an identical content hash at install.
 *
 * NOT `JSON.stringify(value, keys.sort(), 2)`. That second argument is a REPLACER, and an
 * array replacer is a property ALLOWLIST applied at every level of the tree — not a key
 * order. It previously stripped every nested object down to the handful of names that
 * happened to appear at the top level: DocTypes lost their fields and permissions, print
 * formats lost their html, workflows lost their transitions.
 */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
