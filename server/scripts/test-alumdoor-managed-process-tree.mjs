import assert from 'node:assert/strict';
import { managedProcessTree, normalizeProcessRows } from './lib/alumdoor-managed-process-tree.mjs';

const rows = [
  { ProcessId: 100, ParentProcessId: 1, Name: 'cmd.exe', CommandLine: 'managed root' },
  { ProcessId: 110, ParentProcessId: 100, Name: 'node.exe', CommandLine: 'pnpm' },
  { ProcessId: 120, ParentProcessId: 110, Name: 'node.exe', CommandLine: 'wrangler' },
  { ProcessId: 130, ParentProcessId: 120, Name: 'workerd.exe', CommandLine: 'workerd' },
  { ProcessId: 999, ParentProcessId: 1, Name: 'node.exe', CommandLine: 'unrelated' },
];

assert.deepEqual(
  normalizeProcessRows(rows).map((row) => row.id),
  [100, 110, 120, 130, 999],
);

const tree = managedProcessTree(rows, 100);
assert.deepEqual(tree.map((row) => row.id), [130, 120, 110, 100]);
assert.deepEqual(tree.map((row) => row.depth), [3, 2, 1, 0]);
assert.equal(tree.some((row) => row.id === 999), false);
assert.deepEqual(managedProcessTree(rows, 0), []);

console.log('ALUMDOOR_MANAGED_PROCESS_TREE_TEST_PASS');
