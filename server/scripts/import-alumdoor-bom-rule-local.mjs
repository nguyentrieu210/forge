#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const [payloadArg, resultArg, modeArg] = process.argv.slice(2);
const validateOnly = modeArg === '--validate-only';
if (!payloadArg || (!validateOnly && !resultArg)) {
  throw new Error('Usage: import-alumdoor-bom-rule-local.mjs <bom-rules.json> <result.json> [--validate-only]');
}
const payloadPath = path.resolve(payloadArg);
const source = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (source?.format !== 'alumdoor-bom-rules/v1' || !Array.isArray(source.rules) || !Array.isArray(source.component_mappings)) {
  throw new Error('Expected alumdoor-bom-rules/v1');
}
const clean = (value) => String(value ?? '').normalize('NFC').trim();
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
    : JSON.stringify(value) ?? 'null';

for (const rule of source.rules) {
  if (!clean(rule.rule_code) || !clean(rule.rule_name)) throw new Error('BOM Rule missing rule_code/rule_name');
  if (!clean(rule.result_uom) || !clean(rule.formula_json)) throw new Error(`${rule.rule_code}: missing result_uom/formula_json`);
  if (!Array.isArray(rule.applicability)) throw new Error(`${rule.rule_code}: applicability must be an array`);
  if (clean(rule.authority_type) === 'OWNER_CONFIRMED' && !clean(rule.source_formula_text)) {
    throw new Error(`${rule.rule_code}: owner override must preserve source_formula_text`);
  }
}
console.log(`ALUMDOOR_BOM_RULE_PAYLOAD_VALID rules=${source.rules.length} applicability=${source.rules.reduce((n,r)=>n+r.applicability.length,0)} mappings=${source.component_mappings.length}`);
if (validateOnly) {
  console.log('ALUMDOOR_BOM_RULE_VALIDATE_ONLY_PASS');
  process.exit(0);
}
assertLocalMutationChildContext(['bom-rule', 'bom']);

