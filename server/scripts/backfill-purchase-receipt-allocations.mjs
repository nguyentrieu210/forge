#!/usr/bin/env node
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { planPurchaseAllocationBackfill } from "./purchase-allocation-backfill-planner.mjs";
import {
  findTenantDatabaseId,
  findTenantOrigin,
  removeTenantConfig,
  writeTenantConfig,
} from "./tenant-wrangler.mjs";
import { d1Query, fail, quote, serverRoot, wrangler } from "./wrangler-cli.mjs";

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  const committedAt = new Date().toISOString();
  let cleanup = null;
  try {
    const source = args.input ? readFixture(args.input) : readRemote(args.tenant);
    cleanup = source.cleanup ?? null;
    const plan = planPurchaseAllocationBackfill({
      tenantId: args.tenant,
      documents: source.documents,
      children: source.children,
      progressEntries: source.progressEntries,
      committedAt,
    });
    const report = { mode: modeOf(args), ...plan };
    const output = path.resolve(
      process.cwd(),
      args.output ?? `purchase-allocation-backfill-${safe(args.tenant)}.json`,
    );
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      tenant: args.tenant,
      mode: report.mode,
      checksum: plan.checksum,
      counts: plan.counts,
      report: output,
    }, null, 2));

    if (!args.execute) {
      if (plan.unresolved.length > 0) process.exitCode = 2;
    } else if (!source.database) {
      fail("--execute is unavailable with --input; use a remote tenant database");
    } else if (args.activate) {
      activate(source.database, plan, args);
    } else {
      executeBackfill(source.database, plan, args);
    }
  } finally {
    cleanup?.();
  }
}

function validateArgs(args) {
  if (!args.tenant) {
    fail("usage: node scripts/backfill-purchase-receipt-allocations.mjs --tenant <id> [--input fixture.json] [--output report.json] [--execute --confirm <id>] [--activate --actor <user> --expected-checksum <sha256>]");
  }
  if ((args.execute || args.activate) && args.confirm !== args.tenant) {
    fail(`write mode requires --confirm ${args.tenant}`);
  }
  if (args.activate && (!args.actor || !args.expectedChecksum)) {
    fail("activation requires --actor <user> and --expected-checksum <sha256>");
  }
  if (args.activate && !args.execute) fail("activation requires --execute");
}

function modeOf(args) {
  return args.activate ? "activate" : args.execute ? "execute" : "dry-run";
}

function readFixture(file) {
  const data = JSON.parse(readFileSync(path.resolve(process.cwd(), file), "utf8"));
  return {
    documents: data.documents ?? [],
    children: data.children ?? [],
    progressEntries: data.progress_entries ?? data.progressEntries ?? [],
  };
}

function readRemote(tenant) {
  const databaseId = findTenantDatabaseId(tenant, wrangler);
  if (!databaseId) fail(`D1 database cloudforge-${tenant} was not found`);
  const publicOrigin = findTenantOrigin(tenant, wrangler);
  const { configPath, relativeConfig } = writeTenantConfig({ tenant, databaseId, publicOrigin });
  const database = { name: `cloudforge-${tenant}`, configArg: relativeConfig };
  const tenantSql = quote(tenant);
  return {
    database,
    documents: d1Query(database, `
      SELECT doctype,name,version,created_at,payload_json
      FROM documents
      WHERE tenant_id='${tenantSql}' AND docstatus=1
        AND doctype IN ('Purchase Order','Purchase Receipt')
      ORDER BY doctype,name`),
    children: d1Query(database, `
      SELECT parent_key,row_id,idx,payload_json
      FROM document_children
      WHERE tenant_id='${tenantSql}' AND fieldname='items'
        AND (parent_key LIKE 'Purchase Order:%' OR parent_key LIKE 'Purchase Receipt:%')
      ORDER BY parent_key,idx,row_id`),
    progressEntries: d1Query(database, `
      SELECT voucher_type,voucher_no,voucher_revision,line_key,purchase_order,
             kind,item_code,qty_micros,posting_at
      FROM purchase_order_progress_entries
      WHERE tenant_id='${tenantSql}' AND kind='Receipt' AND qty_micros>0
      ORDER BY posting_at,voucher_no,line_key`),
    cleanup: () => removeTenantConfig(configPath),
  };
}

