import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { loadMaterialSpecificationCatalog } from "./lib/alumdoor-material-specification-catalog.mjs";

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const now = "2026-08-16T15:15:00.000Z";

function appendDocumentUpsert(sql, tenant, doctype, name, payload) {
  const json = JSON.stringify(payload);
  sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES(${quote(tenant)},${quote(`${doctype}:${name}`)},${quote(doctype)},${quote(name)},'admin',0,'Draft',1,${quote(now)},${quote(now)},'admin',${quote(json)})
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,
  version=documents.version+1
WHERE documents.payload_json<>excluded.payload_json;`);
}

function appendSearchUpsert(sql, tenant, doctype, name, title, content) {
  sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES(${quote(tenant)},${quote(doctype)},${quote(name)},${quote(title)},${quote(content)},${quote(now)})
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at
WHERE document_search.title<>excluded.title OR document_search.content<>excluded.content;`);
}

export async function buildMaterialSpecificationSeed(repoRoot, tenant = "demo") {
  const catalog = await loadMaterialSpecificationCatalog(repoRoot);
  const sql = [
    "-- Canonical Alumdoor Material Specification seed.",
    "-- Scope is deliberately narrow: technical specification docs + Item links only.",
    "-- NO Measurement Profile, UOM, inventory mode, cutting geometry, pricing or BOM writes.",
  ];
  for (const row of catalog) {
    appendDocumentUpsert(sql, tenant, "Material Specification", row.specCode, row.payload);
    appendSearchUpsert(
      sql, tenant, "Material Specification", row.specCode, row.payload.spec_name,
      `${row.specCode} ${row.itemCode} ${row.itemGroup} ${row.specType} ${row.kgPerM} kg/m`,
    );
    sql.push(`UPDATE documents
SET payload_json=json_set(payload_json,'$.material_specification',${quote(row.specCode)}),
    modified_at=${quote(now)},modified_by='admin',version=version+1
WHERE tenant_id=${quote(tenant)} AND doctype='Item' AND name=${quote(row.itemCode)}
  AND COALESCE(json_extract(payload_json,'$.material_specification'),'')<>${quote(row.specCode)};`);
  }
  return { sql: sql.join("\n\n") + "\n", catalog };
}

async function main() {
  const [tenant = "demo", outputArg] = process.argv.slice(2);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { sql, catalog } = await buildMaterialSpecificationSeed(repoRoot, tenant);
  if (outputArg) await writeFile(resolve(outputArg), sql, "utf8");
  else process.stdout.write(sql);
  console.error(JSON.stringify({ tenant, canonical_specs: catalog.length, linked_items: catalog.length, output: outputArg ?? "stdout" }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
