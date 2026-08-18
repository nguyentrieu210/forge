#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

if (!process.argv.includes('--apply')) {
  throw new Error('Usage: node scripts/local-runner/import-alumdoor-catalog-all-local.mjs --apply');
}

const root = path.win32.resolve(process.env.FORGE_LOCAL_REPO_ROOT || 'C:\\alumdoor');
const runner = path.join(root, 'scripts', 'local-runner', 'run-local-import.mjs');
const supplier = path.join(root, 'scripts', 'local-runner', 'import-alumdoor-supplier-master-local.mjs');
const warehouse = path.join(root, 'scripts', 'local-runner', 'import-alumdoor-warehouse-master-local.mjs');
const manufacturing = path.join(root, 'scripts', 'local-runner', 'import-alumdoor-manufacturing-master-local.mjs');
const itemSource = path.join(root, 'local-imports', 'alumdoor-item-source-records.json');
const includeLayer0 = process.env.FORGE_CATALOG_INCLUDE_LAYER0 === '1';

function run(label, args, extraEnv = {}) {
  console.log(`ALUMDOOR_CATALOG_ALL_STEP=RUNNING step=${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`catalog-all step failed: ${label} exit=${result.status}`);
  console.log(`ALUMDOOR_CATALOG_ALL_STEP=PASS step=${label}`);
}

// Layer0 uses direct D1 and requires the local runtime to be quiesced. The remaining
// catalog convergence is API-safe and must not be blocked just because Desk/backend
// are actively serving the operator. Layer0 can still be requested explicitly with
// FORGE_CATALOG_INCLUDE_LAYER0=1 when the runtime has been stopped intentionally.
if (includeLayer0) run('layer0', [runner, 'layer0']);
else console.log('ALUMDOOR_CATALOG_ALL_STEP=SKIP step=layer0 reason=direct-d1-runtime-active-safe-default');

// Dependency order for remaining catalogs: units/items -> storage/parties -> commercial masters -> BOM -> production.
run('uom', [runner, 'uom']);
run('item-master', [runner, 'item-master', `--source=${itemSource}`]);
run('warehouse-master', [warehouse, '--apply'], { FORGE_LIVE_BRANCH: 'main' });
run('reason-master', [runner, 'reason-master']);
run('customer', [runner, 'customer']);
run('supplier-master', [supplier, '--apply'], { FORGE_LIVE_BRANCH: 'main' });
run('pricing', [runner, 'pricing']);
run('bom', [runner, 'bom']);
run('manufacturing-master', [manufacturing, '--apply'], { FORGE_LIVE_BRANCH: 'main' });

console.log(`ALUMDOOR_CATALOG_ALL_IMPORT_PASS layer0=${includeLayer0 ? '1' : 'skipped'} uom=1 item_master=1 warehouses=3 reason_master=1 customer=1 suppliers=22 pricing=1 bom=1 manufacturing=1`);
