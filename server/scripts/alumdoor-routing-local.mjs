#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`DUPLICATE_${label}: ${value}`);
    seen.add(value);
  }
}

function validate() {
  if (data.authority_policy !== 'repo_source_only_no_invention') throw new Error('AUTHORITY_POLICY_INVALID');
  assertUnique(data.operations.map((x) => x.code), 'OPERATION');
  assertUnique(data.routings.map((x) => x.routing_code), 'ROUTING');
  assertUnique(data.workstations.map((x) => x.name), 'WORKSTATION');

  const operations = new Set(data.operations.map((x) => x.code));
  const workstations = new Set(data.workstations.map((x) => x.name));

  for (const op of data.operations) {
    if (!op.code || !op.name_vi || !op.description || !op.operation_type || !op.time_uom || !op.source_reference) {
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
    if (!routing.routing_code || !routing.routing_name || !routing.source_reference || !Array.isArray(routing.operations)) {
      throw new Error(`ROUTING_REQUIRED_FIELD: ${routing.routing_code || '<unknown>'}`);
    }
    if (routing.needs_time_definition && routing.standard_time_value != null) throw new Error(`ROUTING_FAKE_TIME_GUARD: ${routing.routing_code}`);
    if (!routing.needs_time_definition && routing.standard_time_value == null) throw new Error(`ROUTING_TIME_MISSING: ${routing.routing_code}`);
    if (routing.needs_item_mapping && (routing.item_code || routing.item_group)) throw new Error(`ROUTING_FAKE_MAPPING_GUARD: ${routing.routing_code}`);

    const sequences = routing.operations.map((row) => Number(row.sequence));
    assertUnique(sequences, `SEQUENCE_${routing.routing_code}`);
    if (sequences.some((value) => !Number.isInteger(value) || value <= 0)) throw new Error(`ROUTING_SEQUENCE_INVALID: ${routing.routing_code}`);

    for (const row of routing.operations) {
      if (!operations.has(row.operation)) throw new Error(`ROUTING_OPERATION_REF_INVALID: ${routing.routing_code}:${row.operation}`);
      if (row.needs_time_definition && row.run_time != null) throw new Error(`ROUTING_FAKE_TIME_GUARD: ${routing.routing_code}:${row.sequence}`);
      if (row.needs_workstation && row.workstation != null) throw new Error(`ROUTING_FAKE_WORKSTATION_GUARD: ${routing.routing_code}:${row.sequence}`);
      if (!row.needs_workstation && row.workstation && !workstations.has(row.workstation)) {
        throw new Error(`ROUTING_WORKSTATION_REF_INVALID: ${routing.routing_code}:${row.workstation}`);
      }
    }
  }
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
      reason: 'Routing sequence is evidenced but routing-level standard time is absent.',
      recommended_next_input: `Provide standard time and basis for ${routing.routing_name}.`,
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
      recommended_next_input: `Provide exact Item/Item Group scope for ${routing.routing_name}.`,
    });
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

  return {
    format: 'alumdoor-production-routing-audit/v1',
    authority_policy: data.authority_policy,
    counters: {
      OPERATIONS_TOTAL: data.operations.length,
      OPERATIONS_COMPLETE: data.operations.filter((x) => !x.needs_time_definition && !x.needs_workstation).length,
      OPERATIONS_NEED_DATA: data.operations.filter((x) => x.needs_time_definition || x.needs_workstation).length,
      ROUTINGS_TOTAL: data.routings.length,
      ROUTINGS_COMPLETE: data.routings.filter((x) => !x.needs_time_definition && !x.needs_workstation && !x.needs_item_mapping).length,
      ROUTINGS_NEED_DATA: data.routings.filter((x) => x.needs_time_definition || x.needs_workstation || x.needs_item_mapping).length,
      MISSING_STANDARD_TIME: data.operations.filter((x) => x.needs_time_definition).length + data.routings.filter((x) => x.needs_time_definition).length,
      MISSING_WORKSTATION: data.operations.filter((x) => x.needs_workstation).length + data.routings.filter((x) => x.needs_workstation).length,
      MISSING_ITEM_MAPPING: data.routings.filter((x) => x.needs_item_mapping).length,
      UNRESOLVED_SOURCE_ROWS: unresolved.length,
    },
    complete_routings: data.routings.filter((x) => !x.needs_time_definition && !x.needs_workstation && !x.needs_item_mapping).map((x) => x.routing_code),
    missing_rows: missingRows,
    unresolved_source_rows: unresolved,
  };
}

