#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.env.FORGE_LIVE_ROOT || 'C:\\alumdoor';
const SERVICE_HOME = process.env.FORGE_LIVE_SERVICE_HOME || 'C:\\ForgeServices\\Alumdoor';
const LIVE_BRANCH = process.env.FORGE_LIVE_BRANCH || 'agent-live';
const ALLOWED = new Set(['reason-master', 'item-master', 'uom', 'layer0', 'real-purchase', 'pricing', 'bom', 'customer']);

function run(command, args, { cwd, capture = true, allowFailure = false, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  return { status: result.status, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };
}

function git(args, options = {}) {
  return run('git', ['-C', ROOT, ...args], options).stdout;
}

function log(message) {
  mkdirSync(SERVICE_HOME, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(path.join(SERVICE_HOME, 'live-apply.log'), `${line}\n`, 'utf8');
}

function refOrNull(ref) {
  const result = run('git', ['-C', ROOT, 'rev-parse', '--verify', ref], { allowFailure: true });
  return result.status === 0 ? result.stdout : null;
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== 'ESRCH'; }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopLiveSync() {
  const lockPath = path.join(SERVICE_HOME, 'live-sync.process.lock');
  if (!existsSync(lockPath)) return;
  let info = null;
  try { info = JSON.parse(readFileSync(lockPath, 'utf8')); } catch {}
  if (info?.host === os.hostname() && Number.isInteger(info?.pid) && pidAlive(info.pid)) {
    log(`LIVE_APPLY_SYNC_STOP pid=${info.pid}`);
    try { process.kill(info.pid, 'SIGTERM'); } catch {}
    for (let i = 0; i < 30 && pidAlive(info.pid); i += 1) await wait(100);
    if (pidAlive(info.pid)) throw new Error(`Live sync did not stop cleanly pid=${info.pid}`);
  }
  if (existsSync(lockPath)) {
    let stale = true;
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8'));
      stale = !(current?.host === os.hostname() && Number.isInteger(current?.pid) && pidAlive(current.pid));
    } catch {}
    if (stale) unlinkSync(lockPath);
  }
}

function startLiveSync() {
  const syncScript = path.join(ROOT, 'scripts', 'live-sync', 'forge-live-sync.mjs');
  if (!existsSync(syncScript)) throw new Error(`Live sync script missing: ${syncScript}`);
  const child = spawn(process.execPath, [syncScript, `--root=${ROOT}`, `--branch=${LIVE_BRANCH}`, '--interval=2000', `--service-home=${SERVICE_HOME}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  log(`LIVE_APPLY_SYNC_RESTART pid=${child.pid}`);
}

function backupUnexpectedDirty(tag) {
  const dirty = git(['status', '--porcelain=v1']);
  if (!dirty) return;
  const dir = path.join(SERVICE_HOME, 'live-apply-source-backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const patch = run('git', ['-C', ROOT, 'diff', '--binary', '--no-ext-diff'], { allowFailure: true }).stdout;
  const base = path.join(dir, `${stamp}-${tag}`);
  writeFileSync(`${base}.status.txt`, `${dirty}\n`, 'utf8');
  writeFileSync(`${base}.patch`, patch ? `${patch}\n` : '', 'utf8');
  log(`LIVE_APPLY_SOURCE_DRIFT_BACKUP base=${base}`);
}

function makeLocalAuthority(liveSha) {
  const bare = path.join(SERVICE_HOME, 'live-authority.git');
  if (!existsSync(bare)) run('git', ['init', '--bare', bare], { capture: false });
  const sourceUrl = pathToFileURL(path.resolve(ROOT)).href;
  run('git', ['--git-dir', bare, 'fetch', '--force', sourceUrl, `refs/heads/${LIVE_BRANCH}:refs/heads/main`], { capture: false });
  const authoritySha = run('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/main']).stdout;
  if (authoritySha !== liveSha) throw new Error(`Local authority SHA mismatch expected=${liveSha} actual=${authoritySha}`);
  return pathToFileURL(path.resolve(bare)).href;
}

async function main() {
  const adapter = process.argv[2];
  if (!ALLOWED.has(adapter)) {
    throw new Error(`Usage: node scripts/live-sync/forge-live-apply.mjs <${[...ALLOWED].join('|')}>`);
  }
  if (!existsSync(path.join(ROOT, '.git'))) throw new Error(`${ROOT} is not a Git workspace`);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== LIVE_BRANCH) throw new Error(`Live apply requires branch ${LIVE_BRANCH}; found ${branch}`);
  const dirty = git(['status', '--porcelain=v1']);
  if (dirty) throw new Error(`Live apply requires a clean source mirror:\n${dirty}`);

  git(['fetch', 'origin', LIVE_BRANCH, '--prune'], { capture: false });
  const liveSha = git(['rev-parse', 'HEAD']);
  const remoteLive = git(['rev-parse', `origin/${LIVE_BRANCH}`]);
  if (liveSha !== remoteLive) throw new Error(`Live source is not exact origin/${LIVE_BRANCH}: local=${liveSha} remote=${remoteLive}`);

  const savedOriginUrl = git(['remote', 'get-url', 'origin']);
  const savedMain = refOrNull('refs/heads/main');
  const savedOriginMain = refOrNull('refs/remotes/origin/main');
  let switched = false;
  let originRedirected = false;
  let syncStopped = false;
  let applyError = null;

  await stopLiveSync();
  syncStopped = true;
  try {
    const authority = makeLocalAuthority(liveSha);
    git(['branch', '-f', 'main', liveSha], { capture: false });
    git(['switch', 'main'], { capture: false });
    switched = true;
    git(['remote', 'set-url', 'origin', authority], { capture: false });
    originRedirected = true;
    run('git', ['-C', ROOT, 'update-ref', 'refs/remotes/origin/main', liveSha], { capture: false });

    log(`LIVE_APPLY_AUTHORITY=PASS adapter=${adapter} sha=${liveSha} remote=local-bare`);
    const runner = path.join(ROOT, 'scripts', 'local-runner', 'run-local-import.mjs');
    const result = run(process.execPath, [runner, adapter], {
      cwd: ROOT,
      capture: false,
      allowFailure: true,
      env: {
        FORGE_LOCAL_EXPECTED_SHA: liveSha,
        FORGE_LOCAL_REPO_ROOT: ROOT,
      },
    });
    if (result.status !== 0) throw new Error(`Guarded live apply failed adapter=${adapter} exit=${result.status}`);
    log(`LIVE_APPLY_PASS adapter=${adapter} sha=${liveSha}`);
  } catch (error) {
    applyError = error;
    log(`LIVE_APPLY_FAIL adapter=${adapter} error=${JSON.stringify(error?.message || String(error))}`);
  } finally {
    try {
      if (originRedirected) git(['remote', 'set-url', 'origin', savedOriginUrl], { capture: false });
      backupUnexpectedDirty('post-apply');
      if (git(['status', '--porcelain=v1'])) git(['reset', '--hard', liveSha], { capture: false });
      if (switched) git(['switch', LIVE_BRANCH], { capture: false });
      git(['reset', '--hard', liveSha], { capture: false });
      if (savedMain) run('git', ['-C', ROOT, 'update-ref', 'refs/heads/main', savedMain], { capture: false });
      if (savedOriginMain) run('git', ['-C', ROOT, 'update-ref', 'refs/remotes/origin/main', savedOriginMain], { capture: false });
      else run('git', ['-C', ROOT, 'update-ref', '-d', 'refs/remotes/origin/main'], { capture: false, allowFailure: true });
      log(`LIVE_APPLY_SOURCE_RESTORED branch=${LIVE_BRANCH} sha=${liveSha}`);
    } finally {
      if (syncStopped) startLiveSync();
    }
  }
  if (applyError) throw applyError;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