function executeBackfill(database, plan, args) {
  if (plan.unresolved.length > 0) {
    fail(`backfill has ${plan.unresolved.length} unresolved rows; review the report before any write`);
  }
  const tenant = quote(plan.tenant_id);
  const state = d1Query(database, `
    SELECT enabled FROM purchase_allocation_rollout_state
    WHERE tenant_id='${tenant}'`)[0] ?? null;
  if (Number(state?.enabled ?? 0) === 1) {
    fail("purchase allocation rollout is already enabled; backfill cannot be rewritten");
  }
  const existing = d1Query(database, ledgerCountSql(tenant))[0];
  if (sumLedgerCounts(existing) > 0) {
    fail("allocation ledger is not empty; reconcile existing history instead of overwriting it");
  }

  const sqlFile = path.join(serverRoot, `tmp-purchase-backfill-${safe(plan.tenant_id)}-${Date.now()}.sql`);
  try {
    writeFileSync(sqlFile, renderBackfillSql(plan, args.actor ?? "backfill-operator"), "utf8");
    wrangler([
      "d1", "execute", database.name,
      "--config", database.configArg,
      "--remote", "--file", path.relative(serverRoot, sqlFile),
    ], { capture: false });
  } finally {
    try { unlinkSync(sqlFile); } catch {}
  }

  const verify = d1Query(database, `${ledgerCountSql(tenant).replace(/;\s*$/, "")},
    (SELECT backfill_checksum FROM purchase_allocation_rollout_state WHERE tenant_id='${tenant}') AS checksum,
    (SELECT unresolved_count FROM purchase_allocation_rollout_state WHERE tenant_id='${tenant}') AS unresolved`)[0];
  assertBackfillVerification(verify, plan);
  console.log(`Backfill committed and verified for ${plan.tenant_id}; rollout remains disabled.`);
}

function activate(database, plan, args) {
  if (!/^[a-f0-9]{64}$/.test(args.expectedChecksum)) {
    fail("--expected-checksum must be lowercase SHA-256");
  }
  if (plan.checksum !== args.expectedChecksum) {
    fail(`current dry-run checksum ${plan.checksum} differs from approved ${args.expectedChecksum}`);
  }
  if (plan.unresolved.length > 0) fail("activation is blocked while unresolved rows remain");
  const tenant = quote(plan.tenant_id);
  const actor = quote(args.actor);
  const checksum = quote(args.expectedChecksum);
  d1Query(database, `
    UPDATE purchase_allocation_rollout_state
    SET enabled=1,activated_by='${actor}',activated_at='${quote(new Date().toISOString())}'
    WHERE tenant_id='${tenant}' AND enabled=0
      AND backfill_checksum='${checksum}' AND unresolved_count=0`);
  const state = d1Query(database, `
    SELECT enabled,backfill_checksum,unresolved_count,activated_by,activated_at
    FROM purchase_allocation_rollout_state WHERE tenant_id='${tenant}'`)[0];
  if (Number(state?.enabled) !== 1 || String(state?.backfill_checksum) !== args.expectedChecksum) {
    fail(`activation did not converge: ${JSON.stringify(state)}`);
  }
  console.log(`Purchase allocation rollout activated for ${plan.tenant_id} by ${args.actor}.`);
}

function ledgerCountSql(tenant) {
  return `SELECT
    (SELECT COUNT(*) FROM purchase_obligation_queues WHERE tenant_id='${tenant}') AS queues,
    (SELECT COUNT(*) FROM purchase_settlement_windows WHERE tenant_id='${tenant}') AS windows,
    (SELECT COUNT(*) FROM purchase_window_obligation_entries WHERE tenant_id='${tenant}') AS obligations,
    (SELECT COUNT(*) FROM purchase_receipt_allocation_entries WHERE tenant_id='${tenant}') AS allocations,
    (SELECT COUNT(*) FROM purchase_unapplied_receipt_entries WHERE tenant_id='${tenant}') AS unapplied;`;
}

function sumLedgerCounts(row) {
  return ["queues", "windows", "obligations", "allocations", "unapplied"]
    .reduce((sum, key) => sum + Number(row?.[key] ?? 0), 0);
}

function assertBackfillVerification(row, plan) {
  const expected = plan.counts;
  if (Number(row?.queues) !== expected.queues
    || Number(row?.windows) !== expected.windows
    || Number(row?.obligations) !== expected.obligations
    || Number(row?.allocations) !== expected.allocations
    || Number(row?.unapplied) !== expected.unapplied
    || String(row?.checksum) !== plan.checksum
    || Number(row?.unresolved) !== 0) {
    fail(`backfill verification failed: ${JSON.stringify(row)}`);
  }
}

