import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  scanMigrationTree,
  validateAppliedState,
  validateChangeSet,
} from '../scripts/verify-migration-governance.mjs';

const CONFIG = {
  legacyPrefixCollisions: {
    'tenant/0110': [
      '0110_rc020_finance_posting_period_integrity.sql',
      '0110_rc023_cash_bank_reconciliation.sql',
    ],
  },
};

function fixture() {
  const serverRoot = mkdtempSync(path.join(os.tmpdir(), 'forge-migration-governance-'));
  const tenant = path.join(serverRoot, 'migrations', 'tenant');
  mkdirSync(tenant, { recursive: true });
  writeFileSync(path.join(tenant, '0001_init.sql'), 'CREATE TABLE t(id INTEGER);\n');
  writeFileSync(path.join(tenant, '0110_rc020_finance_posting_period_integrity.sql'), '-- historical a\n');
  writeFileSync(path.join(tenant, '0110_rc023_cash_bank_reconciliation.sql'), '-- historical b\n');
  writeFileSync(path.join(tenant, '0111_next.sql'), '-- next\n');
  return serverRoot;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('exact legacy prefix collision is grandfathered but cannot grow', () => {
  const root = fixture();
  try {
    assert.equal(scanMigrationTree(root, CONFIG).length, 4);
    writeFileSync(path.join(root, 'migrations', 'tenant', '0110_third.sql'), '-- forbidden\n');
    assert.throws(() => scanMigrationTree(root, CONFIG), /legacy collision tenant\/0110 changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('applied-state identity requires exact sha256 and rejects content drift', () => {
  const root = fixture();
  try {
    const records = scanMigrationTree(root, CONFIG);
    const state = {
      version: 1,
      databases: [{
        migrationDir: 'tenant',
        applied: [{ name: '0001_init.sql', sha256: sha256('CREATE TABLE t(id INTEGER);\n') }],
      }],
    };
    assert.equal(validateAppliedState(root, state, records), true);
    state.databases[0].applied[0].sha256 = '0'.repeat(64);
    assert.throws(() => validateAppliedState(root, state, records), /checksum mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('migration deltas are append-only and must allocate above base max', () => {
  const base = [
    'server/migrations/tenant/0001_init.sql',
    'server/migrations/tenant/0110_old.sql',
    'server/migrations/tenant/0111_current.sql',
  ];
  assert.equal(validateChangeSet(base, [{ status: 'A', path: 'server/migrations/tenant/0112_new.sql' }]), true);
  assert.throws(
    () => validateChangeSet(base, [{ status: 'A', path: 'server/migrations/tenant/0110_late.sql' }]),
    /prefix 0110 <= base max 0111/,
  );
  assert.throws(
    () => validateChangeSet(base, [{ status: 'M', path: 'server/migrations/tenant/0001_init.sql' }]),
    /append-only violation/,
  );
  assert.throws(
    () => validateChangeSet(base, [{ status: 'D', path: 'server/migrations/tenant/0001_init.sql' }]),
    /append-only violation/,
  );
});
