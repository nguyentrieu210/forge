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
const runDir = path.join(repoRoot, 'local-backups', 'execution-layer', 'manufacturing-master', runId);

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
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw fail('REMOTE_MUTATION_GUARD', `unsupported protocol ${parsed.protocol}`);
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
  if (expected && expected !== local) {
    throw fail('STALE_WORKTREE', `expected SHA ${expected}, got ${local}`);
  }
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
      if (!deadOwner) {
        throw fail('FILE_LOCK', `active or unproven lock: ${JSON.stringify(existing)}`);
      }
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
  const output = run(process.execPath, [path.join(repoRoot, 'server', 'scripts', 'backup-local-state.mjs')], {
    capture: true,
  });
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
  const expected = SOURCE_EXPECTED.map(([name, norm]) => [normalizeText(name), normalizeText(norm)]);
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw fail('SOURCE_DRIFT', `LỊCH SẢN XUẤT rows differ from authority: actual=${JSON.stringify(found)} expected=${JSON.stringify(expected)}`);
  }
  const sourceSha256 = crypto.createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
  console.log(`ALUMDOOR_MANUFACTURING_SOURCE_PASS rows=${found.length} sha256=${sourceSha256}`);
  return { found, sourceSha256 };
}

function buildPayload(sourceSha256) {
  const ref = `apps/alumdoor/docs/nguon/don-hang-xuat-hang/LỊCH-SẢN-XUẤT.md sha256=${sourceSha256}`;
  const workstation = (name) => ({
    doctype: 'Workstation', name, workstation_name: name, disabled: 0,
  });
  const operation = (name, description) => ({
    doctype: 'Operation', name, operation_name: name, description, hour_rate: 0,
  });
  const child = ({ sequence, operation: op, workstation: ws, runTime, basis, batchSize, batchUom, note = '' }) => ({
    sequence,
    operation: op,
    execution_mode: 'internal',
    workstation: ws,
    setup_time: 0,
    run_time: runTime,
    time_uom: 'phút',
    time_basis: basis,
    batch_size: batchSize ?? 0,
    batch_uom: batchUom ?? '',
    operation_cost: 0,
    needs_time_definition: 0,
    needs_workstation: 0,
    source_reference: ref,
    source_note: note,
  });
  const route = ({ code, name, row, standardTime, basis, batchSize, batchUom, altSize, altUom, needsTime = 0, operations, note = '' }) => ({
    doctype: 'Manufacturing Routing',
    name: code,
    routing_code: code,
    routing_name: name,
    source_identity: `LỊCH SẢN XUẤT:${row}:${name}`,
    execution_mode: 'internal',
    is_active: 1,
    ...(standardTime == null ? {} : { standard_time_value: standardTime }),
    standard_time_uom: 'phút',
    standard_time_basis: basis,
    ...(batchSize == null ? {} : { batch_size: batchSize }),
    ...(batchUom == null ? {} : { batch_uom: batchUom }),
    ...(altSize == null ? {} : { alternate_batch_size: altSize }),
    ...(altUom == null ? {} : { alternate_batch_uom: altUom }),
    needs_time_definition: needsTime,
    needs_workstation: 0,
    needs_item_mapping: 1,
    needs_bom_mapping: 1,
    source_reference: ref,
    source_note: note,
    operations,
  });

  const workstations = SOURCE_EXPECTED.map(([name]) => workstation(name));
  const operations = [
    operation('ÚC', `${SOURCE_EXPECTED[0][1]} · nguồn LỊCH SẢN XUẤT dòng 2`),
    operation('LƯỚI', `${SOURCE_EXPECTED[1][1]} · nguồn LỊCH SẢN XUẤT dòng 3`),
    operation('ĐỨC - Cắt dập', `cắt dập 40' · nguồn LỊCH SẢN XUẤT dòng 4`),
    operation('ĐỨC - Hoàn thiện', `40' hoàn thiện · nguồn LỊCH SẢN XUẤT dòng 4`),
    operation('ĐỨC - Lấy nhôm', `20' lấy nhôm · nguồn LỊCH SẢN XUẤT dòng 4`),
    operation('ĐÀI LOAN', `${SOURCE_EXPECTED[3][1]} · nguồn LỊCH SẢN XUẤT dòng 5`),
    operation('SIÊU TRƯỜNG', `${SOURCE_EXPECTED[4][1]} · nguồn LỊCH SẢN XUẤT dòng 6`),
    operation('LÒ SƠN', `${SOURCE_EXPECTED[5][1]} · nguồn LỊCH SẢN XUẤT dòng 7`),
  ];
  const routes = [
    route({
      code: 'ALUMDOOR-ROUTE-UC', name: 'ÚC', row: 2, standardTime: 105, basis: '12 m2', batchSize: 12, batchUom: 'm2',
      operations: [child({ sequence: 1, operation: 'ÚC', workstation: 'ÚC', runTime: 105, basis: '12 m2', batchSize: 12, batchUom: 'm2' })],
    }),
    route({
      code: 'ALUMDOOR-ROUTE-LUOI', name: 'LƯỚI', row: 3, standardTime: 240, basis: '9 m2', batchSize: 9, batchUom: 'm2',
      operations: [child({ sequence: 1, operation: 'LƯỚI', workstation: 'LƯỚI', runTime: 240, basis: '9 m2', batchSize: 9, batchUom: 'm2' })],
    }),
    route({
      code: 'ALUMDOOR-ROUTE-DUC', name: 'ĐỨC', row: 4, standardTime: null,
      basis: "nguồn chỉ ghi 3 thời lượng 40' + 40' + 20'; chưa ghi cơ sở theo bộ/m2",
      needsTime: 1,
      note: 'Không suy diễn tổng định mức cấp routing khi nguồn chưa ghi cơ sở. Giữ nguyên 3 thời lượng ở child operations.',
      operations: [
        child({ sequence: 1, operation: 'ĐỨC - Cắt dập', workstation: 'ĐỨC', runTime: 40, basis: 'cơ sở chưa ghi trong nguồn', note: "nguyên văn: cắt dập 40'" }),
        child({ sequence: 2, operation: 'ĐỨC - Hoàn thiện', workstation: 'ĐỨC', runTime: 40, basis: 'cơ sở chưa ghi trong nguồn', note: "nguyên văn: 40' hoàn thiện" }),
        child({ sequence: 3, operation: 'ĐỨC - Lấy nhôm', workstation: 'ĐỨC', runTime: 20, basis: 'cơ sở chưa ghi trong nguồn', note: "nguyên văn: 20' lấy nhôm" }),
      ],
    }),
    route({
      code: 'ALUMDOOR-ROUTE-DAI-LOAN', name: 'ĐÀI LOAN', row: 5, standardTime: 30, basis: '1 Bộ', batchSize: 1, batchUom: 'Bộ',
      operations: [child({ sequence: 1, operation: 'ĐÀI LOAN', workstation: 'ĐÀI LOAN', runTime: 30, basis: '1 Bộ', batchSize: 1, batchUom: 'Bộ' })],
    }),
    route({
      code: 'ALUMDOOR-ROUTE-SIEU-TRUONG', name: 'SIÊU TRƯỜNG', row: 6, standardTime: 30, basis: '1 Bộ', batchSize: 1, batchUom: 'Bộ',
      operations: [child({ sequence: 1, operation: 'SIÊU TRƯỜNG', workstation: 'SIÊU TRƯỜNG', runTime: 30, basis: '1 Bộ', batchSize: 1, batchUom: 'Bộ' })],
    }),
    route({
      code: 'ALUMDOOR-ROUTE-LO-SON', name: 'LÒ SƠN', row: 7, standardTime: 180, basis: '1 màu / 1 mẻ', batchSize: 345, batchUom: 'Lá', altSize: 11.5, altUom: 'm',
      note: 'Nguồn ghi đồng thời 345 lá và tổng 11,5m dài; lưu cả hai, không quy đổi giữa lá và mét.',
      operations: [child({ sequence: 1, operation: 'LÒ SƠN', workstation: 'LÒ SƠN', runTime: 180, basis: '1 màu / 1 mẻ', batchSize: 345, batchUom: 'Lá', note: 'alternate source quantity 11,5m dài retained at routing level' })],
    }),
  ];
  return {
    format: 'alumdoor-manufacturing-master/v1',
    source_reference: ref,
    source_sha256: sourceSha256,
    workstations,
    operations,
    routings: routes,
  };
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${origin}/api/method/metaforge.api.get_boot`, { signal: controller.signal });
    if (![200, 401, 403].includes(response.status)) throw fail('API_UNHEALTHY', `HTTP ${response.status}`);
  } finally { clearTimeout(timer); }
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
async function getDoc(doctype, name) {
  const result = await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw fail('HTTP_FAILED', `GET ${doctype}/${name} (${result.response.status}): ${result.text}`);
  return result.body?.data ?? result.body?.message ?? result.body;
}

const TOP_FIELDS = Object.freeze({
  Workstation: ['workstation_name', 'disabled'],
  Operation: ['operation_name', 'description', 'hour_rate'],
  'Manufacturing Routing': [
    'routing_code', 'routing_name', 'source_identity', 'execution_mode', 'is_active',
    'standard_time_value', 'standard_time_uom', 'standard_time_basis', 'batch_size', 'batch_uom',
    'alternate_batch_size', 'alternate_batch_uom', 'needs_time_definition', 'needs_workstation',
    'needs_item_mapping', 'needs_bom_mapping', 'source_reference', 'source_note',
  ],
});
const CHILD_FIELDS = [
  'sequence', 'operation', 'execution_mode', 'workstation', 'setup_time', 'run_time', 'time_uom',
  'time_basis', 'batch_size', 'batch_uom', 'operation_cost', 'needs_time_definition',
  'needs_workstation', 'source_reference', 'source_note',
];
const NUMERIC = new Set([
  'disabled', 'hour_rate', 'is_active', 'standard_time_value', 'batch_size', 'alternate_batch_size',
  'needs_time_definition', 'needs_workstation', 'needs_item_mapping', 'needs_bom_mapping', 'sequence',
  'setup_time', 'run_time', 'operation_cost',
]);
function normalized(field, value) {
  if (NUMERIC.has(field)) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : value;
  }
  return normalizeText(value);
}
function snapshot(doctype, doc) {
  const out = {};
  for (const field of TOP_FIELDS[doctype]) out[field] = normalized(field, doc?.[field]);
  if (doctype === 'Manufacturing Routing') {
    out.operations = (Array.isArray(doc?.operations) ? doc.operations : [])
      .map((row) => Object.fromEntries(CHILD_FIELDS.map((field) => [field, normalized(field, row?.[field])])));
  }
  return out;
}
function exact(doctype, expected, actual) {
  return JSON.stringify(snapshot(doctype, expected)) === JSON.stringify(snapshot(doctype, actual));
}
function apiDoc(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'doctype'));
}
async function upsert(row) {
  const doctype = row.doctype;
  const existing = await getDoc(doctype, row.name);
  if (existing && exact(doctype, row, existing)) return 'exact';
  if (!apply) return existing ? 'would-update' : 'would-create';
  const body = apiDoc(row);
  if (!existing) {
    await requireOk(`/api/resource/${encodeURIComponent(doctype)}`, { method: 'POST', body });
    return 'created';
  }
  await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(row.name)}`, { method: 'PUT', body });
  return 'updated';
}
async function verifyRow(row) {
  const actual = await getDoc(row.doctype, row.name);
  if (!actual) throw fail('VERIFY_FAILED', `${row.doctype} ${row.name} missing`);
  if (!exact(row.doctype, row, actual)) {
    throw fail('VERIFY_FAILED', `${row.doctype} ${row.name} differs: expected=${JSON.stringify(snapshot(row.doctype, row))} actual=${JSON.stringify(snapshot(row.doctype, actual))}`);
  }
}

