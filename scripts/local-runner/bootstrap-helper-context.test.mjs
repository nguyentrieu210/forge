import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { validateBootstrapHelperContext } from './assert-bootstrap-helper-context.mjs';

function validLock() {
  return {
    format: 'forge-local-d1-lock/v2',
    adapter: 'bootstrap',
    run_id: 'run-123',
    hostname: os.hostname(),
    pid: process.pid,
    repo_sha: 'abc123',
  };
}

const validEnv = {
  FORGE_CANONICAL_BOOTSTRAP: '1',
  FORGE_CANONICAL_BOOTSTRAP_RUN_ID: 'run-123',
};

test('accepts exact active bootstrap context', () => {
  assert.deepEqual(validateBootstrapHelperContext({ env: validEnv, lock: validLock() }), {
    runId: 'run-123',
    ownerPid: process.pid,
    repoSha: 'abc123',
  });
});

test('rejects direct helper invocation without canonical token', () => {
  assert.throws(() => validateBootstrapHelperContext({ env: {}, lock: validLock() }), /RUN_ID is required/);
});

test('rejects another adapter lock', () => {
  assert.throws(
    () => validateBootstrapHelperContext({ env: validEnv, lock: { ...validLock(), adapter: 'pricing' } }),
    /not bootstrap/,
  );
});

test('rejects mismatched run id', () => {
  assert.throws(
    () => validateBootstrapHelperContext({ env: validEnv, lock: { ...validLock(), run_id: 'other' } }),
    /run-id mismatch/,
  );
});

test('rejects foreign-host lock', () => {
  assert.throws(
    () => validateBootstrapHelperContext({ env: validEnv, lock: { ...validLock(), hostname: 'other-host' } }),
    /host mismatch/,
  );
});
