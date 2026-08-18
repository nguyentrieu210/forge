#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const repoRoot = resolve(serverRoot, '..');
const sourcePath = join(repoRoot, 'apps', 'alumdoor', 'data', 'production-routing.json');
const sqlPath = join(serverRoot, 'imports', 'alumdoor-production-routing-local.sql');
const reportPath = join(serverRoot, 'reports', 'alumdoor-production-routing-audit.json');
const configPath = join(serverRoot, 'apps', 'tenant-worker', 'wrangler.alumdoor-local.jsonc');
const database = process.env.ALUMDOOR_ROUTING_DATABASE || 'cloudforge-demo';
const tenant = process.env.ALUMDOOR_ROUTING_TENANT || 'alu';
const now = '2026-08-18T05:00:00.000Z';

if (process.argv.some((arg) => arg === '--remote' || arg.startsWith('--remote='))) {
  throw new Error('REMOTE_MUTATION_GUARD: --remote is forbidden; this importer is local-only');
}

const command = process.argv[2] || 'validate';
const allowed = new Set(['validate', 'build', 'import-local', 'query-local', 'verify-local', 'replay-local', 'selftest']);
if (!allowed.has(command)) throw new Error(`Usage: node server/scripts/alumdoor-routing-local.mjs <${[...allowed].join('|')}>`);

const data = JSON.parse(readFileSync(sourcePath, 'utf8'));
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const jq = (value) => q(JSON.stringify(value));
const managedOperationSql = () => data.operations.map((x) => q(x.code)).join(',');
const managedWorkstationSql = () => data.workstations.map((x) => q(x.name)).join(',');
const managedRoutingSql = () => data.routings.map((x) => q(x.routing_code)).join(',');
const costRulesOf = (routing) => Array.isArray(routing.cost_rules) ? routing.cost_rules : [];
const allCostRules = () => data.routings.flatMap((routing) => costRulesOf(routing).map((rule) => ({ routing, rule })));

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`DUPLICATE_${label}: ${value}`);
    seen.add(value);
  }
}

