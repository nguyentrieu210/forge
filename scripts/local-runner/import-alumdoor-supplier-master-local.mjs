#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || 'C:\\alumdoor');
const ORIGIN = (process.env.FORGE_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const AUTHORITY_BRANCH = process.env.FORGE_LIVE_BRANCH || 'main';
const APPLY = process.argv.includes('--apply');

/**
 * 3 nhà cung cấp, không phải 22.
 *
 * Đo trên nguồn ngày 2026-08-19:
 *   DS-KH-NCC.md   → 2 dòng khai `NCC` ở cột `KH/NCC/KH LẺ`: `CTY NAM PHÁT` (dòng 196),
 *                    `ANH BẢO BỌ - LỘC PHÁT` (dòng 318). Tổng 448 đối tác có tên, 2 là NCC.
 *   DS-HH-NHẬP.md  → 1 tên dưới cột `NHÀ CUNG CẤP`: `TIẾN ĐẠT` (dòng 2).
 *   Gộp theo `supplierKey` → 3 tên, không trùng nhau.
 *
 * 22 là con số của một bản nguồn nào đó không còn đối chiếu được; giữ nó thì `SOURCE_DRIFT` bắn
 * mọi lượt chạy và người ta hiểu nhầm thành "nguồn hỏng".
 *
 * CẢNH BÁO CÒN TREO: `DS-HH-NHẬP.md` tự khai "2 dòng có dữ liệu" — 1 tiêu đề + 1 dữ liệu. Một
 * sheet hàng nhập chỉ có một dòng là dấu hiệu bản trích bị cắt. Và `TIẾN ĐẠT` cũng nằm ở
 * DS-KH-NCC dòng 213 với cột phân loại BỎ TRỐNG, tức đang bị bộ nhập Customer xếp vào rổ hoãn.
 * Hai nguồn nói khác nhau về cùng một cái tên — chủ xưởng phải chốt, không đoán ở đây.
 */
const EXPECTED_COUNT = 3;

/**
 * Dòng dữ liệu đầu tiên của `DS-KH-NCC.md` là dòng 3: dòng 1 là tiêu đề bảng
 * (`DANH SÁCH NCC/KHÁCH HÀNG`), dòng 2 là tiêu đề cột.
 *
 * VÌ SAO PHẢI CHẶN: tiêu đề cột phân loại viết là `KH/NCC/KH LẺ`, mà bộ lọc dưới đây nhận diện
 * NCC bằng `includes('NCC')` — nên chính DÒNG TIÊU ĐỀ tự nhận mình là nhà cung cấp và lọt vào
 * danh sách với tên `Nhà cung cấp/tên khách hàng`. Đo được: không guard → 4 NCC, có guard → 3.
 * Nhánh `DS-HH-NHẬP` bên dưới đã có guard `<= 1` từ đầu; nhánh này thì chưa.
 */
const PARTY_FIRST_DATA_ROW = 3;
const PARTY_SOURCE = path.join(ROOT, 'apps', 'alumdoor', 'docs', 'nguon', 'don-hang-xuat-hang', 'DS-KH-NCC.md');
const GOODS_SOURCE = path.join(ROOT, 'apps', 'alumdoor', 'docs', 'nguon', 'don-hang-xuat-hang', 'DS-HH-NHẬP.md');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
const runDir = path.join(ROOT, 'local-backups', 'execution-layer', 'supplier-master', runId);

function fail(code, message, cause) {
  const error = new Error(`${code}: ${message}`, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
function run(program, args, { capture = false, env } = {}) {
  const isShim = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(program));
  const command = isShim ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : program;
  const finalArgs = isShim ? ['/d', '/c', program, ...args] : args;
  const result = spawnSync(command, finalArgs, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw fail('PROCESS_START_FAILED', `${program}: ${result.error.message}`, result.error);
  if (result.status !== 0) throw fail('PROCESS_FAILED', `${program} ${args.join(' ')} exit=${result.status}`);
  return String(result.stdout || '').trim();
}
const git = (args, capture = true) => run('git', ['-C', ROOT, ...args], { capture });
const clean = (value) => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const upper = (value) => clean(value).toLocaleUpperCase('vi');
const normalizedName = (value) => upper(value)
  .replace(/\s*[-–—]\s*(?:\+?84|0)[\d\s().-]{7,}$/u, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const supplierKey = (name) => normalizedName(name).replace(/^(CTY|CÔNG TY)\s+/, '');

function assertLocalOnly() {
  const parsed = new URL(ORIGIN);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw fail('REMOTE_MUTATION_GUARD', `origin must be loopback, got ${parsed.hostname}`);
  }
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') {
    throw fail('WINDOWS_REQUIRED', `canonical runtime is Windows; got ${process.platform}`);
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw fail('NODE_VERSION', `Node >=22 required; got ${process.version}`);
}
function assertAuthority() {
  if (!existsSync(path.join(ROOT, '.git'))) throw fail('NOT_GIT_WORKSPACE', ROOT);
  const branch = git(['branch', '--show-current']);
  if (branch !== AUTHORITY_BRANCH) throw fail('STALE_WORKTREE', `expected branch ${AUTHORITY_BRANCH}, got ${branch}`);
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=no']);
  if (dirty) throw fail('STALE_WORKTREE', `tracked changes present:\n${dirty}`);
  git(['fetch', 'origin', `+refs/heads/${AUTHORITY_BRANCH}:refs/remotes/origin/${AUTHORITY_BRANCH}`, '--prune'], false);
  const local = git(['rev-parse', 'HEAD']);
  const remote = git(['rev-parse', `origin/${AUTHORITY_BRANCH}`]);
  if (local !== remote) throw fail('STALE_WORKTREE', `local=${local} remote=${remote}`);
  const expected = process.env.FORGE_LOCAL_EXPECTED_SHA?.trim();
  if (expected && expected !== local) throw fail('STALE_WORKTREE', `expected=${expected} actual=${local}`);
  return local;
}
function parseSegments(line) {
  const out = {};
  for (const part of String(line).split(/\s+·\s+/u)) {
    const match = part.match(/\[(\d+)\]\s*(.*)$/u);
    if (match) out[Number(match[1])] = clean(match[2]);
  }
  return out;
}
/** Gộp hai nguồn thành danh sách NCC. Thuần văn bản, không đụng fs/process — để test gọi được. */
export function collectSuppliers(partyText, goodsText) {
  const map = new Map();
  const add = (row, source) => {
    const name = clean(row.name);
    const key = supplierKey(name);
    if (!key) return;
    const existing = map.get(key);
    if (!existing) map.set(key, { ...row, name, sources: [source] });
    else {
      for (const field of ['owner', 'phone', 'address', 'note']) if (!existing[field] && row[field]) existing[field] = clean(row[field]);
      existing.sources.push(source);
    }
  };
  for (const raw of String(partyText ?? '').normalize('NFC').split(/\r?\n/)) {
    const rowNo = raw.match(/^\s*(\d+)\s*\|/u)?.[1];
    if (!rowNo || Number(rowNo) < PARTY_FIRST_DATA_ROW) continue;
    const fields = parseSegments(raw);
    if (!upper(fields[2]).includes('NCC')) continue;
    add({ name: fields[0], owner: fields[1], phone: fields[3], address: fields[4], note: fields[5] }, `DS-KH-NCC:${rowNo}`);
  }
  for (const raw of String(goodsText ?? '').normalize('NFC').split(/\r?\n/)) {
    const rowNo = raw.match(/^\s*(\d+)\s*\|/u)?.[1];
    if (!rowNo || Number(rowNo) <= 1) continue;
    const fields = parseSegments(raw);
    if (fields[1]) add({ name: fields[1] }, `DS-HH-NHẬP:${rowNo}`);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function sourceRows() {
  if (!existsSync(PARTY_SOURCE) || !existsSync(GOODS_SOURCE)) throw fail('SOURCE_MISSING', 'DS-KH-NCC.md or DS-HH-NHẬP.md missing');
  const suppliers = collectSuppliers(readFileSync(PARTY_SOURCE, 'utf8'), readFileSync(GOODS_SOURCE, 'utf8'));
  if (suppliers.length !== EXPECTED_COUNT) throw fail('SOURCE_DRIFT', `expected ${EXPECTED_COUNT} canonical suppliers, got ${suppliers.length}`);
  const sha256 = crypto.createHash('sha256')
    .update(readFileSync(PARTY_SOURCE))
    .update(readFileSync(GOODS_SOURCE))
    .digest('hex');
  console.log(`ALUMDOOR_SUPPLIER_SOURCE_PASS suppliers=${suppliers.length} sha256=${sha256}`);
  return { suppliers, sha256 };
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function acquireLock(repoSha) {
  const dir = path.join(ROOT, 'local-locks'); mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'local-d1-mutation.lock');
  const body = { format: 'forge-local-d1-lock/v2', run_id: runId, adapter: 'supplier-master', pid: process.pid, hostname: os.hostname(), started_at: new Date().toISOString(), workflow: 'manual-agent-live', command: process.argv.join(' '), repo_sha: repoSha };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      try { writeFileSync(fd, `${JSON.stringify(body, null, 2)}\n`, 'utf8'); } finally { closeSync(fd); }
      console.log(`GLOBAL_D1_LOCK=ACQUIRED path=${lockPath} run_id=${runId}`); return lockPath;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing; try { existing = JSON.parse(readFileSync(lockPath, 'utf8')); } catch (e) { throw fail('FILE_LOCK', `existing lock unreadable: ${lockPath}`, e); }
      const deadOwner = existing?.hostname === os.hostname() && Number.isInteger(existing?.pid) && existing.pid > 0 && !pidAlive(existing.pid);
      if (!deadOwner) throw fail('FILE_LOCK', `active or unproven lock: ${JSON.stringify(existing)}`);
      renameSync(lockPath, `${lockPath}.stale-${Date.now()}`);
    }
  }
  throw fail('FILE_LOCK', 'unable to acquire lock');
}
function releaseLock(lockPath) {
  if (!lockPath || !existsSync(lockPath)) return;
  const existing = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (existing.run_id !== runId) throw fail('FILE_LOCK', `refusing to release lock owned by ${existing.run_id}`);
  unlinkSync(lockPath); console.log(`GLOBAL_D1_LOCK=RELEASED path=${lockPath} run_id=${runId}`);
}
function backup() {
  const output = run(process.execPath, [path.join(ROOT, 'server', 'scripts', 'backup-local-state.mjs')], { capture: true });
  const match = output.match(/LOCAL_STATE_BACKUP_OK path=(.+) bytes=(\d+)/);
  if (!match || !existsSync(match[1].trim()) || Number(match[2]) <= 0) throw fail('BACKUP_FAILED', 'invalid local state backup evidence');
  console.log(`BACKUP_STATUS=PASS path=${match[1].trim()} bytes=${match[2]}`);
}
const cookies = new Map(); let csrf = '';
function remember(response) {
  const value = response.headers.get('set-cookie'); if (!value) return;
  for (const part of value.split(/,(?=[^;,]+=)/)) { const pair = part.split(';', 1)[0]; const i = pair.indexOf('='); if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
}
const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers || {}); if (cookieHeader()) headers.set('cookie', cookieHeader());
  if (csrf && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrf);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${ORIGIN}${urlPath}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), redirect: 'manual' });
  remember(response); csrf = response.headers.get('x-frappe-csrf-token') || csrf;
  const text = await response.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}
