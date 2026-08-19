#!/usr/bin/env node
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const DEFAULT_ROOT = 'C:\\alumdoor';
const DEFAULT_BRANCH = 'agent-live';
const DEFAULT_REMOTE = 'origin';
const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_SERVICE_HOME = 'C:\\ForgeServices\\Alumdoor';
const SELF_PATH = 'scripts/live-sync/forge-live-sync.mjs';
const ALLOWED_COMMAND_APPLY = new Set(['reason-master', 'item-master', 'uom', 'layer0', 'real-purchase', 'pricing', 'bom', 'bom-rule', 'customer', 'manufacturing-master', 'item-code-rename', 'link-repair']);

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
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 500) throw new Error(`--interval must be >= 500ms; got ${options.intervalMs}`);
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
  return { status: result.status, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };
}

function git(root, args, options) {
  return run('git', ['-C', root, ...args], options).stdout;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonOrNull(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
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
  if (!/github\.com[:/]nguyentrieu210\/forge(?:\.git)?$/i.test(origin)) throw new Error(`Unexpected origin for ${root}: ${origin}`);
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) throw new Error(`Node >=22 required; got ${process.version}`);
}

function backupDirty(root, serviceHome, log) {
  const dirty = git(root, ['status', '--porcelain=v1']);
  if (!dirty) return;
  const dir = path.join(serviceHome, 'live-sync-backups');
  ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(dir, `${stamp}-${process.pid}`);
  const patch = run('git', ['-C', root, 'diff', '--binary', '--no-ext-diff'], { allowFailure: true }).stdout;
  writeFileSync(`${base}.status.txt`, `${dirty}\n`, 'utf8');
  writeFileSync(`${base}.patch`, patch ? `${patch}\n` : '', 'utf8');
  log(`LIVE_SYNC_LOCAL_DIRTY_BACKUP base=${base}`);
}

