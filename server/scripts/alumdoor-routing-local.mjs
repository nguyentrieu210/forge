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
const tenant = process.env.ALUMDOOR_ROUTING_TENANT || 'alu';
const now = '2026-08-18T05:00:00.000Z';

if (process.argv.some((arg) => arg === '--remote' || arg.startsWith('--remote='))) {
  throw new Error('REMOTE_MUTATION_GUARD: --remote is forbidden; this importer is local-only');
}

const command = process.argv[2] || 'validate';
const allowed = new Set(['validate','build','import-local','query-local','verify-local','replay-local','selftest']);
if (!allowed.has(command)) {
  throw new Error(`Usage: node server/scripts/alumdoor-routing-local.mjs <${[...allowed].join('|')}>`);
}

const data = JSON.parse(readFileSync(sourcePath, 'utf8'));
const sqlText = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const jsonText = (value) => sqlText(JSON.stringify(value));

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`DUPLICATE_${label}: ${value}`);
    seen.add(value);
  }
}

function validate() {
  if (data.authority_policy !== 'repo_source_only_no_invention') throw new Error('AUTHORITY_POLICY_INVALID');
  unique(data.operations.map((x) => x.code), 'OPERATION');
  unique(data.routings.map((x) => x.routing_code), 'ROUTING');
  unique(data.workstations.map((x) => x.name), 'WORKSTATION');
  const opCodes = new Set(data.operations.map((x) => x.code));
  const wsNames = new Set(data.workstations.map((x) => x.name));
  for (const op of data.operations) {
    if (!op.code || !op.name_vi || !op.description || !op.operation_type || !op.time_uom || !op.source_reference) {
      throw new Error(`OPERATION_REQUIRED_FIELD: ${op.code || '<unknown>'}`);
    }
    if (op.needs_time_definition && op.default_time != null) throw new Error(`OPERATION_FAKE_TIME_GUARD: ${op.code}`);
    if (!op.needs_time_definition && op.default_time == null) throw new Error(`OPERATION_TIME_MISSING: ${op.code}`);
    if (op.needs_workstation && op.workstation != null) throw new Error(`OPERATION_FAKE_WORKSTATION_GUARD: ${op.code}`);
    if (!op.needs_workstation && (!op.workstation || !wsNames.has(op.workstation))) throw new Error(`OPERATION_WORKSTATION_INVALID: ${op.code}`);
  }
  for (const routing of data.routings) {
    if (!routing.routing_code || !routing.routing_name || !routing.source_reference) throw new Error(`ROUTING_REQUIRED_FIELD: ${routing.routing_code || '<unknown>'}`);
    if (routing.needs_time_definition && routing.standard_time_value != null) throw new Error(`ROUTING_FAKE_TIME_GUARD: ${routing.routing_code}`);
    if (!routing.needs_time_definition && routing.standard_time_value == null) throw new Error(`ROUTING_TIME_MISSING: ${routing.routing_code}`);
    if (routing.needs_item_mapping && (routing.item_code || routing.item_group)) throw new Error(`ROUTING_FAKE_MAPPING_GUARD: ${routing.routing_code}`);
    const seq = routing.operations.map((x) => Number(x.sequence));
    unique(seq, `SEQUENCE_${routing.routing_code}`);
    if (seq.some((x) => !Number.isInteger(x) || x <= 0)) throw new Error(`ROUTING_SEQUENCE_INVALID: ${routing.routing_code}`);
    for (const row of routing.operations) {
      if (!opCodes.has(row.operation)) throw new Error(`ROUTING_OPERATION_REF_INVALID: ${routing.routing_code}:${row.operation}`);
      if (row.needs_time_definition && row.run_time != null) throw new Error(`ROUTING_FAKE_TIME_GUARD: ${routing.routing_code}:${row.sequence}`);
      if (row.needs_workstation && row.workstation != null) throw new Error(`ROUTING_FAKE_WORKSTATION_GUARD: ${routing.routing_code}:${row.sequence}`);
      if (!row.needs_workstation && row.workstation && !wsNames.has(row.workstation)) throw new Error(`ROUTING_WORKSTATION_REF_INVALID: ${routing.routing_code}:${row.workstation}`);
    }
  }
  return true;
}

