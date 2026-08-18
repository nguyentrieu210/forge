#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

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
    format: 'forge-live-command-status/v2',
    updated_at: new Date().toISOString(),
    ...payload,
  }, null, 2)}\n`, 'utf8');
}

function validateRequest(request) {
  if (request?.format !== 'forge-live-command/v1') throw new Error(`Unsupported command format: ${request?.format}`);
  if (typeof request.id !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(request.id)) throw new Error('Invalid command id');
  if (request.action !== 'apply') throw new Error(`Unsupported command action: ${request.action}`);
  if (!ALLOWED_APPLY.has(request.adapter)) throw new Error(`Unsupported apply adapter: ${request.adapter}`);
  return request;
}

function readRequest() {
  if (!existsSync(REQUEST_PATH)) throw new Error(`Command request missing: ${REQUEST_PATH}`);
  return validateRequest(JSON.parse(readFileSync(REQUEST_PATH, 'utf8')));
}

function parseVisibleRequest() {
  const idArg = process.argv.find((arg) => arg.startsWith('--command-id='));
  const adapterArg = process.argv.find((arg) => arg.startsWith('--adapter='));
  if (!idArg || !adapterArg) return null;
  return validateRequest({
    format: 'forge-live-command/v1',
    id: idArg.slice('--command-id='.length),
    action: 'apply',
    adapter: adapterArg.slice('--adapter='.length),
  });
}

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function launchVisible(request) {
  const worker = path.resolve(process.argv[1]);
  const title = `Forge Live - ${request.adapter}`;
  const command = [
    'start',
    quoteCmd(title),
    quoteCmd(process.execPath),
    quoteCmd(worker),
    '--visible',
    `--command-id=${request.id}`,
    `--adapter=${request.adapter}`,
  ].join(' ');

  writeStatus({
    status: 'LAUNCHING_VISIBLE',
    command_id: request.id,
    action: request.action,
    adapter: request.adapter,
  });

  const launcher = spawn('cmd.exe', ['/d', '/s', '/c', command], {
    cwd: ROOT,
    detached: true,
    windowsHide: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      FORGE_LIVE_ROOT: ROOT,
      FORGE_LIVE_SERVICE_HOME: SERVICE_HOME,
      FORGE_LIVE_BRANCH: LIVE_BRANCH,
    },
  });
  launcher.unref();
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

async function runVisible(request) {
  const applyScript = path.join(ROOT, 'scripts', 'live-sync', 'forge-live-apply.mjs');
  if (!existsSync(applyScript)) throw new Error(`Apply script missing: ${applyScript}`);

  const safeId = request.id.replace(/[^A-Za-z0-9._-]/g, '_');
  const logPath = path.join(SERVICE_HOME, `live-command-${safeId}.log`);
  writeFileSync(logPath, '', 'utf8');
  writeStatus({
    status: 'RUNNING',
    command_id: request.id,
    action: request.action,
    adapter: request.adapter,
    log_path: logPath,
    visible_console: true,
  });

  process.stdout.write(`FORGE_LIVE_COMMAND=${request.id}\r\n`);
  process.stdout.write(`ADAPTER=${request.adapter}\r\n`);
  process.stdout.write(`LOG=${logPath}\r\n\r\n`);

  const child = spawn(process.execPath, [applyScript, request.adapter], {
    cwd: ROOT,
    env: {
      ...process.env,
      FORGE_LIVE_ROOT: ROOT,
      FORGE_LIVE_SERVICE_HOME: SERVICE_HOME,
      FORGE_LIVE_BRANCH: LIVE_BRANCH,
      FORGE_LIVE_COMMAND_ID: request.id,
    },
    windowsHide: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const tee = (target, chunk) => {
    target.write(chunk);
    appendFileSync(logPath, chunk);
  };
  child.stdout.on('data', (chunk) => tee(process.stdout, chunk));
  child.stderr.on('data', (chunk) => tee(process.stderr, chunk));

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });

  await ensureSyncRunning();

  if (exitCode !== 0) {
    writeStatus({
      status: 'FAILED',
      command_id: request.id,
      action: request.action,
      adapter: request.adapter,
      exit_code: exitCode,
      log_path: logPath,
      visible_console: true,
    });
    process.stderr.write(`\r\nFORGE_LIVE_COMMAND_FAILED exit=${exitCode}\r\n`);
    process.exitCode = exitCode;
    return;
  }

  writeStatus({
    status: 'PASS',
    command_id: request.id,
    action: request.action,
    adapter: request.adapter,
    exit_code: 0,
    log_path: logPath,
    visible_console: true,
  });
  process.stdout.write('\r\nFORGE_LIVE_COMMAND_PASS\r\n');
}

async function main() {
  if (!process.argv.includes('--visible')) {
    launchVisible(readRequest());
    return;
  }
  const request = parseVisibleRequest();
  if (!request) throw new Error('Visible worker request arguments are missing');
  await runVisible(request);
}

main().catch(async (error) => {
  let request = null;
  try { request = parseVisibleRequest() || readRequest(); } catch {}
  try { await ensureSyncRunning(); } catch {}
  try {
    writeStatus({
      status: 'FAILED',
      command_id: request?.id || null,
      action: request?.action || null,
      adapter: request?.adapter || null,
      error: error?.message || String(error),
      visible_console: process.argv.includes('--visible'),
    });
  } catch {}
  console.error(error?.stack || error);
  process.exit(1);
});
