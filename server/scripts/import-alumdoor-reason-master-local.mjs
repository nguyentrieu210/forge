#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

assertLocalMutationChildContext(['reason-master']);

const origin = (process.env.FORGE_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedOrigin.hostname)) {
  throw new Error(`refusing: Reason Master import is local-only, got ${parsedOrigin.hostname}`);
}
const user = process.env.FORGE_ADMIN_USER || 'dev@example.com';
const password = process.env.FORGE_ADMIN_PASSWORD || '';
if (!password) throw new Error('FORGE_ADMIN_PASSWORD is required');

const CANCELLATION_DOCTYPE = 'L\u00fd do hu\u1ef7';
const VARIANCE_DOCTYPE = 'Nguy\u00ean nh\u00e2n ch\u00eanh l\u1ec7ch';
const sourcePath = new URL('../briefs/alumdoor-v2.fixtures.json', import.meta.url);
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const managedDoctypes = new Map([
  [CANCELLATION_DOCTYPE, ['reason_code', 'reason_name', 'applies_to_doctype', 'sort_order', 'disabled']],
  [VARIANCE_DOCTYPE, ['reason_code', 'reason_name', 'variance_kind', 'sort_order', 'disabled']],
]);
const fixtures = (source.fixtures || []).filter((row) => managedDoctypes.has(row.type));
const cancelFixtures = fixtures.filter((row) => row.type === CANCELLATION_DOCTYPE);
const varianceFixtures = fixtures.filter((row) => row.type === VARIANCE_DOCTYPE);
if (cancelFixtures.length !== 6 || varianceFixtures.length !== 7) {
  const seenTypes = [...new Set((source.fixtures || []).map((row) => JSON.stringify(row.type)))];
  throw new Error(`Refusing local import: expected 6 cancellation + 7 variance fixtures, got ${cancelFixtures.length} + ${varianceFixtures.length}; fixture_types=${seenTypes.join(',')}`);
}

const jar = new Map();
let csrfToken = '';
function storeCookies(response) {
  const values = response.headers.getSetCookie?.() ?? [];
  if (values.length === 0) {
    const combined = response.headers.get('set-cookie');
    if (combined) values.push(...combined.split(/,(?=[^;,]+=)/));
  }
  for (const value of values) {
    const [pair] = value.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function cookieHeader() {
  return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
}
async function request(pathname, { method = 'GET', body, allow404 = false } = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      'cache-control': 'no-cache',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(csrfToken ? { 'x-frappe-csrf-token': csrfToken } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  storeCookies(response);
  csrfToken = response.headers.get('x-frappe-csrf-token') || csrfToken;
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const detail = parsed?.message ?? parsed?.exception ?? text.slice(0, 500);
    throw new Error(`${method} ${pathname} -> HTTP ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return parsed;
}
function resourcePath(doctype, name = '') {
  const root = `/api/resource/${encodeURIComponent(doctype)}`;
  return name ? `${root}/${encodeURIComponent(name)}` : root;
}
async function loadMeta(doctype) {
  const payload = await request(`/api/method/frappe.desk.form.load.getdoctype?doctype=${encodeURIComponent(doctype)}&with_parent=1`);
  const docs = payload?.docs ?? payload?.message?.docs ?? [];
  const meta = docs.find((doc) => doc?.name === doctype);
  if (!meta) throw new Error(`Refusing local import: DocType ${doctype} does not exist`);
  const names = new Set((meta.fields ?? []).map((field) => field.fieldname));
  for (const required of managedDoctypes.get(doctype)) {
    if (!names.has(required)) throw new Error(`Refusing local import: ${doctype}.${required} is missing`);
  }
}
function valueEqual(field, actual, expected) {
  if (field === 'sort_order' || field === 'disabled') return Number(actual ?? 0) === Number(expected ?? 0);
  return String(actual ?? '') === String(expected ?? '');
}
async function getRecord(fixture) {
  const payload = await request(resourcePath(fixture.type, fixture.name), { allow404: true });
  return payload?.data ?? payload?.message ?? payload;
}
async function upsertPass(label) {
  let created = 0;
  let updated = 0;
  let noop = 0;
  for (const fixture of fixtures) {
    const fields = managedDoctypes.get(fixture.type);
    const existing = await getRecord(fixture);
    if (!existing) {
      await request(resourcePath(fixture.type), {
        method: 'POST',
        body: { doctype: fixture.type, name: fixture.name, ...fixture.data },
      });
      created += 1;
      continue;
    }
    const patch = {};
    for (const field of fields) {
      if (!valueEqual(field, existing[field], fixture.data[field])) patch[field] = fixture.data[field];
    }
    if (Object.keys(patch).length) {
      await request(resourcePath(fixture.type, fixture.name), { method: 'PUT', body: patch });
      updated += 1;
    } else {
      noop += 1;
    }
  }
  console.log(`${label} created=${created} updated=${updated} noop=${noop}`);
  return { created, updated, noop };
}
async function verify() {
  for (const fixture of fixtures) {
    const record = await getRecord(fixture);
    if (!record) throw new Error(`Local post-verify missing ${fixture.type}/${fixture.name}`);
    for (const field of managedDoctypes.get(fixture.type)) {
      if (!valueEqual(field, record[field], fixture.data[field])) {
        throw new Error(`Local post-verify mismatch ${fixture.type}/${fixture.name}.${field}: actual=${JSON.stringify(record[field])} expected=${JSON.stringify(fixture.data[field])}`);
      }
    }
  }
  console.log(`LOCAL_CANCELLATION_REASON_PASS expected=${cancelFixtures.length}`);
  console.log(`LOCAL_VARIANCE_REASON_PASS expected=${varianceFixtures.length}`);
}

await request('/api/method/login', { method: 'POST', body: { usr: user, pwd: password } });
await loadMeta(CANCELLATION_DOCTYPE);
await loadMeta(VARIANCE_DOCTYPE);
const first = await upsertPass('LOCAL_IMPORT_PASS_1');
await verify();
const second = await upsertPass('LOCAL_IMPORT_PASS_2');
if (second.created !== 0 || second.updated !== 0 || second.noop !== fixtures.length) {
  throw new Error(`Local idempotence failed: ${JSON.stringify(second)}`);
}
await verify();
console.log(`LOCAL_REASON_MASTER_IDEMPOTENCE_PASS records=${fixtures.length} first_mutations=${first.created + first.updated}`);
