#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';

export function validateBootstrapHelperContext({ env, lock, hostname = os.hostname() }) {
  const runId = String(env?.FORGE_CANONICAL_BOOTSTRAP_RUN_ID ?? '').trim();
  if (!runId) throw new Error('FORGE_CANONICAL_BOOTSTRAP_RUN_ID is required');
  if (String(env?.FORGE_CANONICAL_BOOTSTRAP ?? '') !== '1') {
    throw new Error('FORGE_CANONICAL_BOOTSTRAP=1 is required');
  }
  if (!lock || lock.format !== 'forge-local-d1-lock/v2') {
    throw new Error('Canonical bootstrap lock format is missing or invalid');
  }
  if (lock.adapter !== 'bootstrap') {
    throw new Error(`Active local-D1 lock is not bootstrap: adapter=${lock.adapter ?? '<missing>'}`);
  }
  if (String(lock.run_id ?? '') !== runId) {
    throw new Error(`Bootstrap helper run-id mismatch: env=${runId} lock=${lock.run_id ?? '<missing>'}`);
  }
  if (String(lock.hostname ?? '') !== hostname) {
    throw new Error(`Bootstrap helper host mismatch: lock=${lock.hostname ?? '<missing>'} host=${hostname}`);
  }
  if (!Number.isInteger(lock.pid) || lock.pid <= 0) {
    throw new Error('Bootstrap helper lock owner PID is invalid');
  }
  return { runId, ownerPid: lock.pid, repoSha: String(lock.repo_sha ?? '') };
}

export function assertBootstrapHelperContext({ env = process.env, repoRoot } = {}) {
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
  const evidence = validateBootstrapHelperContext({ env, lock });
  console.log(
    `BOOTSTRAP_HELPER_CONTEXT=PASS run_id=${evidence.runId} owner_pid=${evidence.ownerPid} lock=${lockPath}`,
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
