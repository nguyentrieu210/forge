#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  ALUMDOOR_COLOR_CATALOG,
  ALUMDOOR_LEGACY_COLOR_MAP,
  ALUMDOOR_SURFACE_FINISH_CATALOG,
  alumdoorColorPayload,
  alumdoorSurfaceFinishPayload,
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
const finishDocumentRows = ALUMDOOR_SURFACE_FINISH_CATALOG.map((finish) => {
  const payload = JSON.stringify(alumdoorSurfaceFinishPayload(finish));
  return `(${sqlText(tenant)},${sqlText(`Surface Finish:${finish.code}`)},'Surface Finish',${sqlText(finish.code)},'admin',0,'Draft',1,${sqlText(importedAt)},${sqlText(importedAt)},'admin',${sqlText(payload)})`;
});
const finishSearchRows = ALUMDOOR_SURFACE_FINISH_CATALOG.map((finish) => {
  const content = [finish.code, finish.name].join(" ");
  return `(${sqlText(tenant)},'Surface Finish',${sqlText(finish.code)},${sqlText(finish.name)},${sqlText(content)},${sqlText(importedAt)})`;
});
const documentRows = ALUMDOOR_COLOR_CATALOG.map((color) => {
  const payload = JSON.stringify(alumdoorColorPayload(color));
  return `(${sqlText(tenant)},${sqlText(`Item Color:${color.code}`)},'Item Color',${sqlText(color.code)},'admin',0,'Draft',1,${sqlText(importedAt)},${sqlText(importedAt)},'admin',${sqlText(payload)})`;
});
const searchRows = ALUMDOOR_COLOR_CATALOG.map((color) => {
  const content = [color.code, color.name, color.finish, ...color.groups].join(" ");
  return `(${sqlText(tenant)},'Item Color',${sqlText(color.code)},${sqlText(color.name)},${sqlText(content)},${sqlText(importedAt)})`;
});
const canonicalColorList = ALUMDOOR_COLOR_CATALOG.map((color) => sqlText(color.code)).join(",");
const canonicalFinishList = ALUMDOOR_SURFACE_FINISH_CATALOG.map((finish) => sqlText(finish.code)).join(",");
const aliases = [...ALUMDOOR_LEGACY_COLOR_MAP.entries()]
  .filter(([legacy]) => ["GS", "VK", "CF", "XF", "4004", "9512 ( TRẮNG )"].includes(legacy));
const cases = aliases.map(([legacy, canonical]) => `WHEN ${sqlText(legacy)} THEN ${sqlText(canonical)}`).join(" ");
const legacyList = aliases.map(([legacy]) => sqlText(legacy)).join(",");
const sql = `-- Alumdoor canonical color catalogue correction — 2026-08-16: hội tụ Bề mặt+Màu.
-- THÔ tách khỏi màu thương mại thành Surface Finish riêng; Item Color.surface_finish thay
-- Item Color.finish (Link, không còn text tự do). +SƠN VÂN GỖ/VÂN GỖ theo bảng giá 31/07.
-- Idempotent: upsert 4 Bề mặt + 25 màu chuẩn, normalize legacy lot links, remove obsolete aliases.
-- Surface Finish là authority phạm vi rộng; Item Color.applies_to_groups chỉ thu hẹp thêm.

INSERT INTO documents
  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)
VALUES
  ${finishDocumentRows.join(",\n  ")}
ON CONFLICT(tenant_id,doc_key) DO UPDATE SET
  payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,
  version=documents.version+1;

INSERT INTO document_search(tenant_id,doctype,name,title,content,modified_at)
VALUES
  ${finishSearchRows.join(",\n  ")}
ON CONFLICT(tenant_id,doctype,name) DO UPDATE SET
  title=excluded.title,content=excluded.content,modified_at=excluded.modified_at;

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

-- ── master_records: dọn mọi tên NGOÀI bảng màu chuẩn ──
--
-- Chỗ này trước đây bị bỏ sót, và nó là chỗ đau nhất. Ô chọn Link đọc HỢP của
-- documents ∪ master_records (document-kernel/d1-store.ts → listMasterRecords, UNION là
-- cố ý và đúng). Fixture của brief từng khai ĐỦ CẢ HAI dạng tên — 22 slug ASCII (TRANG,
-- CAFE, XANH_NGOC) cạnh 25 tên đúng (TRẮNG, CAFÉ, XANH NGỌC) — nên người dùng chọn được
-- HAI bản ghi cho cùng một màu. Đúng cái E07 cảnh báo với CUỐN/Cuộn: chẻ tồn kho làm hai
-- vì một lần gõ nhầm, và không có gì báo.
--
-- Lọc theo DANH SÁCH MÃ CHUẨN, tuyệt đối không theo hình dạng tên. VAN_GO có dấu gạch
-- dưới nhưng LÀ mã chuẩn (màu VÂN GỖ của hai phụ thu vân gỗ) — lọc theo "tên có gạch dưới"
-- sẽ xoá đúng nó và làm chết hai chính sách phụ thu.
DELETE FROM master_records
WHERE tenant_id=${sqlText(tenant)} AND record_type='Item Color'
  AND name NOT IN (${canonicalColorList});

DELETE FROM master_records
WHERE tenant_id=${sqlText(tenant)} AND record_type='Surface Finish'
  AND name NOT IN (${canonicalFinishList});
`;

await writeFile(path.resolve(output), sql, "utf8");
console.log(JSON.stringify({
  output: path.resolve(output),
  canonical_colors: ALUMDOOR_COLOR_CATALOG.length,
  normalized_legacy_codes: aliases.length,
}, null, 2));