function validate() {
  if (data.authority_policy !== 'repo_source_only_no_invention') throw new Error('AUTHORITY_POLICY_INVALID');
  if (!Array.isArray(data.source_audit) || data.source_audit.length === 0) throw new Error('SOURCE_AUDIT_REQUIRED');
  assertUnique(data.source_audit.map((x) => x.path), 'SOURCE_PATH');
  assertUnique(data.operations.map((x) => x.code), 'OPERATION');
  assertUnique(data.routings.map((x) => x.routing_code), 'ROUTING');
  assertUnique(data.workstations.map((x) => x.name), 'WORKSTATION');

  const operations = new Set(data.operations.map((x) => x.code));
  const workstations = new Set(data.workstations.map((x) => x.name));

  for (const op of data.operations) {
    if (!op.code?.startsWith('OP-') || !op.name_vi || !op.description || !op.operation_type || !op.time_uom || !op.source_reference) {
      throw new Error(`OPERATION_REQUIRED_FIELD: ${op.code || '<unknown>'}`);
    }
    if (op.needs_time_definition && op.default_time != null) throw new Error(`OPERATION_FAKE_TIME_GUARD: ${op.code}`);
    if (!op.needs_time_definition && op.default_time == null) throw new Error(`OPERATION_TIME_MISSING: ${op.code}`);
    if (op.needs_workstation && op.workstation != null) throw new Error(`OPERATION_FAKE_WORKSTATION_GUARD: ${op.code}`);
    if (!op.needs_workstation && (!op.workstation || !workstations.has(op.workstation))) {
      throw new Error(`OPERATION_WORKSTATION_INVALID: ${op.code}`);
    }
  }

  for (const routing of data.routings) {
    if (!routing.routing_code?.startsWith('RT-') || !routing.routing_name || !routing.source_reference || !Array.isArray(routing.operations) || routing.operations.length === 0) {
      throw new Error(`ROUTING_REQUIRED_FIELD: ${routing.routing_code || '<unknown>'}`);
    }
    if (!['internal', 'subcontract'].includes(routing.execution_mode)) throw new Error(`ROUTING_EXECUTION_MODE_INVALID: ${routing.routing_code}`);
    if (routing.execution_mode === 'subcontract' && !routing.source_supplier) throw new Error(`ROUTING_SUBCONTRACT_SUPPLIER_REQUIRED: ${routing.routing_code}`);
    if (routing.needs_time_definition && routing.standard_time_value != null) throw new Error(`ROUTING_FAKE_TIME_GUARD: ${routing.routing_code}`);
    if (!routing.needs_time_definition && routing.standard_time_value == null) throw new Error(`ROUTING_TIME_MISSING: ${routing.routing_code}`);
    if (routing.needs_item_mapping && (routing.item_code || routing.item_group)) throw new Error(`ROUTING_FAKE_MAPPING_GUARD: ${routing.routing_code}`);
    if (routing.needs_bom_mapping && routing.bom_no) throw new Error(`ROUTING_FAKE_BOM_MAPPING_GUARD: ${routing.routing_code}`);

    const sequences = routing.operations.map((row) => Number(row.sequence));
    assertUnique(sequences, `SEQUENCE_${routing.routing_code}`);
    if (sequences.some((value) => !Number.isInteger(value) || value <= 0)) throw new Error(`ROUTING_SEQUENCE_INVALID: ${routing.routing_code}`);
    if (sequences.some((value, index) => index > 0 && value <= sequences[index - 1])) throw new Error(`ROUTING_SEQUENCE_ORDER_INVALID: ${routing.routing_code}`);

    for (const row of routing.operations) {
      if (!operations.has(row.operation)) throw new Error(`ROUTING_OPERATION_REF_INVALID: ${routing.routing_code}:${row.operation}`);
      if (!['internal', 'subcontract'].includes(row.execution_mode)) throw new Error(`ROUTING_ROW_EXECUTION_MODE_INVALID: ${routing.routing_code}:${row.sequence}`);
      if (row.execution_mode !== routing.execution_mode) throw new Error(`ROUTING_ROW_EXECUTION_MODE_MISMATCH: ${routing.routing_code}:${row.sequence}`);
      if (row.execution_mode === 'subcontract' && !row.source_supplier) throw new Error(`ROUTING_ROW_SUBCONTRACT_SUPPLIER_REQUIRED: ${routing.routing_code}:${row.sequence}`);
      if (row.needs_time_definition && row.run_time != null) throw new Error(`ROUTING_FAKE_TIME_GUARD: ${routing.routing_code}:${row.sequence}`);
      if (row.needs_workstation && row.workstation != null) throw new Error(`ROUTING_FAKE_WORKSTATION_GUARD: ${routing.routing_code}:${row.sequence}`);
      if (!row.needs_workstation && row.workstation && !workstations.has(row.workstation)) {
        throw new Error(`ROUTING_WORKSTATION_REF_INVALID: ${routing.routing_code}:${row.workstation}`);
      }
      if (row.execution_mode === 'subcontract' && row.workstation != null) throw new Error(`ROUTING_SUBCONTRACT_WORKSTATION_FORBIDDEN: ${routing.routing_code}:${row.sequence}`);
    }

    const costRules = costRulesOf(routing);
    const costSequences = costRules.map((rule) => Number(rule.sequence));
    assertUnique(costSequences, `COST_SEQUENCE_${routing.routing_code}`);
    if (costSequences.some((value) => !Number.isInteger(value) || value <= 0)) throw new Error(`ROUTING_COST_SEQUENCE_INVALID: ${routing.routing_code}`);
    if (costSequences.some((value, index) => index > 0 && value <= costSequences[index - 1])) throw new Error(`ROUTING_COST_SEQUENCE_ORDER_INVALID: ${routing.routing_code}`);
    for (const rule of costRules) {
      if (!operations.has(rule.operation)) throw new Error(`ROUTING_COST_OPERATION_REF_INVALID: ${routing.routing_code}:${rule.sequence}`);
      if (!['internal', 'subcontract'].includes(rule.execution_mode)) throw new Error(`ROUTING_COST_EXECUTION_MODE_INVALID: ${routing.routing_code}:${rule.sequence}`);
      if (rule.execution_mode === 'subcontract' && !rule.source_supplier) throw new Error(`ROUTING_COST_SUPPLIER_REQUIRED: ${routing.routing_code}:${rule.sequence}`);
      if (!rule.scope_value || !rule.calculation_formula || !rule.source_reference) throw new Error(`ROUTING_COST_REQUIRED_FIELD: ${routing.routing_code}:${rule.sequence}`);
      if (rule.needs_rate_definition && rule.rate_value != null) throw new Error(`ROUTING_FAKE_COST_RATE_GUARD: ${routing.routing_code}:${rule.sequence}`);
      if (!rule.needs_rate_definition && rule.rate_value == null) throw new Error(`ROUTING_COST_RATE_MISSING: ${routing.routing_code}:${rule.sequence}`);
      if (rule.rate_value != null && (!Number.isFinite(Number(rule.rate_value)) || Number(rule.rate_value) < 0)) throw new Error(`ROUTING_COST_RATE_INVALID: ${routing.routing_code}:${rule.sequence}`);
    }
  }
}

