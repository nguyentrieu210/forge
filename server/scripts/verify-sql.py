#!/usr/bin/env python3
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
for migration in [
    root / "migrations/tenant/0001_core.sql",
    root / "migrations/tenant/0002_o2c_projections.sql",
    root / "migrations/tenant/0003_commercial_accounting.sql",
    root / "migrations/tenant/0004_frappe_platform.sql",
    root / "migrations/tenant/0005_erp_core.sql",
    root / "migrations/tenant/0006_frappe_core_beta.sql",
    root / "migrations/tenant/0007_erpnext_core.sql",
    root / "migrations/tenant/0008_erpnext_breadth.sql",
    root / "migrations/tenant/0009_business_suite.sql",
]:
    connection.executescript(migration.read_text())

HASH = "a" * 64
connection.execute("BEGIN")
connection.execute(
    "INSERT INTO mutation_guard(tenant_id,command_id,doc_key,expected_version,action,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
    ("demo", "create-1", "Sales Order:SO-1", None, "create", HASH, "2026-07-23"),
)
connection.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Sales Order:SO-1", "Sales Order", "SO-1", "Administrator", 0, "Draft", 1, "2026-07-23", "2026-07-23", "{}"),
)
connection.execute(
    "INSERT INTO mutation_receipts VALUES(?,?,?,?,?,?,?,?,?)",
    ("demo", "create-1", "Administrator", "Sales Order", "SO-1", 1, HASH, "2026-07-23", "{}"),
)
connection.execute("DELETE FROM mutation_guard WHERE tenant_id=? AND command_id=?", ("demo", "create-1"))
connection.commit()

try:
    connection.execute("BEGIN")
    connection.execute(
        "INSERT INTO mutation_guard(tenant_id,command_id,doc_key,expected_version,action,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
        ("demo", "stale-1", "Sales Order:SO-1", 0, "save", HASH, "2026-07-23"),
    )
    connection.execute("UPDATE documents SET status='BROKEN'")
    connection.commit()
    raise AssertionError("stale guard did not abort")
except sqlite3.DatabaseError as error:
    connection.rollback()
    assert "VERSION_CONFLICT" in str(error)
assert connection.execute("SELECT status FROM documents").fetchone()[0] == "Draft"

try:
    connection.execute("BEGIN")
    connection.execute(
        "INSERT INTO mutation_guard(tenant_id,command_id,doc_key,expected_version,action,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
        ("demo", "cancel-draft", "Sales Order:SO-1", 1, "cancel", HASH, "2026-07-23"),
    )
    connection.commit()
    raise AssertionError("cancel draft guard did not abort")
except sqlite3.DatabaseError as error:
    connection.rollback()
    assert "INVALID_LIFECYCLE_TRANSITION" in str(error)

connection.execute(
    "INSERT INTO gl_entries(tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,debit_minor,credit_minor,currency,currency_scale,dimensions_json,posting_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "JV", "JV-1", 1, "D", "Cash", 100, 0, "USD", 2, "{}", "2026-07-23"),
)
assert connection.execute("SELECT typeof(debit_minor) FROM gl_entries").fetchone()[0] == "integer"
assert connection.execute("SELECT COUNT(*) FROM mutation_guard").fetchone()[0] == 0

