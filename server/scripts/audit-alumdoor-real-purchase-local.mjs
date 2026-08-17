#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { APPROVED_PURCHASE_SUPPLIERS, extractRealPurchaseRows, PURCHASE_SOURCE } from "./lib/alumdoor-real-purchase-source.mjs";

const clean = (value) => String(value ?? "").normalize("NFC").trim();
const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? "";
if (!adminUser || !adminPassword) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required");
const parsedOrigin = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedOrigin.hostname)) throw new Error(`refusing non-local origin: ${parsedOrigin.hostname}`);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const outputPath = resolve(process.argv[2] || resolve(repoRoot, "local-imports", "alumdoor-real-purchase-local-audit.json"));
const rows = extractRealPurchaseRows(await readFile(resolve(repoRoot, PURCHASE_SOURCE), "utf8"));

const cookies = new Map(); let csrfToken = "";
function rememberCookies(response) { const value = response.headers.get("set-cookie"); if (!value) return; for (const part of value.split(/,(?=[^;,]+=)/)) { const pair = part.split(";",1)[0]; const i = pair.indexOf("="); if (i > 0) cookies.set(pair.slice(0,i).trim(),pair.slice(i+1).trim()); } }
function cookieHeader(){ return [...cookies.entries()].map(([k,v])=>`${k}=${v}`).join("; "); }
async function request(path, options={}) { const headers=new Headers(options.headers??{}); if(cookieHeader())headers.set("cookie",cookieHeader()); if(csrfToken&&options.method&&options.method!=="GET")headers.set("x-frappe-csrf-token",csrfToken); if(options.body!==undefined&&!headers.has("content-type"))headers.set("content-type","application/json"); const response=await fetch(`${origin}${path}`,{...options,headers,body:options.body===undefined||typeof options.body==="string"?options.body:JSON.stringify(options.body),redirect:"manual"}); rememberCookies(response); csrfToken=response.headers.get("x-frappe-csrf-token")??csrfToken; const text=await response.text(); let body=null; try{body=text?JSON.parse(text):null}catch{body=text} return{response,body,text}; }
async function ok(path,options={}){const r=await request(path,options);if(!r.response.ok)throw new Error(`${options.method??"GET"} ${path} failed (${r.response.status}): ${r.text}`);return r.body;}
async function login(){await ok("/api/method/login",{method:"POST",body:{usr:adminUser,pwd:adminPassword}});const boot=await ok("/api/method/metaforge.api.get_boot");const msg=boot&&typeof boot==="object"&&"message" in boot?boot.message:boot;csrfToken=msg?.csrf_token??csrfToken;}
async function listNames(doctype,limit=500){const q=new URLSearchParams({fields:JSON.stringify(["name"]),limit_page_length:String(limit)});const b=await ok(`/api/resource/${encodeURIComponent(doctype)}?${q}`);return(b?.data??b?.message??[]).map(r=>clean(r.name)).filter(Boolean);}
async function getDoc(doctype,name){const r=await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);if(r.response.status===404)return null;if(!r.response.ok)throw new Error(`GET ${doctype} ${name} failed (${r.response.status}): ${r.text}`);return r.body?.data??r.body?.message??r.body;}
function schemaSnapshot(doc){return{name:clean(doc?.name),fields:(Array.isArray(doc?.fields)?doc.fields:[]).map(f=>({fieldname:clean(f?.fieldname),label:clean(f?.label),fieldtype:clean(f?.fieldtype),options:clean(f?.options),reqd:Boolean(Number(f?.reqd)||f?.reqd===true),default:f?.default??null})).filter(f=>f.fieldname)};}

