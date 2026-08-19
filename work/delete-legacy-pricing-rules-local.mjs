import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertLocalMutationChildContext } from '../scripts/local-runner/assert-local-mutation-child-context.mjs';

const root = 'C:\\alumdoor';
const origin = 'http://127.0.0.1:8799';
const targets = [
  'PHỤ THU CỬA ÚC 4-7M2',
  'PHỤ THU RAY MÀU KHÁC',
  'PHỤ THU RAY VÂN GỖ',
  'PHỤ THU SƠN VÂN GỖ CỬA',
  'PHỤ THU V4 V5 SƠN TĨNH ĐIỆN',
];

if (process.argv.includes('--child')) {
  assertLocalMutationChildContext(['pricing']);
  await apply();
  process.exit(0);
}

const lockPath = path.join(root, 'local-locks', 'local-d1-mutation.lock');
const runId = `pricing-cleanup-local-${Date.now()}`;
if (existsSync(lockPath)) throw new Error(`active local D1 lock exists: ${lockPath}`);
const fd = openSync(lockPath, 'wx');
writeFileSync(fd, `${JSON.stringify({
  format: 'forge-local-d1-lock/v2', run_id: runId, adapter: 'pricing', pid: process.pid,
  hostname: os.hostname(), started_at: new Date().toISOString(), workflow: 'manual-agent-live',
  command: process.argv.join(' '),
}, null, 2)}\n`, 'utf8');
closeSync(fd);
try {
  const result = spawnSync(process.execPath, [process.argv[1], '--child'], {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pricing cleanup child failed with exit=${result.status}`);
  console.log(`ALUMDOOR_PRICING_CLEANUP_SCOPED_APPLY_PASS run_id=${runId}`);
} finally {
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.run_id === runId) unlinkSync(lockPath);
  }
}

async function apply() {
  const cookies = new Map();
  let csrf = '';
  function remember(response) {
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const pair = value.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  async function request(urlPath, options = {}, allowed = []) {
    const headers = new Headers(options.headers ?? {});
    if (cookieHeader()) headers.set('cookie', cookieHeader());
    if (csrf && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrf);
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetch(`${origin}${urlPath}`, {
      ...options, headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual',
    });
    remember(response);
    csrf = response.headers.get('x-frappe-csrf-token') ?? csrf;
    const text = await response.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok && !allowed.includes(response.status)) {
      throw new Error(`${options.method ?? 'GET'} ${urlPath} ${response.status}: ${text}`);
    }
    return { status: response.status, body };
  }

  await request('/api/method/login', { method: 'POST', body: {
    usr: process.env.FORGE_ADMIN_USER || 'dev@example.com',
    pwd: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1',
  } });
  const boot = await request('/api/method/metaforge.api.get_boot');
  csrf = (boot.body?.message ?? boot.body)?.csrf_token ?? csrf;
  if (!csrf) throw new Error('authenticated session has no CSRF token');

  const canonicalList = await request('/api/resource/Price%20List/ALUMDOOR-SELLING');
  if ((canonicalList.body?.data ?? canonicalList.body)?.name !== 'ALUMDOOR-SELLING') {
    throw new Error('canonical price list is missing');
  }

  const existing = [];
  for (const name of targets) {
    const response = await request(`/api/resource/Pricing%20Rule/${encodeURIComponent(name)}`, {}, [404]);
    if (response.status === 404) continue;
    const doc = response.body?.data ?? response.body;
    if (doc.price_list !== 'Bảng giá 31/07/2026') throw new Error(`legacy rule identity changed: ${name}`);
    existing.push(name);
  }
  console.log(`ALUMDOOR_PRICING_CLEANUP_PREFLIGHT targets=${targets.length} deletable=${existing.length}`);
  if (existing.length) {
    const response = await request('/api/method/frappe.desk.reportview.delete_items', {
      method: 'POST', body: { doctype: 'Pricing Rule', items: JSON.stringify(existing) },
    });
    const result = response.body?.message ?? response.body;
    if (Number(result?.deleted ?? 0) !== existing.length || Number(result?.failed ?? 0) !== 0) {
      throw new Error(`bulk delete mismatch: ${JSON.stringify(result)}`);
    }
  }

  for (const name of targets) {
    const response = await request(`/api/resource/Pricing%20Rule/${encodeURIComponent(name)}`, {}, [404]);
    if (response.status !== 404) throw new Error(`legacy pricing rule still exists: ${name}`);
  }
  const fields = encodeURIComponent(JSON.stringify(['name','price_list']));
  let canonicalRules = 0;
  for (let start = 0; ; start += 100) {
    const response = await request(`/api/resource/Pricing%20Rule?fields=${fields}&limit_page_length=100&limit_start=${start}`);
    const rows = response.body?.data ?? response.body?.message ?? response.body;
    if (!Array.isArray(rows) || rows.length === 0) break;
    canonicalRules += rows.filter(row => row.price_list === 'ALUMDOOR-SELLING').length;
    if (rows.length < 100) break;
  }
  if (canonicalRules !== 83) throw new Error(`canonical Pricing Rule count changed: ${canonicalRules}`);
  console.log(`ALUMDOOR_PRICING_CLEANUP_VERIFY_PASS deleted=${existing.length} canonical_rules=${canonicalRules}`);
}
