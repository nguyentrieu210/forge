#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { isDescendantProcess } from './assert-bootstrap-helper-context.mjs';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';

function windowsProcessRows() {
  const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress';
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Cannot inspect local mutation child ancestry: ${(result.stderr || result.stdout || '').trim()}`);
  }
  const text = String(result.stdout || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function validateLocalMutationChildContext({
  lock,
  allowedAdapters,
  hostname = os.hostname(),
  currentPid,
  processRows,
}) {
  const allowed = new Set((Array.isArray(allowedAdapters) ? allowedAdapters : [allowedAdapters]).filter(Boolean));
  if (allowed.size === 0) throw new Error('At least one allowed mutation adapter is required');
  if (!lock || lock.format !== 'forge-local-d1-lock/v2') {
    throw new Error('Canonical local-D1 lock format is missing or invalid');
  }
  if (!allowed.has(lock.adapter)) {
    throw new Error(`Mutation child adapter is not allowed: actual=${lock.adapter ?? '<missing>'} allowed=${[...allowed].join(',')}`);
  }
  if (String(lock.hostname ?? '') !== hostname) {
    throw new Error(`Mutation child host mismatch: lock=${lock.hostname ?? '<missing>'} host=${hostname}`);
  }
  if (!Number.isInteger(lock.pid) || lock.pid <= 0) throw new Error('Mutation child lock owner PID is invalid');
  if (!isDescendantProcess(processRows, currentPid, lock.pid)) {
    throw new Error(`Mutation child process is not a descendant of lock owner: current=${currentPid} owner=${lock.pid}`);
  }
  return { adapter: lock.adapter, runId: String(lock.run_id ?? ''), ownerPid: lock.pid };
}

export function assertLocalMutationChildContext(allowedAdapters, {
  repoRoot = process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT,
} = {}) {
  // Canonical Alumdoor mutation authority is the Windows C:\alumdoor runtime.
  // Linux CI may exercise importer logic against fixtures without owning that runtime.
  if (process.platform !== 'win32') return { skipped: true, platform: process.platform };
  const root = path.win32.resolve(repoRoot);
  const lockPath = path.join(root, 'local-locks', 'local-d1-mutation.lock');
  if (!existsSync(lockPath)) throw new Error(`Canonical local-D1 lock is missing: ${lockPath}`);
  let lock;
  try { lock = JSON.parse(readFileSync(lockPath, 'utf8')); }
  catch (error) { throw new Error(`Canonical local-D1 lock is unreadable: ${lockPath}: ${error.message}`); }
  const evidence = validateLocalMutationChildContext({
    lock,
    allowedAdapters,
    currentPid: process.pid,
    processRows: windowsProcessRows(),
  });
  console.log(
    `LOCAL_MUTATION_CHILD_CONTEXT=PASS adapter=${evidence.adapter} run_id=${evidence.runId} owner_pid=${evidence.ownerPid} child_pid=${process.pid}`,
  );
  return evidence;
}

if (process.argv[1]?.endsWith('assert-local-mutation-child-context.mjs')) {
  const allowArg = process.argv.find((arg) => arg.startsWith('--allow='));
  const allowed = String(allowArg?.slice('--allow='.length) || '').split(',').map((value) => value.trim()).filter(Boolean);
  try { assertLocalMutationChildContext(allowed); }
  catch (error) {
    console.error(`LOCAL_MUTATION_CHILD_CONTEXT=BLOCKED message=${JSON.stringify(error?.message ?? String(error))}`);
    process.exit(1);
  }
}