# Database-level cross-aggregate constraints.
connection.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Sales Order:SO-LIMIT", "Sales Order", "SO-LIMIT", "Administrator", 1, "To Deliver and Bill", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":10000}'),
)
connection.execute(
    "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
    ("demo", "Sales Order:SO-LIMIT", "items", "Sales Order Item", "ROW-1", 1, '{"item_code":"ITEM-1","qty_micros":10000000}'),
)
connection.execute(
    "INSERT INTO sales_order_fulfillment_entries VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Delivery Note", "DN-1", 2, "ITEM", "SO-LIMIT", "Delivery", "ITEM-1", 6000000, "2026-07-23"),
)
try:
    connection.execute(
        "INSERT INTO sales_order_fulfillment_entries VALUES(?,?,?,?,?,?,?,?,?,?)",
        ("demo", "Delivery Note", "DN-2", 2, "ITEM", "SO-LIMIT", "Delivery", "ITEM-1", 5000000, "2026-07-23"),
    )
    raise AssertionError("fulfillment limit trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "REFERENCE_QUANTITY_EXCEEDED" in str(error)

connection.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Sales Invoice:SI-LIMIT", "Sales Invoice", "SI-LIMIT", "Administrator", 1, "Submitted", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":10000}'),
)
connection.execute(
    """INSERT INTO payment_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    ("demo", "Sales Invoice", "SI-LIMIT", 2, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 10000, "USD", 2, "Sales Invoice", "SI-LIMIT", "2026-07-23", 10000),
)
try:
    connection.execute(
        """INSERT INTO payment_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Payment Entry", "PE-LIMIT", 2, "ALLOC", "Receivable", "Customer", "CUST-1", "Debtors", -10001, "USD", 2, "Sales Invoice", "SI-LIMIT", "2026-07-23", -10001),
    )
    raise AssertionError("outstanding trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "OUTSTANDING_EXCEEDED" in str(error)

# Company-currency outstanding is an independent database invariant.
connection.execute(
    """INSERT INTO payment_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    ("demo", "Sales Invoice", "SI-BASE", 2, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 100, "EUR", 2, "Sales Invoice", "SI-BASE", "2026-07-23", 125),
)
try:
    connection.execute(
        """INSERT INTO payment_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Payment Entry", "PE-BASE", 2, "ALLOC", "Receivable", "Customer", "CUST-1", "Debtors", -100, "EUR", 2, "Sales Invoice", "SI-BASE", "2026-07-23", -126),
    )
    raise AssertionError("base outstanding trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "BASE_OUTSTANDING_EXCEEDED" in str(error)

row = connection.execute(
    "SELECT outstanding_minor, base_outstanding_minor FROM receivable_outstanding WHERE tenant_id='demo' AND against_voucher_no='SI-BASE'"
).fetchone()
assert row == (100, 125), row

for table, columns in {
    "gl_entries": ["debit_minor", "credit_minor"],
    "stock_ledger_entries": ["actual_qty_micros", "valuation_rate_minor", "stock_value_difference_minor"],
    "payment_ledger_entries": ["amount_minor", "base_amount_minor"],
}.items():
    declared = {row[1]: row[2].upper() for row in connection.execute(f"PRAGMA table_info({table})")}
    for column in columns:
        assert declared[column] == "INTEGER", (table, column, declared[column])


# Frappe-platform and ERP-core schema assertions.
for table in [
    "doctype_definitions", "workflows", "naming_series", "document_comments",
    "assignments", "document_shares", "files", "print_formats", "import_jobs",
    "notification_rules", "purchase_order_progress_entries", "user_permissions",
]:
    assert connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone(), table

assert connection.execute("SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='demo'").fetchone()[0] >= 14
assert connection.execute("SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='__standard__'").fetchone()[0] == connection.execute("SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='demo'").fetchone()[0]
assert connection.execute("SELECT COUNT(*) FROM print_formats WHERE tenant_id='demo'").fetchone()[0] >= 1
for view in ["payable_outstanding", "general_ledger_report", "trial_balance", "asset_lifecycle_report", "project_profitability", "pos_session_summary", "profit_and_loss", "balance_sheet", "cash_flow", "bank_reconciliation_summary", "payroll_register", "subscription_schedule", "e_invoice_submission_log"]:
    assert connection.execute("SELECT 1 FROM sqlite_master WHERE type='view' AND name=?", (view,)).fetchone(), view
for table in ["asset_lifecycle_entries", "project_time_entries", "pos_sales_entries", "bank_reconciliation_entries"]:
    assert connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone(), table
assert connection.execute("SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='demo'").fetchone()[0] >= 55

# Procurement progress is guarded at commit time, like O2C fulfillment.
connection.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Purchase Order:PO-LIMIT", "Purchase Order", "PO-LIMIT", "Administrator", 1, "To Receive and Bill", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":10000}'),
)
connection.execute(
    "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
    ("demo", "Purchase Order:PO-LIMIT", "items", "Purchase Order Item", "ROW-1", 1, '{"item_code":"ITEM-1","qty_micros":10000000}'),
)
connection.execute(
    "INSERT INTO purchase_order_progress_entries VALUES(?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Purchase Receipt", "PR-1", 2, "ITEM", "PO-LIMIT", "Receipt", "ITEM-1", 6000000, "2026-07-23"),
)
try:
    connection.execute(
        "INSERT INTO purchase_order_progress_entries VALUES(?,?,?,?,?,?,?,?,?,?)",
        ("demo", "Purchase Receipt", "PR-2", 2, "ITEM", "PO-LIMIT", "Receipt", "ITEM-1", 5000000, "2026-07-23"),
    )
    raise AssertionError("procurement limit trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "REFERENCE_QUANTITY_EXCEEDED" in str(error)

# Payable transaction/base outstanding are independently guarded.
connection.execute(
    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ("demo", "Purchase Invoice:PI-LIMIT", "Purchase Invoice", "PI-LIMIT", "Administrator", 1, "Unpaid", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":10000}'),
)
connection.execute(
    """INSERT INTO payment_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    ("demo", "Purchase Invoice", "PI-LIMIT", 2, "PAYABLE", "Payable", "Supplier", "SUP-1", "Creditors", 10000, "USD", 2, "Purchase Invoice", "PI-LIMIT", "2026-07-23", 10000),
)
try:
    connection.execute(
        """INSERT INTO payment_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Payment Entry", "PE-PAY", 2, "ALLOC", "Payable", "Supplier", "SUP-1", "Creditors", -10001, "USD", 2, "Purchase Invoice", "PI-LIMIT", "2026-07-23", -10001),
    )
    raise AssertionError("payable outstanding trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "OUTSTANDING_EXCEEDED" in str(error)

# Permission V2 schema is tenant/user/applicable-doctype scoped.
connection.execute(
    "INSERT INTO user_permissions(tenant_id,user,allow_doctype,allow_name,applicable_for_doctype,is_default,hide_descendants,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ("demo", "user@example.com", "Company", "Demo", "Sales Order", 1, 0, "Administrator", "2026-07-25"),
)
assert connection.execute("SELECT allow_name FROM user_permissions WHERE tenant_id='demo' AND user='user@example.com'").fetchone()[0] == "Demo"


# ERPNext-core schema and commit-time invariants.
for table in [
    "stock_bundle_usage_entries", "return_progress_entries",
    "manufacturing_progress_entries", "asset_depreciation_entries",
]:
    assert connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone(), table
for view in ["batch_stock_balance", "serial_stock_state", "asset_depreciation_balance"]:
    assert connection.execute("SELECT 1 FROM sqlite_master WHERE type='view' AND name=?", (view,)).fetchone(), view

# A Serial/Batch Bundle is single-use while active, but cancellation releases it for deterministic reuse.
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Serial and Batch Bundle:BUNDLE-SQL","Serial and Batch Bundle","BUNDLE-SQL","Administrator",1,"Submitted",2,"2026-07-25","2026-07-25",'{"item_code":"SERIAL-ITEM","warehouse":"Stores","type":"Inward"}'))
connection.execute("INSERT INTO stock_bundle_usage_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Stock Entry","STE-BUNDLE-1",2,"USE","BUNDLE-SQL","SERIAL-ITEM","Stores","Inward",1,"2026-07-25"))
try:
    connection.execute("INSERT INTO stock_bundle_usage_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Stock Entry","STE-BUNDLE-2",2,"USE","BUNDLE-SQL","SERIAL-ITEM","Stores","Inward",1,"2026-07-25"))
    raise AssertionError("active bundle duplicate trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "SERIAL_BATCH_BUNDLE_USAGE_INVALID" in str(error)
connection.execute("INSERT INTO stock_bundle_usage_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Stock Entry","STE-BUNDLE-1",3,"REV-USE","BUNDLE-SQL","SERIAL-ITEM","Stores","Inward",-1,"2026-07-25"))
try:
    connection.execute("INSERT INTO stock_bundle_usage_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Stock Entry","STE-BUNDLE-1",4,"REV-USE-2","BUNDLE-SQL","SERIAL-ITEM","Stores","Inward",-1,"2026-07-25"))
    raise AssertionError("bundle over-reversal trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "SERIAL_BATCH_BUNDLE_USAGE_INVALID" in str(error)
connection.execute("INSERT INTO stock_bundle_usage_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Stock Entry","STE-BUNDLE-3",2,"USE","BUNDLE-SQL","SERIAL-ITEM","Stores","Inward",1,"2026-07-25"))
assert connection.execute("SELECT SUM(usage_delta) FROM stock_bundle_usage_entries WHERE tenant_id='demo' AND bundle_name='BUNDLE-SQL'").fetchone()[0] == 1

