#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || 'C:\\alumdoor');
const args = process.argv.slice(2);

function run(script) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'local-runner', script), ...args], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('import-alumdoor-production-standard-local.mjs');
run('import-alumdoor-manufacturing-routing-local.mjs');
console.log('ALUMDOOR_MANUFACTURING_MASTER_BUNDLE_PASS production_standards=6');
