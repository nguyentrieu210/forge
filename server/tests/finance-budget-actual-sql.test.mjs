import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FinanceClosureQueryCompiler } from '../dist/packages/query/src/finance-closure.js';

// Execute the production compiler's SQL, including correlated scope predicates.
// Python SQLite is also used by the existing migration gates; no mock SQL evaluator.
const execute = String.raw`
import sys,json,sqlite3
v=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.executescript('''
CREATE TABLE documents(tenant_id TEXT,doctype TEXT,name TEXT,docstatus INTEGER,payload_json TEXT);
CREATE TABLE master_records(tenant_id TEXT,record_type TEXT,name TEXT,data_json TEXT,disabled INTEGER);
CREATE TABLE gl_entries(tenant_id TEXT,voucher_type TEXT,voucher_no TEXT,voucher_revision INTEGER,line_key TEXT,account TEXT,posting_at TEXT,debit_minor INTEGER,credit_minor INTEGER,currency TEXT,currency_scale INTEGER,cost_center TEXT,dimensions_json TEXT);
''')
for row in v['documents']: db.execute('INSERT INTO documents VALUES(?,?,?,?,?)',row[:4]+[json.dumps(row[4])])
for row in v['accounts']:
    db.execute('INSERT INTO master_records VALUES(?,?,?,?,?)',[row[0],'Account',row[1],json.dumps({'company':row[2],'root_type':row[3],'is_group':row[4]}),row[5] if len(row)>5 else 0])
db.executescript(v['account_view'])
for row in v['gl']: db.execute('INSERT INTO gl_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',row[:12]+[json.dumps(row[12])])
print(json.dumps([dict(r) for r in db.execute(v['sql'],v['params'])]))
`;