function routingComplete(routing) {
  return !routing.needs_time_definition
    && !routing.needs_workstation
    && !routing.needs_item_mapping
    && !routing.needs_bom_mapping
    && costRulesOf(routing).every((rule) => !rule.needs_rate_definition && !rule.needs_item_mapping);
}

function audit() {
  const missingRows = [];
  for (const op of data.operations) {
    if (op.needs_time_definition) missingRows.push({
      routing: 'OPERATION_MASTER', operation: op.code, 'item/group': null, missing_field: 'standard_time',
      source_reference: op.source_reference, reason: 'Source establishes the operation but not its standard time.',
      recommended_next_input: `Provide approved standard time and basis for ${op.name_vi}.`,
    });
    if (op.needs_workstation) missingRows.push({
      routing: 'OPERATION_MASTER', operation: op.code, 'item/group': null, missing_field: 'workstation',
      source_reference: op.source_reference, reason: 'Source does not identify the actual workstation/machine.',
      recommended_next_input: `Provide actual workstation/machine for ${op.name_vi}.`,
    });
  }
  for (const routing of data.routings) {
    if (routing.needs_time_definition) missingRows.push({
      routing: routing.routing_code, operation: null, 'item/group': routing.item_group ?? routing.source_identity ?? null,
      missing_field: 'standard_time', source_reference: routing.source_reference,
      reason: 'Routing is evidenced but its standard/lead time is absent.',
      recommended_next_input: `Provide standard or lead time and basis for ${routing.routing_name}.`,
    });
    if (routing.needs_workstation) missingRows.push({
      routing: routing.routing_code, operation: null, 'item/group': routing.item_group ?? routing.source_identity ?? null,
      missing_field: 'workstation', source_reference: routing.source_reference,
      reason: 'Routing has no source-backed workstation assignment.',
      recommended_next_input: `Provide actual workstation assignment for ${routing.routing_name}.`,
    });
    if (routing.needs_item_mapping) missingRows.push({
      routing: routing.routing_code, operation: null, 'item/group': routing.item_group ?? routing.source_identity ?? null,
      missing_field: 'item_mapping', source_reference: routing.source_reference,
      reason: 'Source does not prove a specific Item/Item Group mapping.',
      recommended_next_input: `Provide exact Item/Item Group scope or routing condition for ${routing.routing_name}.`,
    });
    if (routing.needs_bom_mapping) missingRows.push({
      routing: routing.routing_code, operation: null, 'item/group': routing.item_group ?? routing.source_identity ?? null,
      missing_field: 'bom_mapping', source_reference: routing.source_reference,
      reason: 'Routing is grounded by Item Group/source identity but the canonical BOM is not final enough to link safely.',
      recommended_next_input: `Link the final canonical Bill of Materials to ${routing.routing_name} after BOM convergence.`,
    });
    for (const rule of costRulesOf(routing)) {
      if (rule.needs_rate_definition) missingRows.push({
        routing: routing.routing_code, operation: rule.operation, 'item/group': rule.scope_value,
        missing_field: 'operation_cost_rate', source_reference: rule.source_reference,
        reason: 'Source provides the calculation formula but leaves the operation rate blank.',
        recommended_next_input: `Provide the source rate for ${routing.source_supplier || routing.routing_name} / ${rule.scope_value}.`,
      });
      if (rule.needs_item_mapping) missingRows.push({
        routing: routing.routing_code, operation: rule.operation, 'item/group': rule.scope_value,
        missing_field: 'operation_cost_item_mapping', source_reference: rule.source_reference,
        reason: 'Source cost scope is a paint-type label, not a proven canonical Item/Item Group mapping.',
        recommended_next_input: `Map source paint type ${rule.scope_value} to canonical Item/Item Group or an explicit runtime condition.`,
      });
    }
  }

  const unresolved = data.unresolved_source_rows.map((row) => ({
    routing: row.routing,
    operation: row.operation,
    'item/group': row.item_group,
    missing_field: row.missing_field,
    source_reference: row.source_reference,
    reason: row.reason,
    recommended_next_input: row.recommended_next_input,
  }));
  const costRules = allCostRules();

  return {
    format: 'alumdoor-production-routing-audit/v3',
    authority_policy: data.authority_policy,
    counters: {
      OPERATIONS_TOTAL: data.operations.length,
      OPERATIONS_COMPLETE: data.operations.filter((x) => !x.needs_time_definition && !x.needs_workstation).length,
      OPERATIONS_NEED_DATA: data.operations.filter((x) => x.needs_time_definition || x.needs_workstation).length,
      ROUTINGS_TOTAL: data.routings.length,
      ROUTINGS_COMPLETE: data.routings.filter(routingComplete).length,
      ROUTINGS_NEED_DATA: data.routings.filter((x) => !routingComplete(x)).length,
      MISSING_STANDARD_TIME: data.operations.filter((x) => x.needs_time_definition).length + data.routings.filter((x) => x.needs_time_definition).length,
      MISSING_WORKSTATION: data.operations.filter((x) => x.needs_workstation).length + data.routings.filter((x) => x.needs_workstation).length,
      MISSING_ITEM_MAPPING: data.routings.filter((x) => x.needs_item_mapping).length,
      MISSING_BOM_MAPPING: data.routings.filter((x) => x.needs_bom_mapping).length,
      UNRESOLVED_SOURCE_ROWS: unresolved.length,
      OPERATION_COST_RULES_TOTAL: costRules.length,
      OPERATION_COST_RULES_NEED_RATE: costRules.filter(({ rule }) => rule.needs_rate_definition).length,
      OPERATION_COST_RULES_NEED_ITEM_MAPPING: costRules.filter(({ rule }) => rule.needs_item_mapping).length,
    },
    complete_routings: data.routings.filter(routingComplete).map((x) => x.routing_code),
    missing_rows: missingRows,
    unresolved_source_rows: unresolved,
  };
}

