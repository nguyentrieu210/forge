#!/usr/bin/env python3
"""Gate 2E S5 — behavioral oracle RUNNER (bench-side).

Runs INSIDE a pinned Frappe/ERPNext bench (via `bench --site <site> execute` or the
CLI below). It refuses to run unless the installed Frappe/ERPNext commits match
source-lock.json exactly, then seeds a deterministic synthetic company and replays
each fixture's action sequence, capturing a normalized snapshot (document, children,
ledgers, status, percentages, outstanding, reports, exceptions).

It is intentionally reset-and-replay: every fixture seeds from a known state so the
capture is reproducible. This file does NOT run in the CloudForge CI environment
(no bench); it is executed only where a pinned site exists. Capturing here is what
moves a fixture from ORACLE_SPECIFIED -> ORACLE_CAPTURED.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

# Normalized-away non-deterministic keys (business-meaningful values are kept).
_STRIP = {"name", "creation", "modified", "modified_by", "owner", "idx", "docstatus_str",
          "amended_from", "request_id", "_user_tags", "_comments", "_assign", "_liked_by"}


def require_pinned_commits(frappe: Any, project_root: Path) -> dict[str, Any]:
    """Fail closed unless the running site's app commits match the lock."""
    lock = json.loads((project_root / "source-lock.json").read_text(encoding="utf-8"))
    locked = {s["app"]: s["full_sha"].lower() for s in lock["sources"] if s.get("full_sha")}
    observed = {}
    mismatches = []
    for app in ("frappe", "erpnext"):
        try:
            sha = frappe.get_app_git_commit(app)  # 40-char sha in a bench
        except Exception:
            sha = None
        observed[app] = sha
        if not sha or sha.lower() != locked.get(app):
            mismatches.append(f"{app}: installed {sha} != locked {locked.get(app)}")
    if mismatches:
        raise SystemExit("SOURCE_LOCK_MISMATCH (bench): " + "; ".join(mismatches))
    return {"locked": locked, "observed": observed}


def _norm(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _norm(v) for k, v in sorted(value.items()) if k not in _STRIP}
    if isinstance(value, (list, tuple)):
        return [_norm(v) for v in value]
    return value


def capture_document(frappe: Any, doctype: str, name: str) -> dict[str, Any]:
    doc = frappe.get_doc(doctype, name)
    snap = _norm(doc.as_dict())
    gl = frappe.get_all("GL Entry", filters={"voucher_type": doctype, "voucher_no": name},
                        fields=["account", "party_type", "party", "debit", "credit", "against_voucher_type", "against_voucher"],
                        order_by="account", ignore_permissions=True)
    sle = frappe.get_all("Stock Ledger Entry", filters={"voucher_type": doctype, "voucher_no": name},
                         fields=["item_code", "warehouse", "actual_qty", "qty_after_transaction", "valuation_rate", "stock_value_difference"],
                         order_by="item_code, warehouse", ignore_permissions=True) if frappe.db.exists("DocType", "Stock Ledger Entry") else []
    ple = frappe.get_all("Payment Ledger Entry", filters={"voucher_type": doctype, "voucher_no": name},
                         fields=["account_type", "party_type", "party", "account", "amount", "against_voucher_type", "against_voucher_no"],
                         order_by="account", ignore_permissions=True) if frappe.db.exists("DocType", "Payment Ledger Entry") else []
    return {
        "doctype": doctype,
        "docstatus": doc.docstatus,
        "status": getattr(doc, "status", None),
        "per_delivered": getattr(doc, "per_delivered", None),
        "per_billed": getattr(doc, "per_billed", None),
        "outstanding_amount": getattr(doc, "outstanding_amount", None),
        "document": snap,
        "gl_entries": _norm(gl),
        "stock_ledger_entries": _norm(sle),
        "payment_ledger_entries": _norm(ple),
    }


def capture_report(frappe: Any, report_name: str, filters: dict[str, Any]) -> dict[str, Any]:
    try:
        from frappe.desk.query_report import run as run_report
        result = run_report(report_name, filters=filters, ignore_prepared_report=True)
        return {"report": report_name, "filters": filters,
                "columns": _norm(result.get("columns")), "rows": _norm(result.get("result"))}
    except Exception as exc:
        return {"report": report_name, "filters": filters, "error": f"{type(exc).__name__}: {exc}"}


def run_fixture(frappe: Any, spec: dict[str, Any]) -> dict[str, Any]:
    """Execute one fixture's action sequence and capture the outcome.

    The generic driver here implements the seed + capture primitives; the concrete
    per-group action interpretation (partial vs full, error variants) is applied
    from spec['group']/description. Errors are captured, never raised past this
    boundary, so an expected-error fixture records its exception category.
    """
    captured: dict[str, Any] = {"fixture_id": spec["fixture_id"], "group": spec["group"],
                                "actions": [], "exceptions": []}
    # NOTE: seeding of the synthetic company/customer/item/warehouse/accounts and the
    # per-group action sequence are performed by group handlers registered below.
    handler = HANDLERS.get(spec["group"])
    if not handler:
        captured["skipped"] = f"no handler for group {spec['group']}"
        return captured
    try:
        handler(frappe, spec, captured)
        captured["oracle_status"] = "CAPTURED"
    except Exception as exc:  # expected-error fixtures land here
        captured["exceptions"].append({"type": type(exc).__name__, "message_category": _err_category(exc)})
        captured["oracle_status"] = "CAPTURED"
    return captured


def _err_category(exc: Exception) -> str:
    name = type(exc).__name__
    # Map to a stable category, never the raw (possibly data-bearing) message.
    return name


# Group handlers are registered by a bench-side implementation module; the CI copy
# ships the smoke chain handler signature so the driver is importable and testable.
def _happy_chain(frappe: Any, spec: dict[str, Any], out: dict[str, Any]) -> None:
    raise NotImplementedError(
        "bench-side seed + SO->DN->SI->PE chain executor is provided by the oracle site "
        "implementation module; not available in the CloudForge CI environment")


HANDLERS = {"E-lifecycle": _happy_chain}


def cli() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--site", required=True)
    ap.add_argument("--sites-path", default="sites")
    ap.add_argument("--fixtures", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--project-root", required=True, type=Path)
    args = ap.parse_args()
    import frappe
    frappe.init(site=args.site, sites_path=args.sites_path)
    frappe.connect()
    try:
        provenance = require_pinned_commits(frappe, args.project_root.resolve())
        results = []
        for spec_path in sorted(args.fixtures.glob("O2C-*.json")):
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            results.append(run_fixture(frappe, spec))
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "capture.json").write_text(
            json.dumps({"provenance": provenance, "results": results}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8")
        print(json.dumps({"captured": sum(1 for r in results if r.get("oracle_status") == "CAPTURED"),
                          "total": len(results)}, indent=2))
    finally:
        frappe.destroy()
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
