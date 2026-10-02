import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntegrationMethod } from '../dist/packages/frappe-api/src/integration-methods.js';

function fixture(overrides = {}) {
  const calls = [];
  const integrations = Object.fromEntries(['start', 'callback', 'status', 'disconnect', 'deliveries', 'replay'].map(method => [method, async (...args) => { calls.push({ method, args }); return { accepted: true }; }]));
  return { calls, context: { actor: { user_id: 'user@example.com', roles: ['Employee'] }, establishedSession: true, integrations, ...overrides } };
}
function request(method, http, args = {}) {
  const url = new URL(`https://tenant.example.com/api/method/forge.integrations.${method}`);
  if (http === 'GET') for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
  return [new Request(url, { method: http, ...(http === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) } : {}) }), url];
}
const argumentsFor = { start: { app_id: 'erp' }, callback: { app_id: 'erp', state: 'state', code: 'code' }, status: { app_id: 'erp' }, disconnect: { app_id: 'erp' }, deliveries: { limit: 25 }, replay: { delivery_id: 'dlv1', reason: 'operator retry' } };
const verb = method => ['start', 'disconnect', 'replay'].includes(method) ? 'POST' : 'GET';

test('all integration methods reject Guest and empty actors before API work', async () => {
  for (const user_id of ['Guest', '']) for (const method of Object.keys(argumentsFor)) {
    const { context, calls } = fixture({ actor: { user_id, roles: ['System Manager'] } });
    await assert.rejects(routeIntegrationMethod(...request(method, verb(method), argumentsFor[method]), context));
    assert.equal(calls.length, 0);
  }
});

test('connected app control requires browser session even for administrators', async () => {
  for (const method of ['start', 'callback', 'status', 'disconnect']) {
    const { context, calls } = fixture({ establishedSession: false, actor: { user_id: 'Administrator', roles: [] } });
    await assert.rejects(routeIntegrationMethod(...request(method, verb(method), argumentsFor[method]), context), /browser session/);
    assert.equal(calls.length, 0);
  }
});

test('each integration method enforces its declared HTTP verb before API work', async () => {
  for (const method of Object.keys(argumentsFor)) {
    const { context, calls } = fixture({ actor: { user_id: 'Administrator', roles: [] } });
    await assert.rejects(routeIntegrationMethod(...request(method, verb(method) === 'POST' ? 'GET' : 'POST', argumentsFor[method]), context), /requires/);
    assert.equal(calls.length, 0);
  }
});

test('ordinary authenticated users cannot inspect or replay webhook deliveries', async () => {
  for (const method of ['deliveries', 'replay']) {
    const { context, calls } = fixture();
    await assert.rejects(routeIntegrationMethod(...request(method, verb(method), argumentsFor[method]), context), /System Manager/);
    assert.equal(calls.length, 0);
  }
});

test('delivery inspection and replay allow explicit system authority without browser session', async () => {
  for (const actor of [{ user_id: 'Administrator', roles: [] }, { user_id: 'manager', roles: ['System Manager'] }, { user_id: 'manager', roles: ['Administrator'] }]) {
    for (const method of ['deliveries', 'replay']) {
      const { context, calls } = fixture({ actor, establishedSession: false });
      const response = await routeIntegrationMethod(...request(method, verb(method), argumentsFor[method]), context);
      assert.deepEqual(await response.json(), { message: { accepted: true } });
      assert.equal(calls[0].method, method);
    }
  }
});

test('connected app dispatch accepts identity arguments only and ignores injected provider/tenant/secrets', async () => {
  const { context, calls } = fixture();
  const response = await routeIntegrationMethod(...request('start', 'POST', { app_id: 'erp', tenant_id: 'other', user_id: 'Administrator', token_url: 'https://attacker.example.com', client_secret: 'secret-injected' }), context);
  assert.deepEqual(calls, [{ method: 'start', args: ['erp'] }]);
  assert.doesNotMatch(await response.text(), /secret-injected|attacker|Administrator/);
});

test('bounded delivery limit and required replay attribution reject malformed requests', async () => {
  for (const args of [{ limit: 0 }, { limit: 101 }]) {
    const { context, calls } = fixture({ actor: { user_id: 'Administrator', roles: [] } });
    await assert.rejects(routeIntegrationMethod(...request('deliveries', 'GET', args), context));
    assert.equal(calls.length, 0);
  }
  const { context, calls } = fixture({ actor: { user_id: 'Administrator', roles: [] } });
  await assert.rejects(routeIntegrationMethod(...request('replay', 'POST', { delivery_id: 'dlv1' }), context));
  assert.equal(calls.length, 0);
});

test('unknown routes remain unhandled and missing integration service fails closed', async () => {
  const { context } = fixture();
  assert.equal(await routeIntegrationMethod(...request('unknown', 'GET'), context), null);
  await assert.rejects(routeIntegrationMethod(...request('status', 'GET', { app_id: 'erp' }), { ...context, integrations: undefined }), /unavailable/);
});
