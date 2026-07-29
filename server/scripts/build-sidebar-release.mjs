#!/usr/bin/env node
/**
 * Builds a small, idempotent D1 release for a metadata-only sidebar change.
 *
 * The full app manifest can be hundreds of KB, but sidebar changes affect only the
 * top-level version and nav fields. Updating those bounded JSON paths avoids rewriting
 * every DocType definition merely to move menu entries.
 *
 * Usage:
 *   node scripts/build-sidebar-release.mjs manifest.json output.sql alu 1.19.0
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestArg, outputArg, tenantArg, fromVersionArg] = process.argv.slice(2);
if (!manifestArg || !outputArg || !tenantArg || !fromVersionArg) {
  throw new Error(
    "usage: node build-sidebar-release.mjs <manifest.json> <output.sql> <tenant> <from-version>",
  );
}
if (!/^[a-z][a-z0-9-]*$/.test(tenantArg)) throw new Error(`Invalid tenant id: ${tenantArg}`);

const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
if (!manifest.id || !manifest.version || !Array.isArray(manifest.nav)) {
  throw new Error("Manifest must contain id, version and nav");
}
if (manifest.version === fromVersionArg) {
  throw new Error("Target version must differ from from-version");
}

function stable(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const contentHash = createHash("sha256")
  .update(JSON.stringify(stable(manifest)))
  .digest("hex");
const modifiedAt = new Date().toISOString();
const navJson = JSON.stringify(manifest.nav);
const versionJson = JSON.stringify(manifest.version);

const sql = `-- ${manifest.id}@${manifest.version}: bounded sidebar metadata release.
-- Changes navigation/version only; business documents and DocType definitions are untouched.
UPDATE installed_apps
SET manifest_json=json_set(
      manifest_json,
      '$.version',json(${quote(versionJson)}),
      '$.nav',json(${quote(navJson)})
    ),
    version=${quote(manifest.version)},
    content_hash=${quote(contentHash)},
    modified_at=${quote(modifiedAt)}
WHERE tenant_id=${quote(tenantArg)}
  AND app_id=${quote(manifest.id)}
  AND version IN (${quote(fromVersionArg)},${quote(manifest.version)})
  AND content_hash<>${quote(contentHash)};
`;

await writeFile(resolve(outputArg), sql, "utf8");
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  tenant: tenantArg,
  from_version: fromVersionArg,
  content_hash: contentHash,
  nav_entries: manifest.nav.length,
  nav_bytes: Buffer.byteLength(navJson, "utf8"),
  output: resolve(outputArg),
}, null, 2));
