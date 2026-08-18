#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';
const DEFAULT_ORIGIN = 'http://127.0.0.1:8799';
const DEFAULT_BRANCH = 'agent-live';
const SOURCE_RELATIVE = path.join(
  'apps',
  'alumdoor',
  'docs',
  'nguon',
  'don-hang-xuat-hang',
  'LỊCH-SẢN-XUẤT.md',
);

const apply = process.argv.includes('--apply');
const expectIdempotent = process.argv.includes('--expect-idempotent');
const repoRoot = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
const origin = (process.env.FORGE_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
const authorityBranch = process.env.FORGE_LIVE_BRANCH || DEFAULT_BRANCH;
const sourcePath = path.join(repoRoot, SOURCE_RELATIVE);
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
const runDir = path.join(repoRoot, 'local-backups', 'execution-layer', 'production-standard', runId);

function fail(code, message, cause) {
  const error = new Error(`${code}: ${message}`, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function run(program, args, { cwd = repoRoot, capture = false, env } = {}) {
  const isShim = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(program));
  const invocation = isShim
    ? { command: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/c', program, ...args] }
    : { command: program, args };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw fail('PROCESS_START_FAILED', `${program}: ${result.error.message}`, result.error);
  if (result.status !== 0) {
    const detail = capture ? `${result.stderr || ''}${result.stdout || ''}`.trim() : '';
    throw fail('PROCESS_FAILED', `${program} ${args.join(' ')} exit=${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function git(args, capture = true) {
  return run('git', ['-C', repoRoot, ...args], { capture });
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function assertLocalOnly() {
  let parsed;
  try { parsed = new URL(origin); }
  catch (error) { throw fail('INVALID_ORIGIN', origin, error); }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw fail('REMOTE_MUTATION_GUARD', `origin must be loopback, got ${parsed.hostname}`);
  }
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') {
    throw fail('WINDOWS_REQUIRED', `canonical runtime is Windows; got ${process.platform}`);
  }
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw fail('NODE_VERSION', `Node >=22 required; got ${process.version}`);
  }
}

function assertAuthorityCheckout() {
  if (!existsSync(path.join(repoRoot, '.git'))) throw fail('NOT_GIT_WORKSPACE', repoRoot);
  const branch = git(['branch', '--show-current']);
  if (branch !== authorityBranch) {
    throw fail('STALE_WORKTREE', `expected branch ${authorityBranch}, got ${branch || 'DETACHED'}`);
  }
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=no']);
  if (dirty) throw fail('STALE_WORKTREE', `tracked changes present:\n${dirty}`);
  git(['fetch', 'origin', `+refs/heads/${authorityBranch}:refs/remotes/origin/${authorityBranch}`, '--prune'], false);
  const local = git(['rev-parse', 'HEAD']);
  const remote = git(['rev-parse', `origin/${authorityBranch}`]);
  if (local !== remote) {
    throw fail('STALE_WORKTREE', `local ${authorityBranch} is not exact origin/${authorityBranch}: local=${local} remote=${remote}`);
  }
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();
  if (expected && expected !== local) throw fail('STALE_WORKTREE', `expected SHA ${expected}, got ${local}`);
  return { branch, local, remote };
}

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

function acquireLock(repoSha) {
  const dir = path.join(repoRoot, 'local-locks');
  mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'local-d1-mutation.lock');
  const payload = {
    format: 'forge-local-d1-lock/v2',
    run_id: runId,
    adapter: 'manufacturing-master',
    pid: process.pid,
    hostname: os.hostname(),
    started_at: new Date().toISOString(),
    workflow: 'manual-agent-live',
    github_run_id: '',
    github_run_attempt: '',
    command: process.argv.join(' '),
    repo_sha: repoSha,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      try { writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'); }
      finally { closeSync(fd); }
      console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${lockPath} run_id=${runId}`);
      return lockPath;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing;
      try { existing = JSON.parse(readFileSync(lockPath, 'utf8')); }
      catch (parseError) { throw fail('FILE_LOCK', `existing lock unreadable: ${lockPath}`, parseError); }
      const sameHost = existing?.hostname === os.hostname();
      const deadOwner = sameHost && Number.isInteger(existing?.pid) && existing.pid > 0 && !isPidAlive(existing.pid);
      if (!deadOwner) throw fail('FILE_LOCK', `active or unproven lock: ${JSON.stringify(existing)}`);
      const stale = `${lockPath}.stale-${Date.now()}`;
      renameSync(lockPath, stale);
      console.warn(`GLOBAL_D1_LOCK=REAP dead_owner=${existing.pid} stale=${stale}`);
    }
  }
  throw fail('FILE_LOCK', 'unable to acquire canonical local D1 lock');
}

function releaseLock(lockPath) {
  if (!lockPath || !existsSync(lockPath)) return;
  const existing = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (existing.run_id !== runId) throw fail('FILE_LOCK', `refusing to release lock owned by ${existing.run_id}`);
  unlinkSync(lockPath);
  console.log(`GLOBAL_D1_LOCK=RELEASED path=${lockPath} run_id=${runId}`);
}

function runBackup() {
  const output = run(process.execPath, [path.join(repoRoot, 'server', 'scripts', 'backup-local-state.mjs')], { capture: true });
  const match = output.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/);
  if (!match) throw fail('BACKUP_FAILED', 'backup helper did not emit LOCAL_STATE_BACKUP_OK');
  const backupPath = match[1].trim();
  const bytes = Number(match[2]);
  if (!existsSync(backupPath) || !existsSync(path.join(backupPath, 'manifest.json')) || !(bytes > 0)) {
    throw fail('BACKUP_FAILED', `invalid backup evidence path=${backupPath} bytes=${bytes}`);
  }
  console.log(`BACKUP_STATUS=PASS path=${backupPath} bytes=${bytes}`);
}

const SOURCE_EXPECTED = Object.freeze([
  ['ÚC', "1h45'/ 12m2"],
  ['LƯỚI', '4h/9m2'],
  ['ĐỨC', "cắt dập 40', 40' hoàn thiện, 20' lấy nhôm"],
  ['ĐÀI LOAN', "30'/BỘ"],
  ['SIÊU TRƯỜNG', "30'/BỘ"],
  ['LÒ SƠN', '1 màu sơn (sơn được 345 lá) x tổng 11,5m dài)/ 3 tiếng 1 mẻ'],
]);

function readSourceTruth() {
  if (!existsSync(sourcePath)) throw fail('SOURCE_MISSING', sourcePath);
  const text = readFileSync(sourcePath, 'utf8').normalize('NFC');
  const found = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*\d+\s*\|\s*\[9\]\s*(.*?)\s*·\s*\[11\]\s*(.*?)\s*$/u);
    if (match) found.push([normalizeText(match[1]), normalizeText(match[2])]);
  }
  const expected = SOURCE_EXPECTED.map(([department, standardTime]) => [normalizeText(department), normalizeText(standardTime)]);
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw fail('SOURCE_DRIFT', `LỊCH SẢN XUẤT rows differ from authority: actual=${JSON.stringify(found)} expected=${JSON.stringify(expected)}`);
  }
  const sourceSha256 = crypto.createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
  console.log(`ALUMDOOR_PRODUCTION_STANDARD_SOURCE_PASS rows=${found.length} sha256=${sourceSha256}`);
  return { sourceSha256 };
}