function operationPayload(op) {
  return {
    operation_name: op.code,
    operation_name_vi: op.name_vi,
    description: op.description,
    operation_type: op.operation_type,
    time_uom: op.time_uom,
    default_time: op.default_time,
    workstation: op.workstation,
    disabled: op.disabled,
    needs_time_definition: op.needs_time_definition,
    needs_workstation: op.needs_workstation,
    batch_size: op.batch_size ?? null,
    batch_uom: op.batch_uom ?? null,
    alternate_batch_size: op.alternate_batch_size ?? null,
    alternate_batch_uom: op.alternate_batch_uom ?? null,
    source_reference: op.source_reference,
    source_time_text: op.source_time_text ?? null,
    _metadata_revision: 2,
  };
}

function routingPayload(routing) {
  return {
    routing_code: routing.routing_code,
    routing_name: routing.routing_name,
    item_code: routing.item_code,
    item_group: routing.item_group,
    bom_no: routing.bom_no,
    source_identity: routing.source_identity,
    execution_mode: routing.execution_mode,
    source_supplier: routing.source_supplier,
    standard_time_value: routing.standard_time_value,
    standard_time_uom: routing.standard_time_uom,
    standard_time_basis: routing.standard_time_basis,
    batch_size: routing.batch_size ?? null,
    batch_uom: routing.batch_uom ?? null,
    alternate_batch_size: routing.alternate_batch_size ?? null,
    alternate_batch_uom: routing.alternate_batch_uom ?? null,
    needs_time_definition: routing.needs_time_definition,
    needs_workstation: routing.needs_workstation,
    needs_item_mapping: routing.needs_item_mapping,
    needs_bom_mapping: routing.needs_bom_mapping,
    source_reference: routing.source_reference,
    source_note: routing.source_note,
    is_active: true,
    _metadata_revision: 5,
  };
}

