#!/usr/bin/env node
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
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  preflightRealPurchase,
  runRealPurchase,
} from './real-purchase-adapter.mjs';

const ADAPTERS = new Set([
  'bootstrap',
  'reason-master',
  'item-master',
  'uom',
  'layer0',
  'real-purchase',
]);
const DEFAULT_REPO_ROOT = 'C:\\alumdoor';
const DEFAULT_ORIGIN = 'http://127.0.0.1:8799';
const D1_STATE_RELATIVE = 'server/apps/tenant-worker/.wrangler/state';

export class ExecutionError extends Error {
  constructor(failureClass, message, options = {}) {
    super(message, options);
    this.name = 'ExecutionError';
    this.failureClass = failureClass || 'OTHER';
  }
}

function executionError(failureClass, message, cause) {
  return new ExecutionError(failureClass, message, cause ? { cause } : {});
}

export function normalizeWinPath(value) {
  return String(value).replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase();
}

export function assertPathInside(child, parent) {
  const c = normalizeWinPath(path.win32.resolve(child));
  const p = normalizeWinPath(path.win32.resolve(parent));
  if (c !== p && !c.startsWith(`${p}\\`)) {
    throw executionError('PATH', `Path escapes allowed root: child=${child} allowed=${parent}`);
  }
  return path.win32.resolve(child);
}

export function parseArgs(argv) {
  const [adapter, ...rest] = argv;
  if (!ADAPTERS.has(adapter)) {
    throw executionError(
      'OTHER',
      `Usage: node scripts/local-runner/run-local-import.mjs <${[...ADAPTERS].join('|')}> [--source=<path>]`,
    );
  }
  const options = {};
  for (const arg of rest) {
    if (arg.startsWith('--source=')) options.source = arg.slice('--source='.length);
    else throw executionError('OTHER', `Unknown argument: ${arg}`);
  }
  return { adapter, options };
}

function logStatus(kind, status, detail = '') {
  console.log(`${kind}_STATUS=${status}${detail ? ` ${detail}` : ''}`);
}

export function normalizeSpawnInvocation(
  command,
  args,
  {
    platform = process.platform,
    comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
  } = {},
) {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(command))) {
    return {
      command: comspec,
      args: ['/d', '/c', command, ...args],
    };
  }
  return { command, args };
}

function run(
  command,
  args,
  {
    cwd,
    env,
    capture = false,
    label = command,
    failureClass = 'OTHER',
  } = {},
) {
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
  if (result.error) {
    throw executionError(failureClass, `${label} failed to start: ${result.error.message}`, result.error);
  }
  if (result.status !== 0) {
    throw executionError(failureClass, `${label} failed with exit code ${result.status}`);
  }
  return result.stdout ?? '';
}

function git(repoRoot, args, capture = true) {
  return run('git', ['-C', repoRoot, ...args], {
    capture,
    label: `git ${args.join(' ')}`,
    failureClass: 'CHECKOUT',
  }).trim();
}

export function assertLocalWranglerArgs(args) {
  if (args.some((arg) => String(arg).includes('--remote'))) {
    throw executionError('REMOTE_MUTATION_GUARD', 'Remote mutation guard: --remote is forbidden');
  }
  if (!args.includes('--local')) {
    throw executionError(
      'REMOTE_MUTATION_GUARD',
      'Remote mutation guard: Wrangler D1 command must include --local',
    );
  }
}

function assertLoopbackOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (error) {
    throw executionError('ENV', `Invalid FORGE_ORIGIN: ${origin}`, error);
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw executionError(
      'REMOTE_MUTATION_GUARD',
      `Remote mutation guard: origin must be loopback, got ${parsed.hostname}`,
    );
  }
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 22) {
    throw executionError('DEPENDENCY', `Node >=22 required; got ${process.version}`);
  }
}

function resolveWrangler(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'server', 'node_modules', '.bin', 'wrangler.cmd'),
    path.join(repoRoot, 'node_modules', '.bin', 'wrangler.cmd'),
  ];
  const found = candidates.find(existsSync);
  if (!found) {
    throw executionError(
      'DEPENDENCY',
      `Pinned Wrangler binary not found; checked: ${candidates.join(', ')}`,
    );
  }
  return found;
}

function parseAheadBehind(raw) {
  const [aheadRaw, behindRaw] = String(raw).trim().split(/\s+/);
  const ahead = Number(aheadRaw);
  const behind = Number(behindRaw);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw executionError('CHECKOUT', `Cannot parse ahead/behind counts: ${JSON.stringify(raw)}`);
  }
  return { ahead, behind };
}

