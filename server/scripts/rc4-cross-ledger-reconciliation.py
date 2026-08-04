#!/usr/bin/env python3
"""RC4-A22 independent cross-ledger reconciliation auditor.

Consumes a read-only JSON evidence bundle exported from Forge authoritative tables.
It never writes ledger state and never invents compensating entries.
"""
from __future__ import annotations

import argparse
import copy
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Iterable

Mismatch = dict[str, Any]
VoucherKey = tuple[str, str, int]


def _rows(bundle: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = bundle.get(key, [])
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        raise ValueError(f"{key} must be an array of objects")
    return value


def _voucher(row: dict[str, Any]) -> VoucherKey:
    return str(row["voucher_type"]), str(row["voucher_no"]), int(row["voucher_revision"])


def _doc_data(doc: dict[str, Any]) -> dict[str, Any]:
    value = doc.get("data", {})
    return value if isinstance(value, dict) else {}


def _company_currency(doc: dict[str, Any], row: dict[str, Any]) -> tuple[str, int]:
    data = _doc_data(doc)
    currency = str(data.get("company_currency") or data.get("currency") or row.get("currency", ""))
    raw_scale = data.get("company_currency_scale", data.get("currency_scale", row.get("currency_scale", 2)))
    try:
        return currency, int(raw_scale)
    except (TypeError, ValueError):
        return currency, int(row.get("currency_scale", 2))


def _mismatch(code: str, message: str, **evidence: Any) -> Mismatch:
    return {"code": code, "severity": "CRITICAL", "message": message, "evidence": evidence}


def audit(bundle: dict[str, Any]) -> dict[str, Any]:
    tenant_id = str(bundle.get("tenant_id", "")).strip()
    company = str(bundle.get("company", "")).strip()
    as_of = str(bundle.get("as_of_date", "")).strip()
    if not tenant_id or not company:
        raise ValueError("tenant_id and company are required")
    try:
        date.fromisoformat(as_of)
    except ValueError as exc:
        raise ValueError("as_of_date must be YYYY-MM-DD") from exc

    documents = _rows(bundle, "documents")
    raw = {key: _rows(bundle, key) for key in (
        "gl_entries", "stock_ledger_entries", "payment_ledger_entries",
        "procurement_entries", "manufacturing_entries",
    )}
    docs = {
        (str(doc.get("doctype", "")), str(doc.get("name", ""))): doc
        for doc in documents
        if str(_doc_data(doc).get("company", "")) == company
    }

    def scoped(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for row in rows:
            posting = str(row.get("posting_at", ""))[:10]
            key = str(row.get("voucher_type", "")), str(row.get("voucher_no", ""))
            if posting and posting <= as_of and key in docs:
                out.append(row)
        return out

    gl = scoped(raw["gl_entries"])
    stock = scoped(raw["stock_ledger_entries"])
    payment = scoped(raw["payment_ledger_entries"])
    procurement = scoped(raw["procurement_entries"])
    manufacturing = scoped(raw["manufacturing_entries"])
    mismatches: list[Mismatch] = []

    gl_by_voucher: dict[VoucherKey, list[dict[str, Any]]] = defaultdict(list)
    stock_by_voucher: dict[VoucherKey, list[dict[str, Any]]] = defaultdict(list)
    payment_by_voucher: dict[VoucherKey, list[dict[str, Any]]] = defaultdict(list)
    for row in gl:
        gl_by_voucher[_voucher(row)].append(row)
    for row in stock:
        stock_by_voucher[_voucher(row)].append(row)
    for row in payment:
        payment_by_voucher[_voucher(row)].append(row)

    # XLR-001 — immutable GL voucher revision must balance.
    for key, rows in sorted(gl_by_voucher.items()):
        debit = sum(int(r.get("debit_minor", 0)) for r in rows)
        credit = sum(int(r.get("credit_minor", 0)) for r in rows)
        if debit != credit:
            mismatches.append(_mismatch(
                "XLR-001", "GL voucher revision is not balanced",
                voucher_type=key[0], voucher_no=key[1], voucher_revision=key[2],
                debit_minor=debit, credit_minor=credit, difference_minor=debit-credit,
            ))

    # XLR-010/XLR-011 — company-scope AP/AR subledger vs party GL control.
    for account_type, party_type, sign, code in (
        ("Payable", "Supplier", -1, "XLR-010"),
        ("Receivable", "Customer", 1, "XLR-011"),
    ):
        ple_bal: dict[tuple[str, str, str, int], int] = defaultdict(int)
        gl_bal: dict[tuple[str, str, str, int], int] = defaultdict(int)
        for row in payment:
            if row.get("account_type") != account_type or row.get("party_type") != party_type:
                continue
            doc = docs[(str(row["voucher_type"]), str(row["voucher_no"]))]
            currency, scale = _company_currency(doc, row)
            key = str(row.get("party", "")), str(row.get("account", "")), currency, scale
            ple_bal[key] += int(row.get("base_amount_minor", row.get("amount_minor", 0)))
        for row in gl:
            if row.get("party_type") != party_type or not row.get("party"):
                continue
            key = str(row.get("party", "")), str(row.get("account", "")), str(row.get("currency", "")), int(row.get("currency_scale", 2))
            net = int(row.get("debit_minor", 0)) - int(row.get("credit_minor", 0))
            gl_bal[key] += net if sign == 1 else -net
        for key in sorted(set(ple_bal) | set(gl_bal)):
            pval, gval = ple_bal.get(key, 0), gl_bal.get(key, 0)
            if pval != gval:
                mismatches.append(_mismatch(
                    code, f"{account_type} subledger does not reconcile to party GL control",
                    party=key[0], account=key[1], currency=key[2], currency_scale=key[3],
                    payment_ledger_base_minor=pval, gl_control_minor=gval, difference_minor=pval-gval,
                ))

    # XLR-020/021 — exact Repost Item Valuation Stock value vs declared stock-account GL.
    for key, rows in sorted(stock_by_voucher.items()):
        if key[0] != "Repost Item Valuation":
            continue
        stock_account = str(_doc_data(docs.get((key[0], key[1]), {})).get("stock_account", ""))
        if not stock_account:
            mismatches.append(_mismatch(
                "XLR-021", "Repost Item Valuation lacks canonical stock_account mapping",
                voucher_type=key[0], voucher_no=key[1], voucher_revision=key[2], dependency_owner="A12/A4",
            ))
            continue
        stock_value = sum(int(r.get("stock_value_difference_minor", 0)) for r in rows)
        stock_gl = sum(
            int(r.get("debit_minor", 0)) - int(r.get("credit_minor", 0))
            for r in gl_by_voucher.get(key, []) if str(r.get("account", "")) == stock_account
        )
        if stock_value != stock_gl:
            mismatches.append(_mismatch(
                "XLR-020", "Stock Ledger value delta does not reconcile to stock-account GL delta",
                voucher_type=key[0], voucher_no=key[1], voucher_revision=key[2], stock_account=stock_account,
                stock_value_difference_minor=stock_value, stock_gl_delta_minor=stock_gl,
                difference_minor=stock_value-stock_gl,
            ))

    # XLR-030 — Purchase Receipt progress vs positive Stock Ledger quantity by item.
    receipt_progress: dict[tuple[VoucherKey, str], int] = defaultdict(int)
    for row in procurement:
        if row.get("kind") == "Receipt" and str(row.get("voucher_type", "")) == "Purchase Receipt":
            receipt_progress[(_voucher(row), str(row.get("item_code", "")))] += int(row.get("qty_micros", 0))
    for (vkey, item), progress_qty in sorted(receipt_progress.items()):
        stock_qty = sum(
            max(int(r.get("actual_qty_micros", 0)), 0)
            for r in stock_by_voucher.get(vkey, []) if str(r.get("item_code", "")) == item
        )
        if progress_qty != stock_qty:
            mismatches.append(_mismatch(
                "XLR-030", "Purchase Receipt progress does not reconcile to inward Stock Ledger quantity",
                voucher_type=vkey[0], voucher_no=vkey[1], voucher_revision=vkey[2], item_code=item,
                procurement_receipt_qty_micros=progress_qty, stock_inward_qty_micros=stock_qty,
                difference_micros=progress_qty-stock_qty,
            ))

    # XLR-031 — Purchase Invoice Billing progress requires AP Payment Ledger + Supplier GL evidence.
    billed = sorted({_voucher(r) for r in procurement if r.get("kind") == "Billing" and str(r.get("voucher_type", "")) == "Purchase Invoice"})
    for vkey in billed:
        ap = [r for r in payment_by_voucher.get(vkey, []) if r.get("account_type") == "Payable" and r.get("party_type") == "Supplier"]
        ap_gl = [r for r in gl_by_voucher.get(vkey, []) if r.get("party_type") == "Supplier" and r.get("party")]
        if not ap or not ap_gl:
            mismatches.append(_mismatch(
                "XLR-031", "Purchase Invoice Billing progress exists without canonical AP Payment Ledger and Supplier GL evidence",
                voucher_type=vkey[0], voucher_no=vkey[1], voucher_revision=vkey[2],
                payment_ledger_rows=len(ap), supplier_gl_rows=len(ap_gl), dependency_owner="A11/A4",
            ))

    # XLR-040 — Manufacturing progress vs canonical Stock Ledger movement by item.
    mfg_progress: dict[tuple[VoucherKey, str, str], int] = defaultdict(int)
    for row in manufacturing:
        mfg_progress[(_voucher(row), str(row.get("item_code", "")), str(row.get("kind", "")))] += int(row.get("qty_micros", 0))
    for (vkey, item, kind), qty in sorted(mfg_progress.items()):
        rows = [r for r in stock_by_voucher.get(vkey, []) if str(r.get("item_code", "")) == item]
        inward = sum(max(int(r.get("actual_qty_micros", 0)), 0) for r in rows)
        outward = sum(max(-int(r.get("actual_qty_micros", 0)), 0) for r in rows)
        ok = (kind == "Manufacture" and qty == inward) or (kind == "Consumption" and qty == outward) or (kind == "Material Transfer" and qty == inward == outward)
        if not ok:
            mismatches.append(_mismatch(
                "XLR-040", "Manufacturing progress does not reconcile to canonical Stock Ledger movement",
                voucher_type=vkey[0], voucher_no=vkey[1], voucher_revision=vkey[2], item_code=item, kind=kind,
                manufacturing_qty_micros=qty, stock_inward_qty_micros=inward, stock_outward_qty_micros=outward,
                dependency_owner="A13/A12",
            ))

    # XLR-050..054 — cancelled voucher must leave no residual in any touched authority/projection.
    cancelled = {(str(d.get("doctype", "")), str(d.get("name", ""))) for d in docs.values() if int(d.get("docstatus", 0)) == 2}
    for doctype, name in sorted(cancelled):
        gl_groups: dict[tuple[Any, ...], int] = defaultdict(int)
        for r in gl:
            if str(r.get("voucher_type")) == doctype and str(r.get("voucher_no")) == name:
                key = r.get("account"), r.get("party_type"), r.get("party"), r.get("currency"), int(r.get("currency_scale", 2))
                gl_groups[key] += int(r.get("debit_minor", 0)) - int(r.get("credit_minor", 0))
        bad = {str(k): v for k, v in gl_groups.items() if v}
        if bad:
            mismatches.append(_mismatch("XLR-050", "Cancelled voucher leaves residual GL balance", voucher_type=doctype, voucher_no=name, residuals=bad))

        stock_groups: dict[tuple[Any, ...], list[int]] = defaultdict(lambda: [0, 0])
        for r in stock:
            if str(r.get("voucher_type")) == doctype and str(r.get("voucher_no")) == name:
                key = r.get("item_code"), r.get("warehouse"), r.get("batch_no"), r.get("serial_no"), r.get("currency"), int(r.get("currency_scale", 2))
                stock_groups[key][0] += int(r.get("actual_qty_micros", 0))
                stock_groups[key][1] += int(r.get("stock_value_difference_minor", 0))
        bad = {str(k): tuple(v) for k, v in stock_groups.items() if tuple(v) != (0, 0)}
        if bad:
            mismatches.append(_mismatch("XLR-051", "Cancelled voucher leaves residual Stock Ledger quantity/value", voucher_type=doctype, voucher_no=name, residuals=bad))

        pay_groups: dict[tuple[Any, ...], list[int]] = defaultdict(lambda: [0, 0])
        for r in payment:
            if str(r.get("voucher_type")) == doctype and str(r.get("voucher_no")) == name:
                key = r.get("account_type"), r.get("party_type"), r.get("party"), r.get("account"), r.get("against_voucher_type"), r.get("against_voucher_no")
                pay_groups[key][0] += int(r.get("amount_minor", 0))
                pay_groups[key][1] += int(r.get("base_amount_minor", r.get("amount_minor", 0)))
        bad = {str(k): tuple(v) for k, v in pay_groups.items() if tuple(v) != (0, 0)}
        if bad:
            mismatches.append(_mismatch("XLR-052", "Cancelled voucher leaves residual Payment Ledger amount", voucher_type=doctype, voucher_no=name, residuals=bad))

        for rows, code, label, fields in (
            (procurement, "XLR-053", "procurement progress", ("purchase_order", "kind", "item_code")),
            (manufacturing, "XLR-054", "manufacturing progress", ("work_order", "kind", "item_code")),
        ):
            groups: dict[tuple[Any, ...], int] = defaultdict(int)
            for r in rows:
                if str(r.get("voucher_type")) == doctype and str(r.get("voucher_no")) == name:
                    groups[tuple(r.get(field) for field in fields)] += int(r.get("qty_micros", 0))
            bad = {str(k): v for k, v in groups.items() if v}
            if bad:
                mismatches.append(_mismatch(code, f"Cancelled voucher leaves residual {label}", voucher_type=doctype, voucher_no=name, residuals=bad))

    counts: dict[str, int] = defaultdict(int)
    for item in mismatches:
        counts[item["code"]] += 1
    return {
        "schema_version": 1,
        "tenant_id": tenant_id,
        "company": company,
        "as_of_date": as_of,
        "status": "RECONCILED" if not mismatches else "MISMATCH",
        "mismatch_count": len(mismatches),
        "mismatch_counts": dict(sorted(counts.items())),
        "mismatches": mismatches,
        "notes": [
            "Read-only evidence audit; no ledger mutation or compensating entry is performed.",
            "AR/AP reconciliation is company-scoped because canonical Payment Ledger has no branch dimension.",
            "Exact Stock↔GL account comparison is asserted only for Repost Item Valuation with canonical stock_account evidence.",
        ],
    }


def _fixture() -> dict[str, Any]:
    def doc(doctype: str, name: str, status: int = 1, **data: Any) -> dict[str, Any]:
        return {"doctype": doctype, "name": name, "docstatus": status, "version": 2 if status == 2 else 1, "data": {"company": "Demo", "company_currency": "VND", "company_currency_scale": 0, **data}}
    def row(vt: str, vn: str, rev: int, **rest: Any) -> dict[str, Any]:
        return {"voucher_type": vt, "voucher_no": vn, "voucher_revision": rev, "posting_at": "2026-08-03T10:00:00Z", **rest}
    return {
        "tenant_id": "tenant-a", "company": "Demo", "as_of_date": "2026-08-04",
        "documents": [doc("Purchase Invoice", "PI-1"), doc("Payment Entry", "PAY-1"), doc("Purchase Receipt", "PR-1"), doc("Repost Item Valuation", "RIV-1", stock_account="1400-STOCK"), doc("Stock Entry", "MFG-1"), doc("Stock Entry", "SE-C", status=2)],
        "gl_entries": [
            row("Purchase Invoice", "PI-1", 1, line_key="EXP", account="6000-EXP", debit_minor=1000, credit_minor=0, currency="VND", currency_scale=0),
            row("Purchase Invoice", "PI-1", 1, line_key="AP", account="2110-AP", party_type="Supplier", party="SUP-1", debit_minor=0, credit_minor=1000, currency="VND", currency_scale=0),
            row("Payment Entry", "PAY-1", 1, line_key="AP", account="2110-AP", party_type="Supplier", party="SUP-1", debit_minor=400, credit_minor=0, currency="VND", currency_scale=0),
            row("Payment Entry", "PAY-1", 1, line_key="BANK", account="1120-BANK", debit_minor=0, credit_minor=400, currency="VND", currency_scale=0),
            row("Repost Item Valuation", "RIV-1", 1, line_key="STOCK", account="1400-STOCK", debit_minor=300, credit_minor=0, currency="VND", currency_scale=0),
            row("Repost Item Valuation", "RIV-1", 1, line_key="DIFF", account="7190-DIFF", debit_minor=0, credit_minor=300, currency="VND", currency_scale=0),
        ],
        "payment_ledger_entries": [
            row("Purchase Invoice", "PI-1", 1, line_key="AP", account_type="Payable", party_type="Supplier", party="SUP-1", account="2110-AP", amount_minor=1000, base_amount_minor=1000, currency="VND", currency_scale=0, against_voucher_type="Purchase Invoice", against_voucher_no="PI-1"),
            row("Payment Entry", "PAY-1", 1, line_key="AP", account_type="Payable", party_type="Supplier", party="SUP-1", account="2110-AP", amount_minor=-400, base_amount_minor=-400, currency="VND", currency_scale=0, against_voucher_type="Purchase Invoice", against_voucher_no="PI-1"),
        ],
        "stock_ledger_entries": [
            row("Purchase Receipt", "PR-1", 1, line_key="RM", item_code="RM-1", warehouse="MAIN", actual_qty_micros=100000000, stock_value_difference_minor=1000, currency="VND", currency_scale=0),
            row("Repost Item Valuation", "RIV-1", 1, line_key="ADJ", item_code="RM-1", warehouse="MAIN", actual_qty_micros=0, stock_value_difference_minor=300, currency="VND", currency_scale=0),
            row("Stock Entry", "MFG-1", 1, line_key="RM-OUT", item_code="RM-1", warehouse="WIP", actual_qty_micros=-20000000, stock_value_difference_minor=-200, currency="VND", currency_scale=0),
            row("Stock Entry", "MFG-1", 1, line_key="FG-IN", item_code="FG-1", warehouse="FG", actual_qty_micros=10000000, stock_value_difference_minor=200, currency="VND", currency_scale=0),
            row("Stock Entry", "SE-C", 1, line_key="A", item_code="RM-2", warehouse="MAIN", actual_qty_micros=5000000, stock_value_difference_minor=35, currency="VND", currency_scale=0),
            row("Stock Entry", "SE-C", 2, line_key="REV-A", item_code="RM-2", warehouse="MAIN", actual_qty_micros=-5000000, stock_value_difference_minor=-35, currency="VND", currency_scale=0),
        ],
        "procurement_entries": [
            row("Purchase Receipt", "PR-1", 1, line_key="PO-R", purchase_order="PO-1", kind="Receipt", item_code="RM-1", qty_micros=100000000),
            row("Purchase Invoice", "PI-1", 1, line_key="PO-B", purchase_order="PO-1", kind="Billing", item_code="RM-1", qty_micros=100000000),
        ],
        "manufacturing_entries": [
            row("Stock Entry", "MFG-1", 1, line_key="CONS", work_order="WO-1", kind="Consumption", item_code="RM-1", qty_micros=20000000),
            row("Stock Entry", "MFG-1", 1, line_key="MAKE", work_order="WO-1", kind="Manufacture", item_code="FG-1", qty_micros=10000000),
        ],
    }


def self_test() -> None:
    good = audit(_fixture())
    assert good["status"] == "RECONCILED", good
    bad_fixture = copy.deepcopy(_fixture())
    bad_fixture["stock_ledger_entries"][1]["stock_value_difference_minor"] = 250
    bad_fixture["procurement_entries"][0]["qty_micros"] = 90000000
    bad_fixture["manufacturing_entries"][0]["qty_micros"] = 25000000
    bad_fixture["gl_entries"][0]["debit_minor"] = 990
    bad = audit(bad_fixture)
    codes = {item["code"] for item in bad["mismatches"]}
    expected = {"XLR-001", "XLR-020", "XLR-030", "XLR-040"}
    assert expected.issubset(codes), (expected, codes, bad)
    print("RC4-A22 cross-ledger self-test: PASS")
    print(json.dumps({"good": good["status"], "bad_codes": sorted(codes)}, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only RC4-A22 cross-ledger reconciliation auditor")
    parser.add_argument("--input", type=Path, help="JSON evidence bundle")
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    parser.add_argument("--self-test", action="store_true", help="Run isolated synthetic regression")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.input:
        parser.error("--input is required unless --self-test is used")
    bundle = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(bundle, dict):
        raise ValueError("input root must be an object")
    report = audit(bundle)
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0 if report["status"] == "RECONCILED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
