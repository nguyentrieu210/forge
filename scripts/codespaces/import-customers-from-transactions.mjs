#!/usr/bin/env node
/**
 * Codespace-only Customer import from the repository's transaction workbook.
 *
 * The committed customer-export.xlsx intentionally contains structure/metadata only.
 * The source-data policy ranks actual order/export transactions above prior imports,
 * so this importer reconstructs the usable Customer master from don-hang-xuat-hang.xlsx.
 * It never prints customer names because this public repo has public Actions logs.
 */
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const args=process.argv.slice(2);
const apply=args.includes('--apply');
const positional=args.filter((x)=>x!=='--apply');
const [evidenceArg]=positional;
if(!evidenceArg)throw new Error('Usage: node scripts/codespaces/import-customers-from-transactions.mjs <evidence.json> [--apply]');
const repoRoot=path.resolve(import.meta.dirname,'../..');
const txPath=path.join(repoRoot,'data','don-hang-xuat-hang.xlsx');
if(!existsSync(txPath))throw new Error(`Missing transaction workbook: ${txPath}`);

const origin=(process.env.FORGE_ORIGIN??'http://127.0.0.1:8799').replace(/\/$/,'');
const parsed=new URL(origin);
if(!['127.0.0.1','localhost','::1'].includes(parsed.hostname))throw new Error(`CODESPACE_CUSTOMER_REMOTE_FORBIDDEN origin=${origin}`);
if(args.some((x)=>x.includes('--remote')))throw new Error('CODESPACE_CUSTOMER_REMOTE_FORBIDDEN flag=--remote');
const user=process.env.FORGE_ADMIN_USER??'';
const password=process.env.FORGE_ADMIN_PASSWORD??'';
if(!user||!password)throw new Error('FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required');

const stores=[path.join(repoRoot,'client','node_modules','.pnpm'),path.join(repoRoot,'node_modules','.pnpm')];
const store=stores.find(existsSync);if(!store)throw new Error('pnpm dependency store not found');
const xlsxFile=readdirSync(store).filter((n)=>n.startsWith('xlsx@')).sort().reverse().map((n)=>path.join(store,n,'node_modules','xlsx','xlsx.mjs')).find(existsSync);
if(!xlsxFile)throw new Error('xlsx dependency not found');
const XLSX=await import(pathToFileURL(xlsxFile).href);
const book=XLSX.read(readFileSync(txPath),{type:'buffer',cellFormula:false,cellText:true,cellDates:false});
const rows=(sheet)=>XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,blankrows:false,defval:'',raw:false});
const clean=(v)=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
const key=(v)=>clean(v).normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g,' ').trim();
const identity=(v)=>key(v).replace(/\s*(?:\+?84|0)[\d\s().-]{7,}$/u,'').replace(/\s+/g,' ').trim();
const sha256=(file)=>crypto.createHash('sha256').update(readFileSync(file)).digest('hex');

const records=new Map();
const unresolvedConflicts=[];
let resolvedRetailOverrides=0;
let explicitRows=0, monthlyRows=0, excludedSuppliers=0, excludedUngrouped=0;
function upsert(id,name,group,source){
  if(!id||!name)return;
  let rec=records.get(id);
  if(!rec){rec={name,group:'',monthly:false,sources:[]};records.set(id,rec);}
  if(group&&rec.group&&rec.group!==group){
    const pair=new Set([rec.group,group]);
    // DS KH-NCC contains one duplicate identity typed once as generic KH and once
    // as the more specific KH LẺ. Preserve the specific retail classification;
    // all other disagreements remain hard blockers. Evidence records source rows,
    // never the customer name, because Actions logs are public.
    if(pair.size===2&&pair.has('Đại lý')&&pair.has('Lẻ')){
      rec.group='Lẻ';
      resolvedRetailOverrides++;
      rec.sources.push(`resolved-retail:${source}`);
      return;
    }
    unresolvedConflicts.push({group_a:rec.group,group_b:group,source});
    return;
  }
  if(group&&!rec.group)rec.group=group;
  if(source.startsWith('month:'))rec.monthly=true;
  rec.sources.push(source);
}

if(book.Sheets['DS KH-NCC']){
  const m=rows('DS KH-NCC');
  for(let i=2;i<m.length;i++){
    const name=clean(m[i]?.[0]),id=identity(name),t=key(m[i]?.[2]);
    if(!id)continue;
    if(t.includes('ncc')){excludedSuppliers++;continue;}
    explicitRows++;
    const group=t==='kh'||t==='dai ly'||t==='khach hang'?'Đại lý':(t.includes('kh le')||t.includes('khach le')?'Lẻ':'');
    upsert(id,name,group,`master:${i+1}`);
  }
}
for(const sheet of book.SheetNames.filter((n)=>/^T\d{1,2}\.20\d{2}$/i.test(n))){
  const m=rows(sheet);if(!m.length)continue;
  const h=m[0].map(key),ci=h.findIndex((x)=>x==='dai ly'||x==='khach hang');if(ci<0)continue;
  for(let i=1;i<m.length;i++){
    const name=clean(m[i]?.[ci]),id=identity(name);if(!id)continue;
    monthlyRows++;
    upsert(id,name,'',`month:${sheet}:${i+1}`);
    const rec=records.get(id);if(rec&&!rec.group)rec.group='Đại lý';
  }
}
if(unresolvedConflicts.length)throw new Error(`CODESPACE_CUSTOMER_CLASSIFICATION_CONFLICT count=${unresolvedConflicts.length}`);

