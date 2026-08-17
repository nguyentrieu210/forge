#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');
const failures = [];
const inventory = [];

function exists(relative) { return existsSync(path.join(repoRoot, relative)); }
function requireFile(relative) { if (!exists(relative)) failures.push(`missing:${relative}`); }
function requireMatch(relative, pattern, label) {
  if (exists(relative) && !pattern.test(read(relative))) failures.push(`${relative}:${label}`);
}
function rejectMatch(relative, pattern, label) {
  if (exists(relative) && pattern.test(read(relative))) failures.push(`${relative}:${label}`);
}
function walk(dir) {
  const absolute = path.join(repoRoot, dir);
  if (!existsSync(absolute)) return [];
  const out = [];
  for (const entry of readdirSync(absolute)) {
    const relative = path.join(dir, entry).replaceAll('\\', '/');
    const stat = statSync(path.join(repoRoot, relative));
    if (stat.isDirectory()) out.push(...walk(relative));
    else out.push(relative);
  }
  return out;
}

const canonicalWorkflows = [
  '.github/workflows/bootstrap-alumdoor-local.yml',
  '.github/workflows/alumdoor-master-layer0-local-seed.yml',
  '.github/workflows/alumdoor-reason-master-local-import.yml',
  '.github/workflows/import-alumdoor-item-master-local.yml',
  '.github/workflows/reconcile-alumdoor-local-source-uom.yml',
  '.github/workflows/alumdoor-real-purchase-import-policy.yml',
  '.github/workflows/alumdoor-pricing-local-import.yml',
  '.github/workflows/alumdoor-bom-local-import.yml',
];
for (const file of canonicalWorkflows) {
  requireFile(file);
  if (!exists(file)) continue;
  const text = read(file);
  if (!/group:\s*alumdoor-local-d1-mutation/.test(text)) failures.push(`${file}:missing_shared_concurrency`);
  if (!/cancel-in-progress:\s*false/.test(text)) failures.push(`${file}:cancel_in_progress_must_be_false`);
  if (!/scripts\\local-runner\\run-local-import\.mjs/.test(text)) failures.push(`${file}:missing_canonical_entrypoint`);
  inventory.push({ path: file, class: 'MUTATOR', authority: 'CANONICAL_RUNNER' });
}

const workflowFiles = walk('.github/workflows').filter((file) => /\.ya?ml$/i.test(file));
const workflowBypasses = [
  [/\bnpx\s+wrangler\b[\s\S]{0,160}\bd1\s+(?:execute|migrations)\b/i, 'direct_npx_wrangler_d1'],
  [/(?:^|\s)wrangler(?:\.cmd)?\s+d1\s+(?:execute|migrations)\b/i, 'direct_wrangler_d1'],
  [/sync-local\.bat[^\r\n]*--bootstrap/i, 'direct_sync_bootstrap'],
  [/stop-local-dev\.mjs/i, 'direct_stop_local_dev'],
];
for (const file of workflowFiles) {
  const text = read(file);
  for (const [pattern, label] of workflowBypasses) if (pattern.test(text)) failures.push(`${file}:${label}`);
}

for (const file of ['run-local.bat', 'sync-local.bat']) requireFile(file);
requireMatch('run-local.bat', /assert-bootstrap-helper-context\.mjs/, 'missing_bootstrap_lock_ancestry_guard');
requireMatch('run-local.bat', /server\\node_modules\\\.bin\\wrangler\.cmd/i, 'missing_pinned_wrangler');
rejectMatch('run-local.bat', /\bnpx\s+wrangler\b/i, 'npx_wrangler_forbidden');
rejectMatch('run-local.bat', /stop-local-dev\.mjs/i, 'port_kill_helper_forbidden');
requireMatch('sync-local.bat', /assert-bootstrap-helper-context\.mjs/, 'missing_bootstrap_lock_ancestry_guard');
rejectMatch('sync-local.bat', /stop-local-dev\.mjs/i, 'port_kill_helper_forbidden');
rejectMatch('sync-local.bat', /\bwrangler(?:\.cmd)?\s+d1\b/i, 'raw_d1_forbidden');
inventory.push({ path: 'run-local.bat', class: 'INTERNAL_MUTATOR_HELPER', authority: 'BOOTSTRAP_LOCK_ANCESTRY' });
inventory.push({ path: 'sync-local.bat', class: 'SOURCE_SYNC_INTERNAL_BOOTSTRAP', authority: 'BOOTSTRAP_LOCK_ANCESTRY' });
inventory.push({ path: 'server/scripts/stop-local-dev.mjs', class: 'INFRA_NON_D1', authority: 'NOT_CANONICAL_MUTATION' });