# Serial state is globally 0/1 unit, irrespective of the generic negative-stock flag.
serial_row = ("demo", "Stock Entry", "SERIAL-IN", 2, "SERIAL", "SERIAL-ITEM", "Stores", 1000000, 5000, 5000, 6, 2, "USD", "2026-07-25", "SN-1")
connection.execute("""INSERT INTO stock_ledger_entries
(tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,serial_no)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", serial_row)
try:
    connection.execute("""INSERT INTO stock_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,serial_no)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", ("demo","Stock Entry","SERIAL-DUP",2,"SERIAL","SERIAL-ITEM","Stores",1000000,5000,5000,6,2,"USD","2026-07-25","SN-1"))
    raise AssertionError("serial uniqueness trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "SERIAL_STOCK_STATE_INVALID" in str(error)

connection.execute("""INSERT INTO stock_ledger_entries
(tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,batch_no)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", ("demo","Stock Entry","BATCH-IN",2,"BATCH","BATCH-ITEM","Stores",5000000,100,500,6,2,"USD","2026-07-25","B-1"))
try:
    connection.execute("""INSERT INTO stock_ledger_entries
    (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at,batch_no)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", ("demo","Stock Entry","BATCH-OUT",2,"BATCH","BATCH-ITEM","Stores",-6000000,100,-600,6,2,"USD","2026-07-25","B-1"))
    raise AssertionError("batch negative trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "BATCH_NEGATIVE_STOCK" in str(error)

connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Sales Invoice:SI-RETURN","Sales Invoice","SI-RETURN","Administrator",1,"Unpaid",2,"2026-07-25","2026-07-25",'{"grand_total_minor":10000}'))
connection.execute("INSERT INTO document_children VALUES(?,?,?,?,?,?,?)", ("demo","Sales Invoice:SI-RETURN","items","Sales Invoice Item","1",1,'{"item_code":"ITEM-R","qty_micros":10000000}'))
connection.execute("INSERT INTO return_progress_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Credit Note","CN-1",2,"1","Sales Invoice","SI-RETURN","Sales Credit","ITEM-R",6000000,"2026-07-25"))
try:
    connection.execute("INSERT INTO return_progress_entries VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Credit Note","CN-2",2,"1","Sales Invoice","SI-RETURN","Sales Credit","ITEM-R",5000000,"2026-07-25"))
    raise AssertionError("return quantity trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "RETURN_QUANTITY_EXCEEDED" in str(error)

connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Work Order:WO-1","Work Order","WO-1","Administrator",1,"Not Started",2,"2026-07-25","2026-07-25",'{"qty_micros":5000000}'))
connection.execute("INSERT INTO document_children VALUES(?,?,?,?,?,?,?)", ("demo","Work Order:WO-1","required_items","Work Order Required Item","1",1,'{"item_code":"RAW","required_qty_micros":10000000}'))
try:
    connection.execute("INSERT INTO manufacturing_progress_entries VALUES(?,?,?,?,?,?,?,?,?,?)", ("demo","Stock Entry","MFG-OVER",2,"1","WO-1","Manufacture","FG",6000000,"2026-07-25"))
    raise AssertionError("manufacturing limit trigger did not abort")
except sqlite3.DatabaseError as error:
    assert "WORK_ORDER_OVER_PRODUCTION" in str(error)

connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Asset:A-1","Asset","A-1","Administrator",1,"Active",2,"2026-07-25","2026-07-25",'{"gross_purchase_amount_minor":100000,"salvage_value_minor":10000}'))
connection.execute("INSERT INTO asset_depreciation_entries VALUES(?,?,?,?,?,?,?,?,?,?)", ("demo","Asset Depreciation Entry","DEP-1",2,"1","A-1",90000,"USD",2,"2026-07-25"))
try:
    connection.execute("INSERT INTO asset_depreciation_entries VALUES(?,?,?,?,?,?,?,?,?,?)", ("demo","Asset Depreciation Entry","DEP-2",2,"1","A-1",1,"USD",2,"2026-07-25"))
    raise AssertionError("asset depreciation cap did not abort")
except sqlite3.DatabaseError as error:
    assert "ASSET_DEPRECIATION_EXCEEDED" in str(error)

# Job Card completion and POS session state are protected at commit time.
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Work Order:WO-JC","Work Order","WO-JC","Administrator",1,"In Process",2,"2026-07-25","2026-07-25",'{"qty_micros":5000000}'))
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Job Card:JC-SQL-1","Job Card","JC-SQL-1","Administrator",1,"Completed",2,"2026-07-25","2026-07-25",'{"work_order":"WO-JC","completed_qty_micros":3000000}'))
try:
    connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Job Card:JC-SQL-2","Job Card","JC-SQL-2","Administrator",1,"Completed",2,"2026-07-25","2026-07-25",'{"work_order":"WO-JC","completed_qty_micros":3000000}'))
    raise AssertionError("job card cumulative completion guard did not abort")
except sqlite3.DatabaseError as error:
    assert "JOB_CARD_OVER_COMPLETION" in str(error)

connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","POS Opening Entry:POS-OPEN-SQL-1","POS Opening Entry","POS-OPEN-SQL-1","Administrator",1,"Open",2,"2026-07-25","2026-07-25",'{"pos_profile":"MAIN"}'))
try:
    connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","POS Opening Entry:POS-OPEN-SQL-2","POS Opening Entry","POS-OPEN-SQL-2","Administrator",1,"Open",2,"2026-07-25","2026-07-25",'{"pos_profile":"MAIN"}'))
    raise AssertionError("POS open-session uniqueness guard did not abort")
except sqlite3.DatabaseError as error:
    assert "POS_PROFILE_ALREADY_OPEN" in str(error)
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","POS Closing Entry:POS-CLOSE-SQL-1","POS Closing Entry","POS-CLOSE-SQL-1","Administrator",1,"Closed",2,"2026-07-25","2026-07-25",'{"opening_entry":"POS-OPEN-SQL-1"}'))
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","POS Opening Entry:POS-OPEN-SQL-2","POS Opening Entry","POS-OPEN-SQL-2","Administrator",1,"Open",2,"2026-07-25","2026-07-25",'{"pos_profile":"MAIN"}'))

# v0.9 breadth invariants.
connection.execute("INSERT INTO asset_lifecycle_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Asset Disposal","AD-1",2,"DISPOSAL","ASSET-1","Disposal","2026-07-25",None,None,100,"USD",2))
try:
    connection.execute("INSERT INTO asset_lifecycle_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Asset Disposal","AD-2",2,"DISPOSAL","ASSET-1","Disposal","2026-07-25",None,None,100,"USD",2))
    raise AssertionError("asset disposal guard did not abort")