function childPayload(routing, row) {
  return {
    sequence: row.sequence,
    operation: row.operation,
    execution_mode: row.execution_mode,
    source_supplier: row.source_supplier ?? null,
    workstation: row.workstation ?? null,
    setup_time: row.setup_time ?? null,
    run_time: row.run_time ?? null,
    time_uom: row.time_uom ?? null,
    time_basis: row.time_basis ?? null,
    batch_size: row.batch_size ?? null,
    batch_uom: row.batch_uom ?? null,
    operation_cost: row.operation_cost ?? null,
    needs_time_definition: row.needs_time_definition,
    needs_workstation: row.needs_workstation,
    source_reference: routing.source_reference,
    source_note: routing.source_note ?? null,
  };
}

function costRulePayload(rule) {
  return {
    sequence: rule.sequence,
    operation: rule.operation,
    execution_mode: rule.execution_mode,
    source_supplier: rule.source_supplier ?? null,
    scope_type: rule.scope_type ?? null,
    scope_value: rule.scope_value,
    rate_value: rule.rate_value ?? null,
    currency: rule.currency ?? null,
    rate_uom: rule.rate_uom ?? null,
    calculation_formula: rule.calculation_formula,
    needs_rate_definition: rule.needs_rate_definition,
    needs_item_mapping: rule.needs_item_mapping,
    source_reference: rule.source_reference,
    source_note: rule.source_note ?? null,
  };
}

