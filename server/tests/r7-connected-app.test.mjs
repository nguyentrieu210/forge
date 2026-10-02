import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ConnectedAppService, importConnectedAppKey } from '../dist/packages/integration-hub/src/connected-app.js';
import { D1ConnectedAppStore } from '../dist/packages/integration-hub/src/connected-app-store.js';

const identity = { tenantId: 'tenant-a', userId: 'alice', appId: 'erp' };
const config = { appId: 'erp', authorizationUrl: 'https://provider.example/authorize', tokenUrl: 'https://provider.example/token', redirectUri: 'https://forge.example/oauth/callback', allowedHosts: ['provider.example'], scopes: ['read'] };
async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/tenant/0149_r7_connected_apps.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) { return { bind(...values) { return {
      async run() { return sqlite.prepare(sql).run(...values); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    }; } }; },
    async batch(statements) { sqlite.exec('BEGIN'); try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  let now = 1_000_000; let transport;
  const calls = [];
  const store = new D1ConnectedAppStore(db);
  const service = new ConnectedAppService({ store, encryptionKey: await importConnectedAppKey(new Uint8Array(32).fill(19)), now: () => now,
    credentials: async () => ({ clientId: 'runtime-client', clientSecret: 'runtime-secret' }),
    fetch: async (url, init) => { calls.push({ url, init }); return transport ? transport(url, init) : Response.json({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 60, token_type: 'Bearer' }); },
  });
  return { service, store, sqlite, calls, setNow(value) { now = value; }, setTransport(fn) { transport = fn; } };
}
async function connect(fixture) { const start = await fixture.service.start(identity, config); const url = new URL(start.authorizationUrl); await fixture.service.callback(identity, config, url.searchParams.get('state'), 'code'); return url; }

test('state and PKCE bind to tenant/user/app; token ciphertext only; cached token avoids provider calls', async () => {
  const f = await setup(); const start = await f.service.start(identity, config); const url = new URL(start.authorizationUrl); const state = url.searchParams.get('state');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(start.authorizationUrl.includes('runtime-secret'), false);
  for (const other of [{ ...identity, tenantId: 'tenant-b' }, { ...identity, userId: 'bob' }, { ...identity, appId: 'other' }]) {
    await assert.rejects(f.service.callback(other, { ...config, appId: other.appId }, state, 'code'), /identity mismatch/);
  }
  assert.equal(f.calls.length, 0);
  await f.service.callback(identity, config, state, 'code');
  assert.equal(await f.service.getAccessToken(identity, config), 'access-secret'); assert.equal(f.calls.length, 1);
  await assert.rejects(f.service.getAccessToken(identity, { ...config, scopes: ['write'] }), /configuration changed/);
  const form = f.calls[0].init.body; const verifier = form.get('code_verifier');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  assert.equal(Buffer.from(hash).toString('base64url'), url.searchParams.get('code_challenge'));
  const row = await f.store.getConnection(identity);
  assert.equal(row.tokenCiphertext.includes('access-secret'), false); assert.equal(row.tokenCiphertext.includes('refresh-secret'), false);
  await assert.rejects(f.service.callback(identity, config, state, 'code'), /consumed/);
  assert.equal(f.calls.length, 1);
});

test('expired state, changed configuration, unsafe endpoint and provider redirect all fail closed', async () => {
  const f = await setup(); let start = await f.service.start(identity, config); f.setNow(1_600_000);
  await assert.rejects(f.service.callback(identity, config, new URL(start.authorizationUrl).searchParams.get('state'), 'code'), /expired/);
  f.setNow(2_000_000); start = await f.service.start(identity, config);
  await assert.rejects(f.service.callback(identity, { ...config, scopes: ['write'] }, new URL(start.authorizationUrl).searchParams.get('state'), 'code'), /configuration changed/);
  await assert.rejects(f.service.start(identity, { ...config, tokenUrl: 'http://provider.example/token' }), /endpoint/);
  await assert.rejects(f.service.start(identity, { ...config, tokenUrl: 'https://127.0.0.1/token', allowedHosts: ['127.0.0.1'] }), /endpoint/);
  assert.equal(f.calls.length, 0);
  await connect(f); assert.equal(f.calls[0].init.redirect, 'error'); assert.ok(f.calls[0].init.signal);
});

test('AES-GCM additional data prevents cross-user token transplant', async () => {
  const f = await setup(); await connect(f);
  f.sqlite.prepare('INSERT INTO connected_app_connections SELECT tenant_id,?,app_id,token_ciphertext,expires_at,version,refresh_lease,refresh_lease_until FROM connected_app_connections').run('bob');
  await assert.rejects(f.service.getAccessToken({ ...identity, userId: 'bob' }, config));
  assert.equal(f.calls.length, 1);
});

test('refresh has one atomic lease, rotates token, preserves absent refresh token', async () => {
  const f = await setup(); await connect(f); f.setNow(1_040_000);
  let resolve; f.setTransport(() => new Promise(r => { resolve = r; }));
  const first = f.service.getAccessToken(identity, config);
  while (!resolve) await new Promise(r => setImmediate(r));
  await assert.rejects(f.service.getAccessToken(identity, config), /refresh in progress/);
  resolve(Response.json({ access_token: 'new-access', expires_in: 120, token_type: 'Bearer' }));
  assert.equal(await first, 'new-access'); assert.equal(f.calls[1].init.body.get('refresh_token'), 'refresh-secret');
  assert.equal(await f.service.getAccessToken(identity, config), 'new-access');
  f.setNow(1_150_000); f.setTransport(() => Response.json({ access_token: 'third-access', expires_in: 120, token_type: 'Bearer' }));
  assert.equal(await f.service.getAccessToken(identity, config), 'third-access');
  assert.equal(f.calls[2].init.body.get('refresh_token'), 'refresh-secret');
});

test('disconnect tombstone prevents in-flight callback and refresh from resurrecting connection', async () => {
  for (const mode of ['callback', 'refresh']) {
    const f = await setup(); let pending;
    if (mode === 'refresh') { await connect(f); f.setNow(1_040_000); }
    let resolve; f.setTransport(() => new Promise(r => { resolve = r; }));
    if (mode === 'callback') { const start = await f.service.start(identity, config); pending = f.service.callback(identity, config, new URL(start.authorizationUrl).searchParams.get('state'), 'code'); }
    else pending = f.service.getAccessToken(identity, config);
    while (!resolve) await new Promise(r => setImmediate(r));
    await f.service.disconnect(identity);
    resolve(Response.json({ access_token: 'late-token', expires_in: 120, token_type: 'Bearer' }));
    await assert.rejects(pending, /connection changed/);
    await assert.rejects(f.service.getAccessToken(identity, config), /not connected/);
    assert.equal((await f.store.getConnection(identity)).tokenCiphertext, null);
  }
});

test('provider failure and malformed response never persist tokens or leak provider body', async () => {
  const f = await setup(); f.setTransport(() => new Response('secret-provider-error', { status: 400 }));
  await assert.rejects(connect(f), error => error.message === 'OAuth token exchange failed');
  assert.equal((await f.store.getConnection(identity)).tokenCiphertext, null);
  f.setTransport(() => Response.json({ access_token: 'secret', token_type: 'Bearer', expires_in: -1 }));
  await assert.rejects(connect(f), /Invalid OAuth token response/);
  assert.equal((await f.store.getConnection(identity)).tokenCiphertext, null);
});

test('transport diagnostics, invalid JSON and oversized provider bodies cannot disclose secrets', async () => {
  for (const transport of [
    () => { throw new Error('secret-client-material'); },
    () => new Response('secret-access-token is invalid JSON'),
    () => new Response('x'.repeat(131_073)),
    () => Response.json({ access_token: 'token\r\nsecret', token_type: 'Bearer', expires_in: 120 }),
  ]) {
    const f = await setup(); f.setTransport(transport);
    await assert.rejects(connect(f), error => ['OAuth token exchange failed', 'Invalid OAuth token response'].includes(error.message));
    assert.equal((await f.store.getConnection(identity)).tokenCiphertext, null);
  }
});
