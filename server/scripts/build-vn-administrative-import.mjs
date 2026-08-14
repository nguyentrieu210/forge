import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [provinceArg, wardArg, tenantId, outputArg] = process.argv.slice(2);
if (!provinceArg || !wardArg || !tenantId || !outputArg) {
  throw new Error("usage: node build-vn-administrative-import.mjs <province.json> <commune.json> <tenant> <output.sql>");
}

const provinces = JSON.parse(await readFile(resolve(provinceArg), "utf8"));
const wards = JSON.parse(await readFile(resolve(wardArg), "utf8"));
if (provinces.length !== 34 || wards.length !== 3321) {
  throw new Error("expected 34 provinces and 3321 wards, received " + provinces.length + "/" + wards.length);
}

const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const now = "2026-08-13T00:00:00.000Z";
const toType = (name) => name.startsWith("Phường ") ? "Phường" : name.startsWith("Đặc khu ") ? "Đặc khu" : "Xã";
const row = (doctype, name, data) => "  (" + [
  tenantId,
  doctype + ":" + name,
  doctype,
  name,
  "admin",
  0,
  "Draft",
  1,
  now,
  now,
  "admin",
  JSON.stringify({ ...data, disabled: false, _migration_source: "vn-administrative-2025" }),
].map(sql).join(",") + ")";

// Use readable names for Link values. Codes remain in payload only, as stable
// internal identifiers, and are therefore never shown in the form.
const provinceRows = provinces.map((province) => row("Tỉnh Thành", province.name, {
  province_code: province.idProvince,
  province_name: province.name,
  province_type: province.placeType.includes("Thành phố") ? "Thành phố" : "Tỉnh",
}));
const provinceNames = new Map(provinces.map((province) => [province.idProvince, province.name]));
const wardRows = wards.map((ward) => {
  const provinceName = provinceNames.get(ward.idProvince);
  // Names of wards are not nationwide unique. Keep a readable suffix instead
  // of exposing the numeric administrative code in a Link picker.
  return row("Phường Xã", `${ward.name} — ${provinceName}`, {
  ward_code: ward.idCommune,
  ward_name: ward.name,
  province: provinceName,
  ward_type: toType(ward.name),
  });
});

const insertBatch = (rows) => "INSERT INTO documents\n"
  + "  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)\n"
  + "VALUES\n" + rows.join(",\n") + "\n"
  + "ON CONFLICT(tenant_id,doc_key) DO UPDATE SET\n"
  + "  payload_json=excluded.payload_json,\n"
  + "  modified_at=excluded.modified_at,\n"
  + "  modified_by=excluded.modified_by,\n"
  + "  version=documents.version+1;\n";
const insert = (rows) => {
  const chunks = [];
  for (let index = 0; index < rows.length; index += 200) {
    chunks.push(insertBatch(rows.slice(index, index + 200)));
  }
  return chunks.join("\n");
};

await writeFile(resolve(outputArg), [
  "DELETE FROM documents WHERE tenant_id=" + sql(tenantId) + " AND doctype IN ('Tỉnh Thành', 'Phường Xã');",
  "",
  "-- Vietnam administrative units effective 2025-07-01 (QĐ 19/2025/QĐ-TTg).",
  "-- Idempotent: 34 Tỉnh/Thành phố and 3321 Phường/Xã/Đặc khu for tenant alu.",
  "",
  insert(provinceRows),
  insert(wardRows),
].join("\n"), "utf8");

console.log("Wrote " + provinces.length + " provinces and " + wards.length + " wards to " + resolve(outputArg));