function assertRepoPreflight(repoRoot, { allowBehind = false } = {}) {
  if (!existsSync(path.join(repoRoot, '.git'))) {
    throw executionError('PATH', `${repoRoot} is not a Git workspace`);
  }

  const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') {
    throw executionError('STALE_WORKTREE', `Local runtime authority must be on main; got ${branch}`);
  }

  const dirty = git(repoRoot, ['status', '--porcelain=v1']);
  if (dirty) {
    throw executionError('STALE_WORKTREE', `Local runtime authority is dirty:\n${dirty}`);
  }

  git(repoRoot, ['fetch', 'origin', 'main', '--prune'], false);
  const local = git(repoRoot, ['rev-parse', 'HEAD']);
  const remote = git(repoRoot, ['rev-parse', 'origin/main']);
  const counts = parseAheadBehind(git(repoRoot, ['rev-list', '--left-right', '--count', 'HEAD...origin/main']));

  if (counts.ahead > 0) {
    throw executionError(
      'STALE_WORKTREE',
      `Local main has ${counts.ahead} commit(s) not on origin/main; refusing to overwrite`,
    );
  }
  if (!allowBehind && counts.behind > 0) {
    throw executionError(
      'STALE_WORKTREE',
      `Local source is behind origin/main by ${counts.behind}: local=${local} remote=${remote}`,
    );
  }
  if (!allowBehind && local !== remote) {
    throw executionError(
      'STALE_WORKTREE',
      `Local source is not exact origin/main: local=${local} remote=${remote}`,
    );
  }

  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();
  if (!allowBehind && expected && local !== expected) {
    throw executionError(
      'STALE_WORKTREE',
      `Expected runtime SHA mismatch: expected=${expected} actual=${local}`,
    );
  }
  if (allowBehind && expected && remote !== expected) {
    throw executionError(
      'STALE_WORKTREE',
      `Expected origin/main SHA mismatch: expected=${expected} origin_main=${remote}`,
    );
  }

  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (pkg.packageManager !== 'pnpm@9.15.0') {
    throw executionError(
      'DEPENDENCY',
      `Expected pnpm@9.15.0, got ${pkg.packageManager ?? '<missing>'}`,
    );
  }

  return { branch, local, remote, ...counts };
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function classifyExistingLock(lock, hostname = os.hostname()) {
  const sameHost = lock?.hostname === hostname;
  const validPid = Number.isInteger(lock?.pid) && lock.pid > 0;
  const alive = sameHost && validPid ? isPidAlive(lock.pid) : null;

  if (alive === true) return { action: 'block', reason: 'owner_alive' };
  if (sameHost && alive === false) return { action: 'reap', reason: 'dead_owner' };
  return {
    action: 'block',
    reason: sameHost ? 'invalid_or_unknown_owner' : 'different_host',
  };
}

function acquireLock(repoRoot, adapter, runId, repoSha) {
  const dir = path.join(repoRoot, 'local-locks');
  mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'local-d1-mutation.lock');
  const payload = {
    format: 'forge-local-d1-lock/v2',
    run_id: runId,
    adapter,
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
      try {
        writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      } finally {
        closeSync(fd);
      }
      console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${lockPath} run_id=${runId}`);
      return lockPath;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw executionError('FILE_LOCK', `Cannot create global D1 lock: ${error.message}`, error);
      }

      let existing;
      try {
        existing = JSON.parse(readFileSync(lockPath, 'utf8'));
      } catch (parseError) {
        throw executionError(
          'FILE_LOCK',
          `Global D1 lock exists but is unreadable: ${lockPath}`,
          parseError,
        );
      }

      const verdict = classifyExistingLock(existing);
      if (verdict.action !== 'reap') {
        throw executionError(
          'FILE_LOCK',
          `Global D1 lock is active or ownership is unproven: ${JSON.stringify({ ...existing, verdict })}`,
        );
      }

      const stalePath = `${lockPath}.stale-${Date.now()}`;
      renameSync(lockPath, stalePath);
      console.warn(`Reaped dead-owner local D1 lock -> ${stalePath}`);
    }
  }

  throw executionError('FILE_LOCK', 'Unable to acquire global D1 lock');
}

function releaseLock(lockPath, runId) {
  if (!lockPath || !existsSync(lockPath)) return;
  let existing;
  try {
    existing = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    throw executionError('FILE_LOCK', `Cannot read lock during release: ${lockPath}`, error);
  }
  if (existing.run_id !== runId) {
    throw executionError('FILE_LOCK', `Refusing to release lock owned by ${existing.run_id}`);
  }
  unlinkSync(lockPath);
  console.log(`GLOBAL_D1_LOCK=RELEASED path=${lockPath} run_id=${runId}`);
}

async function probeUrl(url, acceptedStatuses, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!acceptedStatuses.includes(response.status)) {
      throw executionError('ENV', `${label} unhealthy: HTTP ${response.status} url=${url}`);
    }
  } catch (error) {
    if (error instanceof ExecutionError) throw error;
    throw executionError('ENV', `${label} unavailable: ${error.message}`, error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `waitMs` — chờ dịch vụ SỐNG LẠI, không phải nới lỏng điều kiện.
 *
 * `restoreRuntime` tắt cờ maintenance rồi trả về ngay; nó chỉ chờ sẵn sàng cho Desk
 * (`ALUMDOOR_RUNTIME_DESK_READY`), không chờ backend. Backend vừa bị recycle nên cần vài
 * giây mới nghe lại cổng 8799 — mà `requireApi` lại bắn đúng một phát rồi bỏ cuộc. Kết quả:
 * `layer0` ghi D1 xong, mở maintenance, rồi TỰ ĐÁNH TRƯỢT ở bước ngay sau đó, lần nào cũng
 * hệt nhau. Đây là chạy đua về thời điểm, không phải hạ tầng hỏng.
 *
 * Ngưỡng vẫn là ngưỡng: hết `waitMs` mà chưa lên thì ném đúng lỗi ENV như cũ.
 */
async function requireUrl(url, acceptedStatuses, label, { waitMs = 0 } = {}) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await probeUrl(url, acceptedStatuses, label);
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function requireApi(origin) {
  assertLoopbackOrigin(origin);
  await requireUrl(
    `${origin.replace(/\/$/, '')}/api/method/metaforge.api.get_boot`,
    [200, 401, 403],
    'Local API',
    { waitMs: 90_000 },
  );
}

async function requireUi() {
  // Cùng lý do với requireApi: Desk vừa bị recycle thì Vite cần thời gian dựng lại.
  await requireUrl('http://127.0.0.1:5173', [200], 'Local UI', { waitMs: 90_000 });
}

function runBackup(repoRoot) {
  const output = run(
    process.execPath,
    [path.join(repoRoot, 'server', 'scripts', 'backup-local-state.mjs')],
    {
      cwd: repoRoot,
      capture: true,
      label: 'backup-local-state',
      failureClass: 'D1_STATE',
    },
  );

  const match = output.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/);
  if (!match) {
    throw executionError('D1_STATE', 'Backup did not emit LOCAL_STATE_BACKUP_OK evidence');
  }

  const backupPath = match[1].trim();
  const bytes = Number(match[2]);
  const manifestPath = path.join(backupPath, 'manifest.json');
  if (!existsSync(backupPath) || !existsSync(manifestPath)) {
    throw executionError('D1_STATE', `Backup evidence path is missing: ${backupPath}`);
  }
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw executionError('D1_STATE', `Backup is empty: path=${backupPath} bytes=${bytes}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw executionError('D1_STATE', `Backup manifest is unreadable: ${manifestPath}`, error);
  }
  if (manifest.format !== 'forge-local-state-backup/v1') {
    throw executionError('D1_STATE', `Unexpected backup manifest format: ${manifest.format}`);
  }

  console.log(`BACKUP_STATUS=PASS path=${backupPath} bytes=${bytes}`);
  return { backupPath, bytes, manifest };
}