assertLocalOnly();
const checkout = assertAuthorityCheckout();
const source = readSourceTruth();
const payload = buildPayload(source.sourceSha256);
mkdirSync(runDir, { recursive: true });
writeFileSync(path.join(runDir, 'payload.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await requireApi();
await login();

const allRows = [...payload.workstations, ...payload.operations, ...payload.routings];
const preimage = [];
for (const row of allRows) preimage.push({ doctype: row.doctype, name: row.name, existing: await getDoc(row.doctype, row.name) });
writeFileSync(path.join(runDir, 'preimage.json'), `${JSON.stringify({ captured_at: new Date().toISOString(), rows: preimage }, null, 2)}\n`, 'utf8');

if (!apply) {
  const planned = { exact: 0, 'would-create': 0, 'would-update': 0 };
  for (const row of allRows) planned[await upsert(row)] += 1;
  console.log(`ALUMDOOR_MANUFACTURING_DRY_RUN_PASS exact=${planned.exact} create=${planned['would-create']} update=${planned['would-update']} run_dir=${runDir}`);
  process.exit(0);
}

let lockPath = '';
try {
  lockPath = acquireLock(checkout.local);
  runBackup();
  const result = { created: 0, updated: 0, exact: 0 };
  for (const row of allRows) result[await upsert(row)] += 1;
  for (const row of allRows) await verifyRow(row);

  const second = { created: 0, updated: 0, exact: 0 };
  for (const row of allRows) second[await upsert(row)] += 1;
  if (second.created !== 0 || second.updated !== 0 || second.exact !== allRows.length) {
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
    counts: {
      workstations: payload.workstations.length,
      operations: payload.operations.length,
      routings: payload.routings.length,
    },
  }, null, 2)}\n`, 'utf8');
  console.log(`ALUMDOOR_MANUFACTURING_MASTER_IMPORT_PASS created=${result.created} updated=${result.updated} exact=${result.exact} workstations=${payload.workstations.length} operations=${payload.operations.length} routings=${payload.routings.length}`);
  console.log(`ALUMDOOR_MANUFACTURING_MASTER_IDEMPOTENCE_PASS exact=${second.exact}`);
  console.log(`FORGE_LOCAL_IMPORT_EXECUTION_PASS adapter=manufacturing-master run_id=${runId}`);
} finally {
  releaseLock(lockPath);
}
