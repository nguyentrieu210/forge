import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function readJson(file, fail, failureClass, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw fail(failureClass, `${label} is unreadable: ${file}: ${error.message}`, error);
  }
}

function requireFiles(repoRoot, files, fail) {
  const missing = files.filter((relative) => !existsSync(path.join(repoRoot, relative)));
  if (missing.length) {
    throw fail('SOURCE_FILE', `Real Purchase required file(s) missing: ${missing.join(', ')}`);
  }
}

export function assertPurchaseSqlTargets(sqlText, allowedTargets = ['document_search', 'documents']) {
  const allowed = new Set(allowedTargets);
  const targets = new Set();
  const mutation = /^\s*(INSERT\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\s+([A-Za-z_][A-Za-z0-9_]*)/gim;
  let match;
  while ((match = mutation.exec(String(sqlText))) !== null) {
    const verb = match[1].toUpperCase().replace(/\s+/g, ' ');
    const target = match[2];
    if (verb !== 'INSERT INTO') {
      throw new Error(`Real Purchase SQL contains forbidden mutation verb: ${verb} ${target}`);
    }
    if (!allowed.has(target)) {
      throw new Error(`Real Purchase SQL contains forbidden write target: ${target}`);
    }
    targets.add(target);
  }
  const actual = [...targets].sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Real Purchase SQL target mismatch: expected=${expected.join(',')} actual=${actual.join(',')}`);
  }
  return actual;
}

export function preflightRealPurchase({ repoRoot, runDir, exec, env, fail }) {
  requireFiles(repoRoot, [
    'apps/alumdoor/docs/nguon/ms-lien/chi-tiết-nhập-hàng-ngày.md',
    'server/scripts/preflight-alumdoor-real-purchase-import.mjs',
    'server/scripts/audit-alumdoor-real-purchase-local.mjs',
    'server/scripts/ensure-alumdoor-real-purchase-suppliers-local.mjs',
    'server/scripts/import-alumdoor-real-purchase-local.mjs',
    'server/scripts/verify-alumdoor-real-purchase-audit.mjs',
    'server/scripts/backup-alumdoor-uom-local.mjs',
    'server/scripts/build-alumdoor-item-master-payload.mjs',
    'server/scripts/import-alumdoor-item-master-local.mjs',
  ], fail);

  const itemSource = path.join(repoRoot, 'local-imports', 'alumdoor-item-source-records.json');
  if (!existsSync(itemSource)) {
    throw fail('SOURCE_FILE', `Real Purchase Gate A source records missing: ${itemSource}`);
  }

  const server = path.join(repoRoot, 'server');
  const sourcePreflight = path.join(runDir, 'purchase-source-preflight.json');
  exec(
    process.execPath,
    [
      path.join(server, 'scripts', 'preflight-alumdoor-real-purchase-import.mjs'),
      sourcePreflight,
      '--expect-blocked',
    ],
    {
      cwd: server,
      label: 'Real Purchase source preflight',
      failureClass: 'DATA',
    },
  );
  const sourceReport = readJson(sourcePreflight, fail, 'DATA', 'Real Purchase source preflight');
  if (
    Number(sourceReport.source_purchase_row_count) !== 14 ||
    Number(sourceReport.source_exclusions?.row_count) !== 3 ||
    Number(sourceReport.purchase_receipt?.candidate_documents) !== 6
  ) {
    throw fail(
      'DATA',
      `Real Purchase source contract drift: rows=${sourceReport.source_purchase_row_count} excluded=${sourceReport.source_exclusions?.row_count} receipts=${sourceReport.purchase_receipt?.candidate_documents}`,
    );
  }

  const uomPath = path.join(runDir, 'purchase-item-uom-preflight.json');
  exec(process.execPath, [path.join(server, 'scripts', 'backup-alumdoor-uom-local.mjs'), uomPath], {
    cwd: server,
    env,
    label: 'Real Purchase Item UOM prerequisite',
    failureClass: 'DATA',
  });
  const uom = readJson(uomPath, fail, 'DATA', 'Real Purchase UOM report');
  // Chốt luật, không chốt số — xem ghi chú cùng nội dung ở run-local-import-core (preflightItem).
  // Danh mục đơn vị co giãn hợp lệ thì điều kiện này không được đỏ theo.
  const uomCanonical = Number(uom.canonical_count);
  const uomExisting = Number(uom.existing_count);
  const uomMissing = (uom.records ?? []).filter((row) => !row.existed).map((row) => row.name);
  if (!Number.isInteger(uomCanonical) || uomCanonical <= 0 || uomExisting !== uomCanonical || uomMissing.length) {
    throw fail(
      'DATA',
      `Real Purchase blocked: thiếu đơn vị tính chuẩn (canonical=${uomCanonical} existing=${uomExisting}${uomMissing.length ? ` missing=${uomMissing.join(', ')}` : ''})`,
    );
  }

  const itemPayload = path.join(runDir, 'purchase-item-master-payload.json');
  const itemAudit = path.join(runDir, 'purchase-item-master-audit.json');
  exec(
    process.execPath,
    [path.join(server, 'scripts', 'build-alumdoor-item-master-payload.mjs'), itemSource, itemPayload, itemAudit],
    {
      cwd: server,
      label: 'Real Purchase Gate A payload builder',
      failureClass: 'DATA',
    },
  );
  const gateA = readJson(itemAudit, fail, 'DATA', 'Real Purchase Gate A audit');
  for (const key of ['item_master_blocker_count', 'other_blocker_count', 'item_payload_blocker_count']) {
    if (Number(gateA[key]) !== 0) {
      throw fail('DATA', `Real Purchase Gate A blocked: ${key}=${gateA[key]}`);
    }
  }
  exec(
    process.execPath,
    [path.join(server, 'scripts', 'import-alumdoor-item-master-local.mjs'), itemPayload, '--validate-only'],
    {
      cwd: server,
      env,
      label: 'Real Purchase Gate A validate-only',
      failureClass: 'SCHEMA',
    },
  );

  return { itemPayload };
}

function persistedSnapshot(invokeWranglerLocal, outputPath) {
  const query = "SELECT name,docstatus,modified_at,payload_json FROM documents WHERE tenant_id='demo' AND doctype='Purchase Receipt' ORDER BY name";
  const output = invokeWranglerLocal([
    'd1',
    'execute',
    'cloudforge-demo',
    '--local',
    '--config',
    'apps/tenant-worker/wrangler.jsonc',
    '--command',
    query,
    '--json',
  ]);
  writeFileSync(outputPath, output, 'utf8');
}

export function runRealPurchase({
  repoRoot,
  runDir,
  prepared,
  exec,
  env,
  fail,
  invokeWranglerLocal,
  runBackup,
}) {
  const server = path.join(repoRoot, 'server');
  const itemImporter = path.join(server, 'scripts', 'import-alumdoor-item-master-local.mjs');
  const itemPreimage = path.join(runDir, 'purchase-item-preimage.json');
  const itemReplay = path.join(runDir, 'purchase-item-preimage-rerun.json');

  exec(process.execPath, [itemImporter, prepared.itemPayload, itemPreimage], {
    cwd: server,
    env,
    label: 'Real Purchase Gate A reconcile pass 1',
    failureClass: 'IMPORTER',
  });
  const itemReplayOutput = exec(process.execPath, [itemImporter, prepared.itemPayload, itemReplay], {
    cwd: server,
    env,
    capture: true,
    label: 'Real Purchase Gate A reconcile pass 2',
    failureClass: 'IMPORTER',
  });
  if (!/ALUMDOOR_ITEM_LOCAL_IMPORT_PASS created=0\b/.test(itemReplayOutput)) {
    throw fail('VERIFY', 'Real Purchase Gate A idempotency failed: second Item pass did not report created=0');
  }

  const auditScript = path.join(server, 'scripts', 'audit-alumdoor-real-purchase-local.mjs');
  const supplierScript = path.join(server, 'scripts', 'ensure-alumdoor-real-purchase-suppliers-local.mjs');
  const importScript = path.join(server, 'scripts', 'import-alumdoor-real-purchase-local.mjs');
  const verifyScript = path.join(server, 'scripts', 'verify-alumdoor-real-purchase-audit.mjs');
  const auditBefore = path.join(runDir, 'purchase-audit-before-suppliers.json');

  exec(process.execPath, [auditScript, auditBefore], {
    cwd: repoRoot,
    env,
    label: 'Real Purchase authority audit',
    failureClass: 'DATA',
  });
  exec(process.execPath, [supplierScript, auditBefore], {
    cwd: repoRoot,
    env,
    label: 'Real Purchase supplier reconciliation',
    failureClass: 'IMPORTER',
  });
  const supplierReplay = exec(process.execPath, [supplierScript, auditBefore], {
    cwd: repoRoot,
    env,
    capture: true,
    label: 'Real Purchase supplier idempotency',
    failureClass: 'IMPORTER',
  });
  if (!/created=0\b/.test(supplierReplay)) {
    throw fail('VERIFY', 'Real Purchase supplier idempotency failed: replay did not report created=0');
  }

  const auditReady = path.join(runDir, 'purchase-audit-ready.json');
  const sqlFile = path.join(runDir, 'purchase-receipts.sql');
  const expectedFile = path.join(runDir, 'purchase-expected.json');
  exec(process.execPath, [auditScript, auditReady], {
    cwd: repoRoot,
    env,
    label: 'Real Purchase post-supplier audit',
    failureClass: 'DATA',
  });
  exec(process.execPath, [importScript, 'receipts-sql', auditReady, sqlFile, expectedFile], {
    cwd: repoRoot,
    env,
    label: 'Real Purchase historical draft plan',
    failureClass: 'DATA',
  });

  const expected = readJson(expectedFile, fail, 'DATA', 'Real Purchase expected projection');
  if (Number(expected.receipt_count) !== 6 || Number(expected.line_count) !== 11) {
    throw fail('DATA', `Real Purchase expected 6 receipts/11 lines, got ${expected.receipt_count}/${expected.line_count}`);
  }
  try {
    assertPurchaseSqlTargets(readFileSync(sqlFile, 'utf8'));
  } catch (error) {
    throw fail('DATA', error.message, error);
  }
  const ready = readJson(auditReady, fail, 'DATA', 'Real Purchase ready audit');
  const before = (ready.purchase_receipts ?? []).filter(
    (row) => row?.import_marker?.format === 'alumdoor-real-purchase-history/v1',
  ).length;
  if (before < 0 || before > 6) {
    throw fail('DATA', `Real Purchase invalid existing receipt count: ${before}`);
  }
  console.log(`ALUMDOOR_REAL_PURCHASE_PLAN_PASS receipts=6 lines=11 excluded=3 write_targets=document_search,documents before=${before}`);

  invokeWranglerLocal([
    'd1',
    'execute',
    'cloudforge-demo',
    '--local',
    '--config',
    'apps/tenant-worker/wrangler.jsonc',
    `--file=${sqlFile}`,
  ]);

  const auditFirst = path.join(runDir, 'purchase-audit-after-first.json');
  const persistedFirst = path.join(runDir, 'purchase-d1-after-first.json');
  exec(process.execPath, [auditScript, auditFirst], {
    cwd: repoRoot,
    env,
    label: 'Real Purchase first-pass API audit',
    failureClass: 'VERIFY',
  });
  persistedSnapshot(invokeWranglerLocal, persistedFirst);
  exec(
    process.execPath,
    [verifyScript, expectedFile, auditFirst, `--persisted-first=${persistedFirst}`],
    {
      cwd: repoRoot,
      env,
      label: 'Real Purchase first-pass verification',
      failureClass: 'VERIFY',
    },
  );
  const createdFirst = 6 - before;
  console.log(`ALUMDOOR_REAL_PURCHASE_FIRST_PASS_PASS receipts=6 lines=11 created=${createdFirst} docstatus=0`);

  runBackup();
  invokeWranglerLocal([
    'd1',
    'execute',
    'cloudforge-demo',
    '--local',
    '--config',
    'apps/tenant-worker/wrangler.jsonc',
    `--file=${sqlFile}`,
  ]);

  const auditSecond = path.join(runDir, 'purchase-audit-after-second.json');
  const persistedSecond = path.join(runDir, 'purchase-d1-after-second.json');
  exec(process.execPath, [auditScript, auditSecond], {
    cwd: repoRoot,
    env,
    label: 'Real Purchase second-pass API audit',
    failureClass: 'VERIFY',
  });
  persistedSnapshot(invokeWranglerLocal, persistedSecond);
  exec(
    process.execPath,
    [
      verifyScript,
      expectedFile,
      auditFirst,
      auditSecond,
      `--persisted-first=${persistedFirst}`,
      `--persisted-second=${persistedSecond}`,
    ],
    {
      cwd: repoRoot,
      env,
      label: 'Real Purchase second-pass idempotency verification',
      failureClass: 'VERIFY',
    },
  );

  console.log(
    `ALUMDOOR_REAL_PURCHASE_IMPORT_PASS receipts=6 lines=11 excluded=3 created_first=${createdFirst} created_second=0 write_targets=document_search,documents stock_write_targets=0 docstatus=0 submit=forbidden`,
  );
}