function renderBackfillSql(plan, actor) {
  const tenant = sql(plan.tenant_id);
  const command = sql(`backfill:${plan.checksum}`);
  const actorSql = sql(actor);
  const statements = ["PRAGMA foreign_keys=ON;"];
  for (const row of plan.queues) statements.push(`INSERT INTO purchase_obligation_queues(
    tenant_id,queue_key,company,supplier,material_match_key,material_schema_version,
    material_snapshot_json,revision,created_at,modified_at)
    VALUES(${tenant},${sql(row.queue_key)},${sql(row.company)},${sql(row.supplier)},
      ${sql(row.material_match_key)},${row.material_schema_version},${sql(JSON.stringify(row.material_snapshot))},
      0,${sql(row.created_at)},${sql(row.modified_at)});`);
  for (const row of plan.windows) statements.push(`INSERT INTO purchase_settlement_windows(
    tenant_id,window_id,queue_key,window_sequence,status,tolerance_bps,revision,opened_at)
    VALUES(${tenant},${sql(row.window_id)},${sql(row.queue_key)},${row.window_sequence},
      'Open',${row.tolerance_bps},0,${sql(row.opened_at)});`);
  for (const row of plan.obligations) statements.push(renderObligation(row, tenant, actorSql, command));
  for (const row of plan.allocations) statements.push(renderAllocation(row, tenant, actorSql, command));
  for (const row of plan.unapplied) statements.push(renderUnapplied(row, tenant, actorSql, command));
  statements.push(`INSERT INTO purchase_allocation_rollout_state(
    tenant_id,enabled,backfill_checksum,unresolved_count,activated_by,activated_at,updated_at)
    VALUES(${tenant},0,${sql(plan.checksum)},0,NULL,NULL,${sql(plan.generated_at)})
    ON CONFLICT(tenant_id) DO UPDATE SET
      backfill_checksum=excluded.backfill_checksum,unresolved_count=0,updated_at=excluded.updated_at;`);
  return `${statements.join("\n")}\n`;
}

function renderObligation(row, tenant, actor, command) {
  return `INSERT INTO purchase_window_obligation_entries(
    tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
    purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,transaction_date,
    purchase_order_created_at,item_idx,committed_at,actor,command_id,source,resolution)
    VALUES(${tenant},${sql(row.entry_id)},${sql(row.queue_key)},${sql(row.window_id)},'Purchase Order',
      ${sql(row.voucher_no)},${row.voucher_revision},${sql(row.line_key)},${sql(row.purchase_order)},
      ${sql(row.purchase_order_item_row_id)},'legacy',${row.qty_micros},${sql(row.transaction_date)},
      ${sql(row.purchase_order_created_at)},${row.item_idx},${sql(row.committed_at)},${actor},${command},
      'legacy','resolved');`;
}

function renderAllocation(row, tenant, actor, command) {
  return `INSERT INTO purchase_receipt_allocation_entries(
    tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
    receipt_item_row_id,purchase_order,purchase_order_item_row_id,entry_kind,qty_micros,
    barem_weight_micros,projected_actual_weight_micros,projection_version,allocation_sequence,
    posting_at,committed_at,actor,reason,command_id,source,resolution,reversal_of_entry_id)
    VALUES(${tenant},${sql(row.entry_id)},${sql(row.queue_key)},${sql(row.window_id)},'Purchase Receipt',
      ${sql(row.voucher_no)},${row.voucher_revision},${sql(row.line_key)},${sql(row.receipt_item_row_id)},
      ${sql(row.purchase_order)},${sql(row.purchase_order_item_row_id)},'legacy',${row.qty_micros},
      ${row.barem_weight_micros},${numberOrNull(row.projected_actual_weight_micros)},
      ${numberOrNull(row.projection_version)},${row.allocation_sequence},${sql(row.posting_at)},
      ${sql(row.committed_at)},${actor},'Legacy backfill',${command},'legacy','resolved',NULL);`;
}

function renderUnapplied(row, tenant, actor, command) {
  return `INSERT INTO purchase_unapplied_receipt_entries(
    tenant_id,entry_id,queue_key,window_id,voucher_type,voucher_no,voucher_revision,line_key,
    receipt_item_row_id,entry_kind,qty_micros,barem_weight_micros,projected_actual_weight_micros,
    projection_version,source_entry_id,allocation_entry_id,posting_at,committed_at,actor,reason,command_id)
    VALUES(${tenant},${sql(row.entry_id)},${sql(row.queue_key)},${sql(row.window_id)},'Purchase Receipt',
      ${sql(row.voucher_no)},${row.voucher_revision},${sql(row.line_key)},${sql(row.receipt_item_row_id)},
      'receive',${row.qty_micros},${row.barem_weight_micros},
      ${numberOrNull(row.projected_actual_weight_micros)},${numberOrNull(row.projection_version)},
      NULL,NULL,${sql(row.posting_at)},${sql(row.committed_at)},${actor},'Legacy backfill',${command});`;
}

function parseArgs(argv) {
  const result = { execute: false, activate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") result.execute = true;
    else if (arg === "--activate") result.activate = true;
    else if (arg === "--tenant") result.tenant = argv[++index];
    else if (arg === "--confirm") result.confirm = argv[++index];
    else if (arg === "--input") result.input = argv[++index];
    else if (arg === "--output") result.output = argv[++index];
    else if (arg === "--actor") result.actor = argv[++index];
    else if (arg === "--expected-checksum") result.expectedChecksum = argv[++index];
    else fail(`unknown argument ${arg}`);
  }
  return result;
}

function sql(value) {
  return `'${quote(value)}'`;
}

function numberOrNull(value) {
  return value === undefined || value === null ? "NULL" : String(value);
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/g, "_");
}