function audit() {
  const missing = [];
  for (const op of data.operations) {
    if (op.needs_time_definition) missing.push({routing:null,operation:op.code,item_group:null,missing_field:'standard_time',source_reference:op.source_reference,reason:'Source defines the operation but not its standard time.',recommended_next_input:`Provide standard time and basis for ${op.name_vi}.`});
    if (op.needs_workstation) missing.push({routing:null,operation:op.code,item_group:null,missing_field:'workstation',source_reference:op.source_reference,reason:'Source does not identify the workstation/machine.',recommended_next_input:`Provide actual workstation/machine for ${op.name_vi}.`});
  }
  for (const r of data.routings) {
    if (r.needs_time_definition) missing.push({routing:r.routing_code,operation:null,item_group:r.item_group,missing_field:'standard_time',source_reference:r.source_reference,reason:'Routing sequence is evidenced but routing-level standard time is absent.',recommended_next_input:`Provide routing standard time/basis for ${r.routing_name}.`});
    if (r.needs_workstation) missing.push({routing:r.routing_code,operation:null,item_group:r.item_group,missing_field:'workstation',source_reference:r.source_reference,reason:'Routing has no source-backed workstation assignment.',recommended_next_input:`Provide actual workstation assignment for ${r.routing_name}.`});
    if (r.needs_item_mapping) missing.push({routing:r.routing_code,operation:null,item_group:r.item_group,missing_field:'item_mapping',source_reference:r.source_reference,reason:'Source does not prove a specific Item/Item Group mapping.',recommended_next_input:`Provide Item/Item Group scope for ${r.routing_name}.`});
  }
  missing.push(...data.unresolved_source_rows.map((x) => ({routing:x.routing,operation:x.operation,item_group:x.item_group,missing_field:x.missing_field,source_reference:x.source_reference,reason:x.reason,recommended_next_input:x.recommended_next_input})));
  const counters = {
    OPERATIONS_TOTAL: data.operations.length,
    OPERATIONS_COMPLETE: data.operations.filter((x) => !x.needs_time_definition && !x.needs_workstation).length,
    OPERATIONS_NEED_DATA: data.operations.filter((x) => x.needs_time_definition || x.needs_workstation).length,
    ROUTINGS_TOTAL: data.routings.length,
    ROUTINGS_COMPLETE: data.routings.filter((x) => !x.needs_time_definition && !x.needs_workstation && !x.needs_item_mapping).length,
    ROUTINGS_NEED_DATA: data.routings.filter((x) => x.needs_time_definition || x.needs_workstation || x.needs_item_mapping).length,
    MISSING_STANDARD_TIME: data.operations.filter((x) => x.needs_time_definition).length + data.routings.filter((x) => x.needs_time_definition).length,
    MISSING_WORKSTATION: data.operations.filter((x) => x.needs_workstation).length + data.routings.filter((x) => x.needs_workstation).length,
    MISSING_ITEM_MAPPING: data.routings.filter((x) => x.needs_item_mapping).length,
    UNRESOLVED_SOURCE_ROWS: data.unresolved_source_rows.length
  };
  return {format:'alumdoor-production-routing-audit/v1',generated_from:'apps/alumdoor/data/production-routing.json',authority_policy:data.authority_policy,counters,missing};
}

function operationPayload(op) {
  return {
    operation_code: op.code,
    operation_name: op.name_vi,
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
    _metadata_revision: 1
  };
}

function routingPayload(r) {
  return {
    routing_code:r.routing_code,routing_name:r.routing_name,item_code:r.item_code,item_group:r.item_group,source_identity:r.source_identity,
    standard_time_value:r.standard_time_value,standard_time_uom:r.standard_time_uom,standard_time_basis:r.standard_time_basis,
    batch_size:r.batch_size ?? null,batch_uom:r.batch_uom ?? null,alternate_batch_size:r.alternate_batch_size ?? null,alternate_batch_uom:r.alternate_batch_uom ?? null,
    needs_time_definition:r.needs_time_definition,needs_workstation:r.needs_workstation,needs_item_mapping:r.needs_item_mapping,
    source_reference:r.source_reference,source_note:r.source_note,is_active:true,_metadata_revision:2
  };
}

