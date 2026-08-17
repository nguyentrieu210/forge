#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const [itemArg,bomArg,lotArg]=process.argv.slice(2);
if(!itemArg||!bomArg||!lotArg)throw new Error("Usage: audit-alumdoor-real-d1-local.mjs <items.json> <boms.json> <lots.json>");
const itemPayload=JSON.parse(readFileSync(path.resolve(itemArg),"utf8"));
const bomPayload=JSON.parse(readFileSync(path.resolve(bomArg),"utf8"));
const lotPayload=JSON.parse(readFileSync(path.resolve(lotArg),"utf8"));
if(itemPayload?.format!=="alumdoor-item-master-payload/v2"||!Array.isArray(itemPayload.items)||!itemPayload.items.length)throw new Error("Invalid/empty Item payload");
if(bomPayload?.format!=="alumdoor-real-bom-payload/v1"||!Array.isArray(bomPayload.boms)||!bomPayload.boms.length)throw new Error("Invalid/empty BOM payload");
if(lotPayload?.format!=="alumdoor-real-aluminium-lot-payload/v1"||!Array.isArray(lotPayload.lots)||!lotPayload.lots.length)throw new Error("Invalid/empty lot payload");

const origin=(process.env.FORGE_ORIGIN??"http://127.0.0.1:8799").replace(/\/$/,"");
const user=process.env.FORGE_ADMIN_USER??"",password=process.env.FORGE_ADMIN_PASSWORD??"";
if(!user||!password)throw new Error("Admin credentials required");
if(!["127.0.0.1","localhost","::1"].includes(new URL(origin).hostname))throw new Error("real D1 audit is local-only");
const cookies=new Map();let csrf="";
function remember(response){const raw=response.headers.get("set-cookie");if(!raw)return;for(const part of raw.split(/,(?=[^;,]+=)/)){const pair=part.split(";",1)[0],i=pair.indexOf("=");if(i>0)cookies.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());}}
async function request(p,o={}){const headers=new Headers(o.headers??{});if(cookies.size)headers.set("cookie",[...cookies].map(([k,v])=>`${k}=${v}`).join("; "));if(csrf&&o.method&&o.method!=="GET")headers.set("x-frappe-csrf-token",csrf);if(o.body!==undefined)headers.set("content-type","application/json");const response=await fetch(`${origin}${p}`,{...o,headers,body:o.body===undefined?undefined:JSON.stringify(o.body)});remember(response);const text=await response.text();let body;try{body=text?JSON.parse(text):null}catch{body=text}return{response,body,text};}
async function ok(p,o={}){const x=await request(p,o);if(!x.response.ok)throw new Error(`${o.method??"GET"} ${p} ${x.response.status}: ${x.text}`);return x.body;}
await ok("/api/method/login",{method:"POST",body:{usr:user,pwd:password}});const boot=await ok("/api/method/metaforge.api.get_boot");csrf=boot?.message?.csrf_token??boot?.csrf_token??"";
async function getDoc(doctype,name){const x=await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);if(x.response.status===404)return null;if(!x.response.ok)throw new Error(`GET ${doctype} ${name}: ${x.text}`);return x.body?.data??x.body?.message??x.body;}
async function listDocs(doctype,fields,limit=5000){const q=new URLSearchParams({fields:JSON.stringify(fields),limit_page_length:String(limit)});const body=await ok(`/api/resource/${encodeURIComponent(doctype)}?${q.toString()}`);return body?.data??body?.message??[];}
const clean=(v)=>String(v??"").trim();
const number=(v)=>Number(v??0);
const bool=(v)=>Number(Boolean(Number(v)||v===true));
const normConversions=(rows)=>(Array.isArray(rows)?rows:[]).map((r)=>({uom:clean(r?.uom),conversion_factor:Number(r?.conversion_factor)})).filter((r)=>r.uom&&Number.isFinite(r.conversion_factor)&&r.conversion_factor>0).sort((a,b)=>a.uom.localeCompare(b.uom,"vi"));
const itemChecks=["is_stock_item","is_purchase_item","is_sales_item","include_item_in_manufacturing","disabled"];
const itemScalars=["item_code","item_name","item_group","item_nature","material_stage","supply_type","is_stock_item","is_purchase_item","is_sales_item","include_item_in_manufacturing","stock_uom","default_purchase_uom","default_sales_uom","measurement_profile","disabled"];
function itemSnap(doc){const out={};for(const f of itemScalars)out[f]=itemChecks.includes(f)?bool(doc?.[f]):clean(doc?.[f]);out.uom_conversions=normConversions(doc?.uom_conversions);return out;}
const failures=[];
for(const expected of itemPayload.items){const actual=await getDoc("Item",expected.item_code);if(!actual){failures.push({layer:"Item",key:expected.item_code,reason:"missing"});continue;}const e=itemSnap(expected),a=itemSnap(actual);if(JSON.stringify(e)!==JSON.stringify(a))failures.push({layer:"Item",key:expected.item_code,reason:"managed_mismatch",expected:e,actual:a});}
if(failures.length)throw new Error(`ALUMDOOR_REAL_D1_ITEM_AUDIT_FAILED count=${failures.length} sample=${JSON.stringify(failures.slice(0,10))}`);
console.log(`ALUMDOOR_REAL_ITEM_PASS items=${itemPayload.items.length}`);

