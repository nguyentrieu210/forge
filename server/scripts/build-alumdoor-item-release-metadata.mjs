import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !outputArg) {
  throw new Error("usage: node build-alumdoor-item-release-metadata.mjs <manifest.json> <output.sql>");
}

const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
if (manifest.id !== "alumdoor" || manifest.version !== "1.18.4") {
  throw new Error(`Expected alumdoor@1.18.4, received ${manifest.id}@${manifest.version}`);
}

const changedNames = ["Item", "UOM Conversion", "Item Price", "Pricing Rule", "Payment Entry"];
const changed = changedNames.map((name) => {
  const doctype = manifest.doctypes?.find((entry) => entry.name === name);
  if (!doctype) throw new Error(`Manifest is missing changed DocType ${name}`);
  return doctype;
});

function sortValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const contentHash = createHash("sha256")
  .update(JSON.stringify(sortValue(manifest)))
  .digest("hex");
const now = "2026-07-28T23:45:00.000Z";

const definitionUpdates = changed.map((doctype) => `
UPDATE doctype_definitions
SET module=${sqlString(doctype.module)},
    is_custom=${doctype.custom ? 1 : 0},
    is_submittable=${doctype.is_submittable ? 1 : 0},
    is_child=${doctype.is_child ? 1 : 0},
    metadata_json=json_set(
      json(${sqlString(JSON.stringify(doctype))}),
      '$.revision',
      revision + 1
    ),
    revision=revision + 1,
    disabled=0,
    modified_by='admin',
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND doctype=${sqlString(doctype.name)}
  AND EXISTS (
    SELECT 1
    FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor' AND version='1.18.3'
  );`).join("\n");

const manifestPatchArgs = changed.map((doctype) => `
    '$.doctypes[' || (
      SELECT CAST(key AS TEXT)
      FROM json_each(installed_apps.manifest_json, '$.doctypes')
      WHERE json_extract(value, '$.name')=${sqlString(doctype.name)}
      LIMIT 1
    ) || ']',
    json(${sqlString(JSON.stringify(doctype))})`).join(",");

const sql = `-- Alumdoor ${manifest.version}: finish Item/UOM/pricing and Dynamic Link metadata.
-- Generated from the compiler-normalized manifest. Existing business documents are untouched.
${definitionUpdates}

UPDATE installed_apps
SET version=${sqlString(manifest.version)},
    content_hash=${sqlString(contentHash)},
    manifest_json=json_set(
      manifest_json,
      '$.version', ${sqlString(manifest.version)},${manifestPatchArgs}
    ),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version IN ('1.18.3', ${sqlString(manifest.version)});
`;

await writeFile(resolve(outputArg), sql, "utf8");
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  doctypes: changedNames,
  content_hash: contentHash,
  output: resolve(outputArg),
}));
