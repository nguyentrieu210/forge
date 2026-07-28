#!/usr/bin/env python3
"""Restore a tenant export locally, apply the Alumdoor import twice, and reconcile it."""

from __future__ import annotations

import argparse
import json
import sqlite3
import tempfile
from pathlib import Path


def count_doctype(db: sqlite3.Connection, doctype: str) -> int:
    row = db.execute(
        "SELECT COUNT(*) FROM documents WHERE tenant_id='alu' AND doctype=?",
        (doctype,),
    ).fetchone()
    return int(row[0])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True)
    parser.add_argument("--import-sql", required=True)
    parser.add_argument("--audit", required=True)
    args = parser.parse_args()

    backup_path = Path(args.backup).resolve()
    import_path = Path(args.import_sql).resolve()
    audit = json.loads(Path(args.audit).read_text(encoding="utf-8"))
    expected = audit["counts"]

    with tempfile.TemporaryDirectory(prefix="forge-alumdoor-import-") as folder:
        database_path = Path(folder) / "verify.sqlite3"
        db = sqlite3.connect(database_path)
        try:
            db.executescript(backup_path.read_text(encoding="utf-8"))
            ledger_before = {
                "stock": db.execute("SELECT COUNT(*) FROM stock_ledger_entries").fetchone()[0],
                "gl": db.execute("SELECT COUNT(*) FROM gl_entries").fetchone()[0],
                "payment": db.execute("SELECT COUNT(*) FROM payment_ledger_entries").fetchone()[0],
            }
            script = import_path.read_text(encoding="utf-8")
            db.executescript(script)
            first_counts = {
                "Supplier": count_doctype(db, "Supplier"),
                "Aluminium Lot": count_doctype(db, "Aluminium Lot"),
                "Legacy Sales Order": count_doctype(db, "Legacy Sales Order"),
                "Legacy Goods Intake": count_doctype(db, "Legacy Goods Intake"),
                "Warranty Claim": count_doctype(db, "Warranty Claim"),
                "Production Standard": count_doctype(db, "Production Standard"),
            }
            db.executescript(script)
            second_counts = {doctype: count_doctype(db, doctype) for doctype in first_counts}
            if first_counts != second_counts:
                raise AssertionError(f"Import is not idempotent: {first_counts} -> {second_counts}")

            exact = {
                "Supplier": expected["suppliers"],
                "Aluminium Lot": expected["aluminium_lots"],
                "Legacy Sales Order": expected["legacy_orders"],
                "Legacy Goods Intake": expected["legacy_intakes"],
                "Warranty Claim": expected["warranty_claims"],
                "Production Standard": expected["production_standards"],
            }
            if first_counts != exact:
                raise AssertionError(f"Document counts differ: actual={first_counts}, expected={exact}")
            customers = count_doctype(db, "Customer")
            if customers < expected["customers"]:
                raise AssertionError(f"Customer count {customers} is below imported {expected['customers']}")

            lot_totals = db.execute(
                """
                SELECT
                  COUNT(*) AS lots,
                  SUM(CAST(json_extract(payload_json,'$.sheet_count') AS REAL)) AS sheets,
                  SUM(CASE WHEN json_extract(payload_json,'$.quality_status')='Phế' THEN 1 ELSE 0 END) AS scrap,
                  SUM(CASE WHEN json_extract(payload_json,'$.warehouse')<>'K36' THEN 1 ELSE 0 END) AS wrong_warehouse
                FROM documents
                WHERE tenant_id='alu' AND doctype='Aluminium Lot'
                """
            ).fetchone()
            actual_lots, actual_sheets, actual_scrap, wrong_warehouse = lot_totals
            if int(actual_lots) != expected["aluminium_lots"]:
                raise AssertionError(f"Lot count mismatch: {actual_lots}")
            if abs(float(actual_sheets) - float(expected["aluminium_sheets"])) > 1e-6:
                raise AssertionError(f"Sheet total mismatch: {actual_sheets}")
            if int(actual_scrap) != expected["aluminium_scrap_lots"]:
                raise AssertionError(f"Scrap count mismatch: {actual_scrap}")
            if int(wrong_warehouse) != 0:
                raise AssertionError(f"{wrong_warehouse} lot rows are not assigned to K36")

            ledger_after = {
                "stock": db.execute("SELECT COUNT(*) FROM stock_ledger_entries").fetchone()[0],
                "gl": db.execute("SELECT COUNT(*) FROM gl_entries").fetchone()[0],
                "payment": db.execute("SELECT COUNT(*) FROM payment_ledger_entries").fetchone()[0],
            }
            if ledger_before != ledger_after:
                raise AssertionError(f"Historical import changed operational ledgers: {ledger_before} -> {ledger_after}")
            quick_check = db.execute("PRAGMA quick_check").fetchone()[0]
            if quick_check != "ok":
                raise AssertionError(f"SQLite quick_check failed: {quick_check}")
        finally:
            db.close()

    print(json.dumps({
        "status": "PASS",
        "customers": customers,
        "documents": first_counts,
        "aluminium_sheets": actual_sheets,
        "scrap_lots": actual_scrap,
        "ledgers_unchanged": ledger_after,
        "idempotent_second_run": True,
        "quick_check": quick_check,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
