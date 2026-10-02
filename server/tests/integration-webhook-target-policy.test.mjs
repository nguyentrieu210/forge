import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedWebhookTarget } from '../dist/packages/integration-hub/src/index.js';

test('webhook policy rejects special-use literals even when explicitly allowlisted', () => {
  for (const host of [
    '[::ffff:127.0.0.1]', '[::ffff:10.0.0.1]', '[::]', '[::1]', '[64:ff9b::7f00:1]',
    '[fe80::1]', '[fc00::1]', '[ff02::1]', '[2001::1]', '[2001:2::1]', '[2001:db8::1]',
    '[2002:7f00:1::]', '[3fff::1]', '100.64.0.1', '100.127.255.255', '198.18.0.1',
    '198.19.255.255', '224.0.0.1', '240.0.0.1', '255.255.255.255', '192.0.0.1',
    '192.0.2.1', '192.88.99.1', '198.51.100.1', '203.0.113.1', '2130706433',
    '0x7f000001', '127.1', 'localhost.', 'service.local.', 'service.internal',
  ]) {
    const target = `https://${host}/hook`;
    assert.throws(() => assertAllowedWebhookTarget(target, [new URL(target).hostname]), /not allowed/, host);
  }
});

test('webhook policy retains public literals and exact hostname allowlists', () => {
  for (const host of ['8.8.8.8', '100.128.0.1', '198.20.0.1', '[2606:4700:4700::1111]', 'hooks.example.com']) {
    const target = `https://${host}/hook`;
    assert.equal(assertAllowedWebhookTarget(target, [host]).hostname, host);
    assert.throws(() => assertAllowedWebhookTarget(target, ['other.example.com']), /allowlist/);
  }
});