function authEnv() {
  return {
    FORGE_ORIGIN: process.env.FORGE_ORIGIN || DEFAULT_ORIGIN,
    FORGE_ADMIN_USER: process.env.FORGE_ADMIN_USER || 'dev@example.com',
    FORGE_ADMIN_PASSWORD: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1',
  };
}

function invokeWranglerLocal(wrangler, repoRoot, args) {
  assertLocalWranglerArgs(args);
  return run(wrangler, args, {
    cwd: path.join(repoRoot, 'server'),
    capture: true,
    label: 'wrangler local D1',
    failureClass: 'WRANGLER',
  });
}

function makeRunDir(repoRoot, adapter, runId) {
  const dir = path.join(repoRoot, 'local-backups', 'execution-layer', adapter, runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function requireFiles(repoRoot, files, failureClass = 'SOURCE_FILE') {
  const missing = files.filter((relative) => !existsSync(path.join(repoRoot, relative)));
  if (missing.length) {
    throw executionError(failureClass, `Required file(s) missing: ${missing.join(', ')}`);
  }
}

function preflightReason(repoRoot) {
  requireFiles(repoRoot, [
    'server/scripts/import-alumdoor-reason-master-local.mjs',
    'server/briefs/alumdoor-v2.fixtures.json',
  ]);
  let source;
  try {
    source = JSON.parse(
      readFileSync(path.join(repoRoot, 'server', 'briefs', 'alumdoor-v2.fixtures.json'), 'utf8'),
    );
  } catch (error) {
    throw executionError('DATA', `Reason Master fixture JSON is invalid: ${error.message}`, error);
  }
  const cancel = 'Lý do huỷ';
  const variance = 'Nguyên nhân chênh lệch';
  const fixtures = Array.isArray(source.fixtures) ? source.fixtures : [];
  const cancelCount = fixtures.filter((row) => row?.type === cancel).length;
  const varianceCount = fixtures.filter((row) => row?.type === variance).length;
  if (cancelCount !== 6 || varianceCount !== 7) {
    throw executionError(
      'DATA',
      `Reason Master fixture gate failed: cancellation=${cancelCount}/6 variance=${varianceCount}/7`,
    );
  }
  return {};
}

function preflightUom(repoRoot) {
  requireFiles(repoRoot, [
    'server/scripts/backup-alumdoor-uom-local.mjs',
    'server/scripts/seed-alumdoor-uom-local.mjs',
  ]);
  return {};
}

function preflightItem(repoRoot, runDir, sourceArg) {
  if (!sourceArg) {
    throw executionError('SOURCE_FILE', 'item-master requires --source=<path>');
  }
  const source = assertPathInside(sourceArg, path.join(repoRoot, 'local-imports'));
  if (!existsSync(source)) {
    throw executionError('SOURCE_FILE', `Item source records file not found: ${source}`);
  }

  requireFiles(repoRoot, [
    'server/scripts/backup-alumdoor-uom-local.mjs',
    'server/scripts/build-alumdoor-item-master-payload.mjs',
    'server/scripts/import-alumdoor-item-master-local.mjs',
  ]);

  const server = path.join(repoRoot, 'server');
  const payload = path.join(runDir, 'item-master-payload.json');
  const audit = path.join(runDir, 'item-master-audit.json');
  const uom = path.join(runDir, 'uom-preflight.json');
  const env = authEnv();

  run(process.execPath, [path.join(server, 'scripts', 'backup-alumdoor-uom-local.mjs'), uom], {
    cwd: server,
    env,
    label: 'Item UOM prerequisite',
    failureClass: 'DATA',
  });
  const uomReport = JSON.parse(readFileSync(uom, 'utf8'));
  /**
   * Điều kiện là "MỌI đơn vị chuẩn đã có mặt", không phải "đúng 19 cái" — chỗ thứ TƯ cùng một
   * hằng số, sau chốt chặn seed, hậu kiểm layer0 và test catalog. Bốn nơi cùng khoá một con
   * số nghĩa là danh mục đơn vị không thể co giãn nếu không sửa cả bốn; đó không phải bảo vệ,
   * đó là bê tông. Điều kiện thật cho Item là mỗi đơn vị nó sắp tham chiếu đều tồn tại.
   */
  const uomCanonical = Number(uomReport.canonical_count);
  const uomExisting = Number(uomReport.existing_count);
  const uomMissing = (uomReport.records ?? []).filter((row) => !row.existed).map((row) => row.name);
  if (!Number.isInteger(uomCanonical) || uomCanonical <= 0 || uomExisting !== uomCanonical || uomMissing.length) {
    throw executionError(
      'DATA',
      `Item import blocked: thiếu đơn vị tính chuẩn (canonical=${uomCanonical} existing=${uomExisting}${uomMissing.length ? ` missing=${uomMissing.join(', ')}` : ''})`,
    );
  }

  run(
    process.execPath,
    [path.join(server, 'scripts', 'build-alumdoor-item-master-payload.mjs'), source, payload, audit],
    {
      cwd: server,
      label: 'Item payload builder',
      failureClass: 'DATA',
    },
  );

  let auditReport;
  try {
    auditReport = JSON.parse(readFileSync(audit, 'utf8'));
  } catch (error) {
    throw executionError('DATA', `Item audit output is unreadable: ${audit}`, error);
  }
  for (const key of ['item_master_blocker_count', 'other_blocker_count', 'item_payload_blocker_count']) {
    if (Number(auditReport[key]) !== 0) {
      throw executionError('DATA', `Item data preflight blocked: ${key}=${auditReport[key]}`);
    }
  }

  run(
    process.execPath,
    [path.join(server, 'scripts', 'import-alumdoor-item-master-local.mjs'), payload, '--validate-only'],
    {
      cwd: server,
      label: 'Item validate-only',
      failureClass: 'SCHEMA',
    },
  );

  return { source, payload };
}

function preflightLayer0(repoRoot, runDir) {
  requireFiles(repoRoot, [
    'server/scripts/seed-alumdoor-item-groups-local.sql',
    'server/scripts/build-alumdoor-color-correction.mjs',
    'server/scripts/seed-alumdoor-material-specifications-local.mjs',
    'server/scripts/seed-alumdoor-measurement-geometry-local.mjs',
    'server/scripts/seed-alumdoor-uom-local.mjs',
  ]);

  const server = path.join(repoRoot, 'server');
  const colorSql = path.join(runDir, 'layer0-color.sql');
  const materialSql = path.join(runDir, 'layer0-material-spec.sql');
  const geometrySql = path.join(runDir, 'layer0-measurement-geometry.sql');

  run(
    process.execPath,
    [path.join(server, 'scripts', 'build-alumdoor-color-correction.mjs'), '--tenant', 'demo', '--sql', colorSql],
    { cwd: server, label: 'Layer0 color SQL preflight', failureClass: 'DATA' },
  );
  run(
    process.execPath,
    [path.join(server, 'scripts', 'seed-alumdoor-material-specifications-local.mjs'), 'demo', materialSql],
    { cwd: server, label: 'Layer0 material SQL preflight', failureClass: 'DATA' },
  );
  run(
    process.execPath,
    [path.join(server, 'scripts', 'seed-alumdoor-measurement-geometry-local.mjs'), 'demo', geometrySql],
    { cwd: server, label: 'Layer0 geometry SQL preflight', failureClass: 'DATA' },
  );

  for (const file of [colorSql, materialSql, geometrySql]) {
    if (!existsSync(file) || statSync(file).size <= 0) {
      throw executionError('DATA', `Layer0 generated SQL is empty or missing: ${file}`);
    }
  }

  return { colorSql, materialSql, geometrySql };
}

function preflightBootstrap(repoRoot) {
  requireFiles(repoRoot, [
    'sync-local.bat',
    'server/scripts/backup-local-state.mjs',
    'server/scripts/alumdoor-runtime-maintenance.mjs',
  ], 'DEPENDENCY');
  return {};
}

function preflightData(adapter, repoRoot, runDir, options) {
  if (adapter === 'reason-master') return preflightReason(repoRoot);
  if (adapter === 'uom') return preflightUom(repoRoot);
  if (adapter === 'item-master') return preflightItem(repoRoot, runDir, options.source);
  if (adapter === 'layer0') return preflightLayer0(repoRoot, runDir);
  if (adapter === 'real-purchase') {
    return preflightRealPurchase({
      repoRoot,
      runDir,
      exec: run,
      env: authEnv(),
      fail: executionError,
    });
  }
  if (adapter === 'bootstrap') return preflightBootstrap(repoRoot);
  throw executionError('OTHER', `No data preflight registered for adapter=${adapter}`);
}

function powershell(script, label, failureClass = 'PERMISSION') {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { capture: true, label, failureClass },
  );
}

function managedRuntimeServices() {
  const script =
    "$names=@('ForgeAlumdoorBackend','ForgeAlumdoorDesk'); " +
    "$services=@($names|%{Get-Service -Name $_ -ErrorAction SilentlyContinue}|?{$_}); " +
    "$services|%{Write-Output ($_.Name + '|' + $_.Status)}";
  const output = powershell(script, 'inspect Alumdoor runtime services', 'PERMISSION');
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^ForgeAlumdoor(?:Backend|Desk)\|/.test(line));
}

