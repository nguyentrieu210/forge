#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const DEFAULT_ROOT = 'C:\\alumdoor';
const DEFAULT_BRANCH = 'agent-live';
const DEFAULT_REMOTE = 'origin';
const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_SERVICE_HOME = 'C:\\ForgeServices\\Alumdoor';

function parseArgs(argv) {
  const options = {
    root: process.env.FORGE_LIVE_ROOT || DEFAULT_ROOT,
    branch: process.env.FORGE_LIVE_BRANCH || DEFAULT_BRANCH,
    remote: process.env.FORGE_LIVE_REMOTE || DEFAULT_REMOTE,
    intervalMs: Number(process.env.FORGE_LIVE_INTERVAL_MS || DEFAULT_INTERVAL_MS),
    serviceHome: process.env.FORGE_LIVE_SERVICE_HOME || DEFAULT_SERVICE_HOME,
    once: false,
  };
  for (const arg of argv) {
    if (arg === '--once') options.once = true;
    else if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else if (arg.startsWith('--branch=')) options.branch = arg.slice('--branch='.length);
    else if (arg.startsWith('--remote=')) options.remote = arg.slice('--remote='.length);
    else if (arg.startsWith('--interval=')) options.intervalMs = Number(arg.slice('--interval='.length));
    else if (arg.startsWith('--service-home=')) options.serviceHome = arg.slice('--service-home='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 500) {
    throw new Error(`--interval must be >= 500ms; got ${options.intervalMs}`);
  }
  return options;
}

function run(command, args, { cwd, capture = true, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})${detail ? `: ${detail}` : ''}`);
  }
  return {
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function git(root, args, options) {
  return run('git', ['-C', root, ...args], options).stdout;
}

function nowFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeLogger(serviceHome) {
  ensureDir(serviceHome);
  const logPath = path.join(serviceHome, 'live-sync.log');
  return (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    appendFileSync(logPath, `${line}\n`, 'utf8');
  };
}

function assertRepo(root) {
  if (!existsSync(path.join(root, '.git'))) throw new Error(`${root} is not a Git repository`);
  const origin = git(root, ['remote', 'get-url', 'origin']);
  if (!/github\.com[:/]nguyentrieu210\/forge(?:\.git)?$/i.test(origin)) {
    throw new Error(`Unexpected origin for ${root}: ${origin}`);
  }
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) throw new Error(`Node >=22 required; got ${process.version}`);
}

function backupDirty(root, serviceHome, log) {
  const dirty = git(root, ['status', '--porcelain=v1']);
  if (!dirty) return null;
  const backupDir = path.join(serviceHome, 'live-sync-backups');
  ensureDir(backupDir);
  const stamp = nowFileStamp();
  const patchPath = path.join(backupDir, `${stamp}-${process.pid}.patch`);
  const statusPath = path.join(backupDir, `${stamp}-${process.pid}.status.txt`);
  const patch = run('git', ['-C', root, 'diff', '--binary', '--no-ext-diff'], { allowFailure: true }).stdout;
  writeFileSync(statusPath, `${dirty}\n`, 'utf8');
  writeFileSync(patchPath, patch ? `${patch}\n` : '', 'utf8');
  log(`LIVE_SYNC_LOCAL_DIRTY_BACKUP status=${statusPath} patch=${patchPath}`);
  return { patchPath, statusPath };
}

function dependencyFilesChanged(changedFiles) {
  return changedFiles.some((file) =>
    file === 'pnpm-lock.yaml' ||
    file === 'pnpm-workspace.yaml' ||
    file === 'package.json' ||
    file.endsWith('/package.json'),
  );
}

function pendingDependenciesPath(serviceHome) {
  return path.join(serviceHome, 'live-sync.pending-dependencies.json');
}

function installDependencies(root, log) {
  log('LIVE_SYNC_DEPENDENCIES=START');
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  run(command, ['install', '--frozen-lockfile'], { cwd: root, capture: false });
  log('LIVE_SYNC_DEPENDENCIES=PASS');
}

function ensureDependencies(root, serviceHome, sha, requiredByChange, log) {
  const markerPath = pendingDependenciesPath(serviceHome);
  if (!requiredByChange && !existsSync(markerPath)) return false;
  writeJson(markerPath, {
    format: 'forge-live-sync-pending-dependencies/v1',
    sha,
    requested_at: new Date().toISOString(),
  });
  installDependencies(root, log);
  unlinkSync(markerPath);
  return true;
}

function ensureBranch(root, remote, branch, log, serviceHome) {
  const current = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current === branch) return;
  backupDirty(root, serviceHome, log);
  git(root, ['reset', '--hard']);
  const localExists = run('git', ['-C', root, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true }).status === 0;
  if (localExists) git(root, ['switch', branch]);
  else git(root, ['switch', '-c', branch, '--track', `${remote}/${branch}`]);
  log(`LIVE_SYNC_BRANCH=PASS from=${current} to=${branch}`);
}

function applyRemote(root, remote, branch, serviceHome, log) {
  git(root, ['fetch', '--quiet', remote, branch, '--prune']);
  ensureBranch(root, remote, branch, log, serviceHome);

  const local = git(root, ['rev-parse', 'HEAD']);
  const remoteRef = `${remote}/${branch}`;
  const remoteSha = git(root, ['rev-parse', remoteRef]);
  if (local === remoteSha) {
    const dependenciesRecovered = ensureDependencies(root, serviceHome, local, false, log);
    return { changed: false, local, remote: remoteSha, files: [], dependenciesRecovered };
  }

  const changedRaw = git(root, ['diff', '--name-only', `${local}..${remoteSha}`]);
  const changedFiles = changedRaw ? changedRaw.split(/\r?\n/).filter(Boolean) : [];
  backupDirty(root, serviceHome, log);

  // C:\alumdoor is a runtime mirror in live mode. Remote agent-live is the
  // source authority; tracked local edits are backed up above and never block sync.
  git(root, ['reset', '--hard', remoteRef]);

  const depsChanged = dependencyFilesChanged(changedFiles);
  const dependenciesInstalled = ensureDependencies(root, serviceHome, remoteSha, depsChanged, log);

  log(`LIVE_SYNC_APPLIED from=${local} to=${remoteSha} files=${changedFiles.length} deps=${dependenciesInstalled ? 1 : 0} watcher_reload=automatic`);
  if (changedFiles.length) log(`LIVE_SYNC_FILES ${changedFiles.join(' | ')}`);
  return { changed: true, local, remote: remoteSha, files: changedFiles, dependenciesInstalled };
}

function acquireProcessLock(serviceHome) {
  ensureDir(serviceHome);
  const lockPath = path.join(serviceHome, 'live-sync.process.lock');
  const payload = { pid: process.pid, host: os.hostname(), started_at: new Date().toISOString() };
  try {
    const fd = openSync(lockPath, 'wx');
    try { writeFileSync(fd, `${JSON.stringify(payload)}\n`, 'utf8'); } finally { closeSync(fd); }
    return lockPath;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing = null;
    try { existing = JSON.parse(readFileSync(lockPath, 'utf8')); } catch {}
    if (existing?.host === os.hostname() && Number.isInteger(existing?.pid)) {
      try {
        process.kill(existing.pid, 0);
        throw new Error(`Forge live sync is already running pid=${existing.pid}`);
      } catch (probeError) {
        if (probeError?.code !== 'ESRCH') throw probeError;
      }
    }
    unlinkSync(lockPath);
    const fd = openSync(lockPath, 'wx');
    try { writeFileSync(fd, `${JSON.stringify(payload)}\n`, 'utf8'); } finally { closeSync(fd); }
    return lockPath;
  }
}

function releaseProcessLock(lockPath) {
  try { unlinkSync(lockPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function writeStatus(serviceHome, payload) {
  writeJson(path.join(serviceHome, 'live-sync.status.json'), {
    format: 'forge-live-sync/v1',
    updated_at: new Date().toISOString(),
    ...payload,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = makeLogger(options.serviceHome);
  assertRepo(options.root);
  const processLock = acquireProcessLock(options.serviceHome);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log(`LIVE_SYNC_STARTED root=${options.root} remote=${options.remote} branch=${options.branch} interval_ms=${options.intervalMs} mode=${options.once ? 'once' : 'watch'}`);
  try {
    do {
      try {
        const result = applyRemote(options.root, options.remote, options.branch, options.serviceHome, log);
        const current = git(options.root, ['rev-parse', 'HEAD']);
        writeStatus(options.serviceHome, {
          status: 'PASS',
          root: options.root,
          remote: options.remote,
          branch: options.branch,
          sha: current,
          changed: result.changed,
          changed_files: result.files,
        });
      } catch (error) {
        log(`LIVE_SYNC_RETRY error=${JSON.stringify(error?.message || String(error))}`);
        writeStatus(options.serviceHome, {
          status: 'RETRY',
          root: options.root,
          remote: options.remote,
          branch: options.branch,
          error: error?.message || String(error),
        });
        if (options.once) throw error;
      }
      if (!options.once && !stopping) await sleep(options.intervalMs);
    } while (!options.once && !stopping);
  } finally {
    releaseProcessLock(processLock);
    log(`LIVE_SYNC_STOPPED code=${process.exitCode || 0}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