except sqlite3.DatabaseError as error:
    assert "ASSET_DISPOSAL_STATE_INVALID" in str(error)
connection.execute("INSERT INTO project_time_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Timesheet","TS-1",2,"TIME","PROJ-1",None,1000000,100,200,"USD",2,"2026-07-25"))
try:
    connection.execute("INSERT INTO project_time_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Timesheet","TS-1",3,"REV","PROJ-1",None,-2000000,-100,-200,"USD",2,"2026-07-25"))
    raise AssertionError("project time guard did not abort")
except sqlite3.DatabaseError as error:
    assert "PROJECT_TIME_NEGATIVE" in str(error)


# v1.0 business-suite database invariants.
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Bank Transaction:BT-SQL","Bank Transaction","BT-SQL","Administrator",1,"Unreconciled",2,"2026-07-26","2026-07-26",'{"amount_minor":10000,"currency":"USD"}'))
connection.execute("INSERT INTO bank_reconciliation_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Bank Reconciliation","BREC-SQL-1",2,"1","MAIN-BANK","BT-SQL","Payment Entry","PE-1",6000,"USD",2,"2026-07-26"))
try:
    connection.execute("INSERT INTO bank_reconciliation_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Bank Reconciliation","BREC-SQL-2",2,"1","MAIN-BANK","BT-SQL","Payment Entry","PE-2",5000,"USD",2,"2026-07-26"))
    raise AssertionError("bank reconciliation allocation guard did not abort")