function childPayload(r, row) {
  return {
    sequence:row.sequence,operation:row.operation,workstation:row.workstation ?? null,setup_time:row.setup_time ?? null,run_time:row.run_time ?? null,
    time_uom:row.time_uom ?? null,time_basis:row.time_basis ?? null,batch_size:row.batch_size ?? null,batch_uom:row.batch_uom ?? null,
    operation_cost:row.operation_cost ?? null,needs_time_definition:row.needs_time_definition,needs_workstation:row.needs_workstation,
    source_reference:r.source_reference,source_note:r.source_note ?? null
  };
}

function buildSql() {
  validate();
  const lines = [
    '-- Alumdoor Production Routing local-only canonical import.',
    '-- Generated from apps/alumdoor/data/production-routing.json. No production/remote mutation.',
    'PRAGMA foreign_keys = ON;',
    ''
  ];
  for (const ws of data.workstations) {
    const payload = {workstation_name:ws.name,name_vi:ws.name_vi,description:ws.description,disabled:ws.disabled,source_reference:ws.source_reference,_metadata_revision:1};
    lines.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(${sqlText(tenant)},'Workstation',${sqlText(ws.name)},${ws.disabled?1:0},${jsonText(payload)},${sqlText(now)}) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=excluded.disabled,data_json=excluded.data_json,modified_at=excluded.modified_at WHERE master_records.disabled<>excluded.disabled OR master_records.data_json<>excluded.data_json;`);
  }
  for (const op of data.operations) {
    lines.push(`INSERT INTO master_records(tenant_id,record_type,name,disabled,data_json,modified_at) VALUES(${sqlText(tenant)},'Operation',${sqlText(op.code)},${op.disabled?1:0},${jsonText(operationPayload(op))},${sqlText(now)}) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET disabled=excluded.disabled,data_json=excluded.data_json,modified_at=excluded.modified_at WHERE master_records.disabled<>excluded.disabled OR master_records.data_json<>excluded.data_json;`);
  }
  for (const r of data.routings) {
    const docKey = `Manufacturing Routing:${r.routing_code}`;
    lines.push(`INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json) VALUES(${sqlText(tenant)},${sqlText(docKey)},'Manufacturing Routing',${sqlText(r.routing_code)},'admin',0,'Draft',1,${sqlText(now)},${sqlText(now)},'admin',${jsonText(routingPayload(r))}) ON CONFLICT(tenant_id,doc_key) DO UPDATE SET payload_json=excluded.payload_json,modified_at=excluded.modified_at,modified_by=excluded.modified_by,version=documents.version+1 WHERE documents.payload_json<>excluded.payload_json;`);
    lines.push(`DELETE FROM document_children WHERE tenant_id=${sqlText(tenant)} AND parent_key=${sqlText(docKey)} AND fieldname='operations';`);
    for (const row of r.operations) {
      const rowId = `OP-${String(row.sequence).padStart(3,'0')}`;
      lines.push(`INSERT INTO document_children(tenant_id,parent_key,fieldname,child_doctype,row_id,idx,payload_json) VALUES(${sqlText(tenant)},${sqlText(docKey)},'operations','Manufacturing Routing Operation',${sqlText(rowId)},${Number(row.sequence)},${jsonText(childPayload(r,row))});`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function build() {
  await mkdir(dirname(sqlPath), {recursive:true});
  await mkdir(dirname(reportPath), {recursive:true});
  writeFileSync(sqlPath, buildSql(), 'utf8');
  writeFileSync(reportPath, `${JSON.stringify(audit(), null, 2)}\n`, 'utf8');
  console.log(`BUILD_STATUS=PASS sql=${sqlPath} report=${reportPath}`);
  printCounters();
}

function wranglerBin() {
  const name = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
  const candidates = [join(serverRoot,'node_modules','.bin',name),join(repoRoot,'node_modules','.bin',name)];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`LOCAL_WRANGLER_NOT_FOUND: ${candidates.join(', ')}`);
  return found;
}

function runWrangler(args, capture=false) {
  if (!args.includes('--local') || args.some((x) => String(x).includes('--remote'))) throw new Error('REMOTE_MUTATION_GUARD: Wrangler must use --local and never --remote');
  const bin = wranglerBin();
  const invocation = process.platform === 'win32' ? {cmd:process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',args:['/d','/c',bin,...args]} : {cmd:bin,args};
  const result = spawnSync(invocation.cmd, invocation.args, {cwd:serverRoot,encoding:'utf8',stdio:capture?['ignore','pipe','pipe']:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`WRANGLER_LOCAL_FAILED: exit=${result.status}\n${result.stderr || ''}`);
  return result.stdout || '';
}

function localArgs(sqlFile) {
  return ['d1','execute','DB','--local','--config',configPath,'--file',sqlFile];
}

function querySql() {
  return `SELECT 'OPERATIONS' metric,COUNT(*) value FROM master_records WHERE tenant_id=${sqlText(tenant)} AND record_type='Operation' AND name LIKE 'OP-%';\nSELECT 'ROUTINGS' metric,COUNT(*) value FROM documents WHERE tenant_id=${sqlText(tenant)} AND doctype='Manufacturing Routing' AND name LIKE 'RT-%';\nSELECT 'CHILD_ROWS' metric,COUNT(*) value FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${sqlText(tenant)} AND d.doctype='Manufacturing Routing' AND c.fieldname='operations';\nSELECT 'INVALID_OPERATION_REFS' metric,COUNT(*) value FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key LEFT JOIN master_records o ON o.tenant_id=c.tenant_id AND o.record_type='Operation' AND o.name=json_extract(c.payload_json,'$.operation') WHERE c.tenant_id=${sqlText(tenant)} AND d.doctype='Manufacturing Routing' AND c.fieldname='operations' AND o.name IS NULL;\nSELECT 'DUPLICATE_SEQUENCES' metric,COUNT(*) value FROM (SELECT c.parent_key,json_extract(c.payload_json,'$.sequence') seq,COUNT(*) n FROM document_children c JOIN documents d ON d.tenant_id=c.tenant_id AND d.doc_key=c.parent_key WHERE c.tenant_id=${sqlText(tenant)} AND d.doctype='Manufacturing Routing' AND c.fieldname='operations' GROUP BY c.parent_key,seq HAVING n>1);\nSELECT 'INVALID_ITEM_GROUP_MAPPINGS' metric,COUNT(*) value FROM documents r WHERE r.tenant_id=${sqlText(tenant)} AND r.doctype='Manufacturing Routing' AND json_extract(r.payload_json,'$.item_group') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=r.tenant_id AND m.record_type='Item Group' AND m.name=json_extract(r.payload_json,'$.item_group')) AND NOT EXISTS(SELECT 1 FROM documents g WHERE g.tenant_id=r.tenant_id AND g.doctype='Item Group' AND g.name=json_extract(r.payload_json,'$.item_group'));\n`;
}

async function queryLocal() {
  const path = join(serverRoot,'imports','.alumdoor-routing-verify.sql');
  writeFileSync(path, querySql(), 'utf8');
  const out = runWrangler(localArgs(path), true);
  process.stdout.write(out);
  return out;
}

function printCounters() {
  const {counters} = audit();
  for (const [key,value] of Object.entries(counters)) console.log(`${key}=${value}`);
}

async function selftest() {
  validate();
  const {DatabaseSync} = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE master_records(tenant_id TEXT,record_type TEXT,name TEXT,disabled INTEGER,data_json TEXT,modified_at TEXT,PRIMARY KEY(tenant_id,record_type,name)); CREATE TABLE documents(tenant_id TEXT,doc_key TEXT,doctype TEXT,name TEXT,owner TEXT,docstatus INTEGER,status TEXT,version INTEGER,created_at TEXT,modified_at TEXT,modified_by TEXT,payload_json TEXT,PRIMARY KEY(tenant_id,doc_key),UNIQUE(tenant_id,doctype,name)); CREATE TABLE document_children(tenant_id TEXT,parent_key TEXT,fieldname TEXT,child_doctype TEXT,row_id TEXT,idx INTEGER,payload_json TEXT,PRIMARY KEY(tenant_id,parent_key,fieldname,row_id));`);
  for (const group of ['Cửa tấm liền Úc','Cửa Lưới','Cửa CN Đức','Cửa Đài Loan','Cửa siêu trường']) db.prepare(`INSERT INTO master_records VALUES(?,?,?,?,?,?)`).run(tenant,'Item Group',group,0,'{}',now);
  const sql = buildSql();
  db.exec(sql);
  const first = {operations:db.prepare(`SELECT COUNT(*) n FROM master_records WHERE record_type='Operation'`).get().n,routings:db.prepare(`SELECT COUNT(*) n FROM documents WHERE doctype='Manufacturing Routing'`).get().n,children:db.prepare(`SELECT COUNT(*) n FROM document_children WHERE fieldname='operations'`).get().n};
  db.exec(sql);
  const replay = {operations:db.prepare(`SELECT COUNT(*) n FROM master_records WHERE record_type='Operation'`).get().n,routings:db.prepare(`SELECT COUNT(*) n FROM documents WHERE doctype='Manufacturing Routing'`).get().n,children:db.prepare(`SELECT COUNT(*) n FROM document_children WHERE fieldname='operations'`).get().n};
  const invalidRefs = db.prepare(`SELECT COUNT(*) n FROM document_children c LEFT JOIN master_records o ON o.tenant_id=c.tenant_id AND o.record_type='Operation' AND o.name=json_extract(c.payload_json,'$.operation') WHERE c.fieldname='operations' AND o.name IS NULL`).get().n;
  const invalidGroups = db.prepare(`SELECT COUNT(*) n FROM documents r WHERE r.doctype='Manufacturing Routing' AND json_extract(r.payload_json,'$.item_group') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records m WHERE m.tenant_id=r.tenant_id AND m.record_type='Item Group' AND m.name=json_extract(r.payload_json,'$.item_group'))`).get().n;
  if (first.operations !== data.operations.length || first.routings !== data.routings.length || first.children !== 11 || JSON.stringify(first)!==JSON.stringify(replay) || invalidRefs!==0 || invalidGroups!==0) throw new Error(`SELFTEST_FAILED ${JSON.stringify({first,replay,invalidRefs,invalidGroups})}`);
  console.log(`SELFTEST_STATUS=PASS first=${JSON.stringify(first)} replay=${JSON.stringify(replay)} invalid_operation_refs=${invalidRefs} invalid_item_group_mappings=${invalidGroups}`);
  printCounters();
}

validate();
if (command === 'validate') { console.log(`VALIDATE_STATUS=PASS operations=${data.operations.length} routings=${data.routings.length} workstations=${data.workstations.length}`); printCounters(); }
else if (command === 'build') await build();
else if (command === 'selftest') await selftest();
else if (command === 'import-local') { await build(); runWrangler(localArgs(sqlPath)); console.log('IMPORT_LOCAL_STATUS=PASS'); }
else if (command === 'query-local' || command === 'verify-local') { await queryLocal(); console.log('VERIFY_LOCAL_STATUS=PASS'); }
else if (command === 'replay-local') { await build(); runWrangler(localArgs(sqlPath)); const out=await queryLocal(); if (!out.includes('INVALID_OPERATION_REFS') || !out.includes('INVALID_ITEM_GROUP_MAPPINGS')) throw new Error('REPLAY_VERIFY_OUTPUT_MISSING'); console.log('REPLAY_LOCAL_STATUS=PASS'); }
