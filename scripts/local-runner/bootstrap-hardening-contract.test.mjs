import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const core = read('scripts/local-runner/run-local-import-core.mjs');
const bootstrapWorkflow = read('.github/workflows/bootstrap-alumdoor-local.yml');
const persistenceWorkflow = read('.github/workflows/verify-alumdoor-local-persistence.yml');
const runLocal = read('run-local.bat');
const syncLocal = read('sync-local.bat');

test('bootstrap exception path retains runtime restore and lock release in finally', () => {
  const finallyIndex = core.lastIndexOf('} finally {');
  assert.ok(finallyIndex > 0, 'runner must retain a finally cleanup block');
  const cleanup = core.slice(finallyIndex);
  const restoreIndex = cleanup.indexOf('restoreRuntime(repoRoot, runtimeState)');
  const releaseIndex = cleanup.indexOf('releaseLock(lockPath, runId)');
  assert.ok(restoreIndex >= 0, 'finally must restore runtime state');
  assert.ok(releaseIndex >= 0, 'finally must release the global D1 lock');
  assert.ok(restoreIndex < releaseIndex, 'runtime restore must be attempted before lock release');
  assert.match(cleanup, /RUNTIME_RESTORE=FAILED/);
  assert.match(cleanup, /GLOBAL_D1_LOCK=RELEASE_FAILED/);
});

test('lock and run evidence retain run, SHA, process and declared-service metadata', () => {
  for (const key of [
    "format: 'forge-local-d1-lock/v2'",
    'run_id: runId',
    'adapter,',
    'pid: process.pid',
    'hostname: os.hostname()',
    'repo_sha: repoSha',
  ]) assert.ok(core.includes(key), `lock evidence missing ${key}`);

  for (const key of [
    'expected_sha:',
    'local_sha:',
    'origin_main:',
    'required_services:',
    'github_run_id:',
  ]) assert.ok(core.includes(key), `run.json evidence missing ${key}`);
});

test('backend-only bootstrap is not coupled to port 5173', () => {
  assert.match(bootstrapWorkflow, /FORGE_LOCAL_REQUIRED_SERVICES:\s*backend\b/);
  assert.doesNotMatch(
    bootstrapWorkflow,
    /fetch\(['"]http:\/\/127\.0\.0\.1:5173/,
    'bootstrap acceptance must not hard-code a UI probe',
  );
  assert.match(bootstrapWorkflow, /service-verification\.mjs --services=\$env:FORGE_LOCAL_REQUIRED_SERVICES/);
  assert.match(runLocal, /if \/I "!REQUIRED_SERVICES!"=="backend"[\s\S]*set "QUIESCE_PORTS=8799"/);
  assert.match(runLocal, /frontend khong thuoc required-services contract/);
  assert.match(syncLocal, /if defined BOOTSTRAP \([\s\S]*set "MAINTENANCE_SCOPE=backend"[\s\S]*set "QUIESCE_PORTS=8799"/);
});

test('frontend persistence consumer declares and verifies backend plus frontend explicitly', () => {
  assert.match(persistenceWorkflow, /FORGE_LOCAL_REQUIRED_SERVICES:\s*backend,frontend\b/);
  assert.match(persistenceWorkflow, /service-verification\.mjs --services=\$env:FORGE_LOCAL_REQUIRED_SERVICES/);
});

test('hardening sources contain no executable blind-kill or verify bypass patterns', () => {
  const sources = [core, runLocal, syncLocal, bootstrapWorkflow, persistenceWorkflow];
  const blindKillInvocation = /(?:^|[;&|\r\n])\s*(?:call\s+|&\s*)?taskkill(?:\.exe)?\s+\/(?:f|pid|im)\b/im;
  for (const source of sources) {
    assert.doesNotMatch(source, blindKillInvocation);
    assert.doesNotMatch(source, /\|\|\s*true/);
    assert.doesNotMatch(source, /continue-on-error:\s*true/i);
  }
});