except sqlite3.DatabaseError as error:
    assert "BANK_RECONCILIATION_OVER_ALLOCATED" in str(error)
connection.execute("INSERT INTO bank_reconciliation_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Bank Reconciliation","BREC-SQL-1",3,"REV-1","MAIN-BANK","BT-SQL","Payment Entry","PE-1",-6000,"USD",2,"2026-07-26"))
try:
    connection.execute("INSERT INTO bank_reconciliation_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", ("demo","Bank Reconciliation","BREC-SQL-1",4,"REV-2","MAIN-BANK","BT-SQL","Payment Entry","PE-1",-1,"USD",2,"2026-07-26"))
    raise AssertionError("bank reconciliation negative guard did not abort")
except sqlite3.DatabaseError as error:
    assert "BANK_RECONCILIATION_NEGATIVE" in str(error)

connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Salary Slip:SS-SQL","Salary Slip","SS-SQL","Administrator",1,"Unpaid",2,"2026-07-26","2026-07-26",'{"employee":"EMP-1","net_pay_minor":10000}'))
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Payroll Entry:PAY-SQL-1","Payroll Entry","PAY-SQL-1","Administrator",1,"Submitted",2,"2026-07-26","2026-07-26",'{}'))
connection.execute("INSERT INTO document_children VALUES(?,?,?,?,?,?,?)", ("demo","Payroll Entry:PAY-SQL-1","salary_slips","Payroll Entry Salary Slip","1",1,'{"salary_slip":"SS-SQL"}'))
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Payroll Entry:PAY-SQL-2","Payroll Entry","PAY-SQL-2","Administrator",1,"Submitted",2,"2026-07-26","2026-07-26",'{}'))
try:
    connection.execute("INSERT INTO document_children VALUES(?,?,?,?,?,?,?)", ("demo","Payroll Entry:PAY-SQL-2","salary_slips","Payroll Entry Salary Slip","1",1,'{"salary_slip":"SS-SQL"}'))
    raise AssertionError("salary slip payroll uniqueness guard did not abort")
