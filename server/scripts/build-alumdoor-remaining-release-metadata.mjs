#!/usr/bin/env node
/**
 * Builds a bounded D1 metadata release equivalent to installing the compiled alumdoor app.
 *
 * This is the authenticated-installer fallback for a tenant whose administrator
 * password is intentionally unavailable to the deployment shell. Every statement is
 * generated from the compiler-normalized manifest, and files split only at statement
 * boundaries to stay below Wrangler/D1 request limits.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const [manifestArg, outputArg] = process.argv.slice(2);
if (!manifestArg || !outputArg) {
  throw new Error("usage: node build-alumdoor-remaining-release-metadata.mjs <manifest.json> <output.sql>");
}
const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
if (manifest.id !== "alumdoor") {
  throw new Error(`Expected the alumdoor manifest, received ${manifest.id}@${manifest.version}`);
}

function sortValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const contentHash = createHash("sha256").update(JSON.stringify(sortValue(manifest))).digest("hex");
const now = new Date().toISOString();
/**
 * Chạy được hay không quyết định bởi NỘI DUNG, không bởi danh sách phiên bản chép tay.
 *
 * Bản trước liệt kê `version IN ('1.19.0','1.19.1','1.20.0','1.20.1')`. Danh sách đó phải sửa
 * mỗi lần phát hành, và quên sửa thì mọi câu lệnh lặng lẽ khớp KHÔNG dòng nào — bản vá chạy
 * "thành công" mà không đổi gì. So theo content_hash vừa bỏ được việc bảo trì đó, vừa giữ
 * nguyên tính chạy-lại-không-đổi: đã đúng nội dung thì lần chạy sau không khớp gì nữa.
 */
const versionGuard = `EXISTS (
    SELECT 1 FROM installed_apps
    WHERE tenant_id='alu' AND app_id='alumdoor'
      AND content_hash<>${sqlString(contentHash)}
  )`;

const statements = [];
for (const role of manifest.roles) {
  statements.push(`INSERT INTO roles(tenant_id,role,desk_access,is_standard,modified_at)
SELECT 'alu',${sqlString(role.role)},${role.desk_access ? 1 : 0},0,${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,role) DO NOTHING;`);
}
for (const doctype of manifest.doctypes) {
  const metadata = JSON.stringify(doctype);
  statements.push(`INSERT INTO doctype_definitions(
  tenant_id,doctype,module,is_custom,is_submittable,is_child,revision,
  metadata_json,disabled,modified_by,modified_at
)
SELECT
  'alu',${sqlString(doctype.name)},${sqlString(doctype.module)},
  ${doctype.custom ? 1 : 0},${doctype.is_submittable ? 1 : 0},${doctype.is_child ? 1 : 0},
  COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype=${sqlString(doctype.name)}),1),
  json_set(
    json(${sqlString(metadata)}),
    '$.revision',
    COALESCE((SELECT revision+1 FROM doctype_definitions WHERE tenant_id='alu' AND doctype=${sqlString(doctype.name)}),1)
  ),
  0,'admin',${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  module=excluded.module,is_custom=excluded.is_custom,is_submittable=excluded.is_submittable,
  is_child=excluded.is_child,revision=excluded.revision,metadata_json=excluded.metadata_json,
  disabled=0,modified_by=excluded.modified_by,modified_at=excluded.modified_at;`);
}
for (const workflow of manifest.workflows) {
  const metadata = JSON.stringify(workflow);
  statements.push(`INSERT INTO workflows(
  tenant_id,name,document_type,is_active,revision,workflow_json,modified_by,modified_at
)
SELECT
  'alu',${sqlString(workflow.name)},${sqlString(workflow.document_type)},${workflow.is_active ? 1 : 0},
  COALESCE((SELECT revision+1 FROM workflows WHERE tenant_id='alu' AND name=${sqlString(workflow.name)}),1),
  json_set(
    json(${sqlString(metadata)}),
    '$.revision',
    COALESCE((SELECT revision+1 FROM workflows WHERE tenant_id='alu' AND name=${sqlString(workflow.name)}),1)
  ),
  'admin',${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,name) DO UPDATE SET
  document_type=excluded.document_type,is_active=excluded.is_active,revision=excluded.revision,
  workflow_json=excluded.workflow_json,modified_by=excluded.modified_by,modified_at=excluded.modified_at;`);
}
for (const format of manifest.print_formats) {
  const metadata = JSON.stringify(format);
  statements.push(`INSERT INTO print_formats(
  tenant_id,name,doc_type,is_default,disabled,revision,format_json,modified_by,modified_at
)
SELECT
  'alu',${sqlString(format.name)},${sqlString(format.doc_type)},${format.is_default ? 1 : 0},${format.disabled ? 1 : 0},
  COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name=${sqlString(format.name)}),1),
  json_set(
    json(${sqlString(metadata)}),
    '$.revision',
    COALESCE((SELECT revision+1 FROM print_formats WHERE tenant_id='alu' AND name=${sqlString(format.name)}),1)
  ),
  'admin',${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,name) DO UPDATE SET
  doc_type=excluded.doc_type,is_default=excluded.is_default,disabled=excluded.disabled,
  revision=excluded.revision,format_json=excluded.format_json,
  modified_by=excluded.modified_by,modified_at=excluded.modified_at;`);
}
for (const fixture of manifest.fixtures) {
  statements.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at)
