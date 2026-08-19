import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { ExecutionError, classifyExistingLock, normalizeSpawnInvocation } from './run-local-import-core.mjs';

const DEFAULT_REPO_ROOT='C:\\alumdoor';
const DEFAULT_ORIGIN='http://127.0.0.1:8799';
const fail=(c,m,cause)=>new ExecutionError(c,m,cause?{cause}:{});
function run(command,args,{cwd,env,capture=false,label=command,failureClass='OTHER',allowFailure=false}={}){
  const inv=normalizeSpawnInvocation(command,args);
  const r=spawnSync(inv.command,inv.args,{cwd,env:{...process.env,...env},encoding:'utf8',windowsHide:true,stdio:capture?['ignore','pipe','pipe']:'inherit'});
  if(capture){if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);}
  if(r.error)throw fail(failureClass,`${label} failed to start: ${r.error.message}`,r.error);
  if(r.status!==0&&!allowFailure)throw fail(failureClass,`${label} failed with exit code ${r.status}`);
  return {status:r.status,stdout:r.stdout??'',stderr:r.stderr??''};
}
function git(root,args,capture=true){return run('git',['-C',root,...args],{capture,label:`git ${args.join(' ')}`,failureClass:'CHECKOUT'}).stdout.trim();}
function assertLoopback(origin){const u=new URL(origin);if(!['127.0.0.1','localhost','::1'].includes(u.hostname))throw fail('REMOTE_MUTATION_GUARD',`origin must be loopback, got ${u.hostname}`);}
async function requireApi(origin){assertLoopback(origin);const c=new AbortController();const t=setTimeout(()=>c.abort(),5000);try{const r=await fetch(`${origin.replace(/\/$/,'')}/api/method/metaforge.api.get_boot`,{signal:c.signal});if(![200,401,403].includes(r.status))throw fail('ENV',`Local API unhealthy: HTTP ${r.status}`);}finally{clearTimeout(t);}}
function assertRepo(root){if(process.platform!=='win32'&&process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS!=='1')throw fail('ENV',`Windows self-hosted runner required; got ${process.platform}`);if(Number(process.versions.node.split('.')[0])<22)throw fail('DEPENDENCY',`Node >=22 required; got ${process.version}`);if(!existsSync(path.join(root,'.git')))throw fail('PATH',`${root} is not a Git workspace`);const branch=git(root,['rev-parse','--abbrev-ref','HEAD']);if(branch!=='main')throw fail('STALE_WORKTREE',`Local runtime authority must be on main; got ${branch}`);const dirty=git(root,['status','--porcelain=v1']);if(dirty)throw fail('STALE_WORKTREE',`Local runtime authority is dirty:\n${dirty}`);git(root,['fetch','origin','main','--prune'],false);const local=git(root,['rev-parse','HEAD']);const remote=git(root,['rev-parse','origin/main']);if(local!==remote)throw fail('STALE_WORKTREE',`Local source is not exact origin/main: local=${local} remote=${remote}`);const expected=process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();if(expected&&expected!==local)throw fail('STALE_WORKTREE',`Expected runtime SHA mismatch: expected=${expected} actual=${local}`);return{local,remote};}
/**
 * Nạp shim làm tươi `modified` trước mỗi PUT.
 *
 * Nền tảng bắt người ghi phải gửi kèm `modified` mới nhất (khoá lạc quan). Bộ nhập ở đây đọc
 * danh sách MỘT LẦN ở đầu rồi ghi dần, nên bản ghi nào bị chính lượt chạy này đụng trước đó sẽ
 * hỏng với `TimestampMismatchError: The document changed after it was loaded` — gặp thật ở
 * `BOM Template/23` ngay sau khi bước BOM cập nhật 139 định mức.
 *
 * `bom-rule` và `bom-source-complete` đã nạp shim này từ trước; `bom` thì chưa, và chỉ lộ ra khi
 * bước BOM bắt đầu thật sự ghi được.
 */
