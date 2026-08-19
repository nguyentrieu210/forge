#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [payloadArg, resultArg] = process.argv.slice(2);
if (!payloadArg || !resultArg) throw new Error('Usage: verify-alumdoor-bom-local-d1.mjs <bom-importable.json> <result.json>');
const payloadPath = path.resolve(payloadArg);
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (payload?.format !== 'alumdoor-canonical-bom-importable/v2' || !Array.isArray(payload.boms)) throw new Error('Expected alumdoor-canonical-bom-importable/v2');

const serverRoot = path.resolve(import.meta.dirname, '..');
const wranglerEntry = path.join(
  path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
  'bin',
  'wrangler.js',
);
const config = 'apps/tenant-worker/wrangler.jsonc';
const database = 'cloudforge-demo';

function d1(sql) {
  const result = spawnSync(process.execPath, [
    wranglerEntry,
    'd1', 'execute', database,
    '--local',
    '--config', config,
    '--json',
    '--command', sql,
  ], {
    cwd: serverRoot, encoding:'utf8', windowsHide:true, stdio:['ignore','pipe','pipe'],
    // `spawnSync` mặc định chỉ đệm 1 MB. Truy vấn ở đây kéo về `payload_json` của hàng trăm định
    // mức, nên vượt ngưỡng là tiến trình bị GIẾT và `status` thành `null` — thông báo lỗi khi đó
    // là "local D1 query failed (null)" kèm một đống JSON, trông hệt lỗi cú pháp SQL.
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // `status === null` nghĩa là tiến trình bị giết chứ không phải SQL sai — nói thẳng ra, vì hai
    // thứ đó cần hai cách xử lý hoàn toàn khác nhau.
    const killed = result.status === null;
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 2000);
    throw new Error(killed
      ? `local D1 query was killed (signal=${result.signal ?? 'unknown'}) — nhiều khả năng vượt maxBuffer: ${detail}`
      : `local D1 query failed (${result.status}): ${detail}`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`local D1 --json returned invalid JSON: ${error.message}: ${result.stdout.slice(0,500)}`); }
  const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
  while (queue.length) {
    const node = queue.shift();
    if (node && Array.isArray(node.results)) return node.results;
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) if (value && typeof value === 'object') queue.push(value);
    }
  }
  throw new Error(`local D1 result has no results array: ${JSON.stringify(parsed).slice(0,500)}`);
}

const summaryRows = d1(`
SELECT
  (SELECT COUNT(*) FROM documents d WHERE d.doctype='Bill of Materials' AND json_extract(d.payload_json,'$.company')='ALUMDOOR') AS bom_total,
  (SELECT COUNT(*) FROM documents d WHERE d.doctype='BOM Template') AS bom_template_total,
  (SELECT COUNT(DISTINCT json_extract(d.payload_json,'$.item')) FROM documents d WHERE d.doctype='Bill of Materials' AND json_extract(d.payload_json,'$.company')='ALUMDOOR') AS bom_unique_finished_item,
  (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE d.doctype='Bill of Materials' AND json_extract(d.payload_json,'$.company')='ALUMDOOR' AND c.fieldname='items') AS bom_component_total,
  (SELECT COUNT(*) FROM documents d WHERE d.doctype='Bill of Materials' AND json_extract(d.payload_json,'$.company')='ALUMDOOR' AND NOT EXISTS (SELECT 1 FROM document_children c WHERE c.tenant_id=d.tenant_id AND c.parent_key=d.doc_key AND c.fieldname='items')) AS bom_without_component,
  -- Mặt hàng tra ở HỢP hai kho, giống hệt cách picker đọc.
  --
  -- Bản cũ chỉ tra 'master_records' — mà 'Item' nằm trong 'documents' (587 ở đó, 0 ở kia). Nghĩa
  -- là phép kiểm này SAI TỪ ĐẦU: hễ có cấu phần là nó báo mồ côi hết. Nó chưa lộ chỉ vì trước
  -- đây định mức nhập vào được đúng 5 cấu phần; đến khi nhập được 1.279 thì nó báo mồ côi cả 1.279.
  (SELECT COUNT(*) FROM document_children c
     JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key
    WHERE d.doctype='Bill of Materials'
      AND json_extract(d.payload_json,'$.company')='ALUMDOOR'
      AND c.fieldname='items'
      AND NOT EXISTS (
        SELECT 1 FROM documents i
         WHERE i.tenant_id=c.tenant_id AND i.doctype='Item'
           AND i.name=json_extract(c.payload_json,'$.item_code')
        UNION ALL
        SELECT 1 FROM master_records m
         WHERE m.tenant_id=c.tenant_id AND m.record_type='Item'
           AND m.name=json_extract(c.payload_json,'$.item_code')
      )) AS bom_missing_item_reference;
`);
const summary = summaryRows[0] ?? {};

