import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  ExecutionError,
  assertLocalWranglerArgs,
  classifyExistingLock,
  normalizeSpawnInvocation,
} from './run-local-import-core.mjs';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';
const DEFAULT_ORIGIN = 'http://127.0.0.1:8799';

function fail(failureClass, message, cause) {
  return new ExecutionError(failureClass, message, cause ? { cause } : {});
}

function run(command, args, { cwd, env, capture = false, label = command, failureClass = 'OTHER' } = {}) {
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
  if (result.status !== 0) throw fail(failureClass, `${label} failed with exit code ${result.status}`);
  return result.stdout ?? '';
}

function git(repoRoot, args, capture = true) {
  return run('git', ['-C', repoRoot, ...args], {
    capture,
    label: `git ${args.join(' ')}`,
    failureClass: 'CHECKOUT',
  }).trim();
}

function assertLoopback(origin) {
  let parsed;
  try { parsed = new URL(origin); } catch (error) { throw fail('ENV', `Invalid FORGE_ORIGIN: ${origin}`, error); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw fail('REMOTE_MUTATION_GUARD', `Remote mutation guard: origin must be loopback, got ${parsed.hostname}`);
  }
}

async function requireApi(origin) {
  assertLoopback(origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${origin.replace(/\/$/, '')}/api/method/metaforge.api.get_boot`, { signal: controller.signal });
    if (![200, 401, 403].includes(response.status)) throw fail('ENV', `Local API unhealthy: HTTP ${response.status}`);
  } catch (error) {
    if (error instanceof ExecutionError) throw error;
    throw fail('ENV', `Local API unavailable: ${error.message}`, error);
  } finally {
    clearTimeout(timer);
  }
}

function assertRepo(repoRoot) {
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') {
    throw fail('ENV', `Windows self-hosted runner required; got ${process.platform}`);
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw fail('DEPENDENCY', `Node >=22 required; got ${process.version}`);
  if (!existsSync(path.join(repoRoot, '.git'))) throw fail('PATH', `${repoRoot} is not a Git workspace`);
  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') throw fail('STALE_WORKTREE', `Local runtime authority must be on main; got ${branch}`);
  const dirty = git(repoRoot, ['status', '--porcelain=v1']);
  if (dirty) throw fail('STALE_WORKTREE', `Local runtime authority is dirty:\n${dirty}`);
  git(repoRoot, ['fetch', 'origin', 'main', '--prune'], false);
  const local = git(repoRoot, ['rev-parse', 'HEAD']);
  const remote = git(repoRoot, ['rev-parse', 'origin/main']);
  if (local !== remote) throw fail('STALE_WORKTREE', `Local source is not exact origin/main: local=${local} remote=${remote}`);
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();
  if (expected && expected !== local) throw fail('STALE_WORKTREE', `Expected runtime SHA mismatch: expected=${expected} actual=${local}`);
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (pkg.packageManager !== 'pnpm@9.15.0') throw fail('DEPENDENCY', `Expected pnpm@9.15.0, got ${pkg.packageManager ?? '<missing>'}`);
  return { local, remote };
}

function resolveWrangler(repoRoot) {
  for (const candidate of [
    path.join(repoRoot, 'server', 'node_modules', '.bin', 'wrangler.cmd'),
    path.join(repoRoot, 'node_modules', '.bin', 'wrangler.cmd'),
  ]) if (existsSync(candidate)) return candidate;
  throw fail('DEPENDENCY', 'Pinned Wrangler binary not found');
}

function authEnv(origin) {
  return {
    FORGE_ORIGIN: origin,
    FORGE_ADMIN_USER: process.env.FORGE_ADMIN_USER || 'dev@example.com',
    FORGE_ADMIN_PASSWORD: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1',
  };
}

function acquireLock(repoRoot, runId, repoSha) {
  const dir = path.join(repoRoot, 'local-locks');
  mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'local-d1-mutation.lock');
  const payload = {
    format: 'forge-local-d1-lock/v2',
    run_id: runId,
    adapter: 'pricing',
    pid: process.pid,
    hostname: os.hostname(),
    started_at: new Date().toISOString(),
    workflow: process.env.GITHUB_WORKFLOW || 'manual',
    github_run_id: process.env.GITHUB_RUN_ID || '',
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '',
    command: process.argv.join(' '),
    repo_sha: repoSha,
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
      try { existing = JSON.parse(readFileSync(lockPath, 'utf8')); } catch (parseError) {
        throw fail('FILE_LOCK', `Global D1 lock exists but is unreadable: ${lockPath}`, parseError);
      }
      const verdict = classifyExistingLock(existing);
      if (verdict.action !== 'reap') throw fail('FILE_LOCK', `Global D1 lock ownership is unproven: ${JSON.stringify({ ...existing, verdict })}`);
      renameSync(lockPath, `${lockPath}.stale-${Date.now()}`);
    }
  }
  throw fail('FILE_LOCK', 'Unable to acquire global D1 lock');
}

function releaseLock(lockPath, runId) {
  if (!lockPath || !existsSync(lockPath)) return;
  const existing = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (existing.run_id !== runId) throw fail('FILE_LOCK', `Refusing to release lock owned by ${existing.run_id}`);
  unlinkSync(lockPath);
  console.log(`GLOBAL_D1_LOCK=RELEASED path=${lockPath} run_id=${runId}`);
}

function runBackup(repoRoot) {
  const output = run(process.execPath, [path.join(repoRoot, 'server', 'scripts', 'backup-local-state.mjs')], {
    cwd: repoRoot,
    capture: true,
    label: 'backup-local-state',
    failureClass: 'D1_STATE',
  });
  const match = output.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/);
  if (!match) throw fail('D1_STATE', 'Backup did not emit LOCAL_STATE_BACKUP_OK evidence');
  const backupPath = match[1].trim();
  const bytes = Number(match[2]);
  if (!existsSync(backupPath) || !existsSync(path.join(backupPath, 'manifest.json')) || !Number.isFinite(bytes) || bytes <= 0) {
    throw fail('D1_STATE', `Backup evidence invalid: path=${backupPath} bytes=${bytes}`);
  }
  console.log(`BACKUP_STATUS=PASS path=${backupPath} bytes=${bytes}`);
}

function requireFiles(repoRoot) {
  const files = [
    'server/scripts/extract-alumdoor-real-source-records.mjs',
    'server/scripts/build-alumdoor-item-master-payload.mjs',
    'server/scripts/extract-alumdoor-pricing-source.mjs',
    'server/scripts/build-alumdoor-pricing-payload.mjs',
    'server/scripts/validate-alumdoor-pricing-payload.mjs',
    'server/scripts/import-alumdoor-pricing-local.mjs',
    'server/scripts/backup-local-state.mjs',
  ];
  const missing = files.filter((relative) => !existsSync(path.join(repoRoot, relative)));
  if (missing.length) throw fail('SOURCE_FILE', `Required pricing file(s) missing: ${missing.join(', ')}`);
}

function preflightPricing(repoRoot, runDir, origin) {
  requireFiles(repoRoot);
  const server = path.join(repoRoot, 'server');
  const itemSource = path.join(runDir, 'item-source.json');
  const itemSourceReport = path.join(runDir, 'item-source.report.json');
  const items = path.join(runDir, 'items.json');
  const itemsAudit = path.join(runDir, 'items.audit.json');
  const pricingSource = path.join(runDir, 'pricing-source.json');
  const pricingSourceReport = path.join(runDir, 'pricing-source.report.json');
  const payload1 = path.join(runDir, 'pricing-payload-1.json');
  const report1 = path.join(runDir, 'pricing-payload-1.report.json');
  const payload2 = path.join(runDir, 'pricing-payload-2.json');
  const report2 = path.join(runDir, 'pricing-payload-2.report.json');
  const node = process.execPath;
  const exec = (script, args, label) => run(node, [path.join(server, 'scripts', script), ...args], { cwd: repoRoot, label, failureClass: 'DATA' });

  exec('extract-alumdoor-real-source-records.mjs', [itemSource, itemSourceReport], 'pricing canonical Item extraction');
  exec('build-alumdoor-item-master-payload.mjs', [itemSource, items, itemsAudit], 'pricing canonical Item payload');
  exec('extract-alumdoor-pricing-source.mjs', [pricingSource, pricingSourceReport], 'pricing source extraction');
  exec('build-alumdoor-pricing-payload.mjs', [pricingSource, items, payload1, report1], 'pricing payload pass 1');
  exec('build-alumdoor-pricing-payload.mjs', [pricingSource, items, payload2, report2], 'pricing payload pass 2');
  if (!readFileSync(payload1).equals(readFileSync(payload2)) || !readFileSync(report1).equals(readFileSync(report2))) {
    throw fail('DATA', 'Pricing payload/report is not byte-reproducible');
  }
  exec('validate-alumdoor-pricing-payload.mjs', [pricingSource, payload1, report1], 'pricing payload validation');
  const payloadSha = crypto.createHash('sha256').update(readFileSync(payload1)).digest('hex');
  console.log(`ALUMDOOR_PRICING_PAYLOAD_SHA256 ${payloadSha}`);

  const dryPreimage = path.join(runDir, 'preimage-dry-run.json');
  run(node, [path.join(server, 'scripts', 'import-alumdoor-pricing-local.mjs'), payload1, dryPreimage], {
    cwd: repoRoot,
    env: authEnv(origin),
    label: 'pricing authenticated dry-run',
    failureClass: 'DATA',
  });
  if (!existsSync(dryPreimage) || statSync(dryPreimage).size <= 0) throw fail('DATA', 'Pricing dry-run preimage is missing or empty');
  return { payload: payload1, payloadSha };
}

function invokeWranglerLocal(wrangler, repoRoot, args) {
  assertLocalWranglerArgs(args);
  return run(wrangler, args, {
    cwd: path.join(repoRoot, 'server'),
    capture: true,
    label: 'pricing persisted D1 audit',
    failureClass: 'WRANGLER',
  });
}

function normalizePersistedAudit(raw) {
  const candidates = [raw.trim()];
  for (let index = raw.lastIndexOf('\n['); index >= 0; index = raw.lastIndexOf('\n[', index - 1)) {
    candidates.push(raw.slice(index + 1).trim());
  }
  let parsed = null;
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (Array.isArray(value)) {
        parsed = value;
        break;
      }
    } catch {}
  }
  if (!parsed) throw fail('VERIFY', 'Pricing persisted D1 audit did not contain parseable Wrangler JSON');

  const rows = parsed
    .flatMap((batch) => Array.isArray(batch?.results) ? batch.results : [])
    .filter((row) => ['Price List', 'Item Price', 'Pricing Rule'].includes(row?.doctype))
    .map((row) => ({ doctype: row.doctype, records: Number(row.records) }))
    .sort((a, b) => a.doctype.localeCompare(b.doctype));

  if (rows.length !== 3 || rows.some((row) => !Number.isInteger(row.records) || row.records < 0)) {
    throw fail('VERIFY', `Pricing persisted D1 audit rows invalid: ${JSON.stringify(rows)}`);
  }
  return JSON.stringify(rows);
}

function auditPersisted(wrangler, repoRoot) {
  const raw = invokeWranglerLocal(wrangler, repoRoot, [
    'd1', 'execute', 'cloudforge-demo', '--local', '--config', 'apps/tenant-worker/wrangler.jsonc',
    '--command', "SELECT doctype, COUNT(*) AS records FROM documents WHERE tenant_id='demo' AND doctype IN ('Price List','Item Price','Pricing Rule') GROUP BY doctype ORDER BY doctype;",
  ]);
  return { raw, semantic: normalizePersistedAudit(raw) };
}

export async function mainPricing() {
  const repoRoot = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
  const origin = process.env.FORGE_ORIGIN || DEFAULT_ORIGIN;
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  let lockPath = '';
  let stage = 'INFRA';
  try {
    console.log('INFRA_STATUS=RUNNING adapter=pricing');
    assertLoopback(origin);
    const repo = assertRepo(repoRoot);
    await requireApi(origin);
    const wrangler = resolveWrangler(repoRoot);
    run(wrangler, ['--version'], { cwd: path.join(repoRoot, 'server'), capture: true, label: 'wrangler --version', failureClass: 'DEPENDENCY' });
    console.log(`RUNNER_EVIDENCE os=${process.platform} host=${os.hostname()} repo=${repoRoot} branch=main local_sha=${repo.local} origin_main=${repo.remote}`);
    console.log(`INFRA_STATUS=PASS sha=${repo.local} repo=${repoRoot}`);

    stage = 'DATA';
    console.log('DATA_STATUS=RUNNING adapter=pricing');
    const runDir = path.join(repoRoot, 'local-backups', 'execution-layer', 'pricing', runId);
    mkdirSync(runDir, { recursive: true });
    const prepared = preflightPricing(repoRoot, runDir, origin);
    console.log('DATA_STATUS=PASS');

    stage = 'LOCK';
    lockPath = acquireLock(repoRoot, runId, repo.local);
    stage = 'BACKUP';
    runBackup(repoRoot);

    stage = 'IMPORT';
    console.log(`IMPORT_STATUS=RUNNING run_id=${runId}`);
    const importer = path.join(repoRoot, 'server', 'scripts', 'import-alumdoor-pricing-local.mjs');
    const pass1 = path.join(runDir, 'preimage-pass1.json');
    run(process.execPath, [importer, prepared.payload, pass1, '--apply'], {
      cwd: repoRoot,
      env: authEnv(origin),
      label: 'pricing apply pass 1',
      failureClass: 'IMPORTER',
    });
    const persisted1 = auditPersisted(wrangler, repoRoot);
    writeFileSync(path.join(runDir, 'persisted-pass1.txt'), persisted1.raw, 'utf8');

    const pass2 = path.join(runDir, 'preimage-pass2.json');
    run(process.execPath, [importer, prepared.payload, pass2, '--apply', '--expect-idempotent'], {
      cwd: repoRoot,
      env: authEnv(origin),
      label: 'pricing apply pass 2 idempotency',
      failureClass: 'VERIFY',
    });
    const persisted2 = auditPersisted(wrangler, repoRoot);
    writeFileSync(path.join(runDir, 'persisted-pass2.txt'), persisted2.raw, 'utf8');
    if (persisted1.semantic !== persisted2.semantic) {
      throw fail('VERIFY', `Pricing persisted D1 audit changed across idempotency pass: pass1=${persisted1.semantic} pass2=${persisted2.semantic}`);
    }
    console.log(`ALUMDOOR_PRICING_PERSISTED_AUDIT_PASS counts=${persisted2.semantic}`);
    console.log(`IMPORT_STATUS=PASS run_dir=${runDir}`);

    stage = 'VERIFY';
    await requireApi(origin);
    console.log('VERIFY_STATUS=PASS');
    console.log(`ALUMDOOR_LOCAL_PRICING_IMPORT_PASS payload_sha256=${prepared.payloadSha}`);
    console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=pricing run_id=${runId}`);
    console.log('EXECUTION_STATUS=SUCCESS');
  } catch (error) {
    const failure = error instanceof ExecutionError ? error : fail('OTHER', error?.message ?? String(error), error);
    const failureClass = failure.failureClass || 'OTHER';
    console.error(`EXECUTION_STATUS=${['INFRA','LOCK','BACKUP'].includes(stage) ? 'INFRA_BLOCKED' : stage === 'DATA' ? 'DATA_BLOCKED' : stage === 'IMPORT' ? 'IMPORT_FAILED' : 'VERIFY_FAILED'} failure_class=${failureClass} failure_stage=${stage} message=${JSON.stringify(failure.message)}`);
    throw failure;
  } finally {
    if (lockPath) releaseLock(lockPath, runId);
  }
}
