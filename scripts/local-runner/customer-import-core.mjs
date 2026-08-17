#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const EXPECTED_SOURCE_SHA256='09c07304cd4d5fdc231638abd19bbf314d92032942df36f7dee41175730050e5';
const EXPECTED_CANONICAL=369;
const args=process.argv.slice(2);
const apply=args.includes('--apply');
const expectIdempotent=args.includes('--expect-idempotent');
const positional=args.filter((x)=>!['--apply','--expect-idempotent'].includes(x));
const [evidenceArg]=positional;
if(!evidenceArg) throw new Error('Usage: node import-alumdoor-customer-local.mjs <evidence.json> [--apply] [--expect-idempotent]');
const repoRoot=path.resolve(import.meta.dirname,'../..');
const sourcePath=path.join(repoRoot,'data','customer-export.xlsx');
const txPath=path.join(repoRoot,'data','don-hang-xuat-hang.xlsx');
const evidencePath=path.resolve(evidenceArg);
for(const f of [sourcePath,txPath]) if(!existsSync(f)) throw new Error(`Customer source missing: ${f}`);
const sha256=(f)=>crypto.createHash('sha256').update(readFileSync(f)).digest('hex');
const sourceHash=sha256(sourcePath);
if(sourceHash.toLowerCase()!==EXPECTED_SOURCE_SHA256) throw new Error(`Customer source hash mismatch expected=${EXPECTED_SOURCE_SHA256} actual=${sourceHash}`);

const stores=[path.join(repoRoot,'client','node_modules','.pnpm'),path.join(repoRoot,'node_modules','.pnpm')];
const store=stores.find(existsSync); if(!store) throw new Error('pnpm dependency store not found');
const xlsxFile=readdirSync(store).filter((n)=>n.startsWith('xlsx@')).sort().reverse().map((n)=>path.join(store,n,'node_modules','xlsx','xlsx.mjs')).find(existsSync);
if(!xlsxFile) throw new Error('xlsx dependency not found');
const XLSX=await import(pathToFileURL(xlsxFile).href);
const wb=(f)=>XLSX.read(readFileSync(f),{type:'buffer',cellFormula:false,cellText:true,cellDates:false});
const rows=(book,sheet)=>XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,blankrows:false,defval:'',raw:false});
const clean=(v)=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
const key=(v)=>clean(v).normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g,' ').trim();
const identity=(v)=>key(v).replace(/\s*(?:\+?84|0)[\d\s().-]{7,}$/u,'').replace(/\s+/g,' ').trim();
const aliases={customer_name:['customer_name','customer name','ten khach hang','khach hang','ten khach','ten kh','dai ly'],price_group:['price_group','price group','nhom gia','nhom gia ban','phan khuc gia','loai gia']};
function headerMap(r){const m=new Map();for(let i=0;i<r.length;i++){const h=key(r[i]);for(const [field,names] of Object.entries(aliases)) if(!m.has(field)&&names.some((n)=>key(n)===h))m.set(field,i);}return m;}
function findHeader(matrix){let best=null;for(let i=0;i<Math.min(matrix.length,25);i++){const m=headerMap(matrix[i]??[]);const score=m.size+(m.has('customer_name')?20:0)+(m.has('price_group')?10:0);if(!best||score>best.score)best={i,m,score};}if(!best?.m.has('customer_name'))throw new Error('Customer Name column not found');return best;}
function group(v){const x=key(v);if(!x)return'';if(['dai ly','kh','khach hang','dealer'].includes(x))return'Đại lý';if(['le','kh le','khach le','retail'].includes(x))return'Lẻ';return null;}

const sourceBook=wb(sourcePath), sheet=sourceBook.SheetNames[0]; if(!sheet)throw new Error('Customer source has no sheet');
const matrix=rows(sourceBook,sheet), header=findHeader(matrix), records=new Map(), blockers=[];
let rawCandidates=0;
for(let i=header.i+1;i<matrix.length;i++){const r=matrix[i]??[],name=clean(r[header.m.get('customer_name')]);if(!name)continue;rawCandidates++;const id=identity(name);if(!id){blockers.push({type:'invalid_identity',row:i+1});continue;}let rec=records.get(id);if(!rec){rec={row_number:i+1,values:{customer_name:name},direct_group:''};records.set(id,rec);}else if(key(rec.values.customer_name)!==key(name))blockers.push({type:'identity_collision',row:i+1});if(header.m.has('price_group')){const raw=clean(r[header.m.get('price_group')]);if(raw){const g=group(raw);if(!g)blockers.push({type:'invalid_price_group',row:i+1});else if(rec.direct_group&&rec.direct_group!==g)blockers.push({type:'price_group_conflict',row:i+1});else rec.direct_group=g;}}}

