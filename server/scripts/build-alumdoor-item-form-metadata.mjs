import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !outputArg) {
  throw new Error("usage: node build-alumdoor-item-form-metadata.mjs <manifest.json> <output.sql>");
}

const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
if (manifest.id !== "alumdoor" || manifest.version !== "1.18.3") {
  throw new Error(`Expected alumdoor@1.18.3, received ${manifest.id}@${manifest.version}`);
}

const item = manifest.doctypes?.find((entry) => entry.name === "Item");
const sections = item?.fields?.filter((field) => field.fieldtype === "Section Break") ?? [];
if (!item || sections.length < 5) {
  throw new Error("Item metadata must contain the five business sections");
}

function sortValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const contentHash = createHash("sha256")
  .update(JSON.stringify(sortValue(manifest)))
  .digest("hex");
const currentRevision = 24;
const targetRevision = 25;
const now = "2026-07-28T16:45:00.000Z";
const normalizedItem = { ...item, revision: targetRevision };

const sql = `-- Alumdoor 1.18.3: group Item fields into compact business sections.
-- Generated from the compiler-normalized manifest.

UPDATE doctype_definitions
SET module=${sqlString(normalizedItem.module)},
    is_custom=${normalizedItem.custom ? 1 : 0},
    is_submittable=${normalizedItem.is_submittable ? 1 : 0},
    is_child=${normalizedItem.is_child ? 1 : 0},
    revision=${targetRevision},
    metadata_json=${sqlString(JSON.stringify(normalizedItem))},
    disabled=0,
    modified_by='admin',
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND doctype='Item'
  AND revision=${currentRevision};

UPDATE installed_apps
SET version=${sqlString(manifest.version)},
    content_hash=${sqlString(contentHash)},
    manifest_json=json_set(
      manifest_json,
      '$.version', ${sqlString(manifest.version)},
      '$.doctypes[' || (
        SELECT CAST(key AS TEXT)
        FROM json_each(installed_apps.manifest_json, '$.doctypes')
        WHERE json_extract(value, '$.name')='Item'
        LIMIT 1
      ) || ']', json(${sqlString(JSON.stringify(item))})
    ),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version='1.18.2'
  AND (SELECT revision FROM doctype_definitions WHERE tenant_id='alu' AND doctype='Item')=${targetRevision};
`;

await writeFile(resolve(outputArg), sql, "utf8");
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  doctype: item.name,
  revision: targetRevision,
  sections: sections.length,
  content_hash: contentHash,
  output: resolve(outputArg),
}));