function listenerEvidence() {
  const script =
    "$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|" +
    "?{$_.LocalPort -in @(8799,5173)}); " +
    "$listeners|%{ $p=Get-CimInstance Win32_Process -Filter (\"ProcessId=\" + $_.OwningProcess) " +
    "-ErrorAction SilentlyContinue; Write-Output " +
    "(\"port=\"+$_.LocalPort+\" pid=\"+$_.OwningProcess+\" name=\"+$p.Name+\" parent=\"+$p.ParentProcessId+\" exe=\"+$p.ExecutablePath) }";
  return powershell(script, 'inspect local runtime listeners', 'PERMISSION')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function waitForPortsQuiet() {
  const script =
    "$deadline=(Get-Date).AddSeconds(30); $quietSince=$null; do { " +
    "$l=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|?{$_.LocalPort -in @(8799,5173)}); " +
    "if($l.Count -eq 0){ if($null -eq $quietSince){$quietSince=Get-Date}; " +
    "if(((Get-Date)-$quietSince).TotalSeconds -ge 3){exit 0} } else {$quietSince=$null}; " +
    "Start-Sleep -Milliseconds 500 } while((Get-Date)-lt $deadline); " +
    "$l|%{ $p=Get-CimInstance Win32_Process -Filter (\"ProcessId=\"+$_.OwningProcess) -ErrorAction SilentlyContinue; " +
    "Write-Output (\"BLOCKING_LISTENER port=\"+$_.LocalPort+\" pid=\"+$_.OwningProcess+\" name=\"+$p.Name+\" parent=\"+$p.ParentProcessId+\" exe=\"+$p.ExecutablePath) }; exit 9";
  powershell(script, 'quiesce managed local runtime', 'PERMISSION');
}

function quiesceRuntime(repoRoot) {
  const maintenance = path.join(repoRoot, 'server', 'scripts', 'alumdoor-runtime-maintenance.mjs');
  if (!existsSync(maintenance)) {
    throw executionError('DEPENDENCY', `Runtime maintenance helper missing: ${maintenance}`);
  }

  const services = managedRuntimeServices();
  if (services.length === 0) {
    const listeners = listenerEvidence();
    if (listeners.length) {
      throw executionError(
        'PERMISSION',
        `Unmanaged local runtime listeners block safe D1 mutation. Stop them explicitly; blind taskkill is forbidden. ${listeners.join(' | ')}`,
      );
    }
    console.log('RUNTIME_QUIESCE=PASS mode=no-managed-services listeners=0');
    return { maintenanceEnabled: false, services: [] };
  }

  run(process.execPath, [maintenance, 'on'], {
    cwd: repoRoot,
    label: 'enable runtime maintenance',
    failureClass: 'PERMISSION',
  });
  waitForPortsQuiet();
  console.log(`RUNTIME_QUIESCE=PASS mode=managed services=${services.join(',')}`);
  return { maintenanceEnabled: true, services };
}

function restoreRuntime(repoRoot, runtimeState) {
  if (!runtimeState?.maintenanceEnabled) return;
  const maintenance = path.join(repoRoot, 'server', 'scripts', 'alumdoor-runtime-maintenance.mjs');
  run(process.execPath, [maintenance, 'off'], {
    cwd: repoRoot,
    label: 'disable runtime maintenance',
    failureClass: 'PERMISSION',
  });
  runtimeState.maintenanceEnabled = false;
  console.log('RUNTIME_RESTORE=PASS maintenance=off');
}

function runReason(repoRoot, wrangler, runDir) {
  const script = path.join(repoRoot, 'server', 'scripts', 'import-alumdoor-reason-master-local.mjs');
  run(process.execPath, [script], {
    cwd: path.join(repoRoot, 'server'),
    env: authEnv(),
    label: 'reason-master importer',
    failureClass: 'IMPORTER',
  });
  invokeWranglerLocal(wrangler, repoRoot, [
    'd1',
    'execute',
    'cloudforge-demo',
    '--local',
    '--config',
    'apps/tenant-worker/wrangler.jsonc',
    '--command',
    "SELECT hex(doctype) AS doctype_hex, COUNT(*) AS records FROM documents WHERE tenant_id='demo' AND hex(doctype) IN ('4CC3BD20646F206875E1BBB7','4E677579C3AA6E206E68C3A26E206368C3AA6E68206CE1BB876368') GROUP BY hex(doctype) ORDER BY hex(doctype);",
  ]);
  writeFileSync(
    path.join(runDir, 'adapter-status.json'),
    `${JSON.stringify({ adapter: 'reason-master', verified_at: new Date().toISOString() }, null, 2)}\n`,
  );
}

function runUom(repoRoot, runDir) {
  const server = path.join(repoRoot, 'server');
  const pre = path.join(runDir, 'uom-before.json');
  const after = path.join(runDir, 'uom-after.json');
  const env = authEnv();

  run(process.execPath, [path.join(server, 'scripts', 'backup-alumdoor-uom-local.mjs'), pre], {
    cwd: server,
    env,
    label: 'UOM preimage',
    failureClass: 'IMPORTER',
  });
  run(process.execPath, [path.join(server, 'scripts', 'seed-alumdoor-uom-local.mjs')], {
    cwd: server,
    env,
    label: 'UOM seed pass 1',
    failureClass: 'IMPORTER',
  });
  run(process.execPath, [path.join(server, 'scripts', 'seed-alumdoor-uom-local.mjs')], {
    cwd: server,
    env,
    label: 'UOM seed pass 2',
    failureClass: 'IMPORTER',
  });
  run(process.execPath, [path.join(server, 'scripts', 'backup-alumdoor-uom-local.mjs'), after], {
    cwd: server,
    env,
    label: 'UOM postimage',
    failureClass: 'VERIFY',
  });

  const report = JSON.parse(readFileSync(after, 'utf8'));
  /**
   * Luật là "MỌI đơn vị chuẩn đều đã tồn tại", không phải "đúng 19 cái".
   *
   * Con số 19 khoá cứng ở đây là chỗ thứ ba cùng một hằng số — sau chốt chặn trong
   * backup-alumdoor-uom-local.mjs và test alumdoor-uom-catalog. Gỡ `Thùng` theo E07 làm cả
   * ba đỏ, trong đó chỗ này đỏ với thông báo `canonical=18 existing=18` — hai số KHỚP nhau
   * mà vẫn báo hỏng. Một hậu kiểm nói sai lý do còn tệ hơn không có hậu kiểm.
   */
  const canonicalCount = Number(report.canonical_count);
  const existingCount = Number(report.existing_count);
  if (
    !Number.isInteger(canonicalCount) || canonicalCount <= 0 ||
    existingCount !== canonicalCount ||
    report.records?.some((row) => !row.existed)
  ) {
    throw executionError(
      'VERIFY',
      `UOM post-verify failed: canonical=${report.canonical_count} existing=${report.existing_count}`,
    );
  }
  console.log('ALUMDOOR_LOCAL_UOM_IDEMPOTENCE_PASS canonical=19');
}

function runItem(repoRoot, runDir, prepared) {
  const server = path.join(repoRoot, 'server');
  const pre = path.join(runDir, 'item-preimage.json');
  const rerun = path.join(runDir, 'item-preimage-rerun.json');
  const env = authEnv();

  run(
    process.execPath,
    [path.join(server, 'scripts', 'import-alumdoor-item-master-local.mjs'), prepared.payload, pre],
    {
      cwd: server,
      env,
      label: 'Item import pass 1',
      failureClass: 'IMPORTER',
    },
  );
  const output = run(
    process.execPath,
    [path.join(server, 'scripts', 'import-alumdoor-item-master-local.mjs'), prepared.payload, rerun],
    {
      cwd: server,
      env,
      capture: true,
      label: 'Item import pass 2',
      failureClass: 'IMPORTER',
    },
  );
  if (!/ALUMDOOR_ITEM_LOCAL_IMPORT_PASS created=0\b/.test(output)) {
    throw executionError(
      'VERIFY',
      'Item idempotency failed: second pass did not report created=0',
    );
  }
  console.log('ALUMDOOR_LOCAL_ITEM_MASTER_IDEMPOTENCE_PASS');
}

function runLayer0Direct(repoRoot, wrangler, prepared) {
  for (const file of [
    'scripts/seed-alumdoor-item-groups-local.sql',
    prepared.colorSql,
    prepared.materialSql,
    prepared.geometrySql,
  ]) {
    invokeWranglerLocal(wrangler, repoRoot, [
      'd1',
      'execute',
      'cloudforge-demo',
      '--local',
      '--config',
      'apps/tenant-worker/wrangler.jsonc',
      `--file=${file}`,
    ]);
  }
}

function syncBootstrapSource(repoRoot, preflight) {
  if (preflight.behind > 0) {
    git(repoRoot, ['merge', '--ff-only', 'origin/main'], false);
  }
  const actual = git(repoRoot, ['rev-parse', 'HEAD']);
  if (actual !== preflight.remote) {
    throw executionError(
      'CHECKOUT',
      `Bootstrap source sync mismatch: actual=${actual} origin_main=${preflight.remote}`,
    );
  }
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();
  if (expected && actual !== expected) {
    throw executionError(
      'STALE_WORKTREE',
      `Bootstrap expected SHA mismatch after sync: expected=${expected} actual=${actual}`,
    );
  }
  console.log(`BOOTSTRAP_SOURCE_SYNC=PASS sha=${actual}`);
  return actual;
}

function runBootstrap(repoRoot, preflight) {
  const actual = syncBootstrapSource(repoRoot, preflight);
  run(
    'cmd.exe',
    ['/d', '/c', `${repoRoot}\\sync-local.bat --bootstrap --skip-source-verify`],
    {
      cwd: repoRoot,
      label: 'sync-local bootstrap',
      failureClass: 'IMPORTER',
    },
  );
  return actual;
}

export function classifyOutcome(stage, failureClass) {
  if (['DATA', 'SOURCE_FILE', 'SCHEMA'].includes(failureClass)) return 'DATA_BLOCKED';
  if (failureClass === 'VERIFY' || stage === 'VERIFY') return 'VERIFY_FAILED';
  if (stage === 'IMPORT') return 'IMPORT_FAILED';
  return 'INFRA_BLOCKED';
}

function emitFailure(error, stage, context) {
  const failureClass = error?.failureClass || 'OTHER';
  const outcome = classifyOutcome(stage, failureClass);
  const statusKind =
    outcome === 'DATA_BLOCKED'
      ? 'DATA'
      : outcome === 'VERIFY_FAILED'
        ? 'VERIFY'
        : outcome === 'IMPORT_FAILED'
          ? 'IMPORT'
          : 'INFRA';

  logStatus(
    statusKind,
    outcome.endsWith('FAILED') ? 'FAILED' : 'BLOCKED',
    `failure_class=${failureClass} failure_stage=${stage} message=${JSON.stringify(error?.message ?? String(error))}`,
  );
  console.log(
    [
      `EXECUTION_STATUS=${outcome}`,
      `failure_class=${failureClass}`,
      `failure_stage=${stage}`,
      `canonical_repo=${context.repoRoot}`,
      `working_directory=${context.repoRoot}`,
      `d1_state_path=${context.d1StatePath}`,
      `run_id=${context.runId}`,
      `workflow=${process.env.GITHUB_WORKFLOW || 'manual'}`,
      `github_run_id=${process.env.GITHUB_RUN_ID || ''}`,
    ].join(' '),
  );
}

export async function main(argv = process.argv.slice(2)) {
  const { adapter, options } = parseArgs(argv);
  const repoRoot = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
  const origin = process.env.FORGE_ORIGIN || DEFAULT_ORIGIN;
  const d1StatePath = path.join(repoRoot, D1_STATE_RELATIVE);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const context = { adapter, repoRoot, origin, d1StatePath, runId };

  let stage = 'INFRA';
  let lockPath = '';
  let runtimeState = null;
  let failure = null;
  let preflight = null;
  let prepared = null;
  let runDir = '';
  let wrangler = '';

  logStatus('INFRA', 'RUNNING', `adapter=${adapter}`);
  try {
    if (
      process.platform !== 'win32' &&
      process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1'
    ) {
      throw executionError(
        'ENV',
        `Windows self-hosted runner required; got ${process.platform}`,
      );
    }

    assertNodeVersion();
    assertLoopbackOrigin(origin);
    preflight = assertRepoPreflight(repoRoot, { allowBehind: adapter === 'bootstrap' });
    wrangler = adapter === 'bootstrap' ? '' : resolveWrangler(repoRoot);

    const wranglerVersion =
      adapter === 'bootstrap'
        ? 'not-required-for-bootstrap'
        : run(wrangler, ['--version'], {
            cwd: path.join(repoRoot, 'server'),
            capture: true,
            label: 'wrangler --version',
            failureClass: 'DEPENDENCY',
          }).trim();

    if (!['layer0', 'bootstrap'].includes(adapter)) await requireApi(origin);

    console.log(
      `RUNNER_EVIDENCE os=${process.platform} host=${os.hostname()} repo=${repoRoot} branch=${preflight.branch} local_sha=${preflight.local} origin_main=${preflight.remote} node=${process.version} wrangler=${JSON.stringify(wranglerVersion)} d1_state=${d1StatePath}`,
    );
    logStatus('INFRA', 'PASS', `sha=${preflight.local} repo=${repoRoot}`);

    runDir = makeRunDir(repoRoot, adapter, runId);
    writeFileSync(
      path.join(runDir, 'run.json'),
      `${JSON.stringify(
        {
          adapter,
          run_id: runId,
          expected_sha: process.env.FORGE_LOCAL_EXPECTED_SHA || '',
          local_sha: preflight.local,
          origin_main: preflight.remote,
          repo_root: repoRoot,
          working_directory: repoRoot,
          d1_state_path: d1StatePath,
          workflow: process.env.GITHUB_WORKFLOW || 'manual',
          github_run_id: process.env.GITHUB_RUN_ID || '',
          started_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );

    stage = 'DATA';
    logStatus('DATA', 'RUNNING', `adapter=${adapter}`);
    prepared = preflightData(adapter, repoRoot, runDir, options);
    logStatus('DATA', 'PASS');

    stage = 'LOCK';
    lockPath = acquireLock(repoRoot, adapter, runId, preflight.local);

    if (['layer0', 'bootstrap'].includes(adapter)) {
      stage = 'QUIESCE';
      runtimeState = quiesceRuntime(repoRoot);
    }

    stage = 'BACKUP';
    runBackup(repoRoot);

    stage = 'IMPORT';
    logStatus('IMPORT', 'RUNNING', `run_id=${runId}`);
    if (adapter === 'reason-master') {
      runReason(repoRoot, wrangler, runDir);
    } else if (adapter === 'uom') {
      runUom(repoRoot, runDir);
    } else if (adapter === 'item-master') {
      runItem(repoRoot, runDir, prepared);
    } else if (adapter === 'layer0') {
      runLayer0Direct(repoRoot, wrangler, prepared);
      restoreRuntime(repoRoot, runtimeState);
      await requireApi(origin);
      runUom(repoRoot, runDir);
    } else if (adapter === 'real-purchase') {
      runRealPurchase({
        repoRoot,
        runDir,
        prepared,
        exec: run,
        env: authEnv(),
        fail: executionError,
        invokeWranglerLocal: (args) => invokeWranglerLocal(wrangler, repoRoot, args),
        runBackup: () => runBackup(repoRoot),
      });
    } else if (adapter === 'bootstrap') {
      const syncedSha = runBootstrap(repoRoot, preflight);
      preflight.local = syncedSha;
      restoreRuntime(repoRoot, runtimeState);
    }
    logStatus('IMPORT', 'PASS', `run_dir=${runDir}`);

    stage = 'VERIFY';
    logStatus('VERIFY', 'RUNNING');
    await requireApi(origin);
    if (adapter === 'bootstrap') await requireUi();
    if (adapter === 'layer0') {
      invokeWranglerLocal(wrangler, repoRoot, [
        'd1',
        'execute',
        'cloudforge-demo',
        '--local',
        '--config',
        'apps/tenant-worker/wrangler.jsonc',
        '--command',
        "SELECT doctype, COUNT(*) AS records FROM documents WHERE tenant_id='demo' AND doctype IN ('Item Group','Surface Finish','Item Color','Material Specification','Measurement Profile','Geometry Field','Geometry Profile') GROUP BY doctype ORDER BY doctype;",
      ]);
    }
    logStatus('VERIFY', 'PASS');
  } catch (error) {
    failure = error instanceof ExecutionError
      ? error
      : executionError('OTHER', error?.message ?? String(error), error);
  } finally {
    if (runtimeState?.maintenanceEnabled) {
      try {
        restoreRuntime(repoRoot, runtimeState);
      } catch (cleanupError) {
        console.error(`RUNTIME_RESTORE=FAILED message=${JSON.stringify(cleanupError?.message ?? String(cleanupError))}`);
        if (!failure) {
          stage = 'RESTORE';
          failure = cleanupError instanceof ExecutionError
            ? cleanupError
            : executionError('PERMISSION', cleanupError?.message ?? String(cleanupError), cleanupError);
        }
      }
    }

    if (lockPath) {
      try {
        releaseLock(lockPath, runId);
      } catch (lockError) {
        console.error(`GLOBAL_D1_LOCK=RELEASE_FAILED message=${JSON.stringify(lockError?.message ?? String(lockError))}`);
        if (!failure) {
          failure = lockError instanceof ExecutionError
            ? lockError
            : executionError('FILE_LOCK', lockError?.message ?? String(lockError), lockError);
        }
      }
    }
  }

  if (failure) {
    emitFailure(failure, stage, context);
    throw failure;
  }

  console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=${adapter} run_id=${runId}`);
  console.log('EXECUTION_STATUS=SUCCESS');
}

// Only auto-run when this module is the process entry point. Matching the parent
// wrapper's filename made the core run a second time on every `run-local-import.mjs`
// invocation: the wrapper already routes to coreMain, so the duplicate run raced the
// wrapper for the global D1 lock and failed adapters the wrapper owns (pricing/bom/customer).
if (process.argv[1]?.endsWith('run-local-import-core.mjs')) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  });
}
