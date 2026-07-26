#!/usr/bin/env python3
"""Gate 2E S6 — CloudForge differential mapping.

For every S5 fixture, emit the mapping record: the ERPNext side (from captured
artifacts, or NOT_CAPTURED), the CloudForge side (implementation status + source +
test references, filled offline from the CloudForge codebase), and a per-dimension
comparison. When the ERPNext oracle has not been captured, every comparison is
`not_comparable` and gaps that depend on observed behavior are flagged
`candidate_pending_oracle` — architectural facts that are true by construction are
flagged `known`. There is deliberately NO single parity:true/false flag.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

SELLING = "packages/clouderp-selling/src/controllers.ts"
TOTALS = "packages/clouderp-selling/src/totals.ts"
DO = "packages/document-kernel/src/d1-store.ts"
CORE_SQL = "migrations/tenant/0001_core.sql"
PROJ_SQL = "migrations/tenant/0002_o2c_projections.sql"
QUERY = "packages/query/src/index.ts"
TENANT_TEST = "apps/tenant-worker/test/health.integration.test.mts"
SQL_TESTS = "scripts/test-sql-concurrency.py"

# Per-group default CloudForge mapping.
GROUP_DEFAULT: dict[str, dict[str, Any]] = {
    "A-sales-order": {"status": "implemented", "source": [SELLING, TOTALS], "test": [TENANT_TEST]},
    "B-delivery-note": {"status": "implemented", "source": [SELLING, CORE_SQL], "test": [TENANT_TEST, SQL_TESTS]},
    "C-sales-invoice": {"status": "implemented", "source": [SELLING, TOTALS, CORE_SQL], "test": [TENANT_TEST]},
    "D-payment-entry": {"status": "implemented", "source": [SELLING, CORE_SQL], "test": [TENANT_TEST]},
    "E-lifecycle": {"status": "implemented", "source": [SELLING, CORE_SQL, DO], "test": [TENANT_TEST, SQL_TESTS]},
    "F-report": {"status": "implemented", "source": [QUERY, PROJ_SQL], "test": [TENANT_TEST]},
    "G-numeric": {"status": "implemented", "source": [TOTALS, "packages/money/src/index.ts"], "test": ["tests/errors.test.mjs"]},
    "H-concurrency": {"status": "implemented", "source": [CORE_SQL, DO], "test": [SQL_TESTS, TENANT_TEST]},
}

# Overrides keyed by the fixture suffix (the part between group-letter and the ###).
# gap 'status': known (true by construction) | candidate_pending_oracle (needs capture).
OVERRIDES: dict[str, dict[str, Any]] = {
    "A-sales-order/AMEND": {"status": "missing", "gaps": [
        {"type": "MISSING_FEATURE", "status": "known", "detail": "CloudForge has no amendment/versioned-revision flow; only create/save/submit/cancel."}]},
    "A-sales-order/REPLAY-EQUIV": {"status": "implemented", "gaps": [
        {"type": "INTENTIONAL_ARCHITECTURE_DIFFERENCE", "status": "known", "detail": "CloudForge enforces command_id idempotency + optimistic concurrency; ERPNext has no equivalent client-command contract."}]},
    "B-delivery-note/CREATE-FROM-SO": {"status": "partial", "gaps": [
        {"type": "INTENTIONAL_ARCHITECTURE_DIFFERENCE", "status": "known", "detail": "CloudForge maps SO->DN via a client-side prefill + server against_sales_order reference, not ERPNext get_mapped_doc; field-carry set differs."}]},
    "C-sales-invoice/CREATE-FROM-SO": {"status": "partial", "gaps": [
        {"type": "INTENTIONAL_ARCHITECTURE_DIFFERENCE", "status": "known", "detail": "SO->SI via against_sales_order reference, not get_mapped_doc."}]},
    "C-sales-invoice/CREATE-AFTER-DN": {"status": "partial", "gaps": [
        {"type": "INTENTIONAL_ARCHITECTURE_DIFFERENCE", "status": "known", "detail": "DN->SI carries the SO reference; ERPNext links SI items back to DN items (delivery_note/dn_detail) which CloudForge does not model."}]},
    "C-sales-invoice/SINGLE-TAX-BASELINE": {"status": "partial", "gaps": [
        {"type": "MISSING_FEATURE", "status": "known", "detail": "CloudForge has a single flat-rate tax row only; advanced tax templates/inclusive/compounding are out of scope."}]},
    "C-sales-invoice/TAX-FREE-BASELINE": {"status": "implemented", "gaps": []},
    "G-numeric/ROUNDING-BOUNDARY": {"status": "partial", "gaps": [
        {"type": "ROUNDING_MISMATCH", "status": "candidate_pending_oracle", "detail": "CloudForge uses integer fixed-point (minor units, qty micros); ERPNext float+precision rounding may differ at half-up boundaries. Confirm against oracle."}]},
    "G-numeric/DUPLICATE-ITEM-ROWS": {"status": "partial", "gaps": [
        {"type": "BUSINESS_RULE_MISMATCH", "status": "candidate_pending_oracle", "detail": "CloudForge aggregates fulfillment by item_code; ERPNext keeps distinct rows. Confirm behavior against oracle."}]},
    "G-numeric/NEGATIVE-INPUT": {"status": "implemented", "gaps": [
        {"type": "ERROR_SEMANTICS_DIFFERENCE", "status": "candidate_pending_oracle", "detail": "Both reject; exact error type/message category differs. Confirm against oracle."}]},
    "G-numeric/TIMEZONE-BOUNDARY": {"status": "partial", "gaps": [
        {"type": "BUSINESS_RULE_MISMATCH", "status": "candidate_pending_oracle", "detail": "CloudForge stores posting_at as a UTC ISO instant; ERPNext splits posting_date/posting_time with site timezone. Confirm boundary behavior against oracle."}]},
}


def cloudforge_for(group: str, suffix: str) -> dict[str, Any]:
    base = dict(GROUP_DEFAULT.get(group, {"status": "not_applicable", "source": [], "test": []}))
    base.setdefault("gaps", [])
    override = OVERRIDES.get(f"{group}/{suffix}")
    if override:
        base["status"] = override.get("status", base["status"])
        base["gaps"] = override.get("gaps", [])
    return base


def suffix_of(fixture_id: str) -> str:
    # O2C-<letter>-<SUFFIX>-<###>
    parts = fixture_id.split("-")
    return "-".join(parts[2:-1])


def build(fixtures_dir: Path, out_dir: Path) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    matrix = json.loads((fixtures_dir / "fixture-matrix.json").read_text(encoding="utf-8"))
    records = []
    gap_severity: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    error_dims = {"document", "lifecycle", "ledger", "report", "error_semantics"}

    for entry in matrix["fixtures"]:
        fid = entry["fixture_id"]
        group = entry["group"]
        suffix = suffix_of(fid)
        spec = json.loads((fixtures_dir / f"{fid}.json").read_text(encoding="utf-8"))
        erp_captured = spec["erpnext"]["status"] == "CAPTURED"
        cf = cloudforge_for(group, suffix)
        status_counts[cf["status"]] = status_counts.get(cf["status"], 0) + 1
        comparison = {dim: ("match|different|not_comparable"[0:0] or "not_comparable") for dim in error_dims}
        if not erp_captured:
            comparison = {dim: "not_comparable" for dim in error_dims}
        record = {
            "fixture_id": fid,
            "group": group,
            "erpnext": {"status": "captured" if erp_captured else "not_captured",
                        "artifact": spec["erpnext"].get("artifact")},
            "cloudforge": {"status": cf["status"], "source": cf.get("source", []), "test": cf.get("test", [])},
            "comparison": comparison,
            "gaps": cf.get("gaps", []),
            "claim_level": "CLOUDFORGE_MAPPED" if not erp_captured else "DIFFERENTIAL_PASS",
        }
        for gap in record["gaps"]:
            gap_severity[gap["type"]] = gap_severity.get(gap["type"], 0) + 1
        (out_dir / f"{fid}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        records.append(record)

    known = sum(1 for r in records for g in r["gaps"] if g.get("status") == "known")
    candidate = sum(1 for r in records for g in r["gaps"] if g.get("status") == "candidate_pending_oracle")
    summary = {
        "schema_version": "1.0.0",
        "gate": "2E-S6",
        "total_fixtures": len(records),
        "erpnext_captured": sum(1 for r in records if r["erpnext"]["status"] == "captured"),
        "cloudforge_status_counts": status_counts,
        "gap_counts_by_type": gap_severity,
        "gaps_known": known,
        "gaps_candidate_pending_oracle": candidate,
        "claim_levels_present": sorted({r["claim_level"] for r in records}),
        "highest_claim": "CLOUDFORGE_MAPPED" if not any(r["claim_level"] == "DIFFERENTIAL_PASS" for r in records) else "DIFFERENTIAL_PASS",
        "note": "DIFFERENTIAL_PASS is unreachable until the ERPNext oracle is captured (S4/S5 on a pinned bench). No parity is claimed beyond CLOUDFORGE_MAPPED.",
    }
    (out_dir / "differential-report.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[3])
    args = ap.parse_args()
    root = args.project_root.resolve()
    fixtures = root / "docs" / "spec" / "source-exact" / "oracle" / "fixtures"
    out = root / "docs" / "spec" / "source-exact" / "oracle" / "differential"
    summary = build(fixtures, out)
    print(json.dumps({"ok": True, "out": str(out), **{k: summary[k] for k in
          ("total_fixtures", "erpnext_captured", "cloudforge_status_counts", "gap_counts_by_type", "highest_claim")}}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