const payload=[];
for(const [id,rec] of records){
  if(!rec.group){excludedUngrouped++;continue;}
  payload.push({row_number:payload.length+1,values:{customer_name:rec.name,price_group:rec.group},_identity:id,_monthly:rec.monthly});
}
payload.sort((a,b)=>a._identity.localeCompare(b._identity,'vi'));
payload.forEach((row,i)=>{row.row_number=i+1;});
if(payload.length<300)throw new Error(`CODESPACE_CUSTOMER_AUTHORITY_TOO_SMALL count=${payload.length}`);
const apiRows=payload.map(({row_number,values})=>({row_number,values}));

const cookies=new Map();let csrf='';
async function req(url,opts={}){
  const headers=new Headers(opts.headers??{});const cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');if(cookie)headers.set('cookie',cookie);if(csrf&&opts.method&&opts.method!=='GET')headers.set('x-frappe-csrf-token',csrf);if(opts.body!==undefined)headers.set('content-type','application/json');
  const r=await fetch(`${origin}${url}`,{...opts,headers,body:opts.body===undefined?undefined:JSON.stringify(opts.body),redirect:'manual'});const sc=r.headers.get('set-cookie');if(sc)for(const part of sc.split(/,(?=[^;,]+=)/)){const p=part.split(';',1)[0],j=p.indexOf('=');if(j>0)cookies.set(p.slice(0,j).trim(),p.slice(j+1).trim());}csrf=r.headers.get('x-frappe-csrf-token')??csrf;const text=await r.text();let body;try{body=text?JSON.parse(text):null;}catch{body=text;}if(!r.ok)throw new Error(`${opts.method??'GET'} ${url} failed ${r.status}: ${text.slice(0,300)}`);return body;
}
await req('/api/method/login',{method:'POST',body:{usr:user,pwd:password}});const boot=await req('/api/method/metaforge.api.get_boot');csrf=(boot?.message??boot)?.csrf_token??csrf;if(!csrf)throw new Error('Missing CSRF token');
const call=async(method,argsBody)=>(await req(`/api/method/${method}`,{method:'POST',body:{args:argsBody}}))?.message;
const dry=await call('alumdoor.customer_import.dry_run',{rows:apiRows});
const statuses=(dry?.rows??[]).reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{});
const blocked=(dry?.rows??[]).filter((r)=>!['READY_CREATE','DUPLICATE_EXACT'].includes(r.status));
const ready=Number(statuses.READY_CREATE??0), exact=Number(statuses.DUPLICATE_EXACT??0);
const evidencePath=path.resolve(evidenceArg);mkdirSync(path.dirname(evidencePath),{recursive:true});
const evidence={format:'codespace-customer-from-transactions/v1',captured_at:new Date().toISOString(),source:{file:path.basename(txPath),sha256:sha256(txPath),sheets:book.SheetNames.length,explicit_rows:explicitRows,monthly_rows:monthlyRows},canonical_rows:payload.length,groups:{dealer:payload.filter((r)=>r.values.price_group==='Đại lý').length,retail:payload.filter((r)=>r.values.price_group==='Lẻ').length},resolved:{retail_overrides:resolvedRetailOverrides},excluded:{suppliers:excludedSuppliers,ungrouped:excludedUngrouped},preflight:{ready,exact,blocked:blocked.length,statuses},records:payload};
const save=()=>writeFileSync(evidencePath,`${JSON.stringify(evidence,null,2)}\n`,'utf8');save();
console.log(`CODESPACE_CUSTOMER_PREFLIGHT canonical=${payload.length} dealer=${evidence.groups.dealer} retail=${evidence.groups.retail} ready=${ready} exact=${exact} blocked=${blocked.length} resolved_retail=${resolvedRetailOverrides} excluded_ungrouped=${excludedUngrouped}`);
if(blocked.length)throw new Error(`CODESPACE_CUSTOMER_PREFLIGHT_BLOCKED count=${blocked.length}`);
if(!apply){console.log('CODESPACE_CUSTOMER_DRY_RUN_PASS writes=0');process.exit(0);}

let imported=0;
if(ready>0){
  const batchId=`codespace-customer-${sha256(txPath).slice(0,20)}`;
  const commit=await call('alumdoor.customer_import.commit',{rows:apiRows,dry_run_token:dry.dry_run_token,batch_id:batchId});
  imported=Number(commit?.imported??0);
  if(Number(commit?.failed??0)!==0||imported!==ready)throw new Error(`CODESPACE_CUSTOMER_COMMIT_FAILED imported=${imported} ready=${ready} failed=${commit?.failed??0}`);
}
const verify=await call('alumdoor.customer_import.dry_run',{rows:apiRows});
const verifyBad=(verify?.rows??[]).filter((r)=>r.status!=='DUPLICATE_EXACT');
evidence.verify={exact:(verify?.rows??[]).filter((r)=>r.status==='DUPLICATE_EXACT').length,blocked:verifyBad.length,imported};save();
if(verifyBad.length)throw new Error(`CODESPACE_CUSTOMER_VERIFY_FAILED count=${verifyBad.length}`);
console.log(`CODESPACE_CUSTOMER_IMPORT_PASS canonical=${payload.length} imported=${imported} exact=${evidence.verify.exact}`);