const txBook=wb(txPath), explicit=new Map(), dealerRefs=new Set();
if(txBook.Sheets['DS KH-NCC']){const m=rows(txBook,'DS KH-NCC');for(let i=2;i<m.length;i++){const name=clean(m[i]?.[0]),id=identity(name),t=key(m[i]?.[2]);if(!id||t.includes('ncc'))continue;const g=t==='kh'||t==='dai ly'?'Đại lý':(t.includes('kh le')||t.includes('khach le')?'Lẻ':'');if(!g)continue;const old=explicit.get(id);explicit.set(id,old&&old!==g?'CONFLICT':g);}}
for(const s of txBook.SheetNames.filter((n)=>/^T\d{1,2}\.20\d{2}$/i.test(n))){const m=rows(txBook,s);if(!m.length)continue;const h=m[0].map(key),ci=h.findIndex((x)=>x==='dai ly'||x==='khach hang');if(ci<0)continue;for(let i=1;i<m.length;i++){const id=identity(m[i]?.[ci]);if(id)dealerRefs.add(id);}}
for(const [id,rec] of records){const e=explicit.get(id);if(e==='CONFLICT'){blockers.push({type:'transaction_group_conflict',row:rec.row_number});continue;}if(rec.direct_group&&e&&rec.direct_group!==e){blockers.push({type:'cross_source_group_conflict',row:rec.row_number});continue;}const g=rec.direct_group||e||(dealerRefs.has(id)?'Đại lý':'');if(!g){blockers.push({type:'missing_price_group_authority',row:rec.row_number});continue;}rec.values.price_group=g;}
const payload=[...records.values()].sort((a,b)=>a.row_number-b.row_number).map(({row_number,values})=>({row_number,values}));
if(payload.length!==EXPECTED_CANONICAL) blockers.push({type:'canonical_count_mismatch',expected:EXPECTED_CANONICAL,actual:payload.length});