function dependencyFilesChanged(files) {
  return files.some((file) => file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml' || file === 'package.json' || file.endsWith('/package.json'));
}

function ensureDependencies(root, serviceHome, sha, required, log) {
  const marker = path.join(serviceHome, 'live-sync.pending-dependencies.json');
  if (!required && !existsSync(marker)) return false;
  writeJson(marker, { format: 'forge-live-sync-pending-dependencies/v1', sha, requested_at: new Date().toISOString() });
  log('LIVE_SYNC_DEPENDENCIES=START');
  run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--frozen-lockfile'], { cwd: root, capture: false });
  unlinkSync(marker);
  log('LIVE_SYNC_DEPENDENCIES=PASS');
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

function fetchRemoteBranch(root, remote, branch) {
  git(root, ['fetch', '--quiet', '--prune', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`]);
}

function applyRemote(root, remote, branch, serviceHome, log) {
  fetchRemoteBranch(root, remote, branch);
  ensureBranch(root, remote, branch, log, serviceHome);
  const local = git(root, ['rev-parse', 'HEAD']);
  const remoteRef = `${remote}/${branch}`;
  const remoteSha = git(root, ['rev-parse', remoteRef]);
  if (local === remoteSha) {
    const dependenciesRecovered = ensureDependencies(root, serviceHome, local, false, log);
    return { changed: false, from: local, to: remoteSha, files: [], dependenciesRecovered };
  }
  const changedRaw = git(root, ['diff', '--name-only', `${local}..${remoteSha}`]);
  const files = changedRaw ? changedRaw.split(/\r?\n/).filter(Boolean) : [];
  backupDirty(root, serviceHome, log);
  git(root, ['reset', '--hard', remoteRef]);
  const dependenciesInstalled = ensureDependencies(root, serviceHome, remoteSha, dependencyFilesChanged(files), log);
  log(`LIVE_SYNC_APPLIED from=${local} to=${remoteSha} files=${files.length} deps=${dependenciesInstalled ? 1 : 0} watcher_reload=automatic`);
  if (files.length) log(`LIVE_SYNC_FILES ${files.join(' | ')}`);
  return { changed: true, from: local, to: remoteSha, files, dependenciesInstalled };
}

function readCommandRequest(root) {
  const file = path.join(root, '.forge-live-command.json');
  if (!existsSync(file)) return null;
  const request = JSON.parse(readFileSync(file, 'utf8'));
  if (request?.format !== 'forge-live-command/v1') throw new Error(`Unsupported live command format: ${request?.format}`);
  if (typeof request.id !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(request.id)) throw new Error('Invalid live command id');
  if (request.action !== 'apply') throw new Error(`Unsupported live command action: ${request.action}`);
  if (!ALLOWED_COMMAND_APPLY.has(request.adapter)) throw new Error(`Unsupported live apply adapter: ${request.adapter}`);
  return request;
}

function commandAlreadyHandled(serviceHome, request, log) {
  const markerPath = path.join(serviceHome, 'live-command.last-dispatched.json');
  const marker = existsSync(markerPath) ? readJsonOrNull(markerPath) : null;
  if (marker?.command_id !== request.id) return false;

  const statusPath = path.join(serviceHome, 'live-command.status.json');
  const status = existsSync(statusPath) ? readJsonOrNull(statusPath) : null;
  if (status?.command_id === request.id && ['RUNNING', 'PASS', 'FAILED'].includes(status?.status)) return true;

  log(`LIVE_COMMAND_ORPHANED_MARKER id=${request.id} action=redispatch`);
  return false;
}

function dispatchPendingCommand(root, serviceHome, branch, log) {
  const request = readCommandRequest(root);
  if (!request) return null;
  if (commandAlreadyHandled(serviceHome, request, log)) return null;

  const worker = path.join(root, 'scripts', 'live-sync', 'forge-live-command-worker.mjs');
  if (!existsSync(worker)) throw new Error(`Live command worker missing: ${worker}`);

  const markerPath = path.join(serviceHome, 'live-command.last-dispatched.json');
  writeJson(markerPath, {
    format: 'forge-live-command-dispatch/v1',
    command_id: request.id,
    action: request.action,
    adapter: request.adapter,
    dispatched_at: new Date().toISOString(),
    sha: git(root, ['rev-parse', 'HEAD']),
  });

  const child = spawn(process.execPath, [worker], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: root,
    env: { ...process.env, FORGE_LIVE_ROOT: root, FORGE_LIVE_SERVICE_HOME: serviceHome, FORGE_LIVE_BRANCH: branch },
  });
  child.unref();
  log(`LIVE_COMMAND_DISPATCHED id=${request.id} action=${request.action} adapter=${request.adapter} worker_pid=${child.pid}`);
  return request;
}

function acquireProcessLock(serviceHome) {
  ensureDir(serviceHome);
  const file = path.join(serviceHome, 'live-sync.process.lock');
  const payload = { pid: process.pid, host: os.hostname(), started_at: new Date().toISOString() };
  try {
    const fd = openSync(file, 'wx');
    try { writeFileSync(fd, `${JSON.stringify(payload)}\n`, 'utf8'); } finally { closeSync(fd); }
    return file;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = readJsonOrNull(file);
    if (existing?.host === os.hostname() && Number.isInteger(existing?.pid)) {
      try {
        process.kill(existing.pid, 0);
        throw new Error(`Forge live sync is already running pid=${existing.pid}`);
      } catch (probeError) {
        if (probeError?.code !== 'ESRCH') throw probeError;
      }
    }
    unlinkSync(file);
    const fd = openSync(file, 'wx');
    try { writeFileSync(fd, `${JSON.stringify(payload)}\n`, 'utf8'); } finally { closeSync(fd); }
    return file;
  }
}

function releaseProcessLock(file) {
  try { unlinkSync(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function writeStatus(serviceHome, payload) {
  writeJson(path.join(serviceHome, 'live-sync.status.json'), { format: 'forge-live-sync/v2', updated_at: new Date().toISOString(), pid: process.pid, ...payload });
}

function spawnReplacement(options, log) {
  const script = path.join(options.root, SELF_PATH.replaceAll('/', path.sep));
  const child = spawn(process.execPath, [script, `--root=${options.root}`, `--branch=${options.branch}`, `--remote=${options.remote}`, `--interval=${options.intervalMs}`, `--service-home=${options.serviceHome}`], {
    cwd: options.root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  log(`LIVE_SYNC_SELF_RESTART_SPAWNED pid=${child.pid}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = makeLogger(options.serviceHome);
  assertRepo(options.root);
  const processLock = acquireProcessLock(options.serviceHome);
  let stopping = false;
  let restartAfterStop = false;
  let iteration = 0;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log(`LIVE_SYNC_STARTED root=${options.root} remote=${options.remote} branch=${options.branch} interval_ms=${options.intervalMs} mode=${options.once ? 'once' : 'watch'} pid=${process.pid}`);
  try {
    do {
      iteration += 1;
      try {
        const result = applyRemote(options.root, options.remote, options.branch, options.serviceHome, log);
        const current = git(options.root, ['rev-parse', 'HEAD']);
        const request = readCommandRequest(options.root);

        if (!options.once && result.files.includes(SELF_PATH)) {
          restartAfterStop = true;
          stopping = true;
          writeStatus(options.serviceHome, {
            status: 'SELF_RESTART', root: options.root, remote: options.remote, branch: options.branch, sha: current,
            changed: result.changed, changed_files: result.files, iteration, command_request_id: request?.id || null,
          });
          log(`LIVE_SYNC_SELF_UPDATE sha=${current} action=restart`);
          continue;
        }

        const command = dispatchPendingCommand(options.root, options.serviceHome, options.branch, log);
        writeStatus(options.serviceHome, {
          status: command ? 'COMMAND_DISPATCHED' : 'PASS', root: options.root, remote: options.remote, branch: options.branch, sha: current,
          changed: result.changed, changed_files: result.files, iteration,
          command_request_id: request?.id || null, command_id: command?.id || null,
        });
        if (command) stopping = true;
      } catch (error) {
        log(`LIVE_SYNC_RETRY error=${JSON.stringify(error?.message || String(error))}`);
        writeStatus(options.serviceHome, {
          status: 'RETRY', root: options.root, remote: options.remote, branch: options.branch, iteration,
          error: error?.message || String(error),
        });
        if (options.once) throw error;
      }
      if (!options.once && !stopping) await sleep(options.intervalMs);
    } while (!options.once && !stopping);
  } finally {
    releaseProcessLock(processLock);
    log(`LIVE_SYNC_STOPPED code=${process.exitCode || 0} pid=${process.pid}`);
    if (restartAfterStop) spawnReplacement(options, log);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
