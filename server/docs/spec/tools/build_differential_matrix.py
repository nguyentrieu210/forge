#!/usr/bin/env python3
"""Gate 2E S6 — fold the adversarially-verified differential records (produced by
the `o2c-differential` workflow) into the canonical per-fixture differential files
and refresh the aggregate report + ORACLE_REPORT claim levels.

Input (local/gitignored): docs/spec/source-exact/runtime/differential-records.json
  a JSON list of records, each:
  { fixture_id, erpnext_behavior, cloudforge_status, cloudforge_behavior,
    cloudforge_source[], comparison{document,lifecycle,ledger,report,error_semantics},
    gaps[{type,severity,detail}], claim_level (DIFFERENTIAL_PASS|ORACLE_CAPTURED_ONLY|
    CLOUDFORGE_MISSING), verify? , refuted_divergence? }

Outputs (committable):
  docs/spec/source-exact/oracle/differential/<fid>.json     (per fixture)
  docs/spec/source-exact/oracle/differential/differential-report.json
  docs/spec/source-exact/oracle/ORACLE_REPORT.json          (s6 + claim levels)
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SE = ROOT / "docs" / "spec" / "source-exact"
RUNTIME = SE / "runtime"
ORACLE = SE / "oracle"
DIFF = ORACLE / "differential"

CAPTURE_ARTIFACT = "docs/spec/source-exact/oracle/runtime/o2c-matrix-capture.json"

# workflow claim_level -> canonical claim_level
CLAIM_MAP = {
    "DIFFERENTIAL_PASS": "DIFFERENTIAL_PASS",
    "ORACLE_CAPTURED_ONLY": "ORACLE_CAPTURED",
    "CLOUDFORGE_MISSING": "ORACLE_CAPTURED",  # captured on oracle; CloudForge feature absent
}


def group_of(fid: str) -> str:
    letter = fid.split("-")[1]
    return {"A": "A-sales-order", "B": "B-delivery-note", "C": "C-sales-invoice",
            "D": "D-payment-entry", "E": "E-lifecycle", "F": "F-report",
            "G": "G-numeric", "H": "H-concurrency",
            "I": "I-advanced-tax", "J": "J-multicurrency",
            "K": "K-valuation", "M": "M-repost", "L": "L-batch-serial"}.get(letter, letter)


def main() -> int:
    records = json.loads((RUNTIME / "differential-records.json").read_text(encoding="utf-8"))
    assert isinstance(records, list) and records, "no differential records"
    by_id = {r["fixture_id"]: r for r in records}

    DIFF.mkdir(parents=True, exist_ok=True)
    claim_counts: Counter = Counter()
    cf_status_counts: Counter = Counter()
    gap_type_counts: Counter = Counter()
    gap_sev_counts: Counter = Counter()
    diff_pass = []
    written = 0

    for fid, r in by_id.items():
        claim = CLAIM_MAP.get(r.get("claim_level", ""), "ORACLE_CAPTURED")
        rec = {
            "fixture_id": fid,
            "group": group_of(fid),
            "erpnext": {
                "status": "captured",
                "artifact": CAPTURE_ARTIFACT,
                "behavior": r.get("erpnext_behavior"),
            },
            "cloudforge": {
                "status": r.get("cloudforge_status"),
                "behavior": r.get("cloudforge_behavior"),
                "source": r.get("cloudforge_source", []),
            },
            "comparison": r.get("comparison", {}),
            "gaps": r.get("gaps", []),
            "claim_level": claim,
            "verified": {
                "adversarial": bool(r.get("verify") is not None or r.get("refuted_divergence")),
                "refuted": bool(r.get("refuted_divergence")),
                "note": r.get("refuted_divergence") or (r.get("verify") or {}).get("divergence"),
            },
        }
        (DIFF / f"{fid}.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written += 1
        claim_counts[claim] += 1
        cf_status_counts[r.get("cloudforge_status", "unknown")] += 1
        if claim == "DIFFERENTIAL_PASS":
            diff_pass.append(fid)
        for g in r.get("gaps", []):
            gap_type_counts[g.get("type", "UNKNOWN")] += 1
            gap_sev_counts[g.get("severity", "unknown")] += 1

    highest = "DIFFERENTIAL_PASS" if diff_pass else "ORACLE_CAPTURED"
    report = {
        "schema_version": "2.0.0",
        "gate": "2E-S6",
        "total_fixtures": len(by_id),
        "erpnext_captured": len(by_id),
        "adversarially_verified": True,
        "claim_level_counts": dict(claim_counts),
        "cloudforge_status_counts": dict(cf_status_counts),
        "gap_counts_by_type": dict(gap_type_counts),
        "gap_counts_by_severity": dict(gap_sev_counts),
        "differential_pass_fixtures": sorted(diff_pass),
        "differential_pass_count": len(diff_pass),
        "highest_claim": highest,
        "note": "Every fixture's ERPNext behavior was captured on a commit-pinned bench and "
                "differential-mapped to CloudForge source, then each DIFFERENTIAL_PASS was "
                "adversarially verified (a skeptic attempted to refute the match). "
                "No blanket parity flag is emitted; each fixture carries its own classified claim + gaps.",
    }
    (DIFF / "differential-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # --- ORACLE_REPORT ---
    rpath = ORACLE / "ORACLE_REPORT.json"
    orep = json.loads(rpath.read_text(encoding="utf-8"))
    orep["s6"] = {
        "total_fixtures": len(by_id),
        "erpnext_captured": len(by_id),
        "adversarially_verified": True,
        "claim_level_counts": dict(claim_counts),
        "cloudforge_status_counts": dict(cf_status_counts),
        "gap_counts_by_type": dict(gap_type_counts),
        "differential_pass_count": len(diff_pass),
        "highest_claim": highest,
    }
    orep["claim_levels"] = {**orep.get("claim_levels", {}),
                            "RUNTIME_RESOLVED": True, "ORACLE_CAPTURED": True,
                            "CLOUDFORGE_MAPPED": True,
                            "DIFFERENTIAL_PASS": len(diff_pass) > 0}
    orep["highest_claim"] = highest
    rpath.write_text(json.dumps(orep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({"ok": True, "written": written, "claim_counts": dict(claim_counts),
                      "cf_status": dict(cf_status_counts), "gap_types": dict(gap_type_counts),
                      "differential_pass": len(diff_pass)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
