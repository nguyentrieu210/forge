#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || 'C:\\alumdoor');
const args = process.argv.slice(2);
const commandId = process.env.FORGE_LIVE_COMMAND_ID || '';

function run(script, scriptArgs = args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'local-runner', script), ...scriptArgs], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (commandId.startsWith('catalog-all-')) {
  run('import-alumdoor-catalog-all-local.mjs', ['--apply'], { FORGE_LIVE_COMMAND_ID: '' });
  console.log(`ALUMDOOR_CATALOG_ALL_LIVE_DISPATCH_PASS command_id=${commandId}`);
  process.exit(0);
}

run('import-alumdoor-production-standard-local.mjs');
run('import-alumdoor-manufacturing-routing-local.mjs');
console.log('ALUMDOOR_MANUFACTURING_MASTER_BUNDLE_PASS production_standards=6');