const guardedChildren = [
  ['server/scripts/import-alumdoor-reason-master-local.mjs', /assertLocalMutationChildContext\(\[?['"]reason-master['"]\]?\)/, 'reason-master'],
  ['server/scripts/import-alumdoor-item-master-local.mjs', /assertLocalMutationChildContext\(\[['"]item-master['"],\s*['"]real-purchase['"]\]\)/, 'item-master|real-purchase'],
  ['server/scripts/seed-alumdoor-uom-local.mjs', /assertLocalMutationChildContext\(\[['"]uom['"],\s*['"]layer0['"]\]\)/, 'uom|layer0'],
  ['server/scripts/ensure-alumdoor-real-purchase-suppliers-local.mjs', /assertLocalMutationChildContext\(\[['"]real-purchase['"]\]\)/, 'real-purchase'],
  ['server/scripts/import-alumdoor-pricing-local.mjs', /assertLocalMutationChildContext\(\[['"]pricing['"]\]\)/, 'pricing'],
  ['server/scripts/import-alumdoor-canonical-bom-local.mjs', /assertLocalMutationChildContext\(\[['"]bom['"]\]\)/, 'bom'],
];
for (const [file, pattern, adapters] of guardedChildren) {
  requireFile(file);
  requireMatch(file, pattern, 'missing_child_lock_ancestry_guard');
  inventory.push({ path: file, class: 'INTERNAL_CHILD_MUTATOR', authority: adapters });
}
requireMatch('server/scripts/import-alumdoor-item-master-local.mjs', /if \(validateOnly\)[\s\S]*process\.exit\(0\);[\s\S]*assertLocalMutationChildContext/, 'item_validate_only_must_remain_prelock');
requireMatch('server/scripts/import-alumdoor-pricing-local.mjs', /if \(!apply\)[\s\S]*process\.exit\(0\);[\s\S]*assertLocalMutationChildContext/, 'pricing_dry_run_must_remain_prelock');
requireMatch('server/scripts/import-alumdoor-canonical-bom-local.mjs', /if \(validateOnly\)[\s\S]*process\.exit\(0\);[\s\S]*assertLocalMutationChildContext/, 'bom_validate_only_must_remain_prelock');

for (const stale of [
  'server/scripts/import-alumdoor-item-master-local-impl.mjs',
  'server/scripts/import-alumdoor-pricing-local-impl.mjs',
]) if (exists(stale)) failures.push(`${stale}:callable_unguarded_copy_forbidden`);

const candidateScripts = walk('server/scripts')
  .filter((file) => /alumdoor/i.test(file) && /local/i.test(file) && /\.mjs$/i.test(file))
  .filter((file) => !/(?:^|\/)test-|(?:^|\/)backup-|(?:^|\/)audit-|(?:^|\/)verify-|(?:^|\/)preflight-|(?:^|\/)build-|(?:^|\/)export-/i.test(file));
const guardedSet = new Set(guardedChildren.map(([file]) => file));
const generatorAllowlist = new Set([
  'server/scripts/import-alumdoor-real-purchase-local.mjs',
  'server/scripts/seed-alumdoor-material-specifications-local.mjs',
  'server/scripts/seed-alumdoor-measurement-geometry-local.mjs',
]);
for (const file of candidateScripts) {
  const text = read(file);
  const apiMutation = /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(text) && /\/api\/(?:resource|method)\//i.test(text);
  const directD1 = /\b(?:npx\s+)?wrangler(?:\.cmd)?\s+d1\s+(?:execute|migrations)\b/i.test(text);
  if ((apiMutation || directD1) && !guardedSet.has(file) && !generatorAllowlist.has(file)) {
    failures.push(`${file}:unclassified_local_mutator`);
  }
}

const auditSelf = 'scripts/local-runner/audit-local-mutation-entrypoints.mjs';
const remoteToken = '--' + 'remote';
for (const file of walk('scripts/local-runner').filter((file) => /\.mjs$/i.test(file))) {
  if (/\.test\.mjs$/i.test(file)) continue;
  if (file === 'scripts/local-runner/run-local-import-core.mjs' || file === auditSelf) continue;
  if (read(file).includes(remoteToken)) failures.push(`${file}:unexpected_remote_token`);
}

for (const row of inventory) console.log(`LOCAL_MUTATION_INVENTORY class=${row.class} authority=${row.authority} path=${row.path}`);
console.log(`MUTATING_WORKFLOW_INVENTORY=${canonicalWorkflows.length}`);
console.log(`MUTATING_WORKFLOW_MIGRATED=${canonicalWorkflows.length}`);
console.log(`MUTATING_WORKFLOW_BYPASS_COUNT=${failures.length}`);
console.log('CANONICAL_MUTATION_ENTRYPOINT_COUNT=1');
if (failures.length) {
  for (const failure of failures) console.error(`LOCAL_MUTATION_BYPASS ${failure}`);
  process.exit(1);
}
console.log('GLOBAL_LOCAL_MUTATION_INVENTORY_PASS');
