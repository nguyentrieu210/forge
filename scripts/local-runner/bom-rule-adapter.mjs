import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mainBom } from './bom-adapter.mjs';
import { ExecutionError, classifyExistingLock, normalizeSpawnInvocation } from './run-local-import-core.mjs';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';
const DEFAULT_ORIGIN = 'http://127.0.0.1:8799';
const fail = (failureClass, message, cause) => new ExecutionError(failureClass, message, cause ? { cause } : {});

function run(command, args, { cwd, env, capture = false, label = command, failureClass = 'OTHER', allowFailure = false } = {}) {
  const invocation = normalizeSpawnInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) throw fail(failureClass, `${label} failed to start: ${result.error.message}`, result.error);
  if (result.status !== 0 && !allowFailure) throw fail(failureClass, `${label} failed with exit code ${result.status}`);
  return { status: result.status, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

function git(root, args, capture = true) {
  return run('git', ['-C', root, ...args], { capture, label: `git ${args.join(' ')}`, failureClass: 'CHECKOUT' }).stdout.trim();
}

function assertLoopback(origin) {
  const url = new URL(origin);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw fail('REMOTE_MUTATION_GUARD', `origin must be loopback, got ${url.hostname}`);
}

async function requireApi(origin) {
  assertLoopback(origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}/api/method/metaforge.api.get_boot`, { signal: controller.signal });
    if (![200, 401, 403].includes(response.status)) throw fail('ENV', `Local API unhealthy: HTTP ${response.status}`);
  } finally { clearTimeout(timer); }
}

function assertRepo(root) {
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') throw fail('ENV', `Windows self-hosted runner required; got ${process.platform}`);
  if (!existsSync(path.join(root, '.git'))) throw fail('PATH', `${root} is not a Git workspace`);
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') throw fail('STALE_WORKTREE', `Local runtime authority must be on main; got ${branch}`);
  const dirty = git(root, ['status', '--porcelain=v1']);
  if (dirty) throw fail('STALE_WORKTREE', `Local runtime authority is dirty:\n${dirty}`);
  git(root, ['fetch', 'origin', 'main', '--prune'], false);
  const local = git(root, ['rev-parse', 'HEAD']);
  const remote = git(root, ['rev-parse', 'origin/main']);
  if (local !== remote) throw fail('STALE_WORKTREE', `Local source is not exact origin/main: local=${local} remote=${remote}`);
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();
  if (expected && expected !== local) throw fail('STALE_WORKTREE', `Expected runtime SHA mismatch: expected=${expected} actual=${local}`);
  return { local, remote };
}

function acquireLock(root, runId, sha) {
  const dir = path.join(root, 'local-locks');
  mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'local-d1-mutation.lock');
  const payload = {
    format: 'forge-local-d1-lock/v2', run_id: runId, adapter: 'bom-rule', pid: process.pid,
    hostname: os.hostname(), started_at: new Date().toISOString(), command: process.argv.join(' '), repo_sha: sha,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      try { writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'); } finally { closeSync(fd); }
      console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${lockPath} run_id=${runId}`);
      return lockPath;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw fail('FILE_LOCK', `Cannot create global D1 lock: ${error.message}`, error);
      let existing;
      try { existing = JSON.parse(readFileSync(lockPath, 'utf8')); }
      catch (parseError) { throw fail('FILE_LOCK', `Global D1 lock exists but is unreadable: ${lockPath}`, parseError); }
      const verdict = classifyExistingLock(existing);
      if (verdict.action !== 'reap') throw fail('FILE_LOCK', `Global D1 lock ownership is unproven: ${JSON.stringify({ ...existing, verdict })}`);
      unlinkSync(lockPath);
    }
  }
  throw fail('FILE_LOCK', 'Unable to acquire global D1 lock');
}

function releaseLock(lockPath, runId) {
  if (!lockPath || !existsSync(lockPath)) return;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (lock.run_id !== runId) throw fail('FILE_LOCK', `Refusing to release lock owned by ${lock.run_id}`);
  unlinkSync(lockPath);
  console.log(`GLOBAL_D1_LOCK=RELEASED path=${lockPath} run_id=${runId}`);
}

