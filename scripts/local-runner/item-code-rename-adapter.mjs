import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { ExecutionError, classifyExistingLock } from './run-local-import-core.mjs';

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
  const payload = { format: 'forge-local-d1-lock/v2', run_id: runId, adapter: 'item-code-rename', pid: process.pid, hostname: os.hostname(), started_at: new Date().toISOString(), workflow: process.env.GITHUB_WORKFLOW || 'manual', github_run_id: process.env.GITHUB_RUN_ID || '', repo_sha: sha };
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

/**
 * Áp quy ước mã hàng lên D1 local.
 *
 * Khác các adapter khác ở một điểm đáng nói: đây là thao tác đổi DANH TÍNH, không phải nạp dữ
 * liệu. Vì vậy cổng DATA không chỉ chạy thử — nó còn phải chứng minh lát đem chạy đúng là lát
 * một-đổi-một, không dính họ gộp và không có mã nào vượt 24 ký tự. Cả hai nhóm ấy cần chủ xưởng
 * quyết, và importer từ chối tự quyết thay.
 */
export async function mainItemCodeRename() {
  const root = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
  const origin = process.env.FORGE_ORIGIN || DEFAULT_ORIGIN;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  let lock = ''; let stage = 'INFRA';
  try {
    console.log('INFRA_STATUS=RUNNING adapter=item-code-rename');
    assertLoopback(origin);
    const repo = assertRepo(root);
    await requireApi(origin);
    console.log(`INFRA_STATUS=PASS sha=${repo.local}`);

    stage = 'DATA';
    const runDir = path.join(root, 'local-backups', 'execution-layer', 'item-code-rename', runId);
    mkdirSync(runDir, { recursive: true });
    const importer = path.join(root, 'server', 'scripts', 'import-alumdoor-item-code-rename-local.mjs');
    const planPath = path.join(runDir, 'validate-only.json');
    run(process.execPath, [importer, planPath, '--validate-only'], { cwd: root, label: 'Item code rename validate-only', failureClass: 'DATA' });
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    if (Number(plan.planned_rename_count) <= 0) throw fail('DATA', 'Rename plan is empty');
    console.log(`DATA_STATUS=PASS planned=${plan.planned_rename_count} skipped_merged=${plan.skipped_merged_family_count} skipped_too_long=${plan.skipped_too_long_count}`);

    stage = 'LOCK';
    lock = acquireLock(root, runId, repo.local);
    stage = 'BACKUP';
    const backupPath = backup(root);

    stage = 'IMPORT';
    const applied = path.join(runDir, 'apply.json');
    run(process.execPath, [importer, applied], { cwd: root, env: authEnv(origin), label: 'Item code rename apply', failureClass: 'IMPORTER' });
    const result = JSON.parse(readFileSync(applied, 'utf8'));
    if (Number(result.verification_failure_count) !== 0) throw fail('VERIFY', `Rename verification failed: ${JSON.stringify(result.verification?.failures ?? [])}`);
    if (Number(result.pass2?.items_renamed ?? -1) !== 0) throw fail('VERIFY', `Rename idempotency failed: ${JSON.stringify(result.pass2)}`);

    writeFileSync(path.join(runDir, 'adapter-status.json'), `${JSON.stringify({ adapter: 'item-code-rename', run_id: runId, repo_sha: repo.local, backup_path: backupPath, plan: { planned: plan.planned_rename_count, skipped_merged: plan.skipped_merged_family_count, skipped_too_long: plan.skipped_too_long_count }, result }, null, 2)}\n`);
    console.log(`ALUMDOOR_LOCAL_ITEM_CODE_RENAME_PASS renamed=${result.pass1.items_renamed} prices=${result.pass1.prices_renamed} items=${result.verification.item_count}`);
    console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=item-code-rename run_id=${runId}`);
    console.log('EXECUTION_STATUS=SUCCESS');
  } catch (error) {
    const e = error instanceof ExecutionError ? error : fail('OTHER', error?.message ?? String(error), error);
    console.error(`EXECUTION_STATUS=FAILED adapter=item-code-rename stage=${stage} failure_class=${e.failureClass} message=${JSON.stringify(e.message)}`);
    throw e;
  } finally {
    if (lock) releaseLock(lock, runId);
  }
}
