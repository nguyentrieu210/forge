#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
const positional = args.filter((a) => a !== "--validate-only");
const [payloadArg, preimageArg] = positional;
if (!payloadArg || (!validateOnly && !preimageArg)) throw new Error("Usage: import-alumdoor-real-bom-local.mjs <payload.json> <preimage.json> [--validate-only]");
const payload = JSON.parse(readFileSync(path.resolve(payloadArg), "utf8"));
if (payload?.format !== "alumdoor-real-bom-payload/v1" || !Array.isArray(payload.boms)) throw new Error("Invalid real BOM payload");
if (Number(payload.bom_count) !== payload.boms.length || payload.boms.length === 0) throw new Error("BOM count mismatch/empty");
const fingerprints = payload.boms.map((b) => String(b.bom_fingerprint ?? "").trim());
if (fingerprints.some((x) => !x) || new Set(fingerprints).size !== fingerprints.length) throw new Error("BOM fingerprint missing/duplicate");
for (const bom of payload.boms) {
  if (!bom.item || !Array.isArray(bom.items) || bom.items.length === 0) throw new Error(`Invalid BOM ${bom.source_index}`);
  for (const row of bom.items) if (!row.item_code || !Number.isFinite(Number(row.qty))) throw new Error(`Invalid BOM child STT ${bom.source_index}`);
}
console.log(`ALUMDOOR_REAL_BOM_IMPORT_PAYLOAD_VALID boms=${payload.boms.length}`);
if (validateOnly) { console.log("ALUMDOOR_REAL_BOM_IMPORT_VALIDATE_ONLY_PASS"); process.exit(0); }

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const user = process.env.FORGE_ADMIN_USER ?? "";
const password = process.env.FORGE_ADMIN_PASSWORD ?? "";
if (!user || !password) throw new Error("Admin credentials required");
if (!["127.0.0.1","localhost","::1"].includes(new URL(origin).hostname)) throw new Error("BOM import is local-only");
const cookies = new Map(); let csrf = "";
function remember(r){ const raw=r.headers.get("set-cookie"); if(!raw)return; for(const p of raw.split(/,(?=[^;,]+=)/)){const pair=p.split(";",1)[0],i=pair.indexOf("=");if(i>0)cookies.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());}}
async function req(p,o={}){const h=new Headers(o.headers??{});if(cookies.size)h.set("cookie",[...cookies].map(([k,v])=>`${k}=${v}`).join("; "));if(csrf&&o.method&&o.method!=="GET")h.set("x-frappe-csrf-token",csrf);if(o.body!==undefined)h.set("content-type","application/json");const r=await fetch(`${origin}${p}`,{...o,headers:h,body:o.body===undefined?undefined:JSON.stringify(o.body)});remember(r);const t=await r.text();let b;try{b=t?JSON.parse(t):null}catch{b=t}return{r,b,t};}
async function ok(p,o={}){const x=await req(p,o);if(!x.r.ok)throw new Error(`${o.method??"GET"} ${p} ${x.r.status}: ${x.t}`);return x.b;}
await ok("/api/method/login",{method:"POST",body:{usr:user,pwd:password}});const boot=await ok("/api/method/metaforge.api.get_boot");csrf=boot?.message?.csrf_token??boot?.csrf_token??"";
async function getItem(code){const x=await req(`/api/resource/Item/${encodeURIComponent(code)}`);if(x.r.status===404)return null;if(!x.r.ok)throw new Error(`GET Item ${code}: ${x.t}`);return x.b?.data??x.b?.message??x.b;}
async function getBom(name){const x=await req(`/api/resource/Bill%20of%20Materials/${encodeURIComponent(name)}`);if(x.r.status===404)return null;if(!x.r.ok)throw new Error(`GET BOM ${name}: ${x.t}`);return x.b?.data??x.b?.message??x.b;}
const list = await ok(`/api/resource/Bill%20of%20Materials?fields=${encodeURIComponent(JSON.stringify(["name","item","bom_fingerprint"]))}&limit_page_length=2000`);
const existingRows = list?.data ?? list?.message ?? [];
const byFingerprint = new Map(existingRows.filter((r)=>r.bom_fingerprint).map((r)=>[String(r.bom_fingerprint),r]));

// Preflight all Item links before first BOM mutation.
const codes = new Set(); for(const bom of payload.boms){codes.add(bom.item);for(const row of bom.items)codes.add(row.item_code);}
const missingItems=[];for(const code of codes){if(!await getItem(code))missingItems.push(code);}if(missingItems.length)throw new Error(`BOM Item links missing before mutation: ${missingItems.slice(0,20).join(", ")} total=${missingItems.length}`);
const pre=[];const missing=[];const exact=[];const conflicts=[];
function managed(doc){return {item:String(doc?.item??""),company:String(doc?.company??""),quantity:Number(doc?.quantity),is_active:Number(Boolean(Number(doc?.is_active)||doc?.is_active===true)),bom_fingerprint:String(doc?.bom_fingerprint??""),bom_template_code:String(doc?.bom_template_code??""),items:(doc?.items??[]).map((r)=>({item_code:String(r.item_code??""),qty:Number(r.qty),uom:String(r.uom??""),qty_basis:String(r.qty_basis??""),source_note:String(r.source_note??""),note:String(r.note??"")}))};}
for(const bom of payload.boms){const row=byFingerprint.get(bom.bom_fingerprint);if(!row){missing.push(bom);pre.push({fingerprint:bom.bom_fingerprint,existed:false});continue;}const doc=await getBom(row.name);pre.push({fingerprint:bom.bom_fingerprint,existed:true,name:row.name,doc});if(JSON.stringify(managed(doc))===JSON.stringify(managed(bom)))exact.push(row.name);else conflicts.push({name:row.name,fingerprint:bom.bom_fingerprint,expected:managed(bom),actual:managed(doc)});}
if(conflicts.length)throw new Error(`ALUMDOOR_REAL_BOM_IMPORT_CONFLICT count=${conflicts.length}`);
const preimage=path.resolve(preimageArg);mkdirSync(path.dirname(preimage),{recursive:true});writeFileSync(preimage,`${JSON.stringify({format:"alumdoor-real-bom-preimage/v1",created_at:new Date().toISOString(),existing:exact.length,missing:missing.length,records:pre},null,2)}\n`);
const created=[];for(const bom of missing){const body=await ok("/api/resource/Bill%20of%20Materials",{method:"POST",body:bom});const doc=body?.data??body?.message??body;created.push(doc?.name??bom.bom_fingerprint);}
const after=await ok(`/api/resource/Bill%20of%20Materials?fields=${encodeURIComponent(JSON.stringify(["name","bom_fingerprint"]))}&limit_page_length=2000`);const afterRows=after?.data??after?.message??[];const afterMap=new Map(afterRows.filter((r)=>r.bom_fingerprint).map((r)=>[String(r.bom_fingerprint),r.name]));const failures=[];for(const bom of payload.boms){const name=afterMap.get(bom.bom_fingerprint);if(!name){failures.push({fingerprint:bom.bom_fingerprint,reason:"missing"});continue;}const doc=await getBom(name);if(JSON.stringify(managed(doc))!==JSON.stringify(managed(bom)))failures.push({name,fingerprint:bom.bom_fingerprint,reason:"mismatch"});}
if(failures.length)throw new Error(`ALUMDOOR_REAL_BOM_IMPORT_VERIFY_FAILED count=${failures.length}`);
console.log(`ALUMDOOR_REAL_BOM_IMPORT_PASS created=${created.length} existing=${exact.length} total=${payload.boms.length}`);
