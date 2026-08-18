#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const [payloadArg, resultArg, modeArg] = process.argv.slice(2);
const validateOnly = modeArg === '--validate-only';
if (!payloadArg || (!validateOnly && !resultArg)) throw new Error('Usage: import-alumdoor-canonical-bom-local.mjs <payload.json> <result.json> [--validate-only]');
const payloadPath = path.resolve(payloadArg);
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (payload?.format !== 'alumdoor-canonical-bom-importable/v2' || !Array.isArray(payload.boms)) throw new Error('Expected alumdoor-canonical-bom-importable/v2');
if (Number(payload.mutation_blocker_count) !== 0) throw new Error(`mutation_blocker_count must be zero; got ${payload.mutation_blocker_count}`);
if (Number(payload.component_reference_count) !== Number(payload.expected_component_count)) {
  throw new Error(`component coverage must converge before local mutation: components=${payload.component_reference_count} expected=${payload.expected_component_count}`);
}

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
function apiLine(row, index) {
  const managed = managedLine(row);
  return {
    row_id: Number.isFinite(Number(managed.source_row)) ? `SRC-${managed.source_row}` : `SRC-SEQ-${index + 1}`,
    ...managed,
  };
}
function normalizedLines(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(managedLine)
    .sort((a, b) => Number(a.source_sequence ?? 1e12) - Number(b.source_sequence ?? 1e12)
      || Number(a.source_row ?? 1e12) - Number(b.source_row ?? 1e12)
      || clean(a.item_code).localeCompare(clean(b.item_code), 'vi'));
}
function bomSnapshot(doc) {
  return {
    item: clean(doc?.item),
    company: clean(doc?.company),
    quantity: Number(doc?.quantity ?? 1),
    output_uom: clean(doc?.output_uom) || null,
    bom_status: clean(doc?.bom_status) || 'Draft',
    items: normalizedLines(doc?.items),
  };
}
function expectedSnapshot(bom) {
  return {
    item: clean(bom.item),
    company: 'ALUMDOOR',
    quantity: 1,
    output_uom: clean(bom.output_uom) || null,
    bom_status: 'Draft',
    items: normalizedLines(bom.lines),
  };
}
function sameBom(expected, actual) {
  return JSON.stringify(expectedSnapshot(expected)) === JSON.stringify(bomSnapshot(actual));
}
function validateBom(bom) {
  if (!clean(bom?.item)) throw new Error('BOM parent item is blank');
  if (!Array.isArray(bom.lines) || bom.lines.length === 0) throw new Error(`BOM ${bom.item} has no source component rows`);
  const sourceKeys = new Set();
  for (const [index, row] of bom.lines.entries()) {
    if (!clean(row?.item_code)) throw new Error(`BOM ${bom.item} row ${index + 1} has blank canonical Item`);
    const sourceRow = optionalNumber(row?.source_row);
    if (sourceRow === null) throw new Error(`BOM ${bom.item} row ${index + 1} has no source_row lineage`);
    if (sourceKeys.has(sourceRow)) throw new Error(`BOM ${bom.item} duplicates source row ${sourceRow}`);
    sourceKeys.add(sourceRow);
    const status = clean(row?.source_value_status);
    if (!['RESOLVED','PENDING'].includes(status)) throw new Error(`BOM ${bom.item} row ${sourceRow} has invalid source_value_status=${status}`);
    if (status === 'PENDING' && !clean(row?.source_pending_reason)) throw new Error(`BOM ${bom.item} row ${sourceRow} pending values require source_pending_reason`);
    if (status === 'PENDING') {
      for (const numeric of ['qty','conversion_factor']) {
        const value = row?.[numeric];
        if (value !== null && value !== undefined && clean(value) !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
          throw new Error(`BOM ${bom.item} row ${sourceRow} ${numeric} must stay blank or positive`);
        }
      }
    } else if (!Number.isFinite(Number(row?.qty)) || Number(row.qty) <= 0) {
      throw new Error(`BOM ${bom.item} resolved row ${sourceRow} requires positive qty`);
    }
  }
}
for (const bom of payload.boms) validateBom(bom);
const componentCount = payload.boms.reduce((sum, bom) => sum + bom.lines.length, 0);
if (componentCount !== Number(payload.component_reference_count)) throw new Error(`payload component count mismatch declared=${payload.component_reference_count} actual=${componentCount}`);
console.log(`ALUMDOOR_BOM_LOCAL_PAYLOAD_VALID boms=${payload.boms.length} components=${componentCount} pending=${payload.pending_value_count}`);
if (validateOnly) {
  console.log('ALUMDOOR_BOM_LOCAL_VALIDATE_ONLY_PASS');
  process.exit(0);
}

