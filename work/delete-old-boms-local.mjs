import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertLocalMutationChildContext } from '../scripts/local-runner/assert-local-mutation-child-context.mjs';

const root = 'C:\\alumdoor';
const origin = 'http://127.0.0.1:8799';
const targets = [
  {
    name: 'DM-2026-0207',
    item: 'TP-CUADL1LY-XN-VK_TRONBO_4-5M',
    replacement: 'DM-2026-0212',
    replacementItem: 'TP-CUADL1LY XN-VK_TRONBO_4-5m²',
  },
  {
    name: 'DM-2026-0208',
    item: 'TP-CUADL1LY-XN-VK_TRONBO_3-4M',
    replacement: 'DM-2026-0213',
    replacementItem: 'TP-CUADL1LY XN-VK_TRONBO_3-4m²',
  },
];

if (process.argv.includes('--child')) {
  assertLocalMutationChildContext(['bom-cleanup']);
  await deleteTargets();
  process.exit(0);
}

const lockPath = path.join(root, 'local-locks', 'local-d1-mutation.lock');
const runId = `bom-cleanup-local-${Date.now()}`;
if (existsSync(lockPath)) throw new Error(`active local D1 lock exists: ${lockPath}`);
const fd = openSync(lockPath, 'wx');
writeFileSync(fd, `${JSON.stringify({
  format: 'forge-local-d1-lock/v2',
  run_id: runId,
  adapter: 'bom-cleanup',
  pid: process.pid,
  hostname: os.hostname(),
  started_at: new Date().toISOString(),
  workflow: 'manual-agent-live',
  command: process.argv.join(' '),
}, null, 2)}\n`, 'utf8');
closeSync(fd);
try {
  const result = spawnSync(process.execPath, [process.argv[1], '--child'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`BOM cleanup child failed with exit=${result.status}`);
  console.log(`ALUMDOOR_BOM_CLEANUP_SCOPED_APPLY_PASS run_id=${runId}`);
} finally {
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.run_id === runId) unlinkSync(lockPath);
  }
}

async function deleteTargets() {
  const cookies = new Map();
  let csrf = '';
  function remember(response) {
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const pair = value.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  function cookieHeader() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
  async function request(urlPath, options = {}, allowed = []) {
    const headers = new Headers(options.headers ?? {});
    const cookie = cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (csrf && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrf);
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    const response = await fetch(`${origin}${urlPath}`, {
      ...options,
      headers,
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
    return { status: response.status, body, text };
  }

  await request('/api/method/login', { method: 'POST', body: {
    usr: process.env.FORGE_ADMIN_USER || 'dev@example.com',
    pwd: process.env.FORGE_ADMIN_PASSWORD || 'local-dev-password-1',
  } });
  const boot = await request('/api/method/metaforge.api.get_boot');
  const bootMessage = boot.body?.message ?? boot.body;
  csrf = bootMessage?.csrf_token ?? csrf;
  if (!csrf) throw new Error('authenticated session has no CSRF token');

  const existingTargets = [];
  for (const target of targets) {
    const oldResult = await request(`/api/resource/Bill%20of%20Materials/${encodeURIComponent(target.name)}`, {}, [404]);
    const replacementResult = await request(`/api/resource/Bill%20of%20Materials/${encodeURIComponent(target.replacement)}`);
    const replacement = replacementResult.body?.data ?? replacementResult.body?.message ?? replacementResult.body;
    if (replacement.item !== target.replacementItem
      || !String(replacement.note ?? '').startsWith('Alumdoor canonical source-complete ')
      || !String(replacement.bom_fingerprint ?? '').trim()
      || replacement.items?.length !== 4) {
      throw new Error(`canonical replacement failed preflight: ${target.replacement}`);
    }
    if (oldResult.status === 404) continue;
    const old = oldResult.body?.data ?? oldResult.body?.message ?? oldResult.body;
    if (old.item !== target.item
      || String(old.note ?? '').startsWith('Alumdoor canonical ')
      || String(old.bom_fingerprint ?? '').trim()
      || old.items?.length !== 2) {
      throw new Error(`old BOM identity failed preflight: ${target.name}`);
    }
    existingTargets.push(target.name);
  }

  console.log(`ALUMDOOR_BOM_CLEANUP_PREFLIGHT targets=${targets.length} deletable=${existingTargets.length} replacements=2`);
  if (existingTargets.length) {
    const deleted = await request('/api/method/frappe.desk.reportview.delete_items', {
      method: 'POST',
      body: { doctype: 'Bill of Materials', items: JSON.stringify(existingTargets) },
    });
    const result = deleted.body?.message ?? deleted.body;
    const deletedCount = Number(result?.deleted ?? 0);
    const failedCount = Number(result?.failed ?? 0);
    if (failedCount !== 0 || deletedCount !== existingTargets.length) {
      throw new Error(`bulk delete mismatch: ${JSON.stringify(result)}`);
    }
  }

  for (const target of targets) {
    const oldResult = await request(`/api/resource/Bill%20of%20Materials/${encodeURIComponent(target.name)}`, {}, [404]);
    if (oldResult.status !== 404) throw new Error(`old BOM still exists: ${target.name}`);
    const replacementResult = await request(`/api/resource/Bill%20of%20Materials/${encodeURIComponent(target.replacement)}`);
    if (replacementResult.status !== 200) throw new Error(`replacement missing after cleanup: ${target.replacement}`);
  }
  console.log(`ALUMDOOR_BOM_CLEANUP_VERIFY_PASS deleted=${existingTargets.length} canonical_preserved=2`);
}
