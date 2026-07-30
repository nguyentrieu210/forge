#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  ALUMDOOR_COLOR_CATALOG,
  ALUMDOOR_LEGACY_COLOR_MAP,
  alumdoorColorPayload,
} from "./lib/alumdoor-color-catalog.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const tenant = argOf("tenant", "alu");
const output = argOf("sql");
const importedAt = "2026-07-30T00:00:00.000Z";
if (!output) throw new Error("--sql is required");
if (!/^[a-z][a-z0-9-]*$/.test(tenant)) throw new Error(`Invalid tenant id: ${tenant}`);

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const documentRows = ALUMDOOR_COLOR_CATALOG.map((color) => {
  const payload = JSON.stringify(alumdoorColorPayload(color));
  return `(${sqlText(tenant)},${sqlText(`Item Color:${color.code}`)},'Item Color',${sqlText(color.code)},'admin',0,'Draft',1,${sqlText(importedAt)},${sqlText(importedAt)},'admin',${sqlText(payload)})`;
});
const searchRows = ALUMDOOR_COLOR_CATALOG.map((color) => {
  const content = [color.code, color.name, color.finish, ...color.groups].join(" ");
  return `(${sqlText(tenant)},'Item Color',${sqlText(color.code)},${sqlText(color.name)},${sqlText(content)},${sqlText(importedAt)})`;
});
const aliases = [...ALUMDOOR_LEGACY_COLOR_MAP.entries()]
  .filter(([legacy]) => ["GS", "VK", "CF", "XF", "4004", "9512 ( TRẮNG )"].includes(legacy));
const cases = aliases.map(([legacy, canonical]) => `WHEN ${sqlText(legacy)} THEN ${sqlText(canonical)}`).join(" ");
const legacyList = aliases.map(([legacy]) => sqlText(legacy)).join(",");
const colorRows = (colors) => colors.map((color, index) => ({
  row_id: `COLOR-${String(index + 1).padStart(2, "0")}`,
  color: color.code,
}));
const staticColors = ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "Sơn tĩnh điện");
const rawAluminiumColors = colorRows([
  ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "THÔ"),
  ...staticColors,
].filter(Boolean));
const staticAllowed = colorRows(staticColors);
const australiaPlated = colorRows(ALUMDOOR_COLOR_CATALOG.filter((color) =>
  color.finish === "Mạ" && color.groups.includes("Cửa tấm liền Úc")));
const taiwanPlated = colorRows(ALUMDOOR_COLOR_CATALOG.filter((color) =>
  color.finish === "Mạ" && color.groups.includes("Cửa Đài Loan")));

const sql = `-- Alumdoor canonical color catalogue correction.
-- Idempotent: upsert 24 canonical colors, normalize legacy lot links, then remove obsolete aliases.

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ${documentRows.join(",\n  ")}
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ${searchRows.join(",\n  ")}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

UPDATE documents
SET payload_json=json_set(payload_json,'$.colour',CASE json_extract(payload_json,'$.colour') ${cases} ELSE json_extract(payload_json,'$.colour') END),
    modified_at=${sqlText(importedAt)},modified_by='admin',version=version+1
WHERE tenant_id=${sqlText(tenant)} AND doctype='Aluminium Lot'
  AND json_extract(payload_json,'$.colour') IN (${legacyList});

UPDATE document_search
SET title=(SELECT json_extract(d.payload_json,'$.profile')||' · '||json_extract(d.payload_json,'$.colour')||' · '||json_extract(d.payload_json,'$.width_m')||' m'
           FROM documents d WHERE d.tenant_id=document_search.tenant_id AND d.doctype='Aluminium Lot' AND d.name=document_search.name),
    content=(SELECT json_extract(d.payload_json,'$.profile')||' '||json_extract(d.payload_json,'$.colour')||' '||json_extract(d.payload_json,'$.generation')||' '||json_extract(d.payload_json,'$.width_m')||' '||json_extract(d.payload_json,'$.warehouse')||' '||json_extract(d.payload_json,'$.quality_status')
             FROM documents d WHERE d.tenant_id=document_search.tenant_id AND d.doctype='Aluminium Lot' AND d.name=document_search.name),
    modified_at=${sqlText(importedAt)}
WHERE tenant_id=${sqlText(tenant)} AND doctype='Aluminium Lot';

DELETE FROM document_search
WHERE tenant_id=${sqlText(tenant)} AND doctype='Item Color' AND name IN (${legacyList});

DELETE FROM documents
WHERE tenant_id=${sqlText(tenant)} AND doctype='Item Color' AND name IN (${legacyList});

-- Chiều chặn thật nằm trên Item.allowed_colors. Không dùng phạm vi nhóm rộng để cấp màu:
-- Cửa Úc/Đài Loan/Lưới/Phụ kiện chỉ được STĐ khi chính mã hàng ghi STĐ/STD.
UPDATE documents
SET payload_json=json_set(
      payload_json,
      '$.allowed_colors',
      CASE
        WHEN json_extract(payload_json,'$.inventory_mode')='Nhôm cây/lá'
          THEN json(${sqlText(JSON.stringify(rawAluminiumColors))})
        WHEN json_extract(payload_json,'$.item_group') IN ('Cửa CN Đức','Cửa siêu trường')
          OR json_extract(payload_json,'$.item_name') LIKE '%STĐ%'
          OR json_extract(payload_json,'$.item_name') LIKE '%STD%'
          OR json_extract(payload_json,'$.description') LIKE '%STĐ%'
          OR json_extract(payload_json,'$.description') LIKE '%STD%'
          OR json_extract(payload_json,'$.item_name') LIKE '%Sơn tĩnh điện%'
          OR json_extract(payload_json,'$.item_name') LIKE '%SƠN TĨNH ĐIỆN%'
          THEN json(${sqlText(JSON.stringify(staticAllowed))})
        WHEN json_extract(payload_json,'$.item_group')='Cửa tấm liền Úc'
          THEN json(${sqlText(JSON.stringify(australiaPlated))})
        WHEN json_extract(payload_json,'$.item_group')='Cửa Đài Loan'
          THEN json(${sqlText(JSON.stringify(taiwanPlated))})
        ELSE json('[]')
      END
    ),
    modified_at=${sqlText(importedAt)},
    modified_by='admin',
    version=version+1
WHERE tenant_id=${sqlText(tenant)}
  AND doctype='Item'
  AND COALESCE(json_extract(payload_json,'$.disabled'),0)=0;
`;

await writeFile(path.resolve(output), sql, "utf8");
console.log(JSON.stringify({
  output: path.resolve(output),
  canonical_colors: ALUMDOOR_COLOR_CATALOG.length,
  normalized_legacy_codes: aliases.length,
}, null, 2));