assertLocalMutationChildContext(['bom']);
const origin = (process.env.FORGE_ORIGIN ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1','localhost','::1'].includes(parsedOrigin.hostname)) throw new Error(`refusing remote BOM mutation: ${parsedOrigin.hostname}`);
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? '';
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? '';
if (!adminUser || !adminPassword) throw new Error('FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required');
const cookies = new Map();
let csrfToken = '';
function rememberCookies(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return;
  for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(';',1)[0];
    const i = pair.indexOf('=');
    if (i > 0) cookies.set(pair.slice(0,i).trim(), pair.slice(i+1).trim());
  }
}
function cookieHeader(){ return [...cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }
async function request(urlPath, options={}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (csrfToken && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrfToken);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type','application/json');
  const response = await fetch(`${origin}${urlPath}`, { ...options, headers, body: options.body === undefined || typeof options.body === 'string' ? options.body : JSON.stringify(options.body), redirect:'manual' });
  rememberCookies(response);
  csrfToken = response.headers.get('x-frappe-csrf-token') ?? csrfToken;
  const text = await response.text();
  let body=null; try { body=text?JSON.parse(text):null; } catch { body=text; }
  return { response, body, text };
}
async function requireOk(urlPath, options={}) {
  const result = await request(urlPath, options);
  if (!result.response.ok) throw new Error(`${options.method ?? 'GET'} ${urlPath} failed (${result.response.status}): ${result.text}`);
  return result.body;
}
async function login() {
  await requireOk('/api/method/login',{method:'POST',body:{usr:adminUser,pwd:adminPassword}});
  const boot = await requireOk('/api/method/metaforge.api.get_boot');
  const message = boot && typeof boot === 'object' && 'message' in boot ? boot.message : boot;
  csrfToken = message?.csrf_token ?? csrfToken;
  if (!csrfToken) throw new Error('login succeeded but boot returned no CSRF token');
}
const dataOf = (body) => body?.data ?? body?.message ?? body;
async function listPaged(doctype, fields, filters = null) {
  const encodedFields = encodeURIComponent(JSON.stringify(fields));
  const encodedFilters = filters ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : '';
  const pageSize = 100;
  const all = [];
  for (let start = 0; ; start += pageSize) {
    const body = await requireOk(`/api/resource/${encodeURIComponent(doctype)}?fields=${encodedFields}${encodedFilters}&limit_page_length=${pageSize}&limit_start=${start}`);
    const rows = dataOf(body);
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
async function listExisting() {
  return listPaged('Bill of Materials', ['name','item','company','quantity','docstatus','status','remarks'], [['Bill of Materials','company','=','ALUMDOOR']]);
}
async function listItemCodes() {
  const rows = await listPaged('Item', ['name','item_code']);
  return new Set(rows.map((row) => clean(row?.item_code) || clean(row?.name)).filter(Boolean));
}
async function getBom(name) {
  const body = await requireOk(`/api/resource/${encodeURIComponent('Bill of Materials')}/${encodeURIComponent(name)}`);
  return dataOf(body);
}
async function mapConcurrent(values, limit, mapper) {
  const out = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      out[index] = await mapper(values[index], index);
    }
  }
  const count = Math.min(Math.max(1, limit), Math.max(1, values.length));
  await Promise.all(Array.from({ length: count }, () => worker()));
  return out;
}
function apiBom(bom, modified) {
  return {
    company: 'ALUMDOOR',
    item: bom.item,
    quantity: 1,
    output_uom: bom.output_uom || undefined,
    bom_status: 'Draft',
    items: bom.lines.map(apiLine),
    remarks: `Alumdoor canonical source-complete ${bom.import_fingerprint}`,
    ...(modified ? { modified } : {}),
  };
}
function importerManaged(doc) {
  const remarks = clean(doc?.remarks);
  return remarks.startsWith('Alumdoor canonical Gate B ') || remarks.startsWith('Alumdoor canonical source-complete ');
}
async function updateBomDraft(name, bom) {
  const url = `/api/resource/${encodeURIComponent('Bill of Materials')}/${encodeURIComponent(name)}`;
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const current = await getBom(name);
    if (sameBom(bom, current)) return { changed:false, body:current };
    const modified = clean(current?.modified);
    if (!modified) throw new Error(`BOM ${name} update requires current modified token`);
    const result = await request(url, { method:'PUT', body:apiBom(bom, modified) });
    if (result.response.ok) return { changed:true, body:result.body };
    last = result;
    const mismatch = [409,417].includes(result.response.status)
      && /TimestampMismatchError|VERSION_CONFLICT|document changed after it was loaded/i.test(result.text);
    if (!mismatch || attempt === 3) {
      throw new Error(`PUT ${url} failed (${result.response.status}): ${result.text}`);
    }
    console.log(`ALUMDOOR_BOM_PUT_RETRY name=${name} attempt=${attempt} reason=timestamp_mismatch`);
  }
  throw new Error(`PUT ${url} failed (${last?.response?.status ?? 'unknown'}): ${last?.text ?? ''}`);
}

