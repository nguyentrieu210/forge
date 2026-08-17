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
if (payload?.format !== 'alumdoor-canonical-bom-importable/v1' || !Array.isArray(payload.boms)) throw new Error('Expected alumdoor-canonical-bom-importable/v1');
if (Number(payload.item_projection_count) !== 587) throw new Error(`Gate A baseline mismatch: ${payload.item_projection_count}`);
if (Number(payload.mutation_blocker_count) !== 0) throw new Error(`mutation_blocker_count must be zero; got ${payload.mutation_blocker_count}`);
const normalizeLines = (rows) => (Array.isArray(rows) ? rows : []).map((row) => ({ item_code: String(row?.item_code ?? '').trim(), qty: Number(row?.qty) })).filter((row) => row.item_code && Number.isFinite(row.qty) && row.qty > 0).sort((a,b)=>a.item_code.localeCompare(b.item_code,'vi')||a.qty-b.qty);
for (const bom of payload.boms) {
  if (!String(bom?.item ?? '').trim()) throw new Error('BOM parent item is blank');
  const lines = normalizeLines(bom.lines);
  if (lines.length !== (bom.lines ?? []).length) throw new Error(`BOM ${bom.item} contains non-importable child rows`);
  for (const blank of bom.blank_lines ?? []) {
    if (blank.qty !== null || blank.uom !== null || blank.conversion_factor !== null) throw new Error(`BOM ${bom.item} blank line must keep unresolved values null`);
  }
}
console.log(`ALUMDOOR_BOM_LOCAL_PAYLOAD_VALID boms=${payload.boms.length} usable=${payload.usable_reference_count} blank=${payload.blank_reference_count}`);
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
async function listExisting() {
  const fields = encodeURIComponent(JSON.stringify(['name','item','company','quantity']));
  const filters = encodeURIComponent(JSON.stringify([['Bill of Materials','company','=','ALUMDOOR']]));
  const body = await requireOk(`/api/resource/${encodeURIComponent('Bill of Materials')}?fields=${fields}&filters=${filters}&limit_page_length=5000`);
  const rows = dataOf(body);
  return Array.isArray(rows) ? rows : [];
}
async function getBom(name) {
  const body = await requireOk(`/api/resource/${encodeURIComponent('Bill of Materials')}/${encodeURIComponent(name)}`);
  return dataOf(body);
}
function sameBom(expected, actual) {
  if (String(actual?.item ?? '').trim() !== String(expected.item).trim()) return false;
  if (String(actual?.company ?? '').trim() !== 'ALUMDOOR') return false;
  if (Number(actual?.quantity ?? 1) !== 1) return false;
  return JSON.stringify(normalizeLines(actual?.items)) === JSON.stringify(normalizeLines(expected.lines));
}
await login();
const existingList = await listExisting();
const existingByItem = new Map();
for (const row of existingList) {
  const item = String(row?.item ?? '').trim();
  if (!item) continue;
  const list = existingByItem.get(item) ?? [];
  list.push(row);
  existingByItem.set(item,list);
}
const planned=[]; const unchanged=[]; const skippedBlankOnly=[];
for (const bom of payload.boms) {
  const lines=normalizeLines(bom.lines);
  if (!lines.length) { skippedBlankOnly.push({item:bom.item,blank_lines:(bom.blank_lines??[]).length}); continue; }
  let match=null;
  for (const row of existingByItem.get(String(bom.item)) ?? []) {
    const full=await getBom(row.name);
    if (sameBom(bom,full)) { match=row.name; break; }
  }
  if (match) unchanged.push({item:bom.item,name:match});
  else planned.push(bom);
}
const preimage={format:'alumdoor-canonical-bom-local-preimage/v1',created_at:new Date().toISOString(),payload:payloadPath,existing_count:existingList.length,planned_create_count:planned.length,unchanged_count:unchanged.length,skipped_blank_only_count:skippedBlankOnly.length,existing:existingList,planned:planned.map((b)=>({item:b.item,import_fingerprint:b.import_fingerprint,usable_lines:b.lines.length,blank_lines:(b.blank_lines??[]).length}))};
const resultPath=path.resolve(resultArg); mkdirSync(path.dirname(resultPath),{recursive:true});
writeFileSync(`${resultPath}.preimage.json`,`${JSON.stringify(preimage,null,2)}\n`,'utf8');
const created=[];
for (const bom of planned) {
  const body=await requireOk(`/api/resource/${encodeURIComponent('Bill of Materials')}`,{method:'POST',body:{company:'ALUMDOOR',item:bom.item,quantity:1,items:normalizeLines(bom.lines),remarks:`Alumdoor canonical Gate B ${bom.import_fingerprint}`}});
  const doc=dataOf(body); created.push({item:bom.item,name:doc?.name ?? null,import_fingerprint:bom.import_fingerprint});
}
const postList=await listExisting();
const postByItem=new Map();
for (const row of postList) { const item=String(row?.item??'').trim(); const list=postByItem.get(item)??[]; list.push(row); postByItem.set(item,list); }
const failures=[];
for (const bom of payload.boms) {
  const lines=normalizeLines(bom.lines); if(!lines.length) continue;
  let matched=false;
  for (const row of postByItem.get(String(bom.item)) ?? []) { if (sameBom(bom,await getBom(row.name))) { matched=true; break; } }
  if (!matched) failures.push({item:bom.item,reason:'no_exact_persisted_bom'});
}
if (failures.length) { writeFileSync(resultPath,`${JSON.stringify({failures},null,2)}\n`); throw new Error(`ALUMDOOR_BOM_LOCAL_VERIFY_FAILED count=${failures.length}`); }
const result={format:'alumdoor-canonical-bom-local-import-result/v1',payload:payloadPath,created_count:created.length,unchanged_count:unchanged.length,skipped_blank_only_count:skippedBlankOnly.length,usable_reference_count:Number(payload.usable_reference_count),blank_reference_count:Number(payload.blank_reference_count),verification_failure_count:0,created,unchanged,skipped_blank_only:skippedBlankOnly};
writeFileSync(resultPath,`${JSON.stringify(result,null,2)}\n`,'utf8');
console.log(`ALUMDOOR_BOM_LOCAL_IMPORT_PASS created=${created.length} unchanged=${unchanged.length} blank=${payload.blank_reference_count} verified=${payload.boms.length-skippedBlankOnly.length}`);