function backup(root) {
  const output = run(process.execPath, [path.join(root, 'server', 'scripts', 'backup-local-state.mjs')], {
    cwd: root, capture: true, label: 'backup-local-state', failureClass: 'D1_STATE',
  }).stdout;
  const match = output.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/);
  if (!match || !existsSync(match[1].trim()) || Number(match[2]) <= 0) throw fail('D1_STATE', 'Backup evidence invalid');
  console.log(`BACKUP_STATUS=PASS path=${match[1].trim()} bytes=${match[2]}`);
  return match[1].trim();
}

function authEnv(origin) {
  return {
    FORGE_ORIGIN: origin,
    FORGE_ADMIN_USER: process.env.FORGE_ADMIN_USER || 'dev@example.com',
    FORGE_ADMIN_PASSWORD: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1',
    FORGE_LOCAL_REPO_ROOT: process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT,
  };
}

function applyLocalMigrations(root) {
  const server = path.join(root, 'server');
  const wranglerEntry = path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
  run(process.execPath, [
    wranglerEntry, 'd1', 'migrations', 'apply', 'cloudforge-demo', '--local', '--config', 'apps/tenant-worker/wrangler.jsonc',
  ], { cwd: server, label: 'local tenant migrations', failureClass: 'D1_STATE' });
  console.log('BOM_RULE_MIGRATION_STATUS=PASS');
}

function buildRules(root, runDir) {
  const bomBuilder = path.join(root, 'scripts', 'local-runner', 'bom-adapter.mjs');
  void bomBuilder; // keep the dependency explicit in evidence; mainBom has already rebuilt BOM locally.
  const server = path.join(root, 'server');
  const source = path.join(runDir, 'source.json');
  const sourceReport = path.join(runDir, 'source.report.json');
  const items = path.join(runDir, 'items.json');
  const itemsAudit = path.join(runDir, 'items.audit.json');
  const strict = path.join(runDir, 'strict-bom.json');
  const strictAudit = path.join(runDir, 'strict-audit.json');
  const bomPayload = path.join(runDir, 'bom-importable.json');
  const bomAudit = path.join(runDir, 'bom-importable.audit.json');
  const rules = path.join(runDir, 'bom-rules.canonical.json');
  const audit = path.join(runDir, 'bom-rules.audit.json');
  const node = process.execPath;
  const exec = (script, args, label, allowFailure = false) => run(node, [path.join(server, 'scripts', script), ...args], { cwd: root, label, failureClass: 'DATA', allowFailure });
  exec('extract-alumdoor-real-source-records.mjs', [source, sourceReport], 'BOM Rule source extraction');
  exec('build-alumdoor-item-master-payload.mjs', [source, items, itemsAudit], 'BOM Rule Item projection');
  exec('build-alumdoor-canonical-bom-payload.mjs', [source, items, strict, strictAudit], 'BOM Rule strict BOM evidence', true);
  if (!existsSync(strict) || !existsSync(strictAudit)) throw fail('DATA', 'Strict BOM builder did not produce evidence files');
  exec('build-alumdoor-canonical-bom-importable.mjs', [source, items, strict, strictAudit, bomPayload, bomAudit], 'BOM Rule source-complete BOM payload');
  exec('build-alumdoor-bom-rule-importable.mjs', [bomPayload, rules, audit], 'BOM Rule canonical builder');
  exec('import-alumdoor-bom-rule-local.mjs', [rules, path.join(runDir, 'bom-rule-validate.json'), '--validate-only'], 'BOM Rule validate-only');
  const ruleAudit = JSON.parse(readFileSync(audit, 'utf8'));
  if (Number(ruleAudit.rows_pending ?? 0) !== 0) throw fail('DATA', `BOM Rule payload still has pending rows=${ruleAudit.rows_pending}`);
  console.log(`ALUMDOOR_BOM_RULE_DATA_READY rules=${ruleAudit.rules_created} mapped=${ruleAudit.rows_mapped} applicability=${ruleAudit.applicability_count} owner_overrides=${ruleAudit.owner_overrides}`);
  return { rules, audit, bomPayload };
}