await login();

const referencedItems = new Set();
for (const bom of payload.boms) {
  referencedItems.add(clean(bom.item));
  for (const row of bom.lines) referencedItems.add(clean(row.item_code));
}
console.log(`ALUMDOOR_BOM_PREFLIGHT_START referenced_items=${referencedItems.size} target_boms=${payload.boms.length}`);
const localItemCodes = await listItemCodes();
const missingItemRefs = [...referencedItems].filter((code) => !localItemCodes.has(code)).sort((a,b)=>a.localeCompare(b,'vi'));
if (missingItemRefs.length) {
  throw new Error(`ALUMDOOR_BOM_LOCAL_MISSING_ITEMS count=${missingItemRefs.length} items=${JSON.stringify(missingItemRefs)}`);
}
console.log(`ALUMDOOR_BOM_LOCAL_ITEM_PREREQUISITES_PASS unique_items=${referencedItems.size} local_items=${localItemCodes.size}`);

const existingList = await listExisting();
console.log(`ALUMDOOR_BOM_EXISTING_INDEX_PASS existing=${existingList.length}`);
const existingByItem = new Map();
for (const doc of existingList) {
  const item = clean(doc?.item);
  if (!item) continue;
  const list = existingByItem.get(item) ?? [];
  list.push(doc);
  existingByItem.set(item, list);
}

const plans = [];
const unchanged = [];
const conflicts = [];
for (const bom of payload.boms) {
  const candidates = existingByItem.get(clean(bom.item)) ?? [];
  const mutable = candidates.find((doc) => Number(doc?.docstatus ?? 0) === 0 && importerManaged(doc))
    ?? candidates.find((doc) => Number(doc?.docstatus ?? 0) === 0);
  if (mutable) {
    plans.push({ action:'update', bom, existing: mutable });
    continue;
  }
  plans.push({ action:'create', bom, existing: null });
  if (candidates.length) conflicts.push({ item:bom.item, reason:'submitted_revision_preserved_new_draft_required', existing:candidates.map((doc)=>({name:doc.name,docstatus:doc.docstatus,status:doc.status})) });
}

