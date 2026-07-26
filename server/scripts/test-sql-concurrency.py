#!/usr/bin/env python3
import concurrent.futures
import sqlite3
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
HASH = "b" * 64

with tempfile.TemporaryDirectory() as directory:
    database_path = Path(directory) / "cloudforge.sqlite"
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA journal_mode=WAL")
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
    ]:
        connection.executescript(migration.read_text())
    connection.execute(
        "INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", "Sales Order:SO-RACE", "Sales Order", "SO-RACE", "Administrator", 0, "Draft", 1, "2026-07-23", "2026-07-23", "{}"),
    )
    connection.commit()
    connection.close()

    def update(index: int):
        db = sqlite3.connect(database_path, timeout=30, isolation_level=None)
        db.execute("PRAGMA foreign_keys=ON")
        command = f"save-{index}"
        try:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "INSERT INTO mutation_guard(tenant_id,command_id,doc_key,expected_version,action,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
                ("demo", command, "Sales Order:SO-RACE", 1, "save", HASH, "2026-07-23"),
            )
            db.execute(
                "UPDATE documents SET version=2, modified_at=?, status='Draft' WHERE tenant_id=? AND doc_key=? AND version=1",
                ("2026-07-23", "demo", "Sales Order:SO-RACE"),
            )
            db.execute(
                "INSERT INTO mutation_receipts VALUES(?,?,?,?,?,?,?,?,?)",
                ("demo", command, "Administrator", "Sales Order", "SO-RACE", 2, HASH, "2026-07-23", "{}"),
            )
            db.execute("DELETE FROM mutation_guard WHERE tenant_id=? AND command_id=?", ("demo", command))
            db.execute("COMMIT")
            return "won"
        except sqlite3.DatabaseError as error:
            try:
                db.execute("ROLLBACK")
            except sqlite3.DatabaseError:
                pass
            return str(error)
        finally:
            db.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=40) as executor:
        results = list(executor.map(update, range(100)))
    assert results.count("won") == 1, results
    assert sum("VERSION_CONFLICT" in result for result in results) == 99, results

    db = sqlite3.connect(database_path)
    assert db.execute("SELECT version FROM documents WHERE doc_key='Sales Order:SO-RACE'").fetchone()[0] == 2
    assert db.execute("SELECT COUNT(*) FROM mutation_guard").fetchone()[0] == 0

    try:
        db.execute("BEGIN")
        db.execute(
            "INSERT INTO mutation_guard(tenant_id,command_id,doc_key,expected_version,action,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
            ("demo", "submit-bad-gl", "Sales Order:SO-RACE", 2, "submit", HASH, "2026-07-23"),
        )
        db.execute("UPDATE documents SET version=3, docstatus=1, status='Submitted' WHERE doc_key='Sales Order:SO-RACE'")
        db.execute(
            "INSERT INTO gl_entries(tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account,debit_minor,credit_minor,currency,currency_scale,dimensions_json,posting_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            ("demo", "Sales Order", "SO-RACE", 3, "BROKEN", "Cash", 100, 100, "USD", 2, "{}", "2026-07-23"),
        )
        db.execute("COMMIT")
        raise AssertionError("invalid GL did not rollback")
    except sqlite3.DatabaseError:
        db.execute("ROLLBACK")
    row = db.execute("SELECT version,docstatus,status FROM documents WHERE doc_key='Sales Order:SO-RACE'").fetchone()
    assert row == (2, 0, "Draft"), row
    assert db.execute("SELECT COUNT(*) FROM mutation_guard").fetchone()[0] == 0

    # Cross-aggregate fulfillment race: distinct Delivery Notes may both pass an
    # application precheck, but only one 6/10 quantity reservation may commit.
    db.execute(
        "INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", "Sales Order:SO-FULFILL", "Sales Order", "SO-FULFILL", "Administrator", 1, "To Deliver and Bill", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":10000}'),
    )
    db.execute(
        "INSERT INTO document_children VALUES(?,?,?,?,?,?,?)",
        ("demo", "Sales Order:SO-FULFILL", "items", "Sales Order Item", "ROW-1", 1, '{"item_code":"ITEM-001","qty_micros":10000000}'),
    )
    db.commit()

    def fulfill(index: int):
        connection = sqlite3.connect(database_path, timeout=30, isolation_level=None)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT INTO sales_order_fulfillment_entries VALUES(?,?,?,?,?,?,?,?,?,?)",
                ("demo", "Delivery Note", f"DN-{index}", 2, "ITEM-1", "SO-FULFILL", "Delivery", "ITEM-001", 6000000, "2026-07-23"),
            )
            connection.execute("COMMIT")
            return "won"
        except sqlite3.DatabaseError as error:
            try: connection.execute("ROLLBACK")
            except sqlite3.DatabaseError: pass
            return str(error)
        finally:
            connection.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        fulfillment_results = list(executor.map(fulfill, range(2)))
    assert fulfillment_results.count("won") == 1, fulfillment_results
    assert sum("REFERENCE_QUANTITY_EXCEEDED" in result for result in fulfillment_results) == 1, fulfillment_results
    assert db.execute("SELECT SUM(qty_micros) FROM sales_order_fulfillment_entries WHERE sales_order='SO-FULFILL'").fetchone()[0] == 6000000

    # Cross-aggregate payment race: only one 60/100 allocation may commit.
    db.execute(
        "INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", "Sales Invoice:SI-PAY-RACE", "Sales Invoice", "SI-PAY-RACE", "Administrator", 1, "Submitted", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":10000}'),
    )
    db.execute(
        """INSERT INTO payment_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Sales Invoice", "SI-PAY-RACE", 2, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 10000, "USD", 2, "Sales Invoice", "SI-PAY-RACE", "2026-07-23", 10000),
    )
    db.commit()

    def allocate(index: int):
        connection = sqlite3.connect(database_path, timeout=30, isolation_level=None)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """INSERT INTO payment_ledger_entries
                (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("demo", "Payment Entry", f"PE-{index}", 2, "ALLOC", "Receivable", "Customer", "CUST-1", "Debtors", -6000, "USD", 2, "Sales Invoice", "SI-PAY-RACE", "2026-07-23", -6000),
            )
            connection.execute("COMMIT")
            return "won"
        except sqlite3.DatabaseError as error:
            try: connection.execute("ROLLBACK")
            except sqlite3.DatabaseError: pass
            return str(error)
        finally:
            connection.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        payment_results = list(executor.map(allocate, range(2)))
    assert payment_results.count("won") == 1, payment_results
    assert sum("OUTSTANDING_EXCEEDED" in result for result in payment_results) == 1, payment_results
    assert db.execute("SELECT SUM(amount_minor) FROM payment_ledger_entries WHERE against_voucher_no='SI-PAY-RACE'").fetchone()[0] == 4000
    assert db.execute("SELECT SUM(base_amount_minor) FROM payment_ledger_entries WHERE against_voucher_no='SI-PAY-RACE'").fetchone()[0] == 4000

    # Cross-aggregate base-currency race: transaction outstanding may still be
    # non-negative while rounded company-currency allocations would over-clear.
    db.execute(
        "INSERT INTO documents(tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ("demo", "Sales Invoice:SI-BASE-RACE", "Sales Invoice", "SI-BASE-RACE", "Administrator", 1, "Submitted", 2, "2026-07-23", "2026-07-23", '{"grand_total_minor":100,"base_grand_total_minor":125}'),
    )
    db.execute(
        """INSERT INTO payment_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Sales Invoice", "SI-BASE-RACE", 2, "RECEIVABLE", "Receivable", "Customer", "CUST-1", "Debtors", 100, "EUR", 2, "Sales Invoice", "SI-BASE-RACE", "2026-07-23", 125),
    )
    db.commit()

    def allocate_base(index: int):
        connection = sqlite3.connect(database_path, timeout=30, isolation_level=None)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """INSERT INTO payment_ledger_entries
                (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,account_type,party_type,party,account,amount_minor,currency,currency_scale,against_voucher_type,against_voucher_no,posting_at,base_amount_minor)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("demo", "Payment Entry", f"PE-BASE-{index}", 2, "ALLOC", "Receivable", "Customer", "CUST-1", "Debtors", -50, "EUR", 2, "Sales Invoice", "SI-BASE-RACE", "2026-07-23", -70),
            )
            connection.execute("COMMIT")
            return "won"
        except sqlite3.DatabaseError as error:
            try: connection.execute("ROLLBACK")
            except sqlite3.DatabaseError: pass
            return str(error)
        finally:
            connection.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        base_results = list(executor.map(allocate_base, range(2)))
    assert base_results.count("won") == 1, base_results
    assert sum("BASE_OUTSTANDING_EXCEEDED" in result for result in base_results) == 1, base_results
    assert db.execute("SELECT SUM(amount_minor) FROM payment_ledger_entries WHERE against_voucher_no='SI-BASE-RACE'").fetchone()[0] == 50
    assert db.execute("SELECT SUM(base_amount_minor) FROM payment_ledger_entries WHERE against_voucher_no='SI-BASE-RACE'").fetchone()[0] == 55

    # Cross-aggregate stock race: two different source documents cannot both
    # consume 60 units from the same 100-unit warehouse balance.
    db.execute(
        """INSERT INTO stock_ledger_entries
        (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        ("demo", "Stock Reconciliation", "OPENING", 1, "ITEM", "ITEM-STOCK", "Stores", 100000000, 100, 0, 6, 2, "USD", "2026-07-23"),
    )
    db.commit()

    def consume_stock(index: int):
        connection = sqlite3.connect(database_path, timeout=30, isolation_level=None)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """INSERT INTO stock_ledger_entries
                (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("demo", "Delivery Note", f"DN-STOCK-{index}", 2, "ITEM", "ITEM-STOCK", "Stores", -60000000, 100, -6000, 6, 2, "USD", "2026-07-23"),
            )
            connection.execute("COMMIT")
            return "won"
        except sqlite3.DatabaseError as error:
            try: connection.execute("ROLLBACK")
            except sqlite3.DatabaseError: pass
            return str(error)
        finally:
            connection.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        stock_results = list(executor.map(consume_stock, range(2)))
    assert stock_results.count("won") == 1, stock_results
    assert sum("NEGATIVE_STOCK" in result for result in stock_results) == 1, stock_results
    assert db.execute("SELECT SUM(actual_qty_micros) FROM stock_ledger_entries WHERE item_code='ITEM-STOCK' AND warehouse='Stores'").fetchone()[0] == 40000000

    # Cancellation guards are database invariants, not only controller checks.
    for command_id, doc_key, expected_error in [
        ("cancel-so-active", "Sales Order:SO-FULFILL", "ACTIVE_FULFILLMENT_EXISTS"),
        ("cancel-si-active", "Sales Invoice:SI-PAY-RACE", "ACTIVE_PAYMENT_ALLOCATIONS"),
    ]:
        try:
            db.execute("BEGIN")
            db.execute(
                "INSERT INTO mutation_guard(tenant_id,command_id,doc_key,expected_version,action,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)",
                ("demo", command_id, doc_key, 2, "cancel", HASH, "2026-07-23"),
            )
            db.execute("COMMIT")
            raise AssertionError(f"{expected_error} guard did not abort")
        except sqlite3.DatabaseError as error:
            db.execute("ROLLBACK")
            assert expected_error in str(error), error

    db.close()

print("SQLITE_100_WAY_AND_CROSS_AGGREGATE_RACES_PASS")
