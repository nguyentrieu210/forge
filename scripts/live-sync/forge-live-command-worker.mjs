#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.env.FORGE_LIVE_ROOT || 'C:\\alumdoor';
const SERVICE_HOME = process.env.FORGE_LIVE_SERVICE_HOME || 'C:\\ForgeServices\\Alumdoor';
const LIVE_BRANCH = process.env.FORGE_LIVE_BRANCH || 'agent-live';
const REQUEST_PATH = path.join(ROOT, '.forge-live-command.json');
const STATUS_PATH = path.join(SERVICE_HOME, 'live-command.status.json');
const SYNC_LOCK = path.join(SERVICE_HOME, 'live-sync.process.lock');
const ALLOWED_APPLY = new Set(['reason-master', 'item-master', 'uom', 'layer0', 'real-purchase', 'pricing', 'bom', 'customer']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function writeStatus(payload) {
  writeFileSync(STATUS_PATH, `${JSON.stringify({
    format: 'forge-live-command-status/v1',
    updated_at: new Date().toISOString(),
    ...payload,
  }, null, 2)}\n`, 'utf8');
}

function readRequest() {
  if (!existsSync(REQUEST_PATH)) throw new Error(`Command request missing: ${REQUEST_PATH}`);
  const request = JSON.parse(readFileSync(REQUEST_PATH, 'utf8'));
  if (request?.format !== 'forge-live-command/v1') throw new Error(`Unsupported command format: ${request?.format}`);
  if (typeof request.id !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(request.id)) throw new Error('Invalid command id');
  if (request.action !== 'apply') throw new Error(`Unsupported command action: ${request.action}`);
  if (!ALLOWED_APPLY.has(request.adapter)) throw new Error(`Unsupported apply adapter: ${request.adapter}`);
  return request;
}

async function waitForSyncExit() {
  for (let i = 0; i < 100; i += 1) {
    if (!existsSync(SYNC_LOCK)) return;
    await sleep(100);
  }
  throw new Error(`Live sync process lock did not clear: ${SYNC_LOCK}`);
}

async function ensureSyncRunning() {
  for (let i = 0; i < 20; i += 1) {
    if (existsSync(SYNC_LOCK)) return;
    await sleep(100);
  }
  const syncScript = path.join(ROOT, 'scripts', 'live-sync', 'forge-live-sync.mjs');
  if (!existsSync(syncScript)) return;
  const child = spawn(process.execPath, [syncScript, `--root=${ROOT}`, `--branch=${LIVE_BRANCH}`, '--interval=2000', `--service-home=${SERVICE_HOME}`], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function main() {
  const request = readRequest();
  writeStatus({ status: 'RUNNING', command_id: request.id, action: request.action, adapter: request.adapter });
  await waitForSyncExit();

  const applyScript = path.join(ROOT, 'scripts', 'live-sync', 'forge-live-apply.mjs');
  if (!existsSync(applyScript)) throw new Error(`Apply script missing: ${applyScript}`);

  const result = spawnSync(process.execPath, [applyScript, request.adapter], {
    cwd: ROOT,
    env: {
      ...process.env,
      FORGE_LIVE_ROOT: ROOT,
      FORGE_LIVE_SERVICE_HOME: SERVICE_HOME,
      FORGE_LIVE_BRANCH: LIVE_BRANCH,
      FORGE_LIVE_COMMAND_ID: request.id,
    },
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const logPath = path.join(SERVICE_HOME, `live-command-${request.id.replace(/[^A-Za-z0-9._-]/g, '_')}.log`);
  writeFileSync(logPath, `${stdout}${stderr}`, 'utf8');
  await ensureSyncRunning();

  if (result.error) throw result.error;
  if (result.status !== 0) {
    writeStatus({
      status: 'FAILED',
      command_id: request.id,
      action: request.action,
      adapter: request.adapter,
      exit_code: result.status,
      log_path: logPath,
    });
    process.stderr.write(stderr);
    process.stdout.write(stdout);
    process.exit(result.status || 1);
  }

  writeStatus({
    status: 'PASS',
    command_id: request.id,
    action: request.action,
    adapter: request.adapter,
    exit_code: 0,
    log_path: logPath,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}

main().catch(async (error) => {
  let commandId = null;
  try { commandId = readRequest()?.id || null; } catch {}
  try { await ensureSyncRunning(); } catch {}
  try {
    writeStatus({ status: 'FAILED', command_id: commandId, error: error?.message || String(error) });
  } catch {}
  console.error(error?.stack || error);
  process.exit(1);
});
