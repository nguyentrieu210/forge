import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [sourceArg, tenantId, outputArg] = process.argv.slice(2);
if (!sourceArg || !tenantId || !outputArg) {
  throw new Error("usage: node build-vn-administrative-import.mjs <api-v2-depth-2.json> <tenant> <output.sql>");
}

const provinces = JSON.parse(await readFile(resolve(sourceArg), "utf8"));
const wards = provinces.flatMap((province) => (province.wards ?? []).map((ward) => ({ ...ward, province })));
if (provinces.length !== 34 || wards.length !== 3321) {
  throw new Error("expected 34 provinces and 3321 wards, received " + provinces.length + "/" + wards.length);
}

const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const now = "2026-08-18T00:00:00.000Z";
const provinceCode = (value) => String(value).padStart(2, "0");
const wardCode = (value) => String(value).padStart(5, "0");
const toProvinceType = (value) => String(value).toLocaleLowerCase("vi").includes("thành phố") ? "Thành phố" : "Tỉnh";
const toWardType = (value) => String(value).toLocaleLowerCase("vi").includes("phường")
  ? "Phường"
  : String(value).toLocaleLowerCase("vi").includes("đặc khu") ? "Đặc khu" : "Xã";
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

// Document names follow the authoritative administrative codes. The picker
// displays title_field (province_name/ward_name), so users see readable names
// while saved links remain stable if labels are corrected later.
const provinceRows = provinces.map((province) => row("Tỉnh Thành", provinceCode(province.code), {
  province_code: provinceCode(province.code),
  province_name: province.name,
  province_type: toProvinceType(province.division_type),
}));
const wardRows = wards.map((ward) => {
  return row("Phường Xã", wardCode(ward.code), {
    ward_code: wardCode(ward.code),
    ward_name: ward.name,
    province: provinceCode(ward.province.code),
    ward_type: toWardType(ward.division_type),
  });
});

const insertBatch = (rows) => "INSERT INTO documents\n"
  + "  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)\n"
  + "VALUES\n" + rows.join(",\n") + "\n"
  + "ON CONFLICT(tenant_id,doc_key) DO NOTHING;\n";
const insert = (rows) => {
  const chunks = [];
  for (let index = 0; index < rows.length; index += 200) {
    chunks.push(insertBatch(rows.slice(index, index + 200)));
  }
  return chunks.join("\n");
};

await writeFile(resolve(outputArg), [
  "-- Vietnam administrative units effective 2025-07-01 (QĐ 19/2025/QĐ-TTg).",
  "-- Source snapshot: https://provinces.open-api.vn/api/v2/?depth=2",
  "-- Additive and idempotent: never deletes or overwrites an existing local document.",
  "-- Expected result: 34 Tỉnh/Thành phố and 3321 Phường/Xã/Đặc khu.",
  "",
  insert(provinceRows),
  insert(wardRows),
].join("\n"), "utf8");

console.log("Wrote " + provinces.length + " provinces and " + wards.length + " wards to " + resolve(outputArg));