SELECT 'alu',${sqlString(fixture.record_type)},${sqlString(fixture.name)},0,
       ${sqlString(JSON.stringify(fixture.data))},${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET
  data_json=excluded.data_json,modified_at=excluded.modified_at;`);
}
for (const customField of manifest.custom_fields) {
  statements.push(`INSERT INTO custom_fields(
  tenant_id,name,dt,fieldname,metadata_json,insert_after,modified_by,modified_at
)
SELECT 'alu',${sqlString(customField.name)},${sqlString(customField.dt)},${sqlString(customField.fieldname)},
       ${sqlString(JSON.stringify(customField.field))},${sqlString(customField.insert_after)},'admin',${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,name) DO UPDATE SET
  dt=excluded.dt,fieldname=excluded.fieldname,metadata_json=excluded.metadata_json,
  insert_after=excluded.insert_after,modified_by=excluded.modified_by,modified_at=excluded.modified_at;`);
  statements.push(`INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at)
SELECT 'alu',${sqlString(customField.dt)},1,${sqlString(now)}
WHERE ${versionGuard}
ON CONFLICT(tenant_id,doctype) DO UPDATE SET
  revision=revision+1,modified_at=excluded.modified_at;`);
}

const owned = [
  ...manifest.doctypes.map((entry) => ["DocType", "", entry.name]),
  ...manifest.workflows.map((entry) => ["Workflow", "", entry.name]),
  ...manifest.print_formats.map((entry) => ["Print Format", "", entry.name]),
  ...manifest.roles.map((entry) => ["Role", "", entry.role]),
  ...manifest.fixtures.map((entry) => ["Master Record", entry.record_type, entry.name]),
  ...manifest.custom_fields.map((entry) => ["Custom Field", entry.dt, entry.name]),
];
statements.push(`DELETE FROM app_objects
WHERE tenant_id='alu' AND app_id='alumdoor' AND ${versionGuard};`);
for (let start = 0; start < owned.length; start += 20) {
  const values = owned.slice(start, start + 20).map(([type, scope, name]) =>
    `('alu','alumdoor',${sqlString(type)},${sqlString(name)},${sqlString(scope)})`);
  statements.push(`INSERT INTO app_objects(tenant_id,app_id,object_type,object_name,object_scope)
SELECT column1,column2,column3,column4,column5
FROM (VALUES ${values.join(",")})
WHERE ${versionGuard}
ON CONFLICT(tenant_id,object_type,object_scope,object_name) DO UPDATE SET app_id=excluded.app_id;`);
}
// Rebuild the stored manifest a bounded top-level piece at a time. The complete
// manifest is ~400 KB, too large for one Wrangler/D1 statement.
statements.push(`UPDATE installed_apps
SET manifest_json=json_set(manifest_json,'$.doctypes',json('[]')),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>${sqlString(contentHash)};`);
for (const doctype of manifest.doctypes) {
  statements.push(`UPDATE installed_apps
SET manifest_json=json_insert(manifest_json,'$.doctypes[#]',json(${sqlString(JSON.stringify(doctype))})),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>${sqlString(contentHash)};`);
}
for (const [key, value] of Object.entries(manifest)) {
  if (key === "doctypes") continue;
  statements.push(`UPDATE installed_apps
SET manifest_json=json_set(manifest_json,${sqlString(`$.${key}`)},json(${sqlString(JSON.stringify(value))})),
    modified_at=${sqlString(now)}
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>${sqlString(contentHash)};`);
}
statements.push(`UPDATE installed_apps
SET app_name=${sqlString(manifest.name)},
    version=${sqlString(manifest.version)},
    content_hash=${sqlString(contentHash)},
    modified_at=${sqlString(now)}
WHERE tenant_id='alu' AND app_id='alumdoor'
  AND content_hash<>${sqlString(contentHash)};`);

const MAX_PART_BYTES = 80_000;
const header = `-- Alumdoor ${manifest.version}: full compiler-normalized metadata release.
-- Equivalent data shape to AppInstaller.install; generated at statement boundaries.
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
await Promise.all(outputs.map((file, index) => writeFile(file, parts[index], "utf8")));
console.log(JSON.stringify({
  app: `${manifest.id}@${manifest.version}`,
  content_hash: contentHash,
  statements: statements.length,
  doctypes: manifest.doctypes.length,
  outputs,
}));
