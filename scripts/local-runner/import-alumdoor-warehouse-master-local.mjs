#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

if (!process.argv.includes('--apply')) throw new Error('Usage: node scripts/local-runner/import-alumdoor-warehouse-master-local.mjs --apply');
const root = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || 'C:\\alumdoor');
const origin = (process.env.FORGE_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const branch = process.env.FORGE_LIVE_BRANCH || 'main';
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
const rows = [
  { name: 'Kho Alumdoor', warehouse_name: 'Kho Alumdoor', is_group: true, disabled: false },
  { name: 'K36', warehouse_name: 'K36', parent_warehouse: 'Kho Alumdoor', is_group: false, address: 'Kho vật lý K36', disabled: false },
  { name: 'K12', warehouse_name: 'K12', parent_warehouse: 'Kho Alumdoor', is_group: false, address: 'Kho vật lý K12', disabled: false },
];
function run(program, args, capture = false) {
  const r = spawnSync(program, args, { cwd: root, env: process.env, encoding: 'utf8', windowsHide: true, stdio: capture ? ['ignore','pipe','pipe'] : 'inherit' });
  if (r.error) throw r.error; if (r.status !== 0) throw new Error(`${program} ${args.join(' ')} exit=${r.status}`); return String(r.stdout || '').trim();
}
const git = (args, capture = true) => run('git', ['-C', root, ...args], capture);
function assertAuthority() {
  const host = new URL(origin).hostname; if (!['127.0.0.1','localhost','::1'].includes(host)) throw new Error(`refusing non-local origin ${host}`);
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') throw new Error(`Windows required; got ${process.platform}`);
  if (!existsSync(path.join(root,'.git'))) throw new Error(`${root} is not a git workspace`);
  if (git(['branch','--show-current']) !== branch) throw new Error(`expected branch ${branch}`);
  if (git(['status','--porcelain=v1','--untracked-files=no'])) throw new Error('tracked source is dirty');
  git(['fetch','origin',`+refs/heads/${branch}:refs/remotes/origin/${branch}`,'--prune'], false);
  const local = git(['rev-parse','HEAD']), remote = git(['rev-parse',`origin/${branch}`]);
  if (local !== remote) throw new Error(`local=${local} remote=${remote}`);
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim(); if (expected && expected !== local) throw new Error(`expected=${expected} actual=${local}`); return local;
}
function alive(pid) { try { process.kill(pid,0); return true; } catch { return false; } }
function lock(sha) {
  const dir = path.join(root,'local-locks'); mkdirSync(dir,{recursive:true}); const file = path.join(dir,'local-d1-mutation.lock');
  const body = { format:'forge-local-d1-lock/v2', run_id:runId, adapter:'warehouse-master', pid:process.pid, hostname:os.hostname(), started_at:new Date().toISOString(), repo_sha:sha };
  for (let n=0;n<2;n++) try { const fd=openSync(file,'wx'); try { writeFileSync(fd,`${JSON.stringify(body,null,2)}\n`); } finally { closeSync(fd); } console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${file} run_id=${runId}`); return file; } catch(e) {
    if (e?.code !== 'EEXIST') throw e; let old; try { old=JSON.parse(readFileSync(file,'utf8')); } catch { throw new Error('existing D1 lock unreadable'); }
    if (!(old?.hostname===os.hostname() && Number.isInteger(old?.pid) && !alive(old.pid))) throw new Error(`active or unproven D1 lock ${JSON.stringify(old)}`); renameSync(file,`${file}.stale-${Date.now()}`);
  }
  throw new Error('cannot acquire D1 lock');
}
function unlock(file) { if (!file || !existsSync(file)) return; const old=JSON.parse(readFileSync(file,'utf8')); if (old.run_id!==runId) throw new Error('lock owner changed'); unlinkSync(file); console.log(`GLOBAL_D1_LOCK=RELEASED path=${file} run_id=${runId}`); }
function backup() { const out=run(process.execPath,[path.join(root,'server','scripts','backup-local-state.mjs')],true); const m=out.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/); if(!m||!existsSync(m[1].trim())||Number(m[2])<=0) throw new Error('invalid local state backup'); console.log(`BACKUP_STATUS=PASS path=${m[1].trim()} bytes=${m[2]}`); }
const cookies=new Map(); let csrf='';
function remember(r){const v=r.headers.get('set-cookie');if(!v)return;for(const p of v.split(/,(?=[^;,]+=)/)){const pair=p.split(';',1)[0],i=pair.indexOf('=');if(i>0)cookies.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());}}
const cookie=()=>[...cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
async function req(urlPath,opt={}){const h=new Headers(opt.headers||{});if(cookie())h.set('cookie',cookie());if(csrf&&opt.method&&opt.method!=='GET')h.set('x-frappe-csrf-token',csrf);if(opt.body!==undefined)h.set('content-type','application/json');const r=await fetch(`${origin}${urlPath}`,{...opt,headers:h,body:opt.body===undefined?undefined:JSON.stringify(opt.body),redirect:'manual'});remember(r);csrf=r.headers.get('x-frappe-csrf-token')||csrf;const t=await r.text();let b=null;try{b=t?JSON.parse(t):null;}catch{b=t;}return{r,b,t};}
async function ok(p,o={}){const x=await req(p,o);if(!x.r.ok)throw new Error(`${o.method||'GET'} ${p} (${x.r.status}): ${x.t}`);return x.b;}
async function login(){await ok('/api/method/login',{method:'POST',body:{usr:process.env.FORGE_ADMIN_USER||'dev@example.com',pwd:process.env.FORGE_ADMIN_PASSWORD||'local-dev-password-1'}});const b=await ok('/api/method/metaforge.api.get_boot');const m=b&&typeof b==='object'&&'message'in b?b.message:b;csrf=m?.csrf_token||csrf;if(!csrf)throw new Error('missing csrf token');}
async function get(name){const x=await req(`/api/resource/Warehouse/${encodeURIComponent(name)}`);if(x.r.status===404)return null;if(!x.r.ok)throw new Error(`GET Warehouse ${name} (${x.r.status})`);return x.b?.data??x.b?.message??x.b;}
async function upsert(row){const existing=await get(row.name);const body=Object.fromEntries(Object.entries(row).filter(([k])=>k!=='name'));if(!existing)await ok('/api/resource/Warehouse',{method:'POST',body});else await ok(`/api/resource/Warehouse/${encodeURIComponent(row.name)}`,{method:'PUT',body});const after=await get(row.name);if(!after||String(after.warehouse_name||after.name).trim()!==row.warehouse_name)throw new Error(`Warehouse ${row.name} verify failed`);return existing?'updated':'created';}

const sha=assertAuthority(); await login(); let lockPath='';
try { lockPath=lock(sha); backup(); const first={created:0,updated:0}; for(const row of rows)first[await upsert(row)]++; for(const row of rows){const before=await get(row.name);await upsert(row);const after=await get(row.name);if(!before||!after)throw new Error(`Warehouse ${row.name} idempotency failed`);} console.log(`ALUMDOOR_WAREHOUSE_MASTER_IMPORT_PASS warehouses=3 created=${first.created} updated=${first.updated}`); } finally { unlock(lockPath); }