function buildPayload(sourceSha256) {
  const ref = `Nguồn LỊCH SẢN XUẤT · apps/alumdoor/docs/nguon/don-hang-xuat-hang/LỊCH-SẢN-XUẤT.md · sha256=${sourceSha256}`;
  return SOURCE_EXPECTED.map(([department, standardTime]) => ({
    doctype: 'Production Standard',
    name: department,
    department,
    standard_time: standardTime,
    note: ref,
    disabled: 0,
  }));
}

const cookies = new Map();
let csrfToken = '';

function rememberCookies(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return;
  for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (csrfToken && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrfToken);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${urlPath}`, {
    ...options,
    headers,
    body: options.body === undefined || typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
    redirect: 'manual',
  });
  rememberCookies(response);
  csrfToken = response.headers.get('x-frappe-csrf-token') || csrfToken;
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}

async function requireOk(urlPath, options = {}) {
  const result = await request(urlPath, options);
  if (!result.response.ok) {
    throw fail('HTTP_FAILED', `${options.method || 'GET'} ${urlPath} (${result.response.status}): ${result.text}`);
  }
  return result.body;
}

async function requireApi() {
  const response = await fetch(`${origin}/api/method/metaforge.api.get_boot`, { signal: AbortSignal.timeout(5000) });
  if (![200, 401, 403].includes(response.status)) throw fail('API_UNHEALTHY', `HTTP ${response.status}`);
}

async function login() {
  const user = process.env.FORGE_ADMIN_USER || 'dev@example.com';
  const password = process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1';
  await requireOk('/api/method/login', { method: 'POST', body: { usr: user, pwd: password } });
  const boot = await requireOk('/api/method/metaforge.api.get_boot');
  const message = boot && typeof boot === 'object' && 'message' in boot ? boot.message : boot;
  csrfToken = message?.csrf_token || csrfToken;
  if (!csrfToken) throw fail('AUTH_FAILED', 'login succeeded but boot returned no CSRF token');
}

async function getDoc(name) {
  const result = await request(`/api/resource/${encodeURIComponent('Production Standard')}/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw fail('HTTP_FAILED', `GET Production Standard/${name} (${result.response.status}): ${result.text}`);
  return result.body?.data ?? result.body?.message ?? result.body;
}

