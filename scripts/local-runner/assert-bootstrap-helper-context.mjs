#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';

export function isDescendantProcess(rows, childPid, ancestorPid) {
  const child = Number(childPid);
  const ancestor = Number(ancestorPid);
  if (!Number.isInteger(child) || child <= 0 || !Number.isInteger(ancestor) || ancestor <= 0) return false;
  const index = new Map(
    (Array.isArray(rows) ? rows : [])
      .map((row) => ({ id: Number(row?.ProcessId ?? row?.id), parentId: Number(row?.ParentProcessId ?? row?.parentId) }))
      .filter((row) => Number.isInteger(row.id) && row.id > 0)
      .map((row) => [row.id, row]),
  );
  let cursor = child;
  const seen = new Set();
  while (Number.isInteger(cursor) && cursor > 0 && !seen.has(cursor)) {
    if (cursor === ancestor) return true;
    seen.add(cursor);
    cursor = index.get(cursor)?.parentId;
  }
  return false;
}

export function validateBootstrapHelperContext({ lock, hostname = os.hostname(), currentPid, processRows }) {
  if (!lock || lock.format !== 'forge-local-d1-lock/v2') {
    throw new Error('Canonical bootstrap lock format is missing or invalid');
  }
  if (lock.adapter !== 'bootstrap') {
    throw new Error(`Active local-D1 lock is not bootstrap: adapter=${lock.adapter ?? '<missing>'}`);
  }
  if (String(lock.hostname ?? '') !== hostname) {
    throw new Error(`Bootstrap helper host mismatch: lock=${lock.hostname ?? '<missing>'} host=${hostname}`);
  }
  if (!Number.isInteger(lock.pid) || lock.pid <= 0) {
    throw new Error('Bootstrap helper lock owner PID is invalid');
  }
  if (!isDescendantProcess(processRows, currentPid, lock.pid)) {
    throw new Error(`Bootstrap helper process is not a descendant of lock owner: current=${currentPid} owner=${lock.pid}`);
  }
  return { runId: String(lock.run_id ?? ''), ownerPid: lock.pid, repoSha: String(lock.repo_sha ?? '') };
}

function windowsProcessRows() {
  const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress';
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Cannot inspect bootstrap helper ancestry: ${(result.stderr || result.stdout || '').trim()}`);
  }
  const text = String(result.stdout || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function assertBootstrapHelperContext({ env = process.env, repoRoot } = {}) {
  if (process.platform !== 'win32') {
    throw new Error(`Bootstrap helper context is Windows-only; got ${process.platform}`);
  }
  const root = path.win32.resolve(repoRoot || env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT);
  const lockPath = path.join(root, 'local-locks', 'local-d1-mutation.lock');
  if (!existsSync(lockPath)) {
    throw new Error(`Canonical bootstrap lock is missing: ${lockPath}`);
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    throw new Error(`Canonical bootstrap lock is unreadable: ${lockPath}: ${error.message}`);
  }
  const evidence = validateBootstrapHelperContext({
    lock,
    currentPid: process.pid,
    processRows: windowsProcessRows(),
  });
  console.log(
    `BOOTSTRAP_HELPER_CONTEXT=PASS run_id=${evidence.runId} owner_pid=${evidence.ownerPid} helper_pid=${process.pid} lock=${lockPath}`,
  );
  return evidence;
}

if (process.argv[1]?.endsWith('assert-bootstrap-helper-context.mjs')) {
  try {
    assertBootstrapHelperContext();
  } catch (error) {
    console.error(`BOOTSTRAP_HELPER_CONTEXT=BLOCKED message=${JSON.stringify(error?.message ?? String(error))}`);
    process.exit(1);
  }
}
