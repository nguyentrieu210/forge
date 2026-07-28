import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [manifestArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !outputArg) {
  throw new Error("usage: node build-alumdoor-warehouse-metadata.mjs <manifest.json> <output.sql>");
}

const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
const warehouse = manifest.doctypes?.find((entry) => entry.name === "Warehouse");
if (!warehouse?.is_tree) throw new Error("Warehouse must compile as a tree DocType");

const parentField = warehouse.fields?.find((entry) => entry.fieldname === "parent_warehouse");
const groupField = warehouse.fields?.find((entry) => entry.fieldname === "is_group");
if (parentField?.options !== "Warehouse" || !groupField) {
  throw new Error("Warehouse tree requires parent_warehouse:Link(Warehouse) and is_group");
}

function sortValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const targetRevision = 25;
const normalizedWarehouse = { ...warehouse, revision: targetRevision };
const contentHash = createHash("sha256").update(stableStringify(manifest)).digest("hex");
const now = "2026-07-28T12:30:00.000Z";

const sql = `-- Alumdoor 1.18.1 metadata activation: Warehouse list -> tree.
-- Generated from the compiler-normalized app manifest.

UPDATE doctype_definitions
SET module = ${sqlString(normalizedWarehouse.module)},
    is_custom = ${normalizedWarehouse.custom ? 1 : 0},
    is_submittable = ${normalizedWarehouse.is_submittable ? 1 : 0},
    is_child = ${normalizedWarehouse.is_child ? 1 : 0},
    revision = ${targetRevision},
    metadata_json = ${sqlString(JSON.stringify(normalizedWarehouse))},
    disabled = 0,
    modified_by = 'admin',
    modified_at = ${sqlString(now)}
WHERE tenant_id = 'alu' AND doctype = 'Warehouse' AND revision < ${targetRevision};

UPDATE installed_apps
SET version = ${sqlString(manifest.version)},
    content_hash = ${sqlString(contentHash)},
    manifest_json = json_set(
      manifest_json,
      '$.version', ${sqlString(manifest.version)},
      '$.doctypes[' || (
        SELECT CAST(key AS TEXT)
        FROM json_each(installed_apps.manifest_json, '$.doctypes')
        WHERE json_extract(value, '$.name') = 'Warehouse'
        LIMIT 1
      ) || ']', json(${sqlString(JSON.stringify(warehouse))})
    ),
    modified_at = ${sqlString(now)}
WHERE tenant_id = 'alu' AND app_id = ${sqlString(manifest.id)} AND version = '1.18.0';

WITH fixtures(name, data_json) AS (
  VALUES
    ('Kho Alumdoor', json_object(
      'warehouse_name', 'Kho Alumdoor',
      'is_group', json('true'),
      'disabled', json('false')
    )),
    ('K36', json_object(
      'warehouse_name', 'K36',
      'parent_warehouse', 'Kho Alumdoor',
      'is_group', json('false'),
      'address', 'Kho vật lý K36',
      'disabled', json('false')
    )),
    ('K12', json_object(
      'warehouse_name', 'K12',
      'parent_warehouse', 'Kho Alumdoor',
      'is_group', json('false'),
      'address', 'Kho vật lý K12',
      'disabled', json('false')
    ))
)
INSERT INTO master_records(tenant_id, record_type, name, disabled, data_json, modified_at)
SELECT 'alu', 'Warehouse', name, 0, data_json, ${sqlString(now)}
FROM fixtures
WHERE true
ON CONFLICT(tenant_id, record_type, name) DO UPDATE SET
  disabled = 0,
  data_json = excluded.data_json,
  modified_at = excluded.modified_at;

`;

await writeFile(resolve(outputArg), sql, "utf8");
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  doctype: warehouse.name,
  revision: targetRevision,
  content_hash: contentHash,
  output: resolve(outputArg),
}));