function authEnv(origin){
  const previousNodeOptions = process.env.NODE_OPTIONS ?? '';
  const modifiedShimUrl = new URL('./bom-put-modified-shim.mjs', import.meta.url).href;
  return {
    FORGE_ORIGIN: origin,
    FORGE_ADMIN_USER: process.env.FORGE_ADMIN_USER || 'dev@example.com',
    FORGE_ADMIN_PASSWORD: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1',
    NODE_OPTIONS: [previousNodeOptions, `--import=${modifiedShimUrl}`].filter(Boolean).join(' '),
  };
}
function acquireLock(root,runId,sha){const dir=path.join(root,'local-locks');mkdirSync(dir,{recursive:true});const lockPath=path.join(dir,'local-d1-mutation.lock');const payload={format:'forge-local-d1-lock/v2',run_id:runId,adapter:'bom',pid:process.pid,hostname:os.hostname(),started_at:new Date().toISOString(),workflow:process.env.GITHUB_WORKFLOW||'manual',github_run_id:process.env.GITHUB_RUN_ID||'',github_run_attempt:process.env.GITHUB_RUN_ATTEMPT||'',command:process.argv.join(' '),repo_sha:sha};for(let a=0;a<2;a+=1){try{const fd=openSync(lockPath,'wx');try{writeFileSync(fd,`${JSON.stringify(payload,null,2)}\n`,'utf8');}finally{closeSync(fd);}console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${lockPath} run_id=${runId}`);return lockPath;}catch(e){if(e?.code!=='EEXIST')throw fail('FILE_LOCK',`Cannot create global D1 lock: ${e.message}`,e);let existing;try{existing=JSON.parse(readFileSync(lockPath,'utf8'));}catch(pe){throw fail('FILE_LOCK',`Global D1 lock exists but is unreadable: ${lockPath}`,pe);}const verdict=classifyExistingLock(existing);if(verdict.action!=='reap')throw fail('FILE_LOCK',`Global D1 lock ownership is unproven: ${JSON.stringify({...existing,verdict})}`);renameSync(lockPath,`${lockPath}.stale-${Date.now()}`);}}throw fail('FILE_LOCK','Unable to acquire global D1 lock');}
function releaseLock(p,runId){if(!p||!existsSync(p))return;const e=JSON.parse(readFileSync(p,'utf8'));if(e.run_id!==runId)throw fail('FILE_LOCK',`Refusing to release lock owned by ${e.run_id}`);unlinkSync(p);console.log(`GLOBAL_D1_LOCK=RELEASED path=${p} run_id=${runId}`);}
function backup(root){const r=run(process.execPath,[path.join(root,'server','scripts','backup-local-state.mjs')],{cwd:root,capture:true,label:'backup-local-state',failureClass:'D1_STATE'}).stdout;const m=r.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/);if(!m||!existsSync(m[1].trim())||Number(m[2])<=0)throw fail('D1_STATE','Backup evidence invalid');console.log(`BACKUP_STATUS=PASS path=${m[1].trim()} bytes=${m[2]}`);return m[1].trim();}
function requireFiles(root){const files=[
  'server/scripts/extract-alumdoor-real-source-records.mjs',
  'server/scripts/build-alumdoor-item-master-payload.mjs',
  'server/scripts/import-alumdoor-item-master-local.mjs',
  'server/scripts/build-alumdoor-canonical-bom-payload.mjs',
  'server/scripts/build-alumdoor-canonical-bom-importable.mjs',
  'server/scripts/import-alumdoor-canonical-bom-local.mjs',
  'server/scripts/import-alumdoor-bom-template-local.mjs',
  'server/scripts/verify-alumdoor-bom-local-d1.mjs',
  'server/scripts/backup-local-state.mjs',
];const missing=files.filter(f=>!existsSync(path.join(root,f)));if(missing.length)throw fail('SOURCE_FILE',`Required BOM file(s) missing: ${missing.join(', ')}`);}

export function buildImportable(root,runDir){
  requireFiles(root);
  const server=path.join(root,'server');
  const p=(n)=>path.join(runDir,n);
  const source=p('source.json'),sourceReport=p('source.report.json'),items=p('items.json'),itemsAudit=p('items.audit.json'),strict=p('strict-bom.json'),strictAudit=p('strict-audit.json'),payload=p('bom-importable.json'),audit=p('bom-importable.audit.json');
  const node=process.execPath;
  const exec=(script,args,label,allowFailure=false)=>run(node,[path.join(server,'scripts',script),...args],{cwd:root,label,failureClass:'DATA',allowFailure});
  exec('extract-alumdoor-real-source-records.mjs',[source,sourceReport],'BOM source extraction');
  exec('build-alumdoor-item-master-payload.mjs',[source,items,itemsAudit],'BOM Item projection');
  const itemDoc=JSON.parse(readFileSync(items,'utf8'));
  if(!Array.isArray(itemDoc.items)||!itemDoc.items.length)throw fail('DATA','Canonical Item projection is empty');
  if(Number(itemDoc.item_count)!==itemDoc.items.length)throw fail('DATA',`Canonical Item count mismatch declared=${itemDoc.item_count} actual=${itemDoc.items.length}`);
  exec('import-alumdoor-item-master-local.mjs',[items,p('item-validate.json'),'--validate-only'],'Item prerequisite validate-only');
  exec('build-alumdoor-canonical-bom-payload.mjs',[source,items,strict,strictAudit],'strict BOM evidence inventory',true);
  if(!existsSync(strict)||!existsSync(strictAudit))throw fail('DATA','Strict BOM builder did not produce evidence files');
  exec('build-alumdoor-canonical-bom-importable.mjs',[source,items,strict,strictAudit,payload,audit],'source-complete BOM payload');
  exec('import-alumdoor-canonical-bom-local.mjs',[payload,p('bom-validate.json'),'--validate-only'],'BOM validate-only');
  exec('import-alumdoor-bom-template-local.mjs',[payload,p('template-validate.json'),'--validate-only'],'BOM Template validate-only');
  const a=JSON.parse(readFileSync(audit,'utf8'));
  if(Number(a.mutation_blocker_count)!==0)throw fail('DATA',`BOM mutation blockers=${a.mutation_blocker_count}`);
  if(Number(a.missing_component_count)!==0||Number(a.missing_item_count)!==0)throw fail('DATA',`BOM prerequisites unresolved components=${a.missing_component_count} items=${a.missing_item_count}`);
  if(Number(a.component_reference_count)!==Number(a.expected_component_count))throw fail('DATA',`BOM component coverage mismatch components=${a.component_reference_count} expected=${a.expected_component_count}`);
  console.log(`ALUMDOOR_BOM_DATA_READY items=${a.item_projection_count} source_refs=${a.source_reference_count} boms=${a.canonical_bom_count} components=${a.component_reference_count} pending_values=${a.pending_value_count} excluded=${a.excluded_reference_count}`);
  return{source,items,itemsAudit,payload,audit};
}

function assertSecondPass(first,second,label){
  if(Number(second.created_count)!==0||Number(second.updated_count??0)!==0||Number(second.duplicate_removed_count??0)!==0||Number(second.verification_failure_count??0)!==0){
    throw fail('VERIFY',`${label} idempotency failed created=${second.created_count} updated=${second.updated_count??0} duplicate_removed=${second.duplicate_removed_count??0} verify=${second.verification_failure_count??0}`);
  }
  if(Number(first.verification_failure_count??0)!==0)throw fail('VERIFY',`${label} pass 1 verification failed`);
}
function stableD1(a,b){
  const keys=['bom_total','bom_template_total','bom_unique_finished_item','bom_component_total','bom_without_component','bom_missing_item_reference','canonical_bom_expected','canonical_bom_exact','canonical_bom_incomplete','canonical_component_expected','canonical_component_exact','canonical_duplicate_exact_count','pending_value_count','expected_bom_template_count','bom_template_missing_count','bom_template_duplicate_count'];
  return keys.every((key)=>Number(a[key]??0)===Number(b[key]??0));
}

export async function mainBom(){
  const root=path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT||DEFAULT_REPO_ROOT);
  const origin=process.env.FORGE_ORIGIN||DEFAULT_ORIGIN;
  const runId=`${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(4).toString('hex')}`;
  let lock='';let stage='INFRA';
  try{
    console.log('INFRA_STATUS=RUNNING adapter=bom');
    assertLoopback(origin);
    const repo=assertRepo(root);
    await requireApi(origin);
    console.log(`RUNNER_EVIDENCE os=${process.platform} host=${os.hostname()} repo=${root} branch=main local_sha=${repo.local} origin_main=${repo.remote}`);
    console.log(`INFRA_STATUS=PASS sha=${repo.local}`);
    stage='DATA';
    const runDir=path.join(root,'local-backups','execution-layer','bom',runId);mkdirSync(runDir,{recursive:true});
    const prepared=buildImportable(root,runDir);
    const audit=JSON.parse(readFileSync(prepared.audit,'utf8'));
    console.log('DATA_STATUS=PASS');
    stage='LOCK';lock=acquireLock(root,runId,repo.local);
    stage='BACKUP';const backupPath=backup(root);
    const env=authEnv(origin);

    stage='ITEM_PREREQUISITES';
    const itemImporter=path.join(root,'server','scripts','import-alumdoor-item-master-local.mjs');
    const itemPre1=path.join(runDir,'item-pass1.preimage.json');
    run(process.execPath,[itemImporter,prepared.items,itemPre1],{cwd:root,env,label:'Item prerequisite import pass 1',failureClass:'IMPORTER'});
    const itemFirst=JSON.parse(readFileSync(itemPre1,'utf8'));
    const itemsAdded=Number(itemFirst.missing_count??0);

    stage='IMPORT_BOM';
    const bomImporter=path.join(root,'server','scripts','import-alumdoor-canonical-bom-local.mjs');
    const bomPass1=path.join(runDir,'bom-pass1.json');
    run(process.execPath,[bomImporter,prepared.payload,bomPass1],{cwd:root,env,label:'BOM import pass 1',failureClass:'IMPORTER'});
    const first=JSON.parse(readFileSync(bomPass1,'utf8'));

    stage='IMPORT_TEMPLATE';
    const templateImporter=path.join(root,'server','scripts','import-alumdoor-bom-template-local.mjs');
    const templatePass1=path.join(runDir,'template-pass1.json');
    run(process.execPath,[templateImporter,prepared.payload,templatePass1],{cwd:root,env,label:'BOM Template import pass 1',failureClass:'IMPORTER'});
    const templateFirst=JSON.parse(readFileSync(templatePass1,'utf8'));

    stage='VERIFY_D1';
    const verifier=path.join(root,'server','scripts','verify-alumdoor-bom-local-d1.mjs');
    const d1Pass1=path.join(runDir,'d1-pass1.json');
    run(process.execPath,[verifier,prepared.payload,d1Pass1],{cwd:root,label:'direct local D1 verification pass 1',failureClass:'VERIFY'});
    const d1First=JSON.parse(readFileSync(d1Pass1,'utf8'));

    stage='IDEMPOTENCE';
    const itemPre2=path.join(runDir,'item-pass2.preimage.json');
    run(process.execPath,[itemImporter,prepared.items,itemPre2],{cwd:root,env,label:'Item prerequisite import pass 2',failureClass:'VERIFY'});
    const itemSecond=JSON.parse(readFileSync(itemPre2,'utf8'));
    if(Number(itemSecond.missing_count)!==0)throw fail('VERIFY',`Item idempotency failed missing_on_second_pass=${itemSecond.missing_count}`);

    const bomPass2=path.join(runDir,'bom-pass2.json');
    run(process.execPath,[bomImporter,prepared.payload,bomPass2],{cwd:root,env,label:'BOM import pass 2',failureClass:'VERIFY'});
    const second=JSON.parse(readFileSync(bomPass2,'utf8'));
    assertSecondPass(first,second,'BOM');

    const templatePass2=path.join(runDir,'template-pass2.json');
    run(process.execPath,[templateImporter,prepared.payload,templatePass2],{cwd:root,env,label:'BOM Template import pass 2',failureClass:'VERIFY'});
    const templateSecond=JSON.parse(readFileSync(templatePass2,'utf8'));
    assertSecondPass(templateFirst,templateSecond,'BOM Template');

    const d1Pass2=path.join(runDir,'d1-pass2.json');
    run(process.execPath,[verifier,prepared.payload,d1Pass2],{cwd:root,label:'direct local D1 verification pass 2',failureClass:'VERIFY'});
    const d1Second=JSON.parse(readFileSync(d1Pass2,'utf8'));
    if(!stableD1(d1First,d1Second))throw fail('VERIFY','Direct local D1 summary changed on second pass');

    const finalReport={
      BOM_AUDIT_TOTAL:Number(audit.canonical_bom_count),
      BOM_COMPLETE:Number(audit.complete_count),
      BOM_INCOMPLETE:Number(audit.incomplete_count)+Number(audit.blocked_count),
      BOM_COMPONENTS_TOTAL:Number(audit.component_reference_count),
      MISSING_COMPONENTS:Number(audit.missing_component_count),
      MISSING_ITEMS:Number(audit.missing_item_count),
      ITEMS_ADDED:itemsAdded,
      BOM_CREATED:Number(first.created_count),
      BOM_UPDATED:Number(first.updated_count),
      BOM_UNCHANGED:Number(first.unchanged_count),
      BOM_TEMPLATE_CREATED:Number(templateFirst.created_count),
      BOM_TEMPLATE_UPDATED:Number(templateFirst.updated_count),
      IDEMPOTENT_SECOND_PASS:'PASS',
      PENDING_VALUE_ROWS:Number(audit.pending_value_count),
      D1_BOM_TOTAL:Number(d1Second.bom_total),
      D1_BOM_TEMPLATE_TOTAL:Number(d1Second.bom_template_total),
      D1_UNIQUE_FINISHED_ITEM:Number(d1Second.bom_unique_finished_item),
      D1_COMPONENTS_TOTAL:Number(d1Second.bom_component_total),
      D1_ZERO_COMPONENT_BOM:Number(d1Second.bom_without_component),
      D1_MISSING_ITEM_REFERENCE:Number(d1Second.bom_missing_item_reference),
    };
    if(finalReport.BOM_INCOMPLETE!==0||finalReport.MISSING_COMPONENTS!==0||finalReport.MISSING_ITEMS!==0)throw fail('VERIFY',`Definition of Done failed: ${JSON.stringify(finalReport)}`);
    writeFileSync(path.join(runDir,'adapter-status.json'),`${JSON.stringify({adapter:'bom',run_id:runId,repo_sha:repo.local,backup_path:backupPath,audit_path:prepared.audit,final_report:finalReport,item_pass1:itemFirst,item_pass2:itemSecond,bom_pass1:first,bom_pass2:second,template_pass1:templateFirst,template_pass2:templateSecond,d1_pass1:d1First,d1_pass2:d1Second},null,2)}\n`);
    console.log(`ALUMDOOR_LOCAL_BOM_IDEMPOTENCE_PASS bom_created_pass2=0 bom_updated_pass2=0 template_created_pass2=0 template_updated_pass2=0 pending_values=${audit.pending_value_count}`);
    for(const [key,value] of Object.entries(finalReport))console.log(`${key}=${value}`);
    console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=bom run_id=${runId}`);
    console.log('EXECUTION_STATUS=SUCCESS');
  }catch(error){
    const e=error instanceof ExecutionError?error:fail('OTHER',error?.message??String(error),error);
    console.error(`EXECUTION_STATUS=FAILED adapter=bom stage=${stage} failure_class=${e.failureClass} message=${JSON.stringify(e.message)}`);
    throw e;
  }finally{if(lock)releaseLock(lock,runId);}
}