await login();
const companies=[];for(const name of await listNames("Company",50)){const d=await getDoc("Company",name);if(d)companies.push({name:clean(d.name),default_currency:clean(d.default_currency),disabled:d.disabled});}
const warehouses=[];for(const name of await listNames("Warehouse",200)){const d=await getDoc("Warehouse",name);if(d)warehouses.push({name:clean(d.name),warehouse_name:clean(d.warehouse_name),parent_warehouse:clean(d.parent_warehouse),company:clean(d.company),is_group:d.is_group,disabled:d.disabled});}
const allSuppliers=[];for(const name of await listNames("Supplier",500)){const d=await getDoc("Supplier",name);if(d)allSuppliers.push({name:clean(d.name),supplier_name:clean(d.supplier_name),supplier_group:clean(d.supplier_group),supplier_type:clean(d.supplier_type),disabled:d.disabled});}
const suppliers=Object.keys(APPROVED_PURCHASE_SUPPLIERS).map(source_supplier=>({source_supplier,matches:allSuppliers.filter(d=>d.supplier_name===source_supplier||d.name===source_supplier)}));
const sourceCodes=[...new Set(rows.filter(r=>!r.excluded).map(r=>clean(r.canonical_item_code)).filter(Boolean))];
const items=[];for(const itemCode of sourceCodes){const d=await getDoc("Item",itemCode);items.push({item_code:itemCode,exists:Boolean(d),doc:d?{name:clean(d.name),item_code:clean(d.item_code),item_name:clean(d.item_name),stock_uom:clean(d.stock_uom),default_purchase_uom:clean(d.default_purchase_uom),purchase_uom:clean(d.purchase_uom),inventory_mode:clean(d.inventory_mode),disabled:d.disabled,is_purchase_item:d.is_purchase_item,uom_conversions:Array.isArray(d.uom_conversions)?d.uom_conversions.map(e=>({uom:clean(e?.uom),conversion_factor:Number(e?.conversion_factor)})):[]}:null});}
const schema={};for(const doctype of ["Supplier","Warehouse","Purchase Receipt","Purchase Receipt Item"]){const d=await getDoc("DocType",doctype);schema[doctype]=d?schemaSnapshot(d):null;}
const purchaseReceipts=[];for(const name of await listNames("Purchase Receipt",200)){const d=await getDoc("Purchase Receipt",name);if(!d)continue;const marker=d._alumdoor_real_purchase??{};purchaseReceipts.push({name:clean(d.name),supplier:clean(d.supplier),company:clean(d.company),currency:clean(d.currency),posting_at:clean(d.posting_at||d.posting_date),supplier_invoice_no:clean(d.supplier_invoice_no),docstatus:Number(d.docstatus??0),modified:clean(d.modified||d.modified_at),item_warehouses:[...new Set((Array.isArray(d.items)?d.items:[]).map(i=>clean(i?.warehouse)).filter(Boolean))],item_count:Array.isArray(d.items)?d.items.length:0,item_signature:(Array.isArray(d.items)?d.items:[]).map(i=>[clean(i?.item_code),Number(i?.qty),clean(i?.uom),Number(i?.rate??0)]),import_marker:{format:clean(marker.format),mode:clean(marker.mode),import_fingerprint:clean(marker.import_fingerprint),source_rows:Array.isArray(marker.source_rows)?marker.source_rows:[],submit_forbidden:marker.submit_forbidden===true}});}
const report={format:"alumdoor-real-purchase-local-audit/v4",origin,purchase_rows:rows.length,companies,warehouses,suppliers,items,schema,purchase_receipts:purchaseReceipts};
await writeFile(outputPath,`${JSON.stringify(report,null,2)}\n`,"utf8");
console.log(`ALUMDOOR_REAL_PURCHASE_LOCAL_AUDIT ${JSON.stringify({companies,warehouses,suppliers:suppliers.map(r=>({source_supplier:r.source_supplier,match_count:r.matches.length})),items:items.map(r=>({item_code:r.item_code,exists:r.exists,stock_uom:r.doc?.stock_uom,purchase_uom:r.doc?.default_purchase_uom||r.doc?.purchase_uom})),historical_receipts:purchaseReceipts.filter(r=>r.import_marker.format==="alumdoor-real-purchase-history/v1"),output:outputPath})}`);
console.log("ALUMDOOR_REAL_PURCHASE_LOCAL_AUDIT_PASS");