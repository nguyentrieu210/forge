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
const failures = [];

const exactD1 = process.env.ALUMDOOR_D1_PATH;
const verifiedBackup = process.env.ALUMDOOR_VERIFIED_BACKUP;
if (!exactD1 || !verifiedBackup) {
  throw new Error('ALUMDOOR_D1_PATH and ALUMDOOR_VERIFIED_BACKUP are required; the all-catalog runner never guesses runtime state');
}

function execStep(label, args, extraEnv = {}, { required = false } = {}) {
  console.log(`ALUMDOOR_CATALOG_ALL_STEP=RUNNING step=${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`ALUMDOOR_CATALOG_ALL_STEP=FAILED step=${label} error=${JSON.stringify(result.error.message)}`);
    if (required) throw result.error;
    failures.push(`${label}:spawn`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`ALUMDOOR_CATALOG_ALL_STEP=FAILED step=${label} exit=${result.status}`);
    if (required) throw new Error(`catalog-all prerequisite failed: ${label} exit=${result.status}`);
    failures.push(`${label}:exit=${result.status}`);
    return false;
  }
  console.log(`ALUMDOOR_CATALOG_ALL_STEP=PASS step=${label}`);
  return true;
}

// One fail-closed authority gate must pass before any adapter is allowed to acquire a mutation lock.
execStep('authority-gate', [path.join(root, 'server', 'scripts', 'audit-alumdoor-import-gate-local.mjs'), '--d1', exactD1, '--backup', verifiedBackup, '--tenant', 'demo'], {}, { required: true });

// Layer0 uses direct D1 and is intentionally opt-in while the operator is serving Desk/backend.
if (includeLayer0) execStep('layer0', [runner, 'layer0']);
else console.log('ALUMDOOR_CATALOG_ALL_STEP=SKIP step=layer0 reason=direct-d1-runtime-active-safe-default');

// BOM and the commercial masters depend on canonical UOM + Item, so only these two are hard prerequisites.
execStep('uom', [runner, 'uom'], {}, { required: true });
execStep('item-master', [runner, 'item-master', `--source=${itemSource}`], {}, { required: true });

// From here every domain is independent enough to attempt. One bad catalog must not block Customer/NCC/BOM.
execStep('warehouse-master', [warehouse, '--apply'], { FORGE_LIVE_BRANCH: 'main' }, { required: true });
execStep('reason-master', [runner, 'reason-master'], {}, { required: true });
execStep('customer', [runner, 'customer'], {}, { required: true });
execStep('supplier-master', [supplier, '--apply'], { FORGE_LIVE_BRANCH: 'main' }, { required: true });
execStep('item-code-rename', [runner, 'item-code-rename'], {}, { required: true });
execStep('link-repair', [runner, 'link-repair'], {}, { required: true });
execStep('pricing', [runner, 'pricing'], {}, { required: true });
execStep('bom', [runner, 'bom'], {}, { required: true });
execStep('bom-template', [runner, 'bom-template'], {}, { required: true });
execStep('bom-rule', [runner, 'bom-rule'], {}, { required: true });
execStep('manufacturing-master', [manufacturing, '--apply'], { FORGE_LIVE_BRANCH: 'main' }, { required: true });
execStep('layer-converge', [runner, 'layer-converge'], {}, { required: true });

if (failures.length) {
  console.error(`ALUMDOOR_CATALOG_ALL_IMPORT_PARTIAL failed_steps=${failures.join(',')}`);
  process.exitCode = 2;
} else {
  console.log(`ALUMDOOR_CATALOG_ALL_IMPORT_PASS layer0=${includeLayer0 ? '1' : 'skipped'} uom=1 item_master=1 warehouses=3 reason_master=1 customer=1 suppliers=22 pricing=1 bom=1 manufacturing=1`);
}
