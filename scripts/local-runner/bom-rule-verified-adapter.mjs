import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mainBomRule } from './bom-rule-adapter.mjs';
import { ExecutionError, normalizeSpawnInvocation } from './run-local-import-core.mjs';

const DEFAULT_REPO_ROOT = 'C:\\alumdoor';
const fail = (message, cause) => new ExecutionError('VERIFY', message, cause ? { cause } : {});
const packageManagerCommand = () => process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, { cwd, label }) {
  const invocation = normalizeSpawnInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) throw fail(`${label} failed to start: ${result.error.message}`, result.error);
  if (result.status !== 0) throw fail(`${label} failed with exit code ${result.status}`);
}

function pinnedTypeScriptCandidates(root) {
  return [
    path.join(root, 'client', 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
}

function resolvePinnedTypeScript(root) {
  return pinnedTypeScriptCandidates(root).find(existsSync) || '';
}

function ensurePinnedTypeScript(root, pnpm) {
  let tsc = resolvePinnedTypeScript(root);
  if (tsc) return tsc;

  console.log('BOM_RULE_TYPESCRIPT_DEPENDENCY_MISSING action=pnpm_install');
  run(pnpm, ['install', '--frozen-lockfile'], {
    cwd: root,
    label: 'BOM Rule dependency bootstrap',
  });

  tsc = resolvePinnedTypeScript(root);
  if (!tsc) {
    throw fail(`Pinned TypeScript binary still not found after pnpm install; checked: ${pinnedTypeScriptCandidates(root).join(', ')}`);
  }
  console.log(`BOM_RULE_TYPESCRIPT_DEPENDENCY_READY path=${tsc}`);
  return tsc;
}

export function runBomRuleTargetedVerification(root = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || DEFAULT_REPO_ROOT)) {
  const server = path.join(root, 'server');
  const pnpm = packageManagerCommand();
  const tsc = ensurePinnedTypeScript(root, pnpm);
  const viewsTsconfig = path.join(root, 'client', 'packages', 'views', 'tsconfig.json');
  console.log('BOM_RULE_TARGETED_VERIFY_BEGIN');
  run(pnpm, ['run', 'build'], { cwd: server, label: 'BOM Rule server TypeScript build' });
  run(process.execPath, [
    '--test',
    'tests/alumdoor-bom-rule-core.test.mjs',
    'tests/alumdoor-bom-rule-sales-preview.test.mjs',
  ], { cwd: server, label: 'BOM Rule targeted unit tests' });
  run(process.execPath, [tsc, '-b', viewsTsconfig], { cwd: root, label: 'BOM Rule catalog TSX build' });
  console.log('BOM_RULE_TARGETED_VERIFY_PASS server_build=PASS unit_tests=PASS views_build=PASS');
}

export async function mainBomRuleVerified() {
  runBomRuleTargetedVerification();
  return mainBomRule();
}
