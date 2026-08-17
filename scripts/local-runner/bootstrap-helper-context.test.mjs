import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { isDescendantProcess, validateBootstrapHelperContext } from './assert-bootstrap-helper-context.mjs';

const rows = [
  { id: 100, parentId: 1 },
  { id: 110, parentId: 100 },
  { id: 120, parentId: 110 },
  { id: 999, parentId: 1 },
];

function validLock() {
  return {
    format: 'forge-local-d1-lock/v2',
    adapter: 'bootstrap',
    run_id: 'run-123',
    hostname: os.hostname(),
    pid: 100,
    repo_sha: 'abc123',
  };
}

test('detects descendant process ancestry', () => {
  assert.equal(isDescendantProcess(rows, 120, 100), true);
  assert.equal(isDescendantProcess(rows, 999, 100), false);
});

test('accepts helper descended from exact bootstrap lock owner', () => {
  assert.deepEqual(
    validateBootstrapHelperContext({ lock: validLock(), currentPid: 120, processRows: rows }),
    { runId: 'run-123', ownerPid: 100, repoSha: 'abc123' },
  );
});

test('rejects direct helper process outside lock-owner tree', () => {
  assert.throws(
    () => validateBootstrapHelperContext({ lock: validLock(), currentPid: 999, processRows: rows }),
    /not a descendant/,
  );
});

test('rejects another adapter lock', () => {
  assert.throws(
    () => validateBootstrapHelperContext({ lock: { ...validLock(), adapter: 'pricing' }, currentPid: 120, processRows: rows }),
    /not bootstrap/,
  );
});

test('rejects foreign-host lock', () => {
  assert.throws(
    () => validateBootstrapHelperContext({ lock: { ...validLock(), hostname: 'other-host' }, currentPid: 120, processRows: rows }),
    /host mismatch/,
  );
});