const bomList=await listDocs("Bill of Materials",["name","item","bom_fingerprint","bom_template_code"],5000);
const byFingerprint=new Map();for(const row of bomList){const fp=clean(row.bom_fingerprint);if(!fp)continue;const list=byFingerprint.get(fp)??[];list.push(row);byFingerprint.set(fp,list);}
let childCount=0;const bomFailures=[];
function childSnap(row){return {item_code:clean(row?.item_code),qty:number(row?.qty),uom:clean(row?.uom),qty_basis:clean(row?.qty_basis),source_note:clean(row?.source_note),note:clean(row?.note)};}
for(const expected of bomPayload.boms){const candidates=byFingerprint.get(clean(expected.bom_fingerprint))??[];if(candidates.length!==1){bomFailures.push({fingerprint:expected.bom_fingerprint,reason:"fingerprint_count",count:candidates.length});continue;}const actual=await getDoc("Bill of Materials",candidates[0].name);if(!actual){bomFailures.push({fingerprint:expected.bom_fingerprint,reason:"missing_doc"});continue;}if(clean(actual.item)!==clean(expected.item)||clean(actual.bom_template_code)!==clean(expected.bom_template_code)){bomFailures.push({fingerprint:expected.bom_fingerprint,reason:"parent_mismatch",actual_item:actual.item,expected_item:expected.item});continue;}const eChildren=(expected.items??[]).map(childSnap),aChildren=(actual.items??[]).map(childSnap);childCount+=aChildren.length;if(JSON.stringify(eChildren)!==JSON.stringify(aChildren))bomFailures.push({fingerprint:expected.bom_fingerprint,reason:"children_mismatch",expected:eChildren.slice(0,8),actual:aChildren.slice(0,8)});}
if(bomFailures.length)throw new Error(`ALUMDOOR_REAL_D1_BOM_AUDIT_FAILED count=${bomFailures.length} sample=${JSON.stringify(bomFailures.slice(0,10))}`);
const expectedChildCount=bomPayload.boms.reduce((n,b)=>n+(b.items?.length??0),0);if(childCount!==expectedChildCount)throw new Error(`BOM child count mismatch expected=${expectedChildCount} actual=${childCount}`);
console.log(`ALUMDOOR_REAL_BOM_PASS boms=${bomPayload.boms.length} children=${childCount}`);

const lotFields=["source_key","item","profile","source_file","source_sheet","source_row","item_mapping_origin","item_mapping_reason","item_mapping_evidence","entry_date","lot_type","color_code","condition","length_m","piece_count","reentry_date","stock_status","selected_for_cut","scrap_or_remnant","total_kg","source_action","source_note","source_snapshot","is_active"];
const lotNumeric=new Set(["source_row","length_m","piece_count","selected_for_cut","total_kg","is_active"]);
function lotSnap(doc){const out={};for(const f of lotFields)out[f]=lotNumeric.has(f)?number(doc?.[f]):clean(doc?.[f]);return out;}
const lotFailures=[];const actualLots=[];
for(const expected of lotPayload.lots){const actual=await getDoc("Aluminium Lot",expected.source_key);if(!actual){lotFailures.push({source_key:expected.source_key,reason:"missing"});continue;}actualLots.push(actual);const e=lotSnap(expected),a=lotSnap(actual);if(JSON.stringify(e)!==JSON.stringify(a))lotFailures.push({source_key:expected.source_key,reason:"managed_mismatch",expected:e,actual:a});}
if(lotFailures.length)throw new Error(`ALUMDOOR_REAL_D1_LOT_AUDIT_FAILED count=${lotFailures.length} sample=${JSON.stringify(lotFailures.slice(0,10))}`);
const listedLots=await listDocs("Aluminium Lot",["name","source_key","item","source_sheet","source_row"],5000);const listedKeys=listedLots.map((r)=>clean(r.source_key));if(new Set(listedKeys).size!==listedKeys.length)throw new Error("Duplicate Aluminium Lot source_key in D1");const payloadKeys=new Set(lotPayload.lots.map((r)=>clean(r.source_key)));const unexpectedLots=listedLots.filter((r)=>!payloadKeys.has(clean(r.source_key)));if(unexpectedLots.length)throw new Error(`Unexpected Aluminium Lot rows not present in canonical payload count=${unexpectedLots.length} sample=${JSON.stringify(unexpectedLots.slice(0,10))}`);
function aggregate(rows){const map=new Map();for(const row of rows){const key=[clean(row.source_sheet),clean(row.profile),clean(row.color_code),clean(row.condition)].join("\u001f");const a=map.get(key)??{rows:0,pieces:0,kg:0,length_sum:0};a.rows+=1;a.pieces+=number(row.piece_count);a.kg+=number(row.total_kg);a.length_sum+=number(row.length_m);map.set(key,a);}return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],"vi"));}
const expectedAgg=aggregate(lotPayload.lots),actualAgg=aggregate(actualLots);if(JSON.stringify(expectedAgg)!==JSON.stringify(actualAgg))throw new Error("Aluminium Lot aggregate mismatch by sheet/profile/color/condition");
const lotItemCodes=new Set(lotPayload.lots.map((r)=>clean(r.item)));for(const code of lotItemCodes){if(!await getDoc("Item",code))throw new Error(`Orphan Aluminium Lot Item link: ${code}`);}
console.log(`ALUMDOOR_REAL_ALUMINIUM_LOT_PASS lots=${lotPayload.lots.length} aggregates=${expectedAgg.length}`);
console.log(`ALUMDOOR_REAL_D1_AUDIT_PASS items=${itemPayload.items.length} boms=${bomPayload.boms.length} bom_children=${expectedChildCount} lots=${lotPayload.lots.length}`);