function snapshot(doc) {
  return {
    department: normalizeText(doc?.department),
    standard_time: normalizeText(doc?.standard_time),
    note: normalizeText(doc?.note),
    disabled: Number(doc?.disabled ?? 0),
  };
}

function exact(expected, actual) {
  return JSON.stringify(snapshot(expected)) === JSON.stringify(snapshot(actual));
}

async function upsert(row) {
  const existing = await getDoc(row.name);
  if (existing && exact(row, existing)) return 'exact';
  if (!apply) return existing ? 'would-update' : 'would-create';
  const body = {
    department: row.department,
    standard_time: row.standard_time,
    note: row.note,
    disabled: row.disabled,
  };
  if (!existing) {
    await requireOk(`/api/resource/${encodeURIComponent('Production Standard')}`, { method: 'POST', body });
    return 'created';
  }
  await requireOk(`/api/resource/${encodeURIComponent('Production Standard')}/${encodeURIComponent(row.name)}`, { method: 'PUT', body });
  return 'updated';
}

assertLocalOnly();
const checkout = assertAuthorityCheckout();
const source = readSourceTruth();
const rows = buildPayload(source.sourceSha256);
mkdirSync(runDir, { recursive: true });
writeFileSync(path.join(runDir, 'payload.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
await requireApi();
await login();

if (!apply) {
  const planned = { exact: 0, 'would-create': 0, 'would-update': 0 };
  for (const row of rows) planned[await upsert(row)] += 1;
  console.log(`ALUMDOOR_PRODUCTION_STANDARD_DRY_RUN_PASS exact=${planned.exact} create=${planned['would-create']} update=${planned['would-update']} run_dir=${runDir}`);
  process.exit(0);
}

let lockPath = '';
try {
  lockPath = acquireLock(checkout.local);
  runBackup();
  const result = { created: 0, updated: 0, exact: 0 };
  for (const row of rows) result[await upsert(row)] += 1;
  for (const row of rows) {
    const actual = await getDoc(row.name);
    if (!actual || !exact(row, actual)) {
      throw fail('VERIFY_FAILED', `Production Standard ${row.name} missing or differs`);
    }
  }

  const second = { created: 0, updated: 0, exact: 0 };
  for (const row of rows) second[await upsert(row)] += 1;
  if (second.created !== 0 || second.updated !== 0 || second.exact !== rows.length) {
    throw fail('IDEMPOTENCY_FAILED', JSON.stringify(second));
  }
  if (expectIdempotent && (result.created !== 0 || result.updated !== 0)) {
    throw fail('EXPECTED_IDEMPOTENT', `first pass changed records: ${JSON.stringify(result)}`);
  }

  writeFileSync(path.join(runDir, 'result.json'), `${JSON.stringify({
    status: 'PASS',
    branch: checkout.branch,
    sha: checkout.local,
    source_sha256: source.sourceSha256,
    result,
    second_pass: second,
    count: rows.length,
  }, null, 2)}\n`, 'utf8');

  console.log(`ALUMDOOR_PRODUCTION_STANDARD_IMPORT_PASS created=${result.created} updated=${result.updated} exact=${result.exact} count=${rows.length}`);
  console.log(`ALUMDOOR_PRODUCTION_STANDARD_IDEMPOTENCE_PASS exact=${second.exact}`);
} finally {
  releaseLock(lockPath);
}