const resultPath=path.resolve(resultArg);
mkdirSync(path.dirname(resultPath),{recursive:true});
const preimage={
  format:'alumdoor-canonical-bom-local-preimage/v2',
  created_at:new Date().toISOString(),
  payload:payloadPath,
  existing_count:existingList.length,
  planned_create_count:plans.filter((p)=>p.action==='create').length,
  planned_update_count:plans.filter((p)=>p.action==='update').length,
  unchanged_count:0,
  source_component_count:componentCount,
  pending_value_count:Number(payload.pending_value_count),
  submitted_revision_conflicts:conflicts,
  existing:existingList,
  planned:plans.map((p)=>({action:p.action,item:p.bom.item,name:p.existing?.name??null,import_fingerprint:p.bom.import_fingerprint,components:p.bom.lines.length,pending:p.bom.pending_lines?.length??0})),
};
writeFileSync(`${resultPath}.preimage.json`,`${JSON.stringify(preimage,null,2)}\n`,'utf8');

const created=[]; const updated=[];
console.log(`ALUMDOOR_BOM_WRITE_START total=${plans.length}`);
let processed = 0;
for (const plan of plans) {
  if (plan.action === 'create') {
    const body=await requireOk(`/api/resource/${encodeURIComponent('Bill of Materials')}`,{method:'POST',body:apiBom(plan.bom)});
    const doc=dataOf(body); created.push({item:plan.bom.item,name:doc?.name??null,import_fingerprint:plan.bom.import_fingerprint});
  } else {
    const outcome=await updateBomDraft(plan.existing.name, plan.bom);
    const doc=dataOf(outcome.body);
    if (outcome.changed) updated.push({item:plan.bom.item,name:doc?.name??plan.existing.name,import_fingerprint:plan.bom.import_fingerprint});
    else unchanged.push({item:plan.bom.item,name:doc?.name??plan.existing.name});
  }
  processed += 1;
  if (processed === plans.length || processed % 10 === 0) {
    console.log(`ALUMDOOR_BOM_WRITE_PROGRESS processed=${processed}/${plans.length} created=${created.length} updated=${updated.length} unchanged=${unchanged.length}`);
  }
}

const postList=await listExisting();
console.log(`ALUMDOOR_BOM_VERIFY_START existing=${postList.length}`);
const postFull=await mapConcurrent(postList, 8, (row)=>getBom(row.name));
const postByItem=new Map();
for(const doc of postFull){const item=clean(doc?.item);const list=postByItem.get(item)??[];list.push(doc);postByItem.set(item,list);}
const failures=[];
const canonicalMatches=[];
for(const bom of payload.boms){
  const matches=(postByItem.get(clean(bom.item))??[]).filter((doc)=>sameBom(bom,doc));
  if(matches.length!==1) failures.push({item:bom.item,reason:matches.length===0?'no_exact_persisted_bom':'duplicate_exact_persisted_bom',match_count:matches.length,names:matches.map((doc)=>doc.name)});
  else canonicalMatches.push({item:bom.item,name:matches[0].name});
}
if(failures.length){writeFileSync(resultPath,`${JSON.stringify({failures},null,2)}\n`);throw new Error(`ALUMDOOR_BOM_LOCAL_VERIFY_FAILED count=${failures.length}`);}

const result={
  format:'alumdoor-canonical-bom-local-import-result/v2',
  payload:payloadPath,
  created_count:created.length,
  updated_count:updated.length,
  unchanged_count:unchanged.length,
  source_component_count:componentCount,
  pending_value_count:Number(payload.pending_value_count),
  missing_item_reference_count:0,
  verification_failure_count:0,
  total_alumdoor_bom_count:postFull.length,
  unique_finished_item_count:new Set(postFull.map((doc)=>clean(doc.item)).filter(Boolean)).size,
  created,updated,unchanged,canonical_matches:canonicalMatches,
};
writeFileSync(resultPath,`${JSON.stringify(result,null,2)}\n`,'utf8');
console.log(`ALUMDOOR_BOM_LOCAL_IMPORT_PASS created=${created.length} updated=${updated.length} unchanged=${unchanged.length} components=${componentCount} pending=${payload.pending_value_count} verified=${payload.boms.length}`);