function assertSecondPass(result) {
  if (Number(result.created_count ?? 0) !== 0 || Number(result.updated_count ?? 0) !== 0 || Number(result.verification_failure_count ?? 0) !== 0) {
    throw fail('VERIFY', `BOM Rule idempotency failed created=${result.created_count} updated=${result.updated_count} verify=${result.verification_failure_count}`);
  }
}

export async function mainBomRule() {
  // One explicit command converges the existing BOM/BOM Template first, then links reusable rules.
  await mainBom();

  const root = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
  const origin = process.env.FORGE_ORIGIN || DEFAULT_ORIGIN;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  let lock = '';
  let stage = 'INFRA';
  try {
    assertLoopback(origin);
    const repo = assertRepo(root);
    await requireApi(origin);
    const runDir = path.join(root, 'local-backups', 'execution-layer', 'bom-rule', runId);
    mkdirSync(runDir, { recursive: true });
    stage = 'DATA';
    const prepared = buildRules(root, runDir);
    stage = 'LOCK';
    lock = acquireLock(root, runId, repo.local);
    stage = 'BACKUP';
    const backupPath = backup(root);
    stage = 'MIGRATION';
    applyLocalMigrations(root);
    const env = authEnv(origin);
    stage = 'IMPORT';
    const importer = path.join(root, 'server', 'scripts', 'import-alumdoor-bom-rule-local.mjs');
    const pass1Path = path.join(runDir, 'bom-rule-pass1.json');
    run(process.execPath, [importer, prepared.rules, pass1Path], { cwd: root, env, label: 'BOM Rule import pass 1', failureClass: 'IMPORTER' });
    const first = JSON.parse(readFileSync(pass1Path, 'utf8'));
    if (Number(first.verification_failure_count ?? 0) !== 0) throw fail('VERIFY', `BOM Rule pass 1 verification failures=${first.verification_failure_count}`);
    stage = 'IDEMPOTENCE';
    const pass2Path = path.join(runDir, 'bom-rule-pass2.json');
    run(process.execPath, [importer, prepared.rules, pass2Path], { cwd: root, env, label: 'BOM Rule import pass 2', failureClass: 'VERIFY' });
    const second = JSON.parse(readFileSync(pass2Path, 'utf8'));
    assertSecondPass(second);
    const audit = JSON.parse(readFileSync(prepared.audit, 'utf8'));
    const finalReport = {
      BOM_RULES: Number(audit.rules_created ?? 0),
      APPLICABILITY: Number(audit.applicability_count ?? 0),
      COMPONENTS_MAPPED: Number(first.component_mapping_count ?? 0),
      TEMPLATE_ROWS_MAPPED: Number(first.template_rows_mapped ?? 0),
      BOM_ROWS_MAPPED: Number(first.bom_rows_mapped ?? 0),
      HISTORICAL_BOM_PENDING: Number(first.historical_bom_pending_count ?? 0),
      OWNER_OVERRIDES: Number(audit.owner_overrides ?? 0),
      PENDING: Number(audit.rows_pending ?? 0),
      IDEMPOTENT_SECOND_PASS: 'PASS',
    };
    writeFileSync(path.join(runDir, 'adapter-status.json'), `${JSON.stringify({ adapter: 'bom-rule', run_id: runId, repo_sha: repo.local, backup_path: backupPath, final_report: finalReport, pass1: first, pass2: second, audit }, null, 2)}\n`);
    for (const [key, value] of Object.entries(finalReport)) console.log(`${key}=${value}`);
    console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=bom-rule run_id=${runId}`);
    console.log('EXECUTION_STATUS=SUCCESS');
  } catch (error) {
    const wrapped = error instanceof ExecutionError ? error : fail('OTHER', error?.message ?? String(error), error);
    console.error(`EXECUTION_STATUS=FAILED adapter=bom-rule stage=${stage} failure_class=${wrapped.failureClass} message=${JSON.stringify(wrapped.message)}`);
    throw wrapped;
  } finally {
    if (lock) releaseLock(lock, runId);
  }
}