function operationPayload(op) {
  return {
    operation_code: op.code, operation_name: op.name_vi, description: op.description, operation_type: op.operation_type,
    time_uom: op.time_uom, default_time: op.default_time, workstation: op.workstation, disabled: op.disabled,
    needs_time_definition: op.needs_time_definition, needs_workstation: op.needs_workstation,
    batch_size: op.batch_size ?? null, batch_uom: op.batch_uom ?? null,
    alternate_batch_size: op.alternate_batch_size ?? null, alternate_batch_uom: op.alternate_batch_uom ?? null,
    source_reference: op.source_reference, source_time_text: op.source_time_text ?? null, _metadata_revision: 1,
  };
}

function routingPayload(routing) {
  return {
    routing_code: routing.routing_code, routing_name: routing.routing_name, item_code: routing.item_code,
    item_group: routing.item_group, source_identity: routing.source_identity,
    standard_time_value: routing.standard_time_value, standard_time_uom: routing.standard_time_uom,
    standard_time_basis: routing.standard_time_basis, batch_size: routing.batch_size ?? null,
    batch_uom: routing.batch_uom ?? null, alternate_batch_size: routing.alternate_batch_size ?? null,
    alternate_batch_uom: routing.alternate_batch_uom ?? null,
    needs_time_definition: routing.needs_time_definition, needs_workstation: routing.needs_workstation,
    needs_item_mapping: routing.needs_item_mapping, source_reference: routing.source_reference,
    source_note: routing.source_note, is_active: true, _metadata_revision: 2,
  };
}

