import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const [manifestArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !outputArg) {
  throw new Error("usage: node build-alumdoor-color-release-metadata.mjs <manifest.json> <output.sql>");
}

const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
if (manifest.id !== "alumdoor" || manifest.version !== "1.18.5") {
  throw new Error(`Expected alumdoor@1.18.5, received ${manifest.id}@${manifest.version}`);
}

const changedNames = [
  "Item Allowed Color",
  "Item",
  "Material Request Item",
  "Supplier Quotation Item",
  "Purchase Order Item",
  "Purchase Receipt Item",
  "Quotation Item",
  "Sales Order Item",
  "Aluminium Lot",
  "Work Order",
];
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
const now = "2026-07-29T00:30:00.000Z";
const versionGuard = `EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor' AND version IN ('1.18.4', '1.18.5')
  )`;

const definitionUpserts = changed.map((doctype) => {
  const metadata = JSON.stringify(doctype);
  return `
INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu',
  ${sqlString(doctype.name)},
  ${sqlString(doctype.module)},
  ${doctype.custom ? 1 : 0},
  ${doctype.is_submittable ? 1 : 0},
  ${doctype.is_child ? 1 : 0},
  COALESCE((
    SELECT revision + 1 FROM doctype_definitions
    WHERE tenant_id='alu' AND doctype=${sqlString(doctype.name)}
  ), 1),
  json_set(
    json(${sqlString(metadata)}),
    '$.revision',
    COALESCE((
      SELECT revision + 1 FROM doctype_definitions
      WHERE tenant_id='alu' AND doctype=${sqlString(doctype.name)}
    ), 1)
  ),
  0,
  'admin',
  ${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,
  is_custom=excluded.is_custom,
  is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,
  revision=excluded.revision,
  metadata_json=excluded.metadata_json,
  disabled=0,
  modified_by=excluded.modified_by,
  modified_at=excluded.modified_at;`;
});

const manifestDoctypePatches = changed.map((doctype) => `
UPDATE installed_apps
SET manifest_json = CASE
      WHEN EXISTS (
        SELECT 1 FROM json_each(installed_apps.manifest_json, '$.doctypes')
        WHERE json_extract(value, '$.name')=${sqlString(doctype.name)}
      )
      THEN json_set(
        manifest_json,
        '$.doctypes[' || (
          SELECT CAST(key AS TEXT)
          FROM json_each(installed_apps.manifest_json, '$.doctypes')
          WHERE json_extract(value, '$.name')=${sqlString(doctype.name)}
          LIMIT 1
        ) || ']',
        json(${sqlString(JSON.stringify(doctype))})
      )
      ELSE json_insert(manifest_json, '$.doctypes[#]', json(${sqlString(JSON.stringify(doctype))}))
    END,
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version IN ('1.18.4', '1.18.5');`);

const statements = [
  ...definitionUpserts,
  `INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT 'alu','alumdoor','DocType','Item Allowed Color',''
WHERE ${versionGuard}
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;`,
  ...manifestDoctypePatches,
  `UPDATE master_records
SET data_json=json_set(data_json, '$.require_color', json('true')),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND record_type='Measurement Profile'
  AND name IN ('Nhôm cây/lá', 'Thành phẩm theo m2')
  AND ${versionGuard};`,
  `UPDATE installed_apps
SET version=${sqlString(manifest.version)},
    content_hash=${sqlString(contentHash)},
    manifest_json=json_set(
      manifest_json,
      '$.version', ${sqlString(manifest.version)},
      '$.validators', json(${sqlString(JSON.stringify(manifest.validators))}),
      '$.actions', json(${sqlString(JSON.stringify(manifest.actions))}),
      '$.fixtures', json(${sqlString(JSON.stringify(manifest.fixtures))})
    ),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu'
  AND app_id='alumdoor'
  AND version IN ('1.18.4', '1.18.5');`,
];

// Wrangler/D1 rejects a large --file payload even when each SQL statement is valid.
// Pack only at statement boundaries so JSON strings containing semicolons are never split.
const MAX_PART_BYTES = 80_000;
const header = `-- Alumdoor ${manifest.version}: canonical color policy from Item through buying, stock, selling and production.
-- Generated from the compiler-normalized manifest. Existing Item and transaction documents are untouched.
`;
const parts = [];
let part = header;
for (const statement of statements) {
  const candidate = `${part}\n${statement.trim()}\n`;
  if (Buffer.byteLength(candidate, "utf8") > MAX_PART_BYTES && part !== header) {
    parts.push(part);
    part = `${header}\n${statement.trim()}\n`;
  } else {
    part = candidate;
  }
}
parts.push(part);

const resolvedOutput = resolve(outputArg);
const extension = extname(resolvedOutput) || ".sql";
const stem = resolvedOutput.slice(0, resolvedOutput.length - extension.length);
const outputs = parts.map((_, index) => parts.length === 1
  ? resolvedOutput
  : `${stem}.part-${String(index + 1).padStart(2, "0")}${extension}`);
await Promise.all(outputs.map((path, index) => writeFile(path, parts[index], "utf8")));
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  doctypes: changedNames,
  content_hash: contentHash,
  outputs,
}));
