import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { validateLocalMutationChildContext } from './assert-local-mutation-child-context.mjs';

const rows = [
  { id: 200, parentId: 1 },
  { id: 210, parentId: 200 },
  { id: 220, parentId: 210 },
  { id: 999, parentId: 1 },
];
const lock = {
  format: 'forge-local-d1-lock/v2',
  adapter: 'real-purchase',
  run_id: 'run-1',
  hostname: os.hostname(),
  pid: 200,
};

test('accepts child under an allowed adapter lock owner', () => {
  assert.deepEqual(
    validateLocalMutationChildContext({ lock, allowedAdapters: ['real-purchase'], currentPid: 220, processRows: rows }),
    { adapter: 'real-purchase', runId: 'run-1', ownerPid: 200 },
  );
});

test('rejects the wrong adapter', () => {
  assert.throws(
    () => validateLocalMutationChildContext({ lock, allowedAdapters: ['pricing'], currentPid: 220, processRows: rows }),
    /not allowed/,
  );
});

test('rejects a process outside the lock-owner tree', () => {
  assert.throws(
    () => validateLocalMutationChildContext({ lock, allowedAdapters: ['real-purchase'], currentPid: 999, processRows: rows }),
    /not a descendant/,
  );
});
