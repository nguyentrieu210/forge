import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ExecutionError,
  assertLocalWranglerArgs,
  assertPathInside,
  classifyExistingLock,
  classifyOutcome,
  normalizeSpawnInvocation,
  normalizeWinPath,
  parseArgs,
} from './run-local-import.mjs';
import { assertPurchaseSqlTargets } from './real-purchase-adapter.mjs';

const purchaseVerifier = fileURLToPath(
  new URL('../../server/scripts/verify-alumdoor-real-purchase-audit.mjs', import.meta.url),
);

test('parse known adapters and source', () => {
  assert.deepEqual(parseArgs(['item-master', '--source=C:\\alumdoor\\local-imports\\items.json']), {
    adapter: 'item-master',
    options: { source: 'C:\\alumdoor\\local-imports\\items.json' },
  });
  assert.equal(parseArgs(['bootstrap']).adapter, 'bootstrap');
  assert.equal(parseArgs(['real-purchase']).adapter, 'real-purchase');
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

test('Windows command shims are routed through ComSpec without shell mode', () => {
  const command = 'C:\\alumdoor\\server\\node_modules\\.bin\\wrangler.cmd';
  const args = ['d1', 'execute', 'cloudforge-demo', '--local', '--command', 'SELECT 1'];
  assert.deepEqual(
    normalizeSpawnInvocation(command, args, {
      platform: 'win32',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
    }),
    {
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/c', command, ...args],
    },
  );
  assert.deepEqual(
    normalizeSpawnInvocation('git', ['status'], {
      platform: 'win32',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
    }),
    { command: 'git', args: ['status'] },
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

test('Real Purchase SQL allowlist accepts only canonical draft targets', () => {
  assert.deepEqual(
    assertPurchaseSqlTargets(`
      INSERT INTO documents (tenant_id) SELECT 'demo';
      INSERT INTO document_search (tenant_id) SELECT 'demo';
    `),
    ['document_search', 'documents'],
  );
});

test('Real Purchase SQL allowlist rejects extra or destructive targets', () => {
  assert.throws(
    () => assertPurchaseSqlTargets(`
      INSERT INTO documents (tenant_id) SELECT 'demo';
      INSERT INTO document_search (tenant_id) SELECT 'demo';
      INSERT INTO master_records (tenant_id) SELECT 'demo';
    `),
    /forbidden write target: master_records/,
  );
  assert.throws(
    () => assertPurchaseSqlTargets(`
      INSERT INTO documents (tenant_id) SELECT 'demo';
      INSERT INTO document_search (tenant_id) SELECT 'demo';
      DELETE FROM documents WHERE tenant_id='demo';
    `),
    /forbidden mutation verb: DELETE FROM documents/,
  );
});

function purchaseFixture(fingerprint = 'fp-1', modified = '2026-08-18T00:00:00.000Z') {
  return [
    {
      results: [
        {
          name: 'PR-HIST-TEST',
          docstatus: 0,
          modified_at: modified,
          payload_json: JSON.stringify({
            items: [{ item_code: 'NVL-TEST', qty: 1, uom: 'CÁI', rate: 1000 }],
            _alumdoor_real_purchase: {
              format: 'alumdoor-real-purchase-history/v1',
              import_fingerprint: fingerprint,
              source_rows: [7],
              submit_forbidden: true,
            },
          }),
        },
      ],
    },
  ];
}

function withPurchaseVerifierFixture(callback) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'forge-purchase-verifier-'));
  try {
    const expected = path.join(dir, 'expected.json');
    const firstAudit = path.join(dir, 'first.json');
    const secondAudit = path.join(dir, 'second.json');
    const firstPersisted = path.join(dir, 'persisted-first.json');
    const secondPersisted = path.join(dir, 'persisted-second.json');
    writeFileSync(expected, JSON.stringify({
      format: 'alumdoor-real-purchase-expected/v1',
      receipt_count: 1,
      line_count: 1,
      receipts: [{
        name: 'PR-HIST-TEST',
        fingerprint: 'fp-1',
        line_count: 1,
        source_rows: [7],
      }],
    }));
    writeFileSync(firstAudit, JSON.stringify({ purchase_receipts: [] }));
    writeFileSync(secondAudit, JSON.stringify({ purchase_receipts: [] }));
    writeFileSync(firstPersisted, JSON.stringify(purchaseFixture()));
    writeFileSync(secondPersisted, JSON.stringify(purchaseFixture()));
    callback({ dir, expected, firstAudit, secondAudit, firstPersisted, secondPersisted });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Real Purchase verifier consumes runner-supplied persisted D1 evidence', () => {
  withPurchaseVerifierFixture(({ expected, firstAudit, secondAudit, firstPersisted, secondPersisted }) => {
    const result = spawnSync(
      process.execPath,
      [
        purchaseVerifier,
        expected,
        firstAudit,
        secondAudit,
        `--persisted-first=${firstPersisted}`,
        `--persisted-second=${secondPersisted}`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /FIRST_PERSISTED_D1_EVIDENCE receipts=1/);
    assert.match(result.stdout, /SECOND_PERSISTED_D1_EVIDENCE receipts=1/);
    assert.match(result.stdout, /ALUMDOOR_REAL_PURCHASE_IDEMPOTENCY_PASS receipts=1 lines=1/);
  });
});

test('Real Purchase verifier fails closed on persisted fingerprint drift', () => {
  withPurchaseVerifierFixture(({ expected, firstAudit, secondAudit, firstPersisted, secondPersisted }) => {
    writeFileSync(secondPersisted, JSON.stringify(purchaseFixture('fp-conflict')));
    const result = spawnSync(
      process.execPath,
      [
        purchaseVerifier,
        expected,
        firstAudit,
        secondAudit,
        `--persisted-first=${firstPersisted}`,
        `--persisted-second=${secondPersisted}`,
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SECOND_FINGERPRINT_CONFLICT/);
  });
});

test('failure outcome classification keeps data, verify, import and infra distinct', () => {
  assert.equal(classifyOutcome('DATA', 'SOURCE_FILE'), 'DATA_BLOCKED');
  assert.equal(classifyOutcome('IMPORT', 'VERIFY'), 'VERIFY_FAILED');
  assert.equal(classifyOutcome('VERIFY', 'OTHER'), 'VERIFY_FAILED');
  assert.equal(classifyOutcome('IMPORT', 'IMPORTER'), 'IMPORT_FAILED');
  assert.equal(classifyOutcome('BACKUP', 'D1_STATE'), 'INFRA_BLOCKED');
});
