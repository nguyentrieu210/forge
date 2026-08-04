#!/usr/bin/env python3
"""Bounded local SQLite query-shape benchmark for Forge large-data paths.

This is deliberately non-production and does not claim D1/provider latency. It uses
Forge's physical-schema shapes (documents/ledgers/job backlog) to make regressions
in query/index shape reproducible before provider evidence exists.
"""
from __future__ import annotations
import argparse, json, math, os, sqlite3, tempfile, time
from pathlib import Path


def pct(values, q):
    if not values: return 0.0
    ordered = sorted(values)
    return ordered[max(0, math.ceil(q * len(ordered)) - 1)]


def timed(fn, iterations):
    samples=[]
    for _ in range(iterations):
        start=time.perf_counter(); fn(); samples.append((time.perf_counter()-start)*1000)
    return {"p50_ms": round(pct(samples,.50),3), "p95_ms": round(pct(samples,.95),3), "p99_ms": round(pct(samples,.99),3), "min_ms": round(min(samples),3), "max_ms": round(max(samples),3)}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--rows', type=int, default=100_000)
    ap.add_argument('--iterations', type=int, default=30)
    ap.add_argument('--output')
    args=ap.parse_args()
    if not 10_000 <= args.rows <= 1_000_000: raise SystemExit('--rows must be in [10000,1000000]')
    if not 5 <= args.iterations <= 200: raise SystemExit('--iterations must be in [5,200]')

    fd, dbpath=tempfile.mkstemp(prefix='forge-a23-', suffix='.sqlite3'); os.close(fd)
    try:
        db=sqlite3.connect(dbpath)
        db.executescript('''
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY;
        CREATE TABLE documents(tenant_id TEXT NOT NULL, doc_key TEXT NOT NULL, doctype TEXT NOT NULL, name TEXT NOT NULL, owner TEXT NOT NULL, status TEXT NOT NULL, docstatus INTEGER NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, modified_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(tenant_id, doc_key));
        CREATE INDEX idx_documents_tenant_doctype_modified ON documents(tenant_id, doctype, modified_at DESC, name DESC);
        CREATE INDEX idx_documents_tenant_doctype_status_modified ON documents(tenant_id, doctype, status, modified_at DESC, name DESC);
        CREATE TABLE gl_entries(id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, posting_date TEXT NOT NULL, account TEXT NOT NULL, debit REAL NOT NULL, credit REAL NOT NULL);
        CREATE INDEX idx_gl_tenant_date_account ON gl_entries(tenant_id, posting_date, account);
        CREATE TABLE payment_ledger_entries(id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, posting_date TEXT NOT NULL, party TEXT NOT NULL, amount REAL NOT NULL);
        CREATE INDEX idx_payment_tenant_date_party ON payment_ledger_entries(tenant_id, posting_date, party);
        CREATE TABLE queue_jobs(id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL, available_at INTEGER NOT NULL, attempts INTEGER NOT NULL);
        CREATE INDEX idx_queue_tenant_status_available ON queue_jobs(tenant_id, status, available_at);
        CREATE TABLE batch_sink(tenant_id TEXT NOT NULL, item_key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(tenant_id,item_key));
        ''')
        docs=[]; gl=[]; payments=[]; jobs=[]
        for i in range(args.rows):
            tenant=f't{(i%10):02d}'; dt=('Sales Invoice' if i%4==0 else 'Sales Order'); status=('Submitted' if i%3 else 'Draft')
            stamp=f'2026-07-{(i%28)+1:02d}T{(i%24):02d}:{(i%60):02d}:00Z'
            docs.append((tenant,f'{dt}:{i:09d}',dt,f'DOC-{i:09d}',f'user{i%200}@example.invalid',status,1 if status=='Submitted' else 0,1,stamp,stamp,json.dumps({'customer':f'CUST-{i%5000:05d}','company':'ACME','grand_total':str((i%100000)+100)})))
            gl.append((i+1,tenant,f'2026-07-{(i%28)+1:02d}',f'ACC-{i%200:03d}',float(i%1000),float((i*7)%900)))
            payments.append((i+1,tenant,f'2026-07-{(i%28)+1:02d}',f'CUST-{i%5000:05d}',float((i%700)-350)))
            jobs.append((i+1,tenant,'pending' if i%5 else 'done',1_700_000_000+(i%100000),i%4))
            if len(docs)>=5000:
                db.executemany('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)',docs); db.executemany('INSERT INTO gl_entries VALUES(?,?,?,?,?,?)',gl); db.executemany('INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?)',payments); db.executemany('INSERT INTO queue_jobs VALUES(?,?,?,?,?)',jobs); docs.clear();gl.clear();payments.clear();jobs.clear()
        if docs:
            db.executemany('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)',docs); db.executemany('INSERT INTO gl_entries VALUES(?,?,?,?,?,?)',gl); db.executemany('INSERT INTO payment_ledger_entries VALUES(?,?,?,?,?)',payments); db.executemany('INSERT INTO queue_jobs VALUES(?,?,?,?,?)',jobs)
        db.commit(); db.execute('ANALYZE')

        scenarios={
          'document_list_50': ("SELECT name,status,docstatus,version,modified_at FROM documents WHERE tenant_id=? AND doctype=? ORDER BY modified_at DESC,name DESC LIMIT 50", ('t00','Sales Invoice')),
          'document_list_status_50': ("SELECT name,status,modified_at FROM documents WHERE tenant_id=? AND doctype=? AND status=? ORDER BY modified_at DESC,name DESC LIMIT 50", ('t00','Sales Invoice','Submitted')),
          'ledger_report_28d': ("SELECT account,SUM(debit),SUM(credit) FROM gl_entries WHERE tenant_id=? AND posting_date BETWEEN ? AND ? GROUP BY account ORDER BY account", ('t00','2026-07-01','2026-07-28')),
          'payment_reconciliation': ("SELECT party,SUM(amount) FROM payment_ledger_entries WHERE tenant_id=? AND posting_date BETWEEN ? AND ? GROUP BY party HAVING ABS(SUM(amount))>0 ORDER BY party LIMIT 5000", ('t00','2026-07-01','2026-07-28')),
          'queue_backlog_oldest': ("SELECT COUNT(*),MIN(available_at),MAX(attempts) FROM queue_jobs WHERE tenant_id=? AND status=? AND available_at<=?", ('t00','pending',1_700_050_000)),
        }
        results={}
        for name,(sql,params) in scenarios.items():
            plan=[row[3] for row in db.execute('EXPLAIN QUERY PLAN '+sql,params).fetchall()]
            def run(sql=sql,params=params): db.execute(sql,params).fetchall()
            run(); results[name]={**timed(run,args.iterations),'query_plan':plan}

        batch_rows=[('t00',f'item-{i:04d}',f'value-{i}') for i in range(1000)]
        def batch():
            db.execute('BEGIN'); db.executemany('INSERT OR REPLACE INTO batch_sink VALUES(?,?,?)',batch_rows); db.commit()
        results['batch_upsert_1000']={**timed(batch,max(5,min(args.iterations,30))),'query_plan':['PRIMARY KEY(tenant_id,item_key); transaction-scoped executemany']}
        evidence={"format":"forge-sqlite-large-data-benchmark/v1","measured_at":time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),"scope":"local SQLite query-shape evidence only; not D1/provider latency or customer SLO","rows_per_shape":args.rows,"iterations":args.iterations,"sqlite_version":sqlite3.sqlite_version,"results":results}
        text=json.dumps(evidence,indent=2)
        print(text)
        if args.output: Path(args.output).write_text(text+'\n',encoding='utf-8')
    finally:
        try: db.close()
        except Exception: pass
        try: os.remove(dbpath)
        except FileNotFoundError: pass

if __name__=='__main__': main()