const origin=(process.env.FORGE_ORIGIN??'http://127.0.0.1:8799').replace(/\/$/,'');const parsed=new URL(origin);if(!['127.0.0.1','localhost','::1'].includes(parsed.hostname))throw new Error(`refusing remote Customer mutation: ${parsed.hostname}`);
const user=process.env.FORGE_ADMIN_USER??process.env.FORGE_AUTH_USER??'';const password=process.env.FORGE_ADMIN_PASSWORD??process.env.FORGE_AUTH_PASSWORD??'';if(!user||!password)throw new Error('FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required');
const cookies=new Map();let csrf='';
async function req(url,opts={}){const headers=new Headers(opts.headers??{});const cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');if(cookie)headers.set('cookie',cookie);if(csrf&&opts.method&&opts.method!=='GET')headers.set('x-frappe-csrf-token',csrf);if(opts.body!==undefined)headers.set('content-type','application/json');const r=await fetch(`${origin}${url}`,{...opts,headers,body:opts.body===undefined?undefined:JSON.stringify(opts.body),redirect:'manual'});const sc=r.headers.get('set-cookie');if(sc)for(const part of sc.split(/,(?=[^;,]+=)/)){const p=part.split(';',1)[0],j=p.indexOf('=');if(j>0)cookies.set(p.slice(0,j).trim(),p.slice(j+1).trim());}csrf=r.headers.get('x-frappe-csrf-token')??csrf;const text=await r.text();let body;try{body=text?JSON.parse(text):null;}catch{body=text;}if(!r.ok)throw new Error(`${opts.method??'GET'} ${url} failed ${r.status}: ${text.slice(0,300)}`);return body;}
await req('/api/method/login',{method:'POST',body:{usr:user,pwd:password}});const boot=await req('/api/method/metaforge.api.get_boot');csrf=(boot?.message??boot)?.csrf_token??csrf;if(!csrf)throw new Error('Missing CSRF token');
const call=async(method,argsBody)=>(await req(`/api/method/${method}`,{method:'POST',body:{args:argsBody}}))?.message;
const dry=await call('alumdoor.customer_import.dry_run',{rows:payload});
const statuses=(dry?.rows??[]).reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{});const serverBlocked=(dry?.rows??[]).filter((r)=>!['READY_CREATE','DUPLICATE_EXACT'].includes(r.status)).map((r)=>({type:'server_preflight',row:r.row_number,status:r.status}));blockers.push(...serverBlocked);
const ready=statuses.READY_CREATE??0, exact=statuses.DUPLICATE_EXACT??0;
const evidence={format:'alumdoor-customer-local-import/v1',captured_at:new Date().toISOString(),source:{file:path.basename(sourcePath),sha256:sourceHash,sheet,header_row:header.i+1,raw_candidates:rawCandidates},transaction:{file:path.basename(txPath),sha256:sha256(txPath)},canonical_rows:payload.length,groups:{dealer:payload.filter((r)=>r.values.price_group==='Đại lý').length,retail:payload.filter((r)=>r.values.price_group==='Lẻ').length},preflight:{ready,exact,blocked:blockers.length,statuses},blockers};
mkdirSync(path.dirname(evidencePath),{recursive:true});const save=(v)=>writeFileSync(evidencePath,`${JSON.stringify(v,null,2)}\n`,'utf8');save(evidence);console.log(`ALUMDOOR_CUSTOMER_PREFLIGHT canonical=${payload.length} ready=${ready} exact=${exact} blocked=${blockers.length}`);console.log(`ALUMDOOR_CUSTOMER_SOURCE_SHA256 ${sourceHash}`);
if(blockers.length)throw new Error(`ALUMDOOR_CUSTOMER_PREFLIGHT_BLOCKED count=${blockers.length}; writes=0`);if(expectIdempotent&&ready!==0)throw new Error(`ALUMDOOR_CUSTOMER_IDEMPOTENCY_BLOCKED ready=${ready}`);if(!apply){console.log('ALUMDOOR_CUSTOMER_DRY_RUN_PASS writes=0');process.exit(0);}
assertLocalMutationChildContext(['customer']);const txHash=sha256(txPath);const batchId=`customer-local-${crypto.createHash('sha256').update(`${sourceHash}:${txHash}`).digest('hex').slice(0,20)}`;const commit=await call('alumdoor.customer_import.commit',{rows:payload,dry_run_token:dry.dry_run_token,batch_id:batchId});if(Number(commit?.failed??0)!==0)throw new Error(`Customer commit failed=${commit?.failed}`);if(Number(commit?.imported??0)!==ready)throw new Error(`Customer imported mismatch imported=${commit?.imported} expected=${ready}`);
const verify=await call('alumdoor.customer_import.dry_run',{rows:payload});const verifyBad=(verify?.rows??[]).filter((r)=>r.status!=='DUPLICATE_EXACT');const final={...evidence,commit:{batch_id:batchId,imported:Number(commit?.imported??0),skipped:Number(commit?.skipped??0),failed:Number(commit?.failed??0)},verify:{exact:(verify?.rows??[]).filter((r)=>r.status==='DUPLICATE_EXACT').length,blocked:verifyBad.length,statuses:(verify?.rows??[]).reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{})},verify_blockers:verifyBad.map((r)=>({row:r.row_number,status:r.status}))};save(final);if(verifyBad.length)throw new Error(`ALUMDOOR_CUSTOMER_POST_VERIFY_FAILED count=${verifyBad.length}`);if(expectIdempotent&&Number(commit?.imported??0)!==0)throw new Error(`ALUMDOOR_CUSTOMER_IDEMPOTENCY_FAILED imported=${commit?.imported}`);console.log(`ALUMDOOR_CUSTOMER_LOCAL_IMPORT_PASS canonical=${payload.length} imported=${commit?.imported??0} exact=${final.verify.exact}`);if(expectIdempotent)console.log(`ALUMDOOR_CUSTOMER_IDEMPOTENCY_PASS canonical=${payload.length} imported=0`);
