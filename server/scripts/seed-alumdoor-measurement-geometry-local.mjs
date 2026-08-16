#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MEASUREMENT_PROFILES, measurementProfilePayload } from "./lib/alumdoor-measurement-profile-catalog.mjs";
import { GEOMETRY_FIELDS, GEOMETRY_PROFILES, assertGeometryCatalog } from "./lib/alumdoor-geometry-catalog.mjs";

const [tenantArg = "demo", outputArg = ""] = process.argv.slice(2);
const tenant = String(tenantArg).trim();
if (!tenant) throw new Error("tenant is required");
assertGeometryCatalog();

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const at = "2026-08-16T00:00:00.000Z";
const rows = [];

for (const profile of MEASUREMENT_PROFILES) {
  rows.push({
    doctype: "Measurement Profile",
    name: profile.name,
    title: profile.name,
    content: `${profile.name} ${profile.inventoryMode} ${profile.stockUom}`,
    data: measurementProfilePayload(profile),
  });
}
for (const field of GEOMETRY_FIELDS) {
  rows.push({
    doctype: "Geometry Field",
    name: field.code,
    title: field.name,
    content: `${field.code} ${field.name} ${field.uom} ${field.axis}`,
    data: {
      field_code: field.code,
      field_name: field.name,
      uom: field.uom,
      axis: field.axis,
      disabled: false,
      _migration_source: "alumdoor-geometry-master-2026-08-16",
    },
  });
}
for (const profile of GEOMETRY_PROFILES) {
  rows.push({
    doctype: "Geometry Profile",
    name: profile.code,
    title: profile.name,
    content: `${profile.code} ${profile.name} ${profile.itemGroups.join(" ")} ${profile.fields.map((row) => row.geometryField).join(" ")}`,
    data: {
      profile_code: profile.code,
      profile_name: profile.name,
      item_groups: profile.itemGroups.map((item_group, index) => ({ row_id: `GROUP-${index + 1}`, item_group })),
      fields: profile.fields.map((field, index) => ({
        row_id: `FIELD-${index + 1}`,
        geometry_field: field.geometryField,
        role: field.role,
        required: field.required,
        visible: field.visible,
        editable: field.editable,
        sequence: field.sequence,
      })),
      disabled: false,
      _migration_source: "alumdoor-geometry-master-2026-08-16",
    },
  });
}

const sql = [];
sql.push("-- Canonical Alumdoor Measurement Profile + Geometry master seed.");
sql.push("-- Scope lock: only Measurement Profile, Geometry Field, Geometry Profile documents/search rows.");
for (const row of rows) {
  const payload = JSON.stringify(row.data);
  sql.push(`INSERT INTO documents\n  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)\nVALUES\n  (${q(tenant)},${q(`${row.doctype}:${row.name}`)},${q(row.doctype)},${q(row.name)},'admin',0,'Draft',1,${q(at)},${q(at)},'admin',${q(payload)})\nON CONFLICT(tenant_id,doc_key) DO UPDATE SET\n  payload_json=excluded.payload_json, modified_at=excluded.modified_at, modified_by=excluded.modified_by, version=documents.version+1\nWHERE documents.payload_json<>excluded.payload_json;`);
  sql.push(`INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)\nVALUES(${q(tenant)},${q(row.doctype)},${q(row.name)},${q(row.title)},${q(row.content)},${q(at)})\nON CONFLICT(tenant_id,doctype,name) DO UPDATE SET title=excluded.title, content=excluded.content, modified_at=excluded.modified_at;`);
}

const rendered = `${sql.join("\n\n")}\n`;
if (outputArg) {
  const output = resolve(outputArg);
  await writeFile(output, rendered, "utf8");
  console.log(JSON.stringify({ output, measurement_profiles: MEASUREMENT_PROFILES.length, geometry_fields: GEOMETRY_FIELDS.length, geometry_profiles: GEOMETRY_PROFILES.length }));
} else {
  process.stdout.write(rendered);
}