function childPayload(routing, row) {
  return {
    sequence: row.sequence, operation: row.operation, workstation: row.workstation ?? null,
    setup_time: row.setup_time ?? null, run_time: row.run_time ?? null,
    time_uom: row.time_uom ?? null, time_basis: row.time_basis ?? null,
    batch_size: row.batch_size ?? null, batch_uom: row.batch_uom ?? null,
    operation_cost: row.operation_cost ?? null,
    needs_time_definition: row.needs_time_definition, needs_workstation: row.needs_workstation,
    source_reference: routing.source_reference, source_note: routing.source_note ?? null,
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
      workstation_name: workstation.name, name_vi: workstation.name_vi, description: workstation.description,
      disabled: workstation.disabled, source_reference: workstation.source_reference, _metadata_revision: 1,
    };
    lines.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(${q(tenant)},'Workstation',${q(workstation.name)},${workstation.disabled ? 1 : 0},${jq(payload)},${q(now)}) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=excluded.disabled,data_json=excluded.data_json,modified_at=excluded.modified_at WHERE master_records.disabled<>excluded.disabled OR master_records.data_json<>excluded.data_json;`);
  }

  for (const op of data.operations) {
    lines.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(${q(tenant)},'Operation',${q(op.code)},${op.disabled ? 1 : 0},${jq(operationPayload(op))},${q(now)}) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=excluded.disabled,data_json=excluded.data_json,modified_at=excluded.modified_at WHERE master_records.disabled<>excluded.disabled OR master_records.data_json<>excluded.data_json;`);
  }

  for (const routing of data.routings) {
    const docKey = `Manufacturing Routing:${routing.routing_code}`;
    lines.push(`INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json) VALUES(${q(tenant)},${q(docKey)},'Manufacturing Routing',${q(routing.routing_code)},'admin',0,'Draft',1,${q(now)},${q(now)},'admin',${jq(routingPayload(routing))}) ON CONFLICT(tenant_id,doc_key) DO UPDATE SET payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,version=documents.version+1 WHERE documents.payload_json<>excluded.payload_json;`);
    lines.push(`DELETE FROM document_children WHERE tenant_id=${q(tenant)} AND parent_key=${q(docKey)} AND fieldname='operations';`);
    for (const row of routing.operations) {
      const rowId = `OP-${String(row.sequence).padStart(3, '0')}`;
      lines.push(`INSERT INTO document_children(tenant_id,parent_key,fieldname,child_doctype,row_id,idx,payload_json) VALUES(${q(tenant)},${q(docKey)},'operations','Manufacturing Routing Operation',${q(rowId)},${Number(row.sequence)},${jq(childPayload(routing, row))});`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function build() {
  await mkdir(dirname(sqlPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  writeFileSync(sqlPath, buildSql(), 'utf8');
  writeFileSync(reportPath, `${JSON.stringify(audit(), null, 2)}\n`, 'utf8');
  console.log(`BUILD_STATUS=PASS sql=${sqlPath} report=${reportPath}`);
  printCounters();
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
  return `SELECT
    (SELECT COUNT(*) FROM master_records WHERE tenant_id=${q(tenant)} AND record_type='Operation' AND name LIKE 'OP-%') AS operations,
    (SELECT COUNT(*) FROM documents WHERE tenant_id=${q(tenant)} AND doctype='Manufacturing Routing' AND name LIKE 'RT-%') AS routings,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND c.fieldname='operations') AS child_rows,
    (SELECT COUNT(*) FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key LEFT JOIN master_records o ON o.tenant_id=c.tenant_id AND o.record_type='Operation' AND o.name=json_extract(c.payload_json,'$.operation') WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND c.fieldname='operations' AND o.name IS NULL) AS invalid_operation_refs,
    (SELECT COUNT(*) FROM (SELECT c.parent_key,json_extract(c.payload_json,'$.sequence') seq,COUNT(*) n FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${q(tenant)} AND d.doctype='Manufacturing Routing' AND c.fieldname='operations' GROUP BY c.parent_key,seq HAVING n>1)) AS duplicate_sequences,
    (SELECT COUNT(*) FROM documents r WHERE r.tenant_id=${q(tenant)} AND r.doctype='Manufacturing Routing' AND json_extract(r.payload_json,'$.item_group') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=r.tenant_id AND m.record_type='Item Group' AND m.name=json_extract(r.payload_json,'$.item_group')) AND NOT EXISTS(SELECT 1 FROM documents g WHERE g.tenant_id=r.tenant_id AND g.doctype='Item Group' AND g.name=json_extract(r.payload_json,'$.item_group'))) AS invalid_item_group_mappings;`;
}

function verifyRows(rows, label) {
  const row = rows[0];
  if (!row) throw new Error(`${label}_EMPTY`);
  const expected = { operations: data.operations.length, routings: data.routings.length, child_rows: data.routings.reduce((sum, routing) => sum + routing.operations.length, 0) };
  for (const [key, value] of Object.entries(expected)) {
    if (Number(row[key]) !== value) throw new Error(`${label}_${key.toUpperCase()} expected=${value} actual=${row[key]}`);
  }
  for (const key of ['invalid_operation_refs', 'duplicate_sequences', 'invalid_item_group_mappings']) {
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
  console.log(`VALIDATE_STATUS=PASS operations=${data.operations.length} routings=${data.routings.length} workstations=${data.workstations.length}`);
  printCounters();
} else if (command === 'build') {
  await build();
} else if (command === 'selftest') {
  await selftest();
} else if (command === 'import-local') {
  await build();
  executeFile(sqlPath);
  queryLocal('IMPORT_LOCAL_VERIFY');
  console.log('IMPORT_LOCAL_STATUS=PASS');
} else if (command === 'query-local' || command === 'verify-local') {
  queryLocal('VERIFY_LOCAL');
} else if (command === 'replay-local') {
  await build();
  const before = queryLocal('REPLAY_BEFORE');
  executeFile(sqlPath);
  const after = queryLocal('REPLAY_AFTER');
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`REPLAY_NOT_IDEMPOTENT before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  console.log('REPLAY_LOCAL_STATUS=PASS');
}
