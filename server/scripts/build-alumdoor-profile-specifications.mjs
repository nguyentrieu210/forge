#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const PROFILE_WEIGHT_ITEMS = {
  "AL70-1 LỚP": "AL70 - 1 LỚP",
  "TD-AL70-15mm": "AL70 1.5MM",
  "TD-AL70": "AL70 - 2 LỚP",
  AL75: "AL75",
  "TD-AL595": "AL595",
  "TD-AL71N": "AL71",
  "TD-AL503N26": "AL503",
  "TD-AL548N": "AL548",
  "TD-AL501N": "AL501",
  "ALD-DL552": "AL552",
  "MTH-B652M5": "AL652",
  "TD-AL752N": "AL752",
  AL50: "AL50",
  ALVIP50: "ALVIP50",
  VIPST500: "VIPST500",
  VIPST700: "VIPST700",
};

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function loadProfileSpecifications(repoRoot) {
  const source = JSON.parse(await readFile(resolve(repoRoot, "data", "trong-luong-nhom.json"), "utf8"));
  return source.weights
    .filter((row) => PROFILE_WEIGHT_ITEMS[row.supplier_code])
    .map((row) => ({
      itemCode: PROFILE_WEIGHT_ITEMS[row.supplier_code],
      supplierCode: row.supplier_code,
      kgPerM: row.kg_per_m,
    }));
}

export async function buildProfileSpecificationSql(repoRoot) {
  const rows = await loadProfileSpecifications(repoRoot);
  if (rows.length !== Object.keys(PROFILE_WEIGHT_ITEMS).length) {
    throw new Error(`Thiếu ánh xạ định mức: có ${rows.length}, cần ${Object.keys(PROFILE_WEIGHT_ITEMS).length}`);
  }
  const sql = [
    "-- Bổ sung định mức kg/m cho toàn bộ mã profile nhôm còn thiếu.",
    "-- Nguồn duy nhất: data/trong-luong-nhom.json; ưu tiên mã đời mới theo bảng khách cung cấp.",
  ];
  for (const row of rows) {
    const spec = `ĐM-${row.itemCode}`;
    const payload = JSON.stringify({
      spec_code: spec,
      spec_name: `Định mức ${row.itemCode}`,
      profile_system: "TIẾN ĐẠT",
      section_code: row.supplierCode,
      theoretical_kg_per_m: row.kgPerM,
      note: `Định mức ${row.kgPerM} kg/m; nguồn data/trong-luong-nhom.json (${row.supplierCode}).`,
      disabled: false,
      _migration_source: "alumdoor-profile-specifications-2026-07-30",
    });
    sql.push(`INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ('alu',${quote(`Material Specification:${spec}`)},'Material Specification',${quote(spec)},'admin',0,'Draft',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'admin',${quote(payload)})
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=json_patch(documents.payload_json,excluded.payload_json),
  modified_at=CURRENT_TIMESTAMP,
  modified_by='admin',
  version=documents.version+1
WHERE documents.payload_json<>json_patch(documents.payload_json,excluded.payload_json);`);
    sql.push(`UPDATE documents
SET payload_json=json_set(payload_json,'$.material_specification',${quote(spec)}),
    modified_at=CURRENT_TIMESTAMP,
    modified_by='admin',
    version=version+1
WHERE tenant_id='alu' AND doctype='Item' AND name=${quote(row.itemCode)}
  AND COALESCE(json_extract(payload_json,'$.material_specification'),'')<>${quote(spec)};`);
  }
  return `${sql.join("\n\n")}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const repoRoot = resolve(import.meta.dirname, "../..");
  const output = resolve(process.argv[2] ?? "work/alumdoor-profile-specifications.sql");
  await writeFile(output, await buildProfileSpecificationSql(repoRoot), "utf8");
  console.log(output);
}