const bomRows = d1(`
SELECT d.name, d.docstatus, d.status, d.payload_json
FROM documents d
WHERE d.doctype='Bill of Materials' AND json_extract(d.payload_json,'$.company')='ALUMDOOR'
ORDER BY d.name;
`);
const childRows = d1(`
SELECT d.name AS bom_name, c.idx, c.row_id, c.payload_json
FROM document_children c
JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key
WHERE d.doctype='Bill of Materials' AND json_extract(d.payload_json,'$.company')='ALUMDOOR' AND c.fieldname='items'
ORDER BY d.name, c.idx;
`);
const templateRows = d1(`
SELECT d.name, d.payload_json
FROM documents d
WHERE d.doctype='BOM Template'
ORDER BY d.name;
`);

const clean = (value) => String(value ?? '').normalize('NFC').trim();
const optionalNumber = (value) => {
  if (value === null || value === undefined || clean(value) === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const LINE_FIELDS = [
  'item_code','qty','uom','stock_uom','conversion_factor','qty_basis','quantity_formula_json','bom_template_code','component_key',
  'source_value_status','source_pending_reason','source_value','source_sequence','source_sheet','source_row','source_index','source_parent_row',
  'source_item_code','source_item_name','source_uom','source_qty_or_formula','source_formula_code','source_formula_text','resolution_reason',
];
function managedLine(row) {
  const out = {};
  for (const field of LINE_FIELDS) {
    if (['qty','conversion_factor','source_sequence','source_row','source_index','source_parent_row'].includes(field)) out[field] = optionalNumber(row?.[field]);
    else out[field] = clean(row?.[field]) || null;
  }
  return out;
}
function sortedLines(rows) {
  return rows.map(managedLine).sort((a,b)=>Number(a.source_sequence??1e12)-Number(b.source_sequence??1e12)||Number(a.source_row??1e12)-Number(b.source_row??1e12)||clean(a.item_code).localeCompare(clean(b.item_code),'vi'));
}
function parseJson(text, label) {
  try { return JSON.parse(String(text ?? '{}')); }
  catch (error) { throw new Error(`${label} contains invalid JSON: ${error.message}`); }
}

const childrenByBom = new Map();
for (const row of childRows) {
  const list = childrenByBom.get(row.bom_name) ?? [];
  list.push(parseJson(row.payload_json, `BOM child ${row.bom_name}/${row.row_id}`));
  childrenByBom.set(row.bom_name, list);
}
const persistedByItem = new Map();
for (const row of bomRows) {
  const doc = parseJson(row.payload_json, `BOM ${row.name}`);
  const item = clean(doc.item);
  const entry = {
    name: row.name,
    docstatus: Number(row.docstatus),
    status: clean(row.status),
    data: doc,
    lines: sortedLines(childrenByBom.get(row.name) ?? []),
  };
  const list = persistedByItem.get(item) ?? [];
  list.push(entry);
  persistedByItem.set(item, list);
}
function expectedSnapshot(bom) {
  return {
    item: clean(bom.item),
    company: 'ALUMDOOR',
    quantity: 1,
    output_uom: clean(bom.output_uom) || null,
    bom_status: 'Draft',
    lines: sortedLines(bom.lines),
  };
}
function actualSnapshot(doc) {
  return {
    item: clean(doc.data.item),
    company: clean(doc.data.company),
    quantity: Number(doc.data.quantity ?? 1),
    output_uom: clean(doc.data.output_uom) || null,
    bom_status: clean(doc.data.bom_status) || 'Draft',
    lines: doc.lines,
  };
}

const canonical = [];
let exactCount = 0;
let exactComponentCount = 0;
let duplicateExactCount = 0;
for (const bom of payload.boms) {
  const expected = expectedSnapshot(bom);
  const candidates = persistedByItem.get(clean(bom.item)) ?? [];
  /**
   * KHÔNG KHAI nghĩa là "đừng đụng", không phải "phải bằng null".
   *
   * Payload để `qty_basis: null` cho dòng chờ (chưa có số lượng), còn D1 giữ giá trị thật từ lần
   * nhập trước. Bộ nhập hiểu đúng điều đó nên báo `unchanged=232`; verifier thì so cứng bằng
   * JSON.stringify và báo 0/1279 khớp — hai phép so bất đồng về cùng một dữ liệu.
   *
   * So theo trường, bỏ qua trường payload không khai. Trường có khai mà lệch thì vẫn báo.
   */
  const lineMatches = (actualLines, expectedLines) => {
    if (actualLines.length !== expectedLines.length) return false;
    return expectedLines.every((want, index) => {
      const got = actualLines[index] ?? {};
      return Object.entries(want).every(([field, value]) => value === null || JSON.stringify(got[field]) === JSON.stringify(value));
    });
  };
  const matches = candidates.filter((doc) => {
    const actual = actualSnapshot(doc);
    const { lines: actualLines, ...actualHead } = actual;
    const { lines: expectedLines, ...expectedHead } = expected;
    if (JSON.stringify(actualHead) !== JSON.stringify(expectedHead)) return false;
    return lineMatches(actualLines, expectedLines);
  });
  if (matches.length === 1) {
    exactCount += 1;
    exactComponentCount += matches[0].lines.length;
  } else if (matches.length > 1) {
    duplicateExactCount += matches.length - 1;
  }
  canonical.push({
    finished_item:bom.item,
    source_component_count:bom.lines.length,
    pending_value_count:bom.pending_lines?.length ?? 0,
    persisted_candidate_count:candidates.length,
    exact_match_count:matches.length,
    persisted_bom_names:matches.map((doc)=>doc.name),
    status:matches.length===1?'complete':(matches.length===0?'incomplete':'blocked'),
  });
}

const templateByCode = new Map();
for (const row of templateRows) {
  const doc = parseJson(row.payload_json, `BOM Template ${row.name}`);
  const code = clean(doc.template_code);
  const list = templateByCode.get(code) ?? [];
  list.push({name:row.name,data:doc});
  templateByCode.set(code,list);
}
const expectedTemplateCodes = payload.boms.filter((bom)=>(bom.pending_lines?.length??0)>0).map((bom)=>clean(bom.item));
const templateDuplicateCount = expectedTemplateCodes.reduce((sum,code)=>sum+Math.max(0,(templateByCode.get(code)?.length??0)-1),0);
const templateMissingCount = expectedTemplateCodes.filter((code)=>(templateByCode.get(code)?.length??0)===0).length;

const result = {
  format:'alumdoor-bom-local-d1-verify/v1',
  payload:payloadPath,
  verified_at:new Date().toISOString(),
  bom_total:Number(summary.bom_total ?? 0),
  bom_template_total:Number(summary.bom_template_total ?? 0),
  bom_unique_finished_item:Number(summary.bom_unique_finished_item ?? 0),
  bom_component_total:Number(summary.bom_component_total ?? 0),
  bom_without_component:Number(summary.bom_without_component ?? 0),
  bom_missing_item_reference:Number(summary.bom_missing_item_reference ?? 0),
  canonical_bom_expected:payload.boms.length,
  canonical_bom_exact:exactCount,
  canonical_bom_incomplete:payload.boms.length-exactCount,
  canonical_component_expected:Number(payload.component_reference_count),
  canonical_component_exact:exactComponentCount,
  canonical_duplicate_exact_count:duplicateExactCount,
  pending_value_count:Number(payload.pending_value_count),
  expected_bom_template_count:expectedTemplateCodes.length,
  bom_template_missing_count:templateMissingCount,
  bom_template_duplicate_count:templateDuplicateCount,
  canonical,
};
writeFileSync(path.resolve(resultArg), `${JSON.stringify(result,null,2)}\n`);
console.log(`ALUMDOOR_BOM_D1_SUMMARY boms=${result.bom_total} templates=${result.bom_template_total} unique_finished=${result.bom_unique_finished_item} components=${result.bom_component_total} zero_component=${result.bom_without_component} missing_item_refs=${result.bom_missing_item_reference}`);
console.log(`ALUMDOOR_BOM_D1_CANONICAL expected_boms=${result.canonical_bom_expected} exact_boms=${result.canonical_bom_exact} expected_components=${result.canonical_component_expected} exact_components=${result.canonical_component_exact} duplicate_exact=${result.canonical_duplicate_exact_count} template_missing=${result.bom_template_missing_count} template_duplicates=${result.bom_template_duplicate_count}`);
if (result.bom_missing_item_reference !== 0) throw new Error(`local D1 has ${result.bom_missing_item_reference} BOM Item reference(s) with no Item master`);
if (result.canonical_bom_incomplete !== 0 || result.canonical_component_exact !== result.canonical_component_expected || result.canonical_duplicate_exact_count !== 0) {
  throw new Error(`canonical local D1 mismatch incomplete=${result.canonical_bom_incomplete} components=${result.canonical_component_exact}/${result.canonical_component_expected} duplicate_exact=${result.canonical_duplicate_exact_count}`);
}
if (result.bom_template_missing_count !== 0 || result.bom_template_duplicate_count !== 0) {
  throw new Error(`canonical BOM Template mismatch missing=${result.bom_template_missing_count} duplicates=${result.bom_template_duplicate_count}`);
}
console.log('ALUMDOOR_BOM_D1_VERIFY_PASS');
