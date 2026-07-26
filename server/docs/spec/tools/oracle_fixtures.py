#!/usr/bin/env python3
"""Gate 2E S5 — behavioral oracle FIXTURE MATRIX (specifications).

Emits one deterministic spec file per fixture under
docs/spec/source-exact/oracle/fixtures/. A spec is inputs + the capture contract,
NOT captured results — the ERPNext-side expected state is filled in by the S5
runner (o2c_fixture_runner.py) when run against a pinned bench. Here every fixture
is authored with oracle_status = NOT_CAPTURED so nothing is ever faked.

All seed data is synthetic ("_OC-*") and safe to share; no real party/account/item.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

# One deterministic, fully synthetic seed shared by all fixtures.
SEED = {
    "company": "_OracleCo",
    "abbr": "_OC",
    "currency": "USD",
    "customer": "_OC-CUST",
    "item": "_OC-ITEM",
    "warehouse": "_OC-WH - _OC",
    "accounts": {
        "debit_to": "Debtors - _OC",
        "income": "Sales - _OC",
        "tax": "Output Tax - _OC",
        "cash_bank": "Cash - _OC",
    },
    "actor": "oracle-operator@example.com",
    "roles": ["Accounts Manager", "Sales Manager", "Stock Manager"],
    "posting_date": "2027-01-04",
    "posting_time": "10:00:00",
    "timezone": "UTC",
}

CAPTURE = [
    "parent_document", "child_rows", "docstatus", "status",
    "per_delivered", "per_billed", "outstanding_amount",
    "gl_entries", "stock_ledger_entries", "payment_ledger_entries", "bin",
    "report_rows", "exceptions", "modified_version_equivalent",
]
NORMALIZE = ["name", "creation", "modified", "owner", "database_ids", "request_ids"]

# (group, suffix, description, [expected_error_category|None])
MATRIX: list[tuple[str, str, str, str | None]] = [
    # A. Sales Order
    ("A-sales-order", "CREATE-DRAFT", "Create Sales Order in draft", None),
    ("A-sales-order", "UPDATE-DRAFT", "Update a draft Sales Order line", None),
    ("A-sales-order", "SUBMIT", "Submit Sales Order", None),
    ("A-sales-order", "CANCEL", "Cancel a submitted Sales Order with no downstream", None),
    ("A-sales-order", "AMEND", "Amend a cancelled Sales Order (if ERPNext allows)", None),
    ("A-sales-order", "INVALID-ITEM", "Submit with a non-existent item", "ValidationError"),
    ("A-sales-order", "INVALID-QTY", "Submit with zero/blank quantity", "ValidationError"),
    ("A-sales-order", "MISSING-MANDATORY", "Submit without a mandatory field (customer)", "MandatoryError"),
    ("A-sales-order", "PRICE-RATE", "Rate/amount computation and precision", None),
    ("A-sales-order", "REPLAY-EQUIV", "Idempotency/replay-equivalent (best-effort mapping)", None),
    ("A-sales-order", "PERMISSION-DENIED", "Submit as a role lacking submit permission", "PermissionError"),
    # B. Delivery Note
    ("B-delivery-note", "CREATE-FROM-SO", "Create Delivery Note mapped from Sales Order", None),
    ("B-delivery-note", "PARTIAL", "Partial delivery of ordered qty", None),
    ("B-delivery-note", "FULL", "Full delivery of ordered qty", None),
    ("B-delivery-note", "OVER-DELIVERY", "Deliver more than ordered (tolerance behavior)", "ValidationError"),
    ("B-delivery-note", "WAREHOUSE-MISSING", "Submit without a warehouse", "ValidationError"),
    ("B-delivery-note", "INSUFFICIENT-STOCK", "Submit with no available stock", "NegativeStockError"),
    ("B-delivery-note", "SUBMIT", "Submit Delivery Note (stock ledger posting)", None),
    ("B-delivery-note", "CANCEL", "Cancel Delivery Note (stock reversal)", None),
    ("B-delivery-note", "FULFILLMENT-ROLLBACK", "SO per_delivered rolls back after DN cancel", None),
    ("B-delivery-note", "MULTI-ITEM", "Delivery with multiple items", None),
    ("B-delivery-note", "PERMISSION-DENIED", "Submit as a role lacking permission", "PermissionError"),
    # C. Sales Invoice
    ("C-sales-invoice", "CREATE-FROM-SO", "Create Sales Invoice mapped from Sales Order", None),
    ("C-sales-invoice", "CREATE-AFTER-DN", "Create Sales Invoice after Delivery Note", None),
    ("C-sales-invoice", "PARTIAL-BILLING", "Bill part of the ordered/delivered qty", None),
    ("C-sales-invoice", "FULL-BILLING", "Bill the full qty", None),
    ("C-sales-invoice", "OVER-BILLING", "Bill more than ordered (tolerance behavior)", "ValidationError"),
    ("C-sales-invoice", "SUBMIT-GL", "Submit and capture GL entries", None),
    ("C-sales-invoice", "TAX-FREE-BASELINE", "Tax-free invoice posting baseline", None),
    ("C-sales-invoice", "SINGLE-TAX-BASELINE", "Single-tax posting baseline (oracle only)", None),
    ("C-sales-invoice", "OUTSTANDING", "Outstanding amount after submit", None),
    ("C-sales-invoice", "CANCEL", "Cancel Sales Invoice (GL reversal)", None),
    ("C-sales-invoice", "PERMISSION-DENIED", "Submit as a role lacking permission", "PermissionError"),
    # D. Payment Entry
    ("D-payment-entry", "RECEIVE-FULL", "Receive full payment against one Sales Invoice", None),
    ("D-payment-entry", "RECEIVE-PARTIAL", "Receive partial payment", None),
    ("D-payment-entry", "OVER-PAYMENT", "Allocate more than outstanding", "ValidationError"),
    ("D-payment-entry", "ALLOCATION-MISMATCH", "Allocation total != paid amount", "ValidationError"),
    ("D-payment-entry", "PAID-RECEIVED-BEHAVIOR", "paid_amount vs received_amount (single currency)", None),
    ("D-payment-entry", "SUBMIT-PLE-GL", "Submit and capture Payment Ledger + GL entries", None),
    ("D-payment-entry", "CANCEL", "Cancel Payment Entry (ledger reversal)", None),
    ("D-payment-entry", "OUTSTANDING-ROLLBACK", "Invoice outstanding restored after PE cancel", None),
    ("D-payment-entry", "PERMISSION-DENIED", "Submit as a role lacking permission", "PermissionError"),
    # E. Cross-document lifecycle
    ("E-lifecycle", "SO-DN-SI-PE-HAPPY", "Full SO->DN->SI->PE happy path", None),
    ("E-lifecycle", "PARTIAL-CHAIN", "Partial DN -> partial SI -> partial PE", None),
    ("E-lifecycle", "CANCEL-PE", "Cancel Payment Entry in a completed chain", None),
    ("E-lifecycle", "CANCEL-SI", "Cancel Sales Invoice in a chain", None),
    ("E-lifecycle", "CANCEL-DN", "Cancel Delivery Note in a chain", None),
    ("E-lifecycle", "CANCEL-SO-BLOCKED", "Cancel Sales Order while downstream exists", "LinkExistsError"),
    ("E-lifecycle", "STATUS-RECALC", "Status + per_delivered/per_billed recalculation", None),
    ("E-lifecycle", "OUTSTANDING-CHANGES", "Outstanding changes across the chain", None),
    # F. Report oracle
    ("F-report", "AR-BEFORE-INVOICE", "Accounts Receivable before any invoice", None),
    ("F-report", "AR-AFTER-INVOICE", "AR after invoice submit", None),
    ("F-report", "AR-AFTER-PARTIAL-PAYMENT", "AR after partial payment", None),
    ("F-report", "AR-AFTER-FULL-PAYMENT", "AR after full payment", None),
    ("F-report", "AR-AFTER-PAYMENT-CANCEL", "AR after payment cancellation", None),
    ("F-report", "STOCK-BEFORE-DN", "Stock Balance before delivery", None),
    ("F-report", "STOCK-AFTER-DN", "Stock Balance after delivery", None),
    ("F-report", "STOCK-AFTER-DN-CANCEL", "Stock Balance after delivery cancellation", None),
    # G. Numeric & boundary
    ("G-numeric", "ZERO", "Zero amount/qty behavior", None),
    ("G-numeric", "NEGATIVE-INPUT", "Negative input behavior", "ValidationError"),
    ("G-numeric", "FRACTIONAL-QTY", "Fractional quantity", None),
    ("G-numeric", "FRACTIONAL-RATE", "Fractional rate", None),
    ("G-numeric", "ROUNDING-BOUNDARY", "Rounding boundary (half-up/precision)", None),
    ("G-numeric", "LARGE-AMOUNT", "Large amount precision", None),
    ("G-numeric", "DUPLICATE-ITEM-ROWS", "Duplicate item rows", None),
    ("G-numeric", "SAME-TIMESTAMP", "Two actions with the same timestamp", None),
    ("G-numeric", "TIMEZONE-BOUNDARY", "Posting date/time timezone boundary", None),
    # H. Concurrency candidates (observe ERPNext's real behavior; do not force OCC parity)
    ("H-concurrency", "TWO-UPDATES", "Two near-simultaneous updates to one document", None),
    ("H-concurrency", "TWO-DELIVERIES", "Two deliveries against one Sales Order", None),
    ("H-concurrency", "TWO-PAYMENTS", "Two payments referencing one invoice", None),
    ("H-concurrency", "TWO-STOCK-MUTATIONS", "Two competing stock mutations", None),
    # I. Advanced tax (ERPNext charge-types + inclusive tax + discounts) — captured on the bench
    ("I-advanced-tax", "MULTI-TAX-ROWS", "Invoice with multiple tax rows (On Net Total)", None),
    ("I-advanced-tax", "INCLUSIVE-TAX", "Tax included in the item rate (net back-calculated)", None),
    ("I-advanced-tax", "TAX-ON-PREVIOUS-ROW-TOTAL", "Tax on a previous row total (tax on tax)", None),
    ("I-advanced-tax", "ACTUAL-TAX", "Actual (flat amount) tax", None),
    ("I-advanced-tax", "ON-ITEM-QUANTITY", "Tax charged per item quantity", None),
    ("I-advanced-tax", "ADDITIONAL-DISCOUNT-ON-GRAND", "Additional discount applied on grand total", None),
    ("I-advanced-tax", "ADDITIONAL-DISCOUNT-ON-NET", "Additional discount applied on net total", None),
    ("I-advanced-tax", "DEDUCT-TAX", "Deduct-type tax (withholding-like)", None),
    ("I-advanced-tax", "TAX-ROUNDING", "Tax amount rounding + round off", None),
    # J. Multi-currency (foreign invoice, base-currency GL, FX gain/loss)
    ("J-multicurrency", "FOREIGN-SO", "Sales Order in a foreign currency (EUR)", None),
    ("J-multicurrency", "FOREIGN-SI-GL", "Foreign-currency invoice posts base-currency GL", None),
    ("J-multicurrency", "OUTSTANDING-TXN-VS-BASE", "Outstanding in transaction vs base currency", None),
    ("J-multicurrency", "PE-SAME-RATE", "Payment at the invoice exchange rate (no gain/loss)", None),
    ("J-multicurrency", "PE-DIFF-RATE-GAIN", "Payment at a higher rate -> exchange gain", None),
    ("J-multicurrency", "PE-DIFF-RATE-LOSS", "Payment at a lower rate -> exchange loss", None),
    # K. Valuation (FIFO / Moving Average / LIFO layers, COGS, stock value) — captured on the bench
    ("K-valuation", "FIFO-LAYERS", "FIFO consumption across two price layers", None),
    ("K-valuation", "MAVG-LAYERS", "Moving Average across two price layers", None),
    ("K-valuation", "LIFO-LAYERS", "LIFO consumption across two price layers", None),
    ("K-valuation", "PARTIAL-DELIVERY", "Partial delivery valuation + remaining layer", None),
    ("K-valuation", "FULL-DELIVERY", "Full delivery drains stock to zero", None),
    ("K-valuation", "MULTI-LINE", "Multi-item delivery valuation", None),
    ("K-valuation", "DELIVERY-CANCEL", "Delivery cancel reverses stock + valuation", None),
    ("K-valuation", "RETURN-REVERSAL", "Sales return restores stock at original rate", None),
    ("K-valuation", "NEGATIVE-STOCK", "Delivery from empty stock (negative-stock guard)", "NegativeStockError"),
    ("K-valuation", "ROUNDING-BOUNDARY", "Valuation rounding at precision boundary", None),
    ("K-valuation", "STOCK-BALANCE-STEPS", "Stock Balance after each receipt/delivery", None),
    # M. Repost / backdated stock behavior
    ("M-repost", "BACKDATED-INCOMING-RECALC", "Backdated incoming layer vs already-posted outgoing", None),
    ("M-repost", "FORWARD-MULTI-OUTGOING", "Multiple outgoings after a backdated insert", None),
    ("M-repost", "BACKDATED-CANCEL", "Cancel a backdated incoming layer", None),
    ("M-repost", "REPOST-IDEMPOTENT", "Re-running repost is idempotent", None),
    ("M-repost", "REPOST-JOB-STATUS", "Repost Item Valuation job status/fields", None),
    ("M-repost", "BACKDATED-NEGATIVE", "Backdated outgoing causing intermediate negative", "NegativeStockError"),
    # L. Batch + Serial (Serial and Batch Bundle mechanism)
    ("L-batch-serial", "BATCH-DELIVERY", "Deliver from a specific batch", None),
    ("L-batch-serial", "BATCH-MULTI", "Multiple batches for one item", None),
    ("L-batch-serial", "BATCH-OVER-DELIVERY", "Deliver more than a batch holds", "BatchNegativeStockError"),
    ("L-batch-serial", "BATCH-EXPIRED", "Deliver from an expired batch", None),
    ("L-batch-serial", "BATCH-CANCEL", "Cancel restores the correct batch qty", None),
    ("L-batch-serial", "BATCH-VALUATION", "Batch-specific valuation on delivery", None),
    ("L-batch-serial", "SERIAL-DELIVERY", "Deliver specific serial numbers", None),
    ("L-batch-serial", "SERIAL-NONEXISTENT", "Deliver a non-existent serial", "ValidationError"),
    ("L-batch-serial", "SERIAL-ALREADY-DELIVERED", "Re-deliver an already-delivered serial", "ValidationError"),
    ("L-batch-serial", "SERIAL-MULTIPLE", "Multiple serials on one delivery line", None),
    ("L-batch-serial", "SERIAL-CANCEL", "Cancel returns serials to Active", None),
    ("L-batch-serial", "SERIAL-DOWNSTREAM", "Serial-to-voucher linkage via SBB", None),
]


def fixture_id(group: str, suffix: str, index: int) -> str:
    letter = group.split("-")[0]
    return f"O2C-{letter}-{suffix}-{index:03d}"


def build(out_dir: Path, frappe_commit: str, erpnext_commit: str) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    index = []
    for i, (group, suffix, desc, err) in enumerate(MATRIX, start=1):
        fid = fixture_id(group, suffix, i)
        spec = {
            "fixture_id": fid,
            "group": group,
            "description": desc,
            "deterministic": True,
            "source_version": {"frappe": frappe_commit, "erpnext": erpnext_commit},
            "seed": SEED,
            "capture": CAPTURE,
            "normalize_nondeterministic": NORMALIZE,
            "expected_error_category": err,
            "erpnext": {"status": "NOT_CAPTURED", "artifact": None,
                        "blocked_reason": "pinned Frappe/ERPNext bench not available in this environment"},
            "oracle_status": "NOT_CAPTURED",
        }
        spec["fixture_hash"] = hashlib.sha256(
            json.dumps({k: spec[k] for k in ("fixture_id", "group", "seed", "capture", "expected_error_category")},
                       sort_keys=True).encode()).hexdigest()
        (out_dir / f"{fid}.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        index.append({"fixture_id": fid, "group": group, "description": desc,
                      "expected_error_category": err, "oracle_status": "NOT_CAPTURED"})

    groups: dict[str, int] = {}
    for entry in index:
        groups[entry["group"]] = groups.get(entry["group"], 0) + 1
    manifest = {
        "schema_version": "1.0.0",
        "gate": "2E-S5",
        "total_fixtures": len(index),
        "groups": groups,
        "captured": 0,
        "not_captured": len(index),
        "claim_level": "ORACLE_SPECIFIED (capture pending bench)",
        "fixtures": index,
    }
    (out_dir / "fixture-matrix.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[3])
    args = ap.parse_args()
    root = args.project_root.resolve()
    lock = json.loads((root / "source-lock.json").read_text(encoding="utf-8"))
    locked = {s["app"]: s for s in lock["sources"]}
    out = root / "docs" / "spec" / "source-exact" / "oracle" / "fixtures"
    manifest = build(out, locked["frappe"]["full_sha"], locked["erpnext"]["full_sha"])
    print(json.dumps({"ok": True, "out": str(out), "total": manifest["total_fixtures"], "groups": manifest["groups"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