const origin = (process.env.FORGE_ORIGIN ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1','localhost','::1'].includes(parsedOrigin.hostname)) throw new Error(`refusing remote BOM Rule mutation: ${parsedOrigin.hostname}`);
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
function cookieHeader() { return [...cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }
async function request(urlPath, options={}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (csrfToken && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrfToken);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type','application/json');
  const response = await fetch(`${origin}${urlPath}`, {
    ...options,
    headers,
    body: options.body === undefined || typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
    redirect:'manual',
  });
  rememberCookies(response);
  csrfToken = response.headers.get('x-frappe-csrf-token') ?? csrfToken;
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return {response,body,text};
}
async function requireOk(urlPath, options={}) {
  const result = await request(urlPath, options);
  if (!result.response.ok) throw new Error(`${options.method ?? 'GET'} ${urlPath} failed (${result.response.status}): ${result.text}`);
  return result.body;
}
function dataOf(body) { return body?.data ?? body?.message ?? body; }
async function login() {
  await requireOk('/api/method/login', {method:'POST', body:{usr:adminUser,pwd:adminPassword}});
  const boot = dataOf(await requireOk('/api/method/metaforge.api.get_boot'));
  csrfToken = boot?.csrf_token ?? csrfToken;
  if (!csrfToken) throw new Error('login succeeded but boot returned no CSRF token');
}
async function listDocs(doctype, fields=['name'], filters=[]) {
  const all=[]; const pageSize=100;
  for (let start=0;;start+=pageSize) {
    const qs = new URLSearchParams({fields:JSON.stringify(fields),filters:JSON.stringify(filters),limit_page_length:String(pageSize),limit_start:String(start)});
    const rows=dataOf(await requireOk(`/api/resource/${encodeURIComponent(doctype)}?${qs}`));
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
async function getDoc(doctype,name) {
  const result=await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (result.response.status===404) return null;
  if (!result.response.ok) throw new Error(`GET ${doctype} ${name} failed (${result.response.status}): ${result.text}`);
  return dataOf(result.body);
}
async function createDoc(doctype,doc) { return dataOf(await requireOk(`/api/resource/${encodeURIComponent(doctype)}`,{method:'POST',body:doc})); }
async function updateDoc(doctype,name,doc) { return dataOf(await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,{method:'PUT',body:doc})); }

function apiRule(rule) {
  return {
    doctype:'BOM Rule',
    rule_code:clean(rule.rule_code), rule_name:clean(rule.rule_name), description:clean(rule.description),
    result_kind:clean(rule.result_kind), result_uom:clean(rule.result_uom),
    source_field:clean(rule.source_field), operator:clean(rule.operator)||'COPY', operand:Number(rule.operand??0),
    multiply:Number(rule.multiply??1), divide:Number(rule.divide??1), qty_per_set:Number(rule.qty_per_set??1),
    rounding:clean(rule.rounding)||'NONE', precision:Number(rule.precision??6), formula_json:clean(rule.formula_json),
    formula_display:clean(rule.formula_display), version:Number(rule.version??1), disabled:Number(Boolean(rule.disabled)),
    authority_type:clean(rule.authority_type)||'SOURCE', source_sheet:clean(rule.source_sheet),
    source_row:Number.isFinite(Number(rule.source_row))?Number(rule.source_row):undefined,
    source_formula_text:clean(rule.source_formula_text), source_formula_code:clean(rule.source_formula_code),
    source_note:clean(rule.source_note), confirmed_by:clean(rule.confirmed_by), confirmed_at:clean(rule.confirmed_at)||undefined,
    applicability:(rule.applicability??[]).map((row)=>({
      scope_type:clean(row.scope_type)||'ITEM', parent_item:clean(row.parent_item), parent_item_group:clean(row.parent_item_group),
      door_type:clean(row.door_type), component_item:clean(row.component_item), bom:clean(row.bom), priority:Number(row.priority??0),
      effective_from:clean(row.effective_from)||undefined, effective_to:clean(row.effective_to)||undefined,
      disabled:Number(Boolean(row.disabled)), note:clean(row.note),
    })),
  };
}
function sameRule(expected,actual) {
  if (!actual) return false;
  const pick=(doc)=>({
    rule_code:clean(doc.rule_code), rule_name:clean(doc.rule_name), result_kind:clean(doc.result_kind), result_uom:clean(doc.result_uom),
    source_field:clean(doc.source_field), operator:clean(doc.operator)||'COPY', operand:Number(doc.operand??0), multiply:Number(doc.multiply??1), divide:Number(doc.divide??1),
    qty_per_set:Number(doc.qty_per_set??1), rounding:clean(doc.rounding)||'NONE', precision:Number(doc.precision??6), formula_json:clean(doc.formula_json),
    formula_display:clean(doc.formula_display), version:Number(doc.version??1), disabled:Number(Boolean(doc.disabled)), authority_type:clean(doc.authority_type),
    source_formula_text:clean(doc.source_formula_text), source_note:clean(doc.source_note),
    applicability:(Array.isArray(doc.applicability)?doc.applicability:[]).map((row)=>({scope_type:clean(row.scope_type),parent_item:clean(row.parent_item),parent_item_group:clean(row.parent_item_group),door_type:clean(row.door_type),component_item:clean(row.component_item),bom:clean(row.bom),priority:Number(row.priority??0),effective_from:clean(row.effective_from),effective_to:clean(row.effective_to),disabled:Number(Boolean(row.disabled)),note:clean(row.note)})).sort((a,b)=>stable(a).localeCompare(stable(b),'en')),
  });
  return stable(pick(expected))===stable(pick(actual));
}

await login();
const resultPath=path.resolve(resultArg);
mkdirSync(path.dirname(resultPath),{recursive:true});
const existingRows=await listDocs('BOM Rule',['name','rule_code']);
const existingDocs=[];
for (const row of existingRows) existingDocs.push(await getDoc('BOM Rule',row.name));
const existingByCode=new Map(existingDocs.filter(Boolean).map((doc)=>[clean(doc.rule_code),doc]));
const created=[]; const updated=[]; const unchanged=[];
for (const raw of source.rules) {
  const expected=apiRule(raw);
  const prior=existingByCode.get(expected.rule_code);
  if (sameRule(expected,prior)) { unchanged.push(expected.rule_code); continue; }
  if (prior) { await updateDoc('BOM Rule',prior.name,expected); updated.push(expected.rule_code); }
  else { await createDoc('BOM Rule',expected); created.push(expected.rule_code); }
}

const ruleByCode=new Map(source.rules.map((rule)=>[clean(rule.rule_code),rule]));
const mappingsByParent=new Map();
for (const mapping of source.component_mappings) {
  const parent=clean(mapping.parent_item);
  const list=mappingsByParent.get(parent)??[];
  list.push(mapping); mappingsByParent.set(parent,list);
}
const templateRows=await listDocs('BOM Template',['name','item_code','template_code']);
let templatesUpdated=0; let templateRowsMapped=0;
const templatePending=[];
for (const row of templateRows) {
  const parent=clean(row.item_code);
  const mappings=mappingsByParent.get(parent);
  if (!mappings?.length) continue;
  const doc=await getDoc('BOM Template',row.name);
  if (!doc || !Array.isArray(doc.component_rules)) continue;
  let changed=false;
  const nextRules=doc.component_rules.map((child)=>{
    const sourceRow=Number(child.source_row);
    const match=mappings.find((mapping)=>Number.isFinite(sourceRow)&&Number(mapping.source_row)===sourceRow)
      ?? mappings.find((mapping)=>clean(mapping.component_item)===clean(child.item_code) && (!clean(mapping.component_key)||clean(mapping.component_key)===clean(child.component_key)));
    if (!match) return child;
    const master=ruleByCode.get(clean(match.rule_code));
    if (!master) return child;
    templateRowsMapped+=1;
    if (clean(child.bom_rule)===clean(match.rule_code) && Number(child.bom_rule_version??0)===Number(master.version??1)) return child;
    changed=true;
    return {...child,bom_rule:clean(match.rule_code),bom_rule_version:Number(master.version??1),bom_rule_formula_snapshot:JSON.stringify({rule_code:master.rule_code,version:master.version??1,formula_json:master.formula_json,result_uom:master.result_uom,qty_per_set:master.qty_per_set??1,authority_type:master.authority_type,source_formula_text:master.source_formula_text})};
  });
  if (changed) {
    await updateDoc('BOM Template',doc.name,{component_rules:nextRules});
    templatesUpdated+=1;
  }
}

// Draft static BOMs also retain the reusable rule link/snapshot. Submitted historical BOMs are
// intentionally immutable; they keep their old quantity snapshot and are reported for follow-up.
const bomRows=await listDocs('Bill of Materials',['name','item','docstatus']);
let bomsUpdated=0; let bomRowsMapped=0;
for (const row of bomRows) {
  const mappings=mappingsByParent.get(clean(row.item));
  if (!mappings?.length) continue;
  const doc=await getDoc('Bill of Materials',row.name);
  if (!doc || !Array.isArray(doc.items)) continue;
  if (Number(doc.docstatus??row.docstatus??0)!==0) {
    templatePending.push({bom:doc.name,parent_item:doc.item,reason:'submitted_bom_kept_as_historical_snapshot'});
    continue;
  }
  let changed=false;
  const nextItems=doc.items.map((child)=>{
    const sourceRow=Number(child.source_row);
    const match=mappings.find((mapping)=>Number.isFinite(sourceRow)&&Number(mapping.source_row)===sourceRow)
      ?? mappings.find((mapping)=>clean(mapping.component_item)===clean(child.item_code));
    if (!match) return child;
    const master=ruleByCode.get(clean(match.rule_code));
    if (!master) return child;
    bomRowsMapped+=1;
    const snapshot=JSON.stringify({rule_code:master.rule_code,version:master.version??1,formula_json:master.formula_json,result_uom:master.result_uom,qty_per_set:master.qty_per_set??1,authority_type:master.authority_type,source_formula_text:master.source_formula_text});
    if (clean(child.bom_rule)===clean(match.rule_code) && clean(child.bom_rule_formula_snapshot)===snapshot) return child;
    changed=true;
    return {...child,bom_rule:clean(match.rule_code),bom_rule_version:Number(master.version??1),bom_rule_formula_snapshot:snapshot};
  });
  if (changed) { await updateDoc('Bill of Materials',doc.name,{items:nextItems}); bomsUpdated+=1; }
}

const verifyRows=await listDocs('BOM Rule',['name','rule_code']);
const verifyDocs=[];
for (const row of verifyRows) if (source.rules.some((rule)=>clean(rule.rule_code)===clean(row.rule_code))) verifyDocs.push(await getDoc('BOM Rule',row.name));
const failures=[];
for (const raw of source.rules) {
  const expected=apiRule(raw);
  const matches=verifyDocs.filter((doc)=>doc&&clean(doc.rule_code)===expected.rule_code&&sameRule(expected,doc));
  if (matches.length!==1) failures.push({rule_code:expected.rule_code,match_count:matches.length});
}
const result={
  format:'alumdoor-bom-rule-local-import-result/v1', payload:payloadPath,
  created_count:created.length, updated_count:updated.length, unchanged_count:unchanged.length,
  verification_failure_count:failures.length, rule_count:source.rules.length,
  applicability_count:source.rules.reduce((n,r)=>n+r.applicability.length,0),
  component_mapping_count:source.component_mappings.length, template_rows_mapped:templateRowsMapped,
  templates_updated:templatesUpdated, bom_rows_mapped:bomRowsMapped, boms_updated:bomsUpdated,
  historical_bom_pending_count:templatePending.length, historical_bom_pending:templatePending,
  created,updated,unchanged,failures,
};
writeFileSync(resultPath,`${JSON.stringify(result,null,2)}\n`);
if (failures.length) throw new Error(`ALUMDOOR_BOM_RULE_VERIFY_FAILED count=${failures.length}`);
console.log(`ALUMDOOR_BOM_RULE_IMPORT_PASS created=${created.length} updated=${updated.length} unchanged=${unchanged.length} rules=${source.rules.length} template_rows=${templateRowsMapped} bom_rows=${bomRowsMapped} historical_pending=${templatePending.length}`);
