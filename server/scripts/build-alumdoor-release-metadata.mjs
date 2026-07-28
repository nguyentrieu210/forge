import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileBrief } from "./lib/compile-brief.mjs";

const [briefArg, outputArg] = process.argv.slice(2);
if (!briefArg || !outputArg) {
  throw new Error("usage: node build-alumdoor-release-metadata.mjs <brief.json> <output.sql>");
}

const brief = JSON.parse(await readFile(resolve(briefArg), "utf8"));
const manifest = compileBrief(brief);
if (manifest.id !== "alumdoor") throw new Error(`Expected alumdoor, received ${manifest.id}`);

function sortValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const contentHash = createHash("sha256")
  .update(JSON.stringify(sortValue(manifest)))
  .digest("hex");
const now = "2026-07-28T14:45:00.000Z";

const sql = `-- Alumdoor data release metadata ${manifest.version}.
-- No DocType shape changes: version/hash follow the verified master-data migration.

UPDATE installed_apps
SET version=${sqlString(manifest.version)},
    content_hash=${sqlString(contentHash)},
    manifest_json=json_set(manifest_json,'$.version',${sqlString(manifest.version)}),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version IN ('1.18.1', ${sqlString(manifest.version)});
`;

await writeFile(resolve(outputArg), sql, "utf8");
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  content_hash: contentHash,
  output: resolve(outputArg),
}));
