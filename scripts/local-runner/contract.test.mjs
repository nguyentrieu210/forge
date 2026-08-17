import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {
  ExecutionError,
  assertLocalWranglerArgs,
  assertPathInside,
  classifyExistingLock,
  classifyOutcome,
  normalizeWinPath,
  parseArgs,
} from './run-local-import.mjs';

test('parse known adapters and source', () => {
  assert.deepEqual(parseArgs(['item-master', '--source=C:\\alumdoor\\local-imports\\items.json']), {
    adapter: 'item-master',
    options: { source: 'C:\\alumdoor\\local-imports\\items.json' },
  });
  assert.equal(parseArgs(['bootstrap']).adapter, 'bootstrap');
});

test('reject unknown adapter', () => {
  assert.throws(() => parseArgs(['pricing']), /Usage:/);
});

test('path containment is case insensitive and rejects escape', () => {
  const inside = assertPathInside(
    'C:\\ALUMDOOR\\local-imports\\x.json',
    'c:\\alumdoor\\local-imports',
  );
  assert.equal(normalizeWinPath(inside), 'c:\\alumdoor\\local-imports\\x.json');
  assert.throws(
    () => assertPathInside('C:\\alumdoor\\..\\secret.json', 'C:\\alumdoor\\local-imports'),
    /escapes/,
  );
});

test('different-host lock fails closed even when old', () => {
  const lock = {
    hostname: 'other-host',
    pid: 999999,
    started_at: new Date(0).toISOString(),
  };
  assert.deepEqual(classifyExistingLock(lock, os.hostname()), {
    action: 'block',
    reason: 'different_host',
  });
});

test('same-host live owner blocks', () => {
  const lock = {
    hostname: os.hostname(),
    pid: process.pid,
    started_at: new Date(0).toISOString(),
  };
  assert.deepEqual(classifyExistingLock(lock, os.hostname()), {
    action: 'block',
    reason: 'owner_alive',
  });
});

test('same-host proven dead owner can be reaped without age-only logic', () => {
  const lock = {
    hostname: os.hostname(),
    pid: 2147483647,
    started_at: new Date().toISOString(),
  };
  assert.deepEqual(classifyExistingLock(lock, os.hostname()), {
    action: 'reap',
    reason: 'dead_owner',
  });
});

test('invalid lock owner fails closed', () => {
  assert.deepEqual(classifyExistingLock({ hostname: os.hostname() }, os.hostname()), {
    action: 'block',
    reason: 'invalid_or_unknown_owner',
  });
});

test('Wrangler local guard rejects remote and missing --local', () => {
  assert.throws(
    () => assertLocalWranglerArgs(['d1', 'execute', 'db', '--remote']),
    (error) => error instanceof ExecutionError && error.failureClass === 'REMOTE_MUTATION_GUARD',
  );
  assert.throws(
    () => assertLocalWranglerArgs(['d1', 'execute', 'db']),
    /must include --local/,
  );
  assert.doesNotThrow(() =>
    assertLocalWranglerArgs(['d1', 'execute', 'db', '--local', '--command', 'SELECT 1']),
  );
});

test('failure outcome classification keeps data, verify, import and infra distinct', () => {
  assert.equal(classifyOutcome('DATA', 'SOURCE_FILE'), 'DATA_BLOCKED');
  assert.equal(classifyOutcome('IMPORT', 'VERIFY'), 'VERIFY_FAILED');
  assert.equal(classifyOutcome('VERIFY', 'OTHER'), 'VERIFY_FAILED');
  assert.equal(classifyOutcome('IMPORT', 'IMPORTER'), 'IMPORT_FAILED');
  assert.equal(classifyOutcome('BACKUP', 'D1_STATE'), 'INFRA_BLOCKED');
});
