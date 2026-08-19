import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { ExecutionError, classifyExistingLock } from './run-local-import-core.mjs';
import { buildImportable } from './bom-adapter.mjs';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';
const DEFAULT_ORIGIN = 'http://127.0.0.1:8799';
const fail = (c, m, cause) => new ExecutionError(c, m, cause ? { cause } : {});
function run(command, args, { cwd, env, capture = false, label = command, failureClass = 'OTHER' } = {}) {
  const r = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (capture) { if (r.stdout) process.stdout.write(r.stdout); if (r.stderr) process.stderr.write(r.stderr); }
  if (r.error) throw fail(failureClass, `${label} failed to start: ${r.error.message}`, r.error);
  if (r.status !== 0) throw fail(failureClass, `${label} failed with exit code ${r.status}`);
  return { stdout: r.stdout ?? '' };
}
const git = (root, args, capture = true) => run('git', ['-C', root, ...args], { capture, label: `git ${args.join(' ')}`, failureClass: 'CHECKOUT' }).stdout.trim();
function assertLoopback(origin) { const u = new URL(origin); if (!['127.0.0.1', 'localhost', '::1'].includes(u.hostname)) throw fail('REMOTE_MUTATION_GUARD', `origin must be loopback, got ${u.hostname}`); }
async function requireApi(origin) {
  assertLoopback(origin);
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000);
  try { const r = await fetch(`${origin.replace(/\/$/, '')}/api/method/metaforge.api.get_boot`, { signal: c.signal }); if (![200, 401, 403].includes(r.status)) throw fail('ENV', `Local API unhealthy: HTTP ${r.status}`); } finally { clearTimeout(t); }
}
function authEnv(origin) { return { FORGE_ORIGIN: origin, FORGE_ADMIN_USER: process.env.FORGE_ADMIN_USER || 'dev@example.com', FORGE_ADMIN_PASSWORD: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1' }; }
function assertRepo(root) {
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') throw fail('ENV', `Windows self-hosted runner required; got ${process.platform}`);
  if (Number(process.versions.node.split('.')[0]) < 22) throw fail('DEPENDENCY', `Node >=22 required; got ${process.version}`);
  if (!existsSync(path.join(root, '.git'))) throw fail('PATH', `${root} is not a Git workspace`);
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']); if (branch !== 'main') throw fail('STALE_WORKTREE', `Local runtime authority must be on main; got ${branch}`);
  const dirty = git(root, ['status', '--porcelain=v1']); if (dirty) throw fail('STALE_WORKTREE', `Local runtime authority is dirty:\n${dirty}`);
  git(root, ['fetch', 'origin', 'main', '--prune'], false);
  const local = git(root, ['rev-parse', 'HEAD']); const remote = git(root, ['rev-parse', 'origin/main']);
  if (local !== remote) throw fail('STALE_WORKTREE', `Local source is not exact origin/main: local=${local} remote=${remote}`);
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim(); if (expected && expected !== local) throw fail('STALE_WORKTREE', `Expected runtime SHA mismatch: expected=${expected} actual=${local}`);
  return { local, remote };
}
function acquireLock(root, runId, sha) {
  const dir = path.join(root, 'local-locks'); mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'local-d1-mutation.lock');
  const payload = { format: 'forge-local-d1-lock/v2', run_id: runId, adapter: 'bom-template', pid: process.pid, hostname: os.hostname(), started_at: new Date().toISOString(), workflow: process.env.GITHUB_WORKFLOW || 'manual', github_run_id: process.env.GITHUB_RUN_ID || '', repo_sha: sha };
  for (let a = 0; a < 2; a += 1) {
    try { const fd = openSync(lockPath, 'wx'); try { writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'); } finally { closeSync(fd); } console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${lockPath} run_id=${runId}`); return lockPath; }
    catch (e) { if (e?.code !== 'EEXIST') throw fail('FILE_LOCK', `Cannot create global D1 lock: ${e.message}`, e); let existing; try { existing = JSON.parse(readFileSync(lockPath, 'utf8')); } catch (pe) { throw fail('FILE_LOCK', `Global D1 lock exists but is unreadable: ${lockPath}`, pe); } const verdict = classifyExistingLock(existing); if (verdict.action !== 'reap') throw fail('FILE_LOCK', `Global D1 lock ownership is unproven: ${JSON.stringify({ ...existing, verdict })}`); renameSync(lockPath, `${lockPath}.stale-${Date.now()}`); }
  }
  throw fail('FILE_LOCK', 'Unable to acquire global D1 lock');
}
function releaseLock(p, runId) { if (!p || !existsSync(p)) return; const e = JSON.parse(readFileSync(p, 'utf8')); if (e.run_id !== runId) throw fail('FILE_LOCK', `Refusing to release lock owned by ${e.run_id}`); unlinkSync(p); console.log(`GLOBAL_D1_LOCK=RELEASED path=${p} run_id=${runId}`); }
function backup(root) {
  const r = run(process.execPath, [path.join(root, 'server', 'scripts', 'backup-local-state.mjs')], { cwd: root, capture: true, label: 'backup-local-state', failureClass: 'D1_STATE' }).stdout;
  const m = r.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/); if (!m || !existsSync(m[1].trim()) || Number(m[2]) <= 0) throw fail('D1_STATE', 'Backup evidence invalid');
  console.log(`BACKUP_STATUS=PASS path=${m[1].trim()} bytes=${m[2]}`); return m[1].trim();
}

export async function mainBomTemplate() {
  const root = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
  const origin = process.env.FORGE_ORIGIN || DEFAULT_ORIGIN;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  let lock = ''; let stage = 'INFRA';
  try {
    console.log('INFRA_STATUS=RUNNING adapter=bom-template');
    assertLoopback(origin);
    const repo = assertRepo(root);
    await requireApi(origin);
    console.log(`INFRA_STATUS=PASS sha=${repo.local}`);
    stage = 'DATA';
    const runDir = path.join(root, 'local-backups', 'execution-layer', 'bom-template', runId);
    mkdirSync(runDir, { recursive: true });
    // Reuse Gate B only as the authoritative parent-child source. The importer
    // replaces legacy production BOM drafts/templates with one sales composition
    // template per TRỌN BỘ Item and deliberately ignores production quantities.
    const prepared = buildImportable(root, runDir, origin);
    run(process.execPath, [
      path.join(root, 'server', 'scripts', 'import-alumdoor-sales-bom-composition-local.mjs'),
      prepared.payload,
      path.join(runDir, 'validate-only.json'),
      '--validate-only',
    ], { cwd: root, label: 'Sales BOM composition validate-only', failureClass: 'DATA' });
    console.log('DATA_STATUS=PASS');
    stage = 'LOCK';
    lock = acquireLock(root, runId, repo.local);
    stage = 'BACKUP';
    const backupPath = backup(root);
    stage = 'IMPORT';
    const importer = path.join(root, 'server', 'scripts', 'import-alumdoor-sales-bom-composition-local.mjs');
    const pass1 = path.join(runDir, 'import-pass1.json');
    run(process.execPath, [importer, prepared.payload, pass1], { cwd: root, env: authEnv(origin), label: 'BOM Template import pass 1', failureClass: 'IMPORTER' });
    const first = JSON.parse(readFileSync(pass1, 'utf8'));
    if (Number(first.verification_failure_count) !== 0) throw fail('VERIFY', 'BOM Template pass 1 verification failed');
    const pass2 = path.join(runDir, 'import-pass2.json');
    run(process.execPath, [importer, prepared.payload, pass2], { cwd: root, env: authEnv(origin), label: 'BOM Template import pass 2', failureClass: 'VERIFY' });
    const second = JSON.parse(readFileSync(pass2, 'utf8'));
    if (Number(second.created_count) !== 0 || Number(second.verification_failure_count) !== 0) throw fail('VERIFY', `BOM Template idempotency failed created=${second.created_count} verify=${second.verification_failure_count}`);
    writeFileSync(path.join(runDir, 'adapter-status.json'), `${JSON.stringify({ adapter: 'bom-template', run_id: runId, repo_sha: repo.local, backup_path: backupPath, pass1: first, pass2: second }, null, 2)}\n`);
    console.log(`ALUMDOOR_LOCAL_BOM_TEMPLATE_IDEMPOTENCE_PASS created_pass1=${first.created_count} created_pass2=0 templates=${first.template_count} components=${first.component_rule_count}`);
    console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=bom-template run_id=${runId}`);
    console.log('EXECUTION_STATUS=SUCCESS');
  } catch (error) {
    const e = error instanceof ExecutionError ? error : fail('OTHER', error?.message ?? String(error), error);
    console.error(`EXECUTION_STATUS=FAILED adapter=bom-template stage=${stage} failure_class=${e.failureClass} message=${JSON.stringify(e.message)}`);
    throw e;
  } finally {
    if (lock) releaseLock(lock, runId);
  }
}