except sqlite3.DatabaseError as error:
    assert "SALARY_SLIP_ALREADY_IN_PAYROLL" in str(error)

connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","Sales Invoice:SI-EINV","Sales Invoice","SI-EINV","Administrator",1,"Unpaid",2,"2026-07-26","2026-07-26",'{"company":"Demo"}'))
connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","E-Invoice Submission:EINV-SQL-1","E-Invoice Submission","EINV-SQL-1","Administrator",1,"Queued",2,"2026-07-26","2026-07-26",'{"source_doctype":"Sales Invoice","source_name":"SI-EINV"}'))
try:
    connection.execute("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)", ("demo","E-Invoice Submission:EINV-SQL-2","E-Invoice Submission","EINV-SQL-2","Administrator",1,"Queued",2,"2026-07-26","2026-07-26",'{"source_doctype":"Sales Invoice","source_name":"SI-EINV"}'))
    raise AssertionError("e-invoice uniqueness guard did not abort")
except sqlite3.DatabaseError as error:
    assert "E_INVOICE_ALREADY_SUBMITTED" in str(error)

print("FRAPPE_PLATFORM_AND_ERP_CORE_SCHEMA_PASS")

print("SQLITE_SCHEMA_TRIGGER_FIXED_POINT_AND_REFERENCE_GUARDS_PASS")
