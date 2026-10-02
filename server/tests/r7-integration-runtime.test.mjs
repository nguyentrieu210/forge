import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorWebhookHosts, runtimeWebhookTransport, runtimeWebhookCredentials, runTenantWebhooks, createIntegrationApi, connectedAppRuntime } from '../dist/apps/tenant-worker/src/integration-runtime.js';

const env = () => ({
  INTEGRATION_ALLOWED_HOSTS_JSON: JSON.stringify({ demo: ['hooks.example.com'], other: ['other.example.com'] }),
  INTEGRATION_CREDENTIALS_JSON: JSON.stringify({ demo: { ref: { headers: { authorization: 'Bearer demo-secret' }, signing_secret: 'demo-signing-secret' } }, other: { ref: { headers: { authorization: 'Bearer other-secret' } } } }),
});
const subscription = (overrides = {}) => ({ tenant_id: 'demo', secret_ref: 'ref', auth_kind: 'api_key', ...overrides });

test('runtime operator allowlists stay tenant scoped and malformed bindings fail closed', () => {
  assert.deepEqual(operatorWebhookHosts(env(), 'demo'), ['hooks.example.com']);
  assert.equal(operatorWebhookHosts(env(), 'missing'), null);
  assert.equal(operatorWebhookHosts({}, 'demo'), null);
  for (const value of ['[]', '{', JSON.stringify({ demo: ['*.example.com'] }), JSON.stringify({ demo: [123] })]) {
    assert.throws(() => operatorWebhookHosts({ INTEGRATION_ALLOWED_HOSTS_JSON: value }, 'demo'));
  }
  assert.equal(operatorWebhookHosts({ INTEGRATION_ALLOWED_HOSTS_JSON: '{}' }, '__proto__'), null);
});

test('unconfigured tenant preserves durable webhook work without touching the database', async () => {
  const DB = { prepare() { throw new Error('unexpected database access'); } };
  assert.deepEqual(await runTenantWebhooks({ DB }, 'demo', '2026-10-02T00:00:00Z'), { configured: false, claimed: 0, delivered: 0, retry: 0, dead_letter: 0 });
  assert.equal((await runTenantWebhooks({ DB, INTEGRATION_ALLOWED_HOSTS_JSON: '{"demo":[]}' }, 'demo', '2026-10-02T00:00:00Z')).configured, false);
});

test('runtime credential references cannot cross tenants or inherit object properties', async () => {
  const resolver = runtimeWebhookCredentials(env(), 'demo');
  assert.deepEqual(await resolver.resolve(subscription()), { headers: { authorization: 'Bearer demo-secret' }, signing_secret: 'demo-signing-secret' });
  for (const overrides of [{ tenant_id: 'other' }, { secret_ref: 'missing' }, { secret_ref: '__proto__' }, { secret_ref: 'constructor' }]) {
    await assert.rejects(resolver.resolve(subscription(overrides)));
  }
  await assert.rejects(runtimeWebhookCredentials(env(), 'missing').resolve(subscription({ tenant_id: 'missing' })));
});

test('anonymous credentials need no secret binding and authenticated credentials require a reference', async () => {
  const resolver = runtimeWebhookCredentials({}, 'demo');
  assert.deepEqual(await resolver.resolve(subscription({ auth_kind: 'none', secret_ref: undefined })), {});
  await assert.rejects(resolver.resolve(subscription({ secret_ref: undefined })), /reference required/);
});

test('malformed credential binding never returns provider material', async () => {
  for (const value of [{ headers: { authorization: 123 } }, { headers: [] }, { signing_secret: 123 }, []]) {
    const configured = { INTEGRATION_CREDENTIALS_JSON: JSON.stringify({ demo: { ref: value } }) };
    await assert.rejects(runtimeWebhookCredentials(configured, 'demo').resolve(subscription()));
  }
  await assert.rejects(runtimeWebhookCredentials({ INTEGRATION_CREDENTIALS_JSON: '{"demo":{"ref":{}}}' }, 'demo').resolve(subscription({ auth_kind: 'oauth2' })), /OAuth webhook binding/);
});

test('runtime transport rechecks operator host before network and forces safe fetch options', async () => {
  const calls = [];
  const transport = runtimeWebhookTransport(['hooks.example.com'], async (url, init) => { calls.push({ url, init }); return new Response('ok'); });
  await assert.rejects(transport.fetch('https://other.example.com/', {}), /allowlist/);
  await assert.rejects(transport.fetch('http://hooks.example.com/', {}), /HTTPS/);
  assert.equal(calls.length, 0);
  await transport.fetch('https://hooks.example.com/hook', { method: 'POST', redirect: 'follow', credentials: 'include', body: 'payload' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, 'payload');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('connected app runtime refuses tenant registration and vault gaps before database/provider access', async () => {
  const app = { appId: 'erp', clientId: 'id', clientSecret: 'provider-secret', allowedHosts: ['oauth.example.com'], scopes: [] };
  const configured = { CONNECTED_APPS_JSON: JSON.stringify({ demo: { erp: app } }) };
  await assert.rejects(connectedAppRuntime(configured, 'other', 'user', 'erp'), /Tenant integration binding/);
  await assert.rejects(connectedAppRuntime(configured, 'demo', 'user', 'missing'), /not registered/);
  await assert.rejects(connectedAppRuntime(configured, 'demo', 'user', 'erp'), /vault/);
  await assert.rejects(connectedAppRuntime({ ...configured, CONNECTED_APP_VAULT_KEY: 'wrong' }, 'demo', 'user', 'erp'), /vault/);
});

test('delivery inspection uses trusted tenant and selects metadata without payload or credential fields', async () => {
  let sql;
  let args;
  const row = { delivery_id: 'dlv1', state: 'dead_letter' };
  const DB = { prepare(query) { sql = query; return { bind(...values) { args = values; return this; }, async all() { return { results: [row] }; } }; } };
  const api = createIntegrationApi({ DB }, 'trusted-tenant', 'trusted-user');
  assert.deepEqual(await api.deliveries(25), { deliveries: [row] });
  assert.deepEqual(args, ['trusted-tenant', 25]);
  assert.match(sql, /WHERE tenant_id=\?1/);
  assert.doesNotMatch(sql.split('FROM')[0], /task_json|headers|secret|token|payload/i);
});