function buildSql() {
  validate();
  const lines = [
    '-- Alumdoor Production Routing local-only canonical import.',
    '-- Generated from apps/alumdoor/data/production-routing.json. No remote/production mutation.',
    'PRAGMA foreign_keys = ON;',
  ];

  for (const workstation of data.workstations) {
    const payload = {
      workstation_name: workstation.name,
      name_vi: workstation.name_vi,
      description: workstation.description,
      disabled: workstation.disabled,
      source_reference: workstation.source_reference,
      _metadata_revision: 1,
    };
    lines.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(${q(tenant)},'Workstation',${q(workstation.name)},${workstation.disabled ? 1 : 0},${jq(payload)},${q(now)}) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=excluded.disabled,data_json=excluded.data_json,modified_at=excluded.modified_at WHERE master_records.disabled<>excluded.disabled OR master_records.data_json<>excluded.data_json;`);
  }

  for (const op of data.operations) {
    lines.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(${q(tenant)},'Operation',${q(op.code)},${op.disabled ? 1 : 0},${jq(operationPayload(op))},${q(now)}) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=excluded.disabled,data_json=excluded.data_json,modified_at=excluded.modified_at WHERE master_records.disabled<>excluded.disabled OR master_records.data_json<>excluded.data_json;`);
  }

  for (const routing of data.routings) {
    const docKey = `Manufacturing Routing:${routing.routing_code}`;
    lines.push(`INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json) VALUES(${q(tenant)},${q(docKey)},'Manufacturing Routing',${q(routing.routing_code)},'admin',0,'Draft',1,${q(now)},${q(now)},'admin',${jq(routingPayload(routing))}) ON CONFLICT(tenant_id,doc_key) DO UPDATE SET payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,version=documents.version+1 WHERE documents.payload_json<>excluded.payload_json;`);
    lines.push(`DELETE FROM document_children WHERE tenant_id=${q(tenant)} AND parent_key=${q(docKey)} AND fieldname IN ('operations','cost_rules');`);
    for (const row of routing.operations) {
      const rowId = `OP-${String(row.sequence).padStart(3, '0')}`;
      lines.push(`INSERT INTO document_children(tenant_id,parent_key,fieldname,child_doctype,row_id,idx,payload_json) VALUES(${q(tenant)},${q(docKey)},'operations','Manufacturing Routing Operation',${q(rowId)},${Number(row.sequence)},${jq(childPayload(routing, row))});`);
    }
    for (const rule of costRulesOf(routing)) {
      const rowId = `COST-${String(rule.sequence).padStart(3, '0')}`;
      lines.push(`INSERT INTO document_children(tenant_id,parent_key,fieldname,child_doctype,row_id,idx,payload_json) VALUES(${q(tenant)},${q(docKey)},'cost_rules','Manufacturing Routing Cost Rule',${q(rowId)},${Number(rule.sequence)},${jq(costRulePayload(rule))});`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function writeAuditIfChanged(nextAudit) {
  let current = null;
  if (existsSync(reportPath)) {
    try { current = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { /* rewrite malformed/stale report */ }
  }
  if (JSON.stringify(current) !== JSON.stringify(nextAudit)) {
    writeFileSync(reportPath, `${JSON.stringify(nextAudit, null, 2)}\n`, 'utf8');
    return true;
  }
  return false;
}

async function build() {
  await mkdir(dirname(sqlPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  writeFileSync(sqlPath, buildSql(), 'utf8');
  const reportChanged = writeAuditIfChanged(audit());
  console.log(`BUILD_STATUS=PASS sql=${sqlPath} report=${reportPath} report_changed=${reportChanged ? 1 : 0}`);
  printCounters();
}

function cleanupGeneratedSql() {
  try { unlinkSync(sqlPath); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function wranglerBin() {
  const name = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
  const candidates = [join(serverRoot, 'node_modules', '.bin', name), join(repoRoot, 'node_modules', '.bin', name)];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`LOCAL_WRANGLER_NOT_FOUND: ${candidates.join(', ')}`);
  return found;
}

function runWrangler(args, capture = false) {
  if (!args.includes('--local') || args.some((arg) => String(arg).includes('--remote'))) {
    throw new Error('REMOTE_MUTATION_GUARD: Wrangler must use --local and never --remote');
  }
  const binary = wranglerBin();
  const invocation = process.platform === 'win32'
    ? { command: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/c', binary, ...args] }
    : { command: binary, args };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: serverRoot,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, CI: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`WRANGLER_LOCAL_FAILED exit=${result.status}\n${result.stdout || ''}\n${result.stderr || ''}`);
  return (result.stdout || '').trim();
}

function executeFile(path) {
  runWrangler(['d1', 'execute', database, '--local', '--config', configPath, '--file', path]);
}

function queryRows(sql) {
  const output = runWrangler(['d1', 'execute', database, '--local', '--config', configPath, '--json', '--command', sql], true);
  const parsed = JSON.parse(output);
  const groups = Array.isArray(parsed) ? parsed : [parsed];
  return groups.flatMap((group) => Array.isArray(group?.results) ? group.results : []);
}

function verificationSql() {
  const routingScope = managedRoutingSql();
  return `SELECT
    (SELECT COUNT(*) FROM master_records WHERE tenant_id=${q(tenant)} AND record_type='Operation' AND name IN (${managedOperationSql()})) AS operations,
    (SELECT COUNT(*) FROM master_records WHERE tenant_id=${q(tenant)} AND record_type='Workstation' AND name IN (${managedWorkstationSql()})) AS workstations,
    (SELECT COUNT(*) FROM documents WHERE tenant_id=${q(tenant)} AND doctype='Manufacturing Routing' AND name IN (${routingScope})) AS routings,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='operations') AS child_rows,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='cost_rules') AS cost_rule_rows,
    (SELECT COUNT(*) FROM master_records o WHERE o.tenant_id=${q(tenant)} AND o.record_type='Operation' AND o.name IN (${managedOperationSql()}) AND (json_extract(o.data_json,'$.operation_name')<>o.name OR COALESCE(json_extract(o.data_json,'$.operation_name_vi'),'')='')) AS invalid_operation_payload_identity,
    (SELECT COUNT(*) FROM master_records w WHERE w.tenant_id=${q(tenant)} AND w.record_type='Workstation' AND w.name IN (${managedWorkstationSql()}) AND json_extract(w.data_json,'$.workstation_name')<>w.name) AS invalid_workstation_payload_identity,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key LEFT JOIN master_records o ON o.tenant_id=c.tenant_id AND o.record_type='Operation' AND o.name=json_extract(c.payload_json,'$.operation') WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='operations' AND o.name IS NULL) AS invalid_operation_refs,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key LEFT JOIN master_records o ON o.tenant_id=c.tenant_id AND o.record_type='Operation' AND o.name=json_extract(c.payload_json,'$.operation') WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='cost_rules' AND o.name IS NULL) AS invalid_cost_operation_refs,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key LEFT JOIN master_records w ON w.tenant_id=c.tenant_id AND w.record_type='Workstation' AND w.name=json_extract(c.payload_json,'$.workstation') WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='operations' AND json_extract(c.payload_json,'$.workstation') IS NOT NULL AND w.name IS NULL) AS invalid_workstation_refs,
    (SELECT COUNT(*) FROM master_records o LEFT JOIN master_records w ON w.tenant_id=o.tenant_id AND w.record_type='Workstation' AND w.name=json_extract(o.data_json,'$.workstation') WHERE o.tenant_id=${q(tenant)} AND o.record_type='Operation' AND o.name IN (${managedOperationSql()}) AND json_extract(o.data_json,'$.workstation') IS NOT NULL AND w.name IS NULL) AS invalid_operation_workstation_refs,
    (SELECT COUNT(*) FROM (SELECT c.parent_key,json_extract(c.payload_json,'$.sequence') seq,COUNT(*) n FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='operations' GROUP BY c.parent_key,seq HAVING n>1)) AS duplicate_sequences,
    (SELECT COUNT(*) FROM (SELECT c.parent_key,json_extract(c.payload_json,'$.sequence') seq,COUNT(*) n FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='cost_rules' GROUP BY c.parent_key,seq HAVING n>1)) AS duplicate_cost_sequences,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname IN ('operations','cost_rules') AND c.idx<>CAST(json_extract(c.payload_json,'$.sequence') AS INTEGER)) AS invalid_sequence_idx,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND d.name IN (${routingScope}) AND c.fieldname='cost_rules' AND ((json_extract(c.payload_json,'$.needs_rate_definition')=1 AND json_extract(c.payload_json,'$.rate_value') IS NOT NULL) OR (json_extract(c.payload_json,'$.needs_rate_definition')=0 AND json_extract(c.payload_json,'$.rate_value') IS NULL))) AS invalid_cost_rate_state,
    (SELECT COUNT(*) FROM documents r WHERE r.tenant_id=${q(tenant)} AND r.doctype='Manufacturing Routing' AND r.name IN (${routingScope}) AND json_extract(r.payload_json,'$.item_group') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=r.tenant_id AND m.record_type='Item Group' AND m.name=json_extract(r.payload_json,'$.item_group')) AND NOT EXISTS(SELECT 1 FROM documents g WHERE g.tenant_id=r.tenant_id AND g.doctype='Item Group' AND g.name=json_extract(r.payload_json,'$.item_group'))) AS invalid_item_group_mappings,
    (SELECT COUNT(*) FROM documents r WHERE r.tenant_id=${q(tenant)} AND r.doctype='Manufacturing Routing' AND r.name IN (${routingScope}) AND json_extract(r.payload_json,'$.item_code') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=r.tenant_id AND m.record_type='Item' AND m.name=json_extract(r.payload_json,'$.item_code')) AND NOT EXISTS(SELECT 1 FROM documents i WHERE i.tenant_id=r.tenant_id AND i.doctype='Item' AND i.name=json_extract(r.payload_json,'$.item_code'))) AS invalid_item_code_mappings,
    (SELECT COUNT(*) FROM documents r WHERE r.tenant_id=${q(tenant)} AND r.doctype='Manufacturing Routing' AND r.name IN (${routingScope}) AND json_extract(r.payload_json,'$.bom_no') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents b WHERE b.tenant_id=r.tenant_id AND b.doctype='Bill of Materials' AND b.name=json_extract(r.payload_json,'$.bom_no'))) AS invalid_bom_mappings;`;
}

function verifyRows(rows, label) {
  const row = rows[0];
  if (!row) throw new Error(`${label}_EMPTY`);
  const expected = {
    operations: data.operations.length,
    workstations: data.workstations.length,
    routings: data.routings.length,
    child_rows: data.routings.reduce((sum, routing) => sum + routing.operations.length, 0),
    cost_rule_rows: allCostRules().length,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (Number(row[key]) !== value) throw new Error(`${label}_${key.toUpperCase()} expected=${value} actual=${row[key]}`);
  }
  for (const key of [
    'invalid_operation_payload_identity',
    'invalid_workstation_payload_identity',
    'invalid_operation_refs',
    'invalid_cost_operation_refs',
    'invalid_workstation_refs',
    'invalid_operation_workstation_refs',
    'duplicate_sequences',
    'duplicate_cost_sequences',
    'invalid_sequence_idx',
    'invalid_cost_rate_state',
    'invalid_item_group_mappings',
    'invalid_item_code_mappings',
    'invalid_bom_mappings',
  ]) {
    if (Number(row[key]) !== 0) throw new Error(`${label}_${key.toUpperCase()}=${row[key]}`);
  }
  console.log(`${label}_STATUS=PASS ${Object.entries(row).map(([key, value]) => `${key}=${value}`).join(' ')}`);
  return row;
}

function queryLocal(label = 'VERIFY_LOCAL') {
  return verifyRows(queryRows(verificationSql()), label);
}

function printCounters() {
  for (const [key, value] of Object.entries(audit().counters)) console.log(`${key}=${value}`);
}

async function selftest() {
  validate();
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE master_records(tenant_id TEXT,record_type TEXT,name TEXT,disabled INTEGER,data_json TEXT,modified_at TEXT,PRIMARY KEY(tenant_id,record_type,name)); CREATE TABLE documents(tenant_id TEXT,doc_key TEXT,doctype TEXT,name TEXT,owner TEXT,docstatus INTEGER,status TEXT,version INTEGER,created_at TEXT,modified_at TEXT,modified_by TEXT,payload_json TEXT,PRIMARY KEY(tenant_id,doc_key),UNIQUE(tenant_id,doctype,name)); CREATE TABLE document_children(tenant_id TEXT,parent_key TEXT,fieldname TEXT,child_doctype TEXT,row_id TEXT,idx INTEGER,payload_json TEXT,PRIMARY KEY(tenant_id,parent_key,fieldname,row_id));`);
  for (const group of ['Cửa tấm liền Úc', 'Cửa Lưới', 'Cửa CN Đức', 'Cửa Đài Loan', 'Cửa siêu trường']) {
    db.prepare('INSERT INTO master_records VALUES(?,?,?,?,?,?)').run(tenant, 'Item Group', group, 0, '{}', now);
  }
  const sql = buildSql();
  db.exec(sql);
  const first = db.prepare(verificationSql()).get();
  verifyRows([first], 'SELFTEST_FIRST');
  db.exec(sql);
  const replay = db.prepare(verificationSql()).get();
  verifyRows([replay], 'SELFTEST_REPLAY');
  console.log('SELFTEST_STATUS=PASS');
  printCounters();
}

validate();
if (command === 'validate') {
  console.log(`VALIDATE_STATUS=PASS operations=${data.operations.length} routings=${data.routings.length} workstations=${data.workstations.length} cost_rules=${allCostRules().length}`);
  printCounters();
} else if (command === 'build') {
  await build();
} else if (command === 'selftest') {
  await selftest();
} else if (command === 'import-local') {
  try {
    await build();
    executeFile(sqlPath);
    queryLocal('IMPORT_LOCAL_VERIFY');
    console.log('IMPORT_LOCAL_STATUS=PASS');
  } finally {
    cleanupGeneratedSql();
  }
} else if (command === 'query-local' || command === 'verify-local') {
  queryLocal('VERIFY_LOCAL');
} else if (command === 'replay-local') {
  try {
    await build();
    const before = queryLocal('REPLAY_BEFORE');
    executeFile(sqlPath);
    const after = queryLocal('REPLAY_AFTER');
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`REPLAY_NOT_IDEMPOTENT before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    console.log('REPLAY_LOCAL_STATUS=PASS');
  } finally {
    cleanupGeneratedSql();
  }
}