async function ok(urlPath, options = {}) { const result = await request(urlPath, options); if (!result.response.ok) throw fail('HTTP_FAILED', `${options.method || 'GET'} ${urlPath} (${result.response.status}): ${result.text}`); return result.body; }
async function login() {
  await ok('/api/method/login', { method: 'POST', body: { usr: process.env.FORGE_ADMIN_USER || 'dev@example.com', pwd: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1' } });
  const boot = await ok('/api/method/metaforge.api.get_boot'); const message = boot && typeof boot === 'object' && 'message' in boot ? boot.message : boot; csrf = message?.csrf_token || csrf;
  if (!csrf) throw fail('AUTH_FAILED', 'login succeeded but boot returned no CSRF token');
}
async function getSupplier(name) {
  const result = await request(`/api/resource/Supplier/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw fail('HTTP_FAILED', `GET Supplier ${name} (${result.response.status}): ${result.text}`);
  return result.body?.data ?? result.body?.message ?? result.body;
}
async function upsert(row) {
  const existing = await getSupplier(row.name);
  if (existing && clean(existing.supplier_name || existing.name) === row.name) return 'exact';
  if (!APPLY) return existing ? 'would-update' : 'would-create';
  const body = { supplier_name: row.name, disabled: false };
  if (!existing) await ok('/api/resource/Supplier', { method: 'POST', body });
  else await ok(`/api/resource/Supplier/${encodeURIComponent(row.name)}`, { method: 'PUT', body });
  const after = await getSupplier(row.name);
  if (!after || clean(after.supplier_name || after.name) !== row.name) throw fail('VERIFY_FAILED', `Supplier ${row.name} missing after upsert`);
  return existing ? 'updated' : 'created';
}

async function main() {
  assertLocalOnly();
  const repoSha = assertAuthority();
  const source = sourceRows();
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(runDir, 'source.json'), `${JSON.stringify(source, null, 2)}\n`, 'utf8');
  await login();
  if (!APPLY) {
    const planned = { exact: 0, 'would-create': 0, 'would-update': 0 };
    for (const row of source.suppliers) planned[await upsert(row)] += 1;
    console.log(`ALUMDOOR_SUPPLIER_DRY_RUN_PASS suppliers=${source.suppliers.length} create=${planned['would-create']} update=${planned['would-update']} exact=${planned.exact}`);
    process.exit(0);
  }
  let lockPath = '';
  try {
    lockPath = acquireLock(repoSha); backup();
    const first = { created: 0, updated: 0, exact: 0 };
    for (const row of source.suppliers) first[await upsert(row)] += 1;
    const second = { created: 0, updated: 0, exact: 0 };
    for (const row of source.suppliers) second[await upsert(row)] += 1;
    if (second.created !== 0 || second.updated !== 0 || second.exact !== EXPECTED_COUNT) throw fail('IDEMPOTENCY_FAILED', JSON.stringify(second));
    writeFileSync(path.join(runDir, 'result.json'), `${JSON.stringify({ status: 'PASS', repo_sha: repoSha, count: EXPECTED_COUNT, first, second }, null, 2)}\n`, 'utf8');
    console.log(`ALUMDOOR_SUPPLIER_MASTER_IMPORT_PASS suppliers=${EXPECTED_COUNT} created=${first.created} updated=${first.updated} exact=${first.exact}`);
    console.log(`ALUMDOOR_SUPPLIER_MASTER_IDEMPOTENCE_PASS exact=${second.exact}`);
  } finally { releaseLock(lockPath); }
}

/**
 * File này vừa là script chạy thật, vừa là nơi chứa `collectSuppliers` cho test gọi. Không có cổng
 * này thì `import` từ test sẽ kéo theo cả đòi Windows, đòi cây git sạch, rồi gọi mạng.
 *
 * So CẢ đường tuyệt đối LẪN tên file: trên Windows hai đường dẫn khác hoa/thường vẫn là một file,
 * mà so hụt ở đây thì script im lặng không làm gì — kiểu hỏng tệ nhất trong một bộ nhập dữ liệu.
 */
const selfPath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const RUN_AS_SCRIPT = entryPath === selfPath
  || (entryPath !== '' && path.basename(entryPath).toLowerCase() === path.basename(selfPath).toLowerCase());
if (RUN_AS_SCRIPT) await main();