function fixture({ scope='Company', root='Expense', budget=1000, scale=0, currency='VND', action='Stop' }={}) {
  const input = { company:'Demo', account:'EXP', budget_against:scope, scope_key:scope+':target',
    cost_center:'CC', branch:'A', project:'P', start_date:'2026-01-01', end_date:'2026-12-31',
    currency,currency_scale:scale,budget_amount_minor:budget,control_action:action };
  return { documents:[['t','Finance Budget','BUD',1,input]], accounts:[['t','EXP','Demo',root,0]],gl:[] };
}
function document(f, type, name, data, status=1, tenant='t') { f.documents.push([tenant,type,name,status,data]); }
function ledger(f, { name='INV'+f.gl.length, debit=0, credit=0, date='2026-06-01', branch='A', project='P', costCenter='CC', currency='VND',scale=0,company='Demo',tenant='t',type='Purchase Invoice',status=1,lineKey='L1',documentData={} }={}) {
  if (!f.documents.some(r=>r[0]===tenant&&r[1]===type&&r[2]===name)) document(f,type,name,{company,branch,project,...documentData},status,tenant);
  f.gl.push([tenant,type,name,1,lineKey,'EXP',date+'T12:00:00.000Z',debit,credit,currency,scale,costCenter,{branch,project}]);
}
function report(f, date='2026-09-30', filters=[]) {
  const compiled=new FinanceClosureQueryCompiler().compile({report:'Finance Budget vs Actual',tenant_id:'t',filters:[
    {field:'as_of_date',operator:'=',value:date},{field:'company',operator:'=',value:'Demo'},...filters]});
  const account_view=readFileSync(new URL('../migrations/tenant/0152_period_close_scope_safety.sql',import.meta.url),'utf8').split('DROP TRIGGER')[0];
  const result=spawnSync('python3',['-c',execute],{input:JSON.stringify({...f,...compiled,account_view}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

test('actual SQL isolates tenant/company/dates and excludes period closing while retaining exact cancellation reversal',()=>{
  const f=fixture();
  ledger(f,{name:'CANCELLED',debit:300,status:2});
  ledger(f,{name:'CANCELLED',credit:300,status:2});
  ledger(f,{debit:200});
  ledger(f,{debit:900,tenant:'other'});
  ledger(f,{debit:800,company:'Other'});
  ledger(f,{debit:700,date:'2025-12-31'});
  ledger(f,{debit:600,date:'2026-10-01'});
  ledger(f,{credit:200,type:'Period Closing Voucher'});
  const [row]=report(f);
  assert.equal(row.actual_minor,200);
  assert.equal(row.available_minor,800);
  assert.equal(row.status,'Within Budget');
});

for (const [scope,wrong] of [['Branch',{branch:'B'}],['Cost Center',{costCenter:'Other'}],['Project',{project:'Other'}]]) {
  test('actual SQL isolates '+scope+' and reads GL dimensions',()=>{
    const f=fixture({scope}); ledger(f,{debit:100}); ledger(f,{debit:900,...wrong});
    // Removing document dimensions exercises canonical GL fallback.
    for(const row of f.documents.filter(r=>r[1]==='Purchase Invoice')) {delete row[4].branch;delete row[4].project;}
    assert.equal(report(f)[0].actual_minor,100);
  });
}

test('actual SQL applies dated revisions and net outstanding commitments only once',()=>{
  const f=fixture();ledger(f,{debit:200});
  document(f,'Finance Budget Revision','R1',{budget:'BUD',posting_date:'2026-08-01',delta_amount_minor:300});
  document(f,'Finance Budget Revision','FUTURE',{budget:'BUD',posting_date:'2026-10-01',delta_amount_minor:999});
  document(f,'Finance Budget Revision','DRAFT',{budget:'BUD',posting_date:'2026-08-01',delta_amount_minor:999},0);
  document(f,'Finance Budget Commitment','RES',{budget:'BUD',posting_date:'2026-08-01',commitment_type:'Reserve',amount_minor:500});
  document(f,'Finance Budget Commitment','REL',{budget:'BUD',posting_date:'2026-09-01',commitment_type:'Release',amount_minor:200});
  document(f,'Finance Budget Commitment','CANCEL',{budget:'BUD',posting_date:'2026-09-01',commitment_type:'Reserve',amount_minor:999},2);
  const [row]=report(f);assert.equal(row.effective_budget_minor,1300);assert.equal(row.committed_minor,300);assert.equal(row.available_minor,800);
});

test('actual SQL uses income credit sign and currency fixed point',()=>{
  const f=fixture({root:'Income',currency:'USD',scale:2,budget:10000});
  ledger(f,{credit:2500,currency:'USD',scale:2});ledger(f,{debit:500,currency:'USD',scale:2});
  const [row]=report(f);assert.equal(row.actual_minor,2000);assert.equal(row.actual_amount,20);assert.equal(row.available_amount,80);
});

test('historical disabled income account retains its credit sign in Budget vs Actual',()=>{
  const f=fixture({root:'Income'});f.accounts[0].push(1);ledger(f,{credit:200});
  const [row]=report(f);assert.equal(row.actual_minor,200);assert.equal(row.available_minor,800);
});

for(const units of [{currency:'USD',scale:2},{currency:'VND',scale:2}]) {
  test('actual SQL exposes invalid GL units '+JSON.stringify(units)+' without publishing a false balance',()=>{
    const f=fixture();ledger(f,{debit:100});ledger(f,{debit:10000,...units});
    const [row]=report(f);assert.equal(row.invalid_gl_entry_count,1);assert.equal(row.actual_minor,null);
    assert.equal(row.actual_amount,null);assert.equal(row.available_minor,null);assert.equal(row.utilization_pct,null);
    assert.equal(row.status,'Invalid GL Currency / Scale');
  });
}

test('actual SQL keeps invalid units outside selected scope from poisoning a valid budget',()=>{
  const f=fixture({scope:'Branch'});ledger(f,{debit:100});ledger(f,{debit:10000,branch:'B',currency:'USD',scale:2});
  const [row]=report(f);assert.equal(row.invalid_gl_entry_count,0);assert.equal(row.actual_minor,100);
});

test('zero budget with consumption reports exceeded and undefined utilization',()=>{
  const f=fixture({budget:0,action:'Warn'});ledger(f,{debit:1});
  const [row]=report(f);assert.equal(row.available_minor,-1);assert.equal(row.status,'Exceeded / Warn');assert.equal(row.utilization_pct,null);
});

test('actual SQL clips end date and parameterizes output filters',()=>{
  const f=fixture();ledger(f,{debit:100,date:'2026-12-31'});ledger(f,{debit:500,date:'2027-01-01'});
  const [row]=report(f,'2027-06-01');assert.equal(row.through_date,'2026-12-31');assert.equal(row.actual_minor,100);
  assert.deepEqual(report(f,'2027-06-01',[{field:'budget',operator:'=',value:"BUD' OR 1=1 --"}]),[]);
});


test('actual SQL consumes linked PO commitment as PI expense actual and restores it on reversal',()=>{
  const f=fixture({budget:1000});
  document(f,'Purchase Order','PO-AUTO',{
    company:'Demo',currency:'VND',items:[{row_id:'PO-ROW',item_code:'ITEM-1',material_request:'MR-AUTO'}]
  });
  document(f,'Finance Budget Commitment','COM-AUTO',{
    budget:'BUD',posting_date:'2026-04-01',commitment_type:'Reserve',amount_minor:1000,
    source_doctype:'Purchase Order',source_name:'PO-AUTO'
  });
  ledger(f,{
    name:'PI-AUTO',debit:600,lineKey:'EXPENSE-PI-ROW',
    documentData:{
      against_purchase_order:'PO-AUTO',
      items:[{row_id:'PI-ROW',item_code:'ITEM-1',purchase_order:'PO-AUTO',
        purchase_order_item_row_id:'PO-ROW',material_request:'MR-AUTO'}]
    }
  });
  let [row]=report(f);
  assert.equal(row.actual_minor,600);
  assert.equal(row.committed_minor,400);
  assert.equal(row.available_minor,0);

  ledger(f,{
    name:'PI-AUTO',credit:600,lineKey:'REV-EXPENSE-PI-ROW',status:2,
    documentData:{
      against_purchase_order:'PO-AUTO',
      items:[{row_id:'PI-ROW',item_code:'ITEM-1',purchase_order:'PO-AUTO',
        purchase_order_item_row_id:'PO-ROW',material_request:'MR-AUTO'}]
    }
  });
  [row]=report(f);
  assert.equal(row.actual_minor,0);
  assert.equal(row.committed_minor,1000);
  assert.equal(row.available_minor,0);
});

test('actual SQL consumes Material Request commitment only from the exact PI row lineage',()=>{
  const f=fixture({budget:1000});
  document(f,'Finance Budget Commitment','COM-MR',{
    budget:'BUD',posting_date:'2026-04-01',commitment_type:'Reserve',amount_minor:700,
    source_doctype:'Material Request',source_name:'MR-1'
  });
  ledger(f,{
    name:'PI-MULTI',debit:300,lineKey:'EXPENSE-MR-ROW',
    documentData:{items:[
      {row_id:'MR-ROW',material_request:'MR-1'},
      {row_id:'OTHER-ROW',material_request:'MR-2'}
    ]}
  });
  ledger(f,{
    name:'PI-MULTI',debit:200,lineKey:'EXPENSE-OTHER-ROW',
    documentData:{items:[
      {row_id:'MR-ROW',material_request:'MR-1'},
      {row_id:'OTHER-ROW',material_request:'MR-2'}
    ]}
  });
  const [row]=report(f);
  assert.equal(row.actual_minor,500);
  assert.equal(row.committed_minor,400);
  assert.equal(row.available_minor,100);
});
