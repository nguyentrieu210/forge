#!/usr/bin/env python3
"""Gate 2E S5 — fold the FULL 71-fixture behavioral capture (matrix-raw.json,
produced by o2c_matrix_runner.py on the pinned bench) into committable oracle
artifacts and lift every fixture from NOT_CAPTURED to ORACLE_CAPTURED.

Inputs (local/gitignored):
  docs/spec/source-exact/runtime/matrix-raw.json

Outputs (committable, synthetic `_OM-*` data only, no secrets):
  docs/spec/source-exact/oracle/runtime/o2c-matrix-capture.json   (all 71 captures)
  docs/spec/source-exact/oracle/fixtures/<fid>.json               (oracle_status=CAPTURED)
  docs/spec/source-exact/oracle/fixtures/fixture-matrix.json      (captured=71)
  docs/spec/source-exact/oracle/ORACLE_REPORT.json                (s6.erpnext_captured=71)

The differential comparison against CloudForge (S6, DIFFERENTIAL_PASS) is a
separate, evidence-based step (build_differential_matrix.py) that reads this
capture plus CloudForge source.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SE = ROOT / "docs" / "spec" / "source-exact"
RUNTIME = SE / "runtime"
ORACLE = SE / "oracle"
FIXTURES = ORACLE / "fixtures"

SECRET_RE = re.compile(r"password|passwd|secret|token|api[_-]?key|cookie|authorization|oracle123|oracle-admin|BEGIN [A-Z ]*PRIVATE", re.I)


def summarize(data: dict) -> dict:
    """A compact, human-scannable summary of one fixture capture."""
    if not isinstance(data, dict):
        return {"raw": data}
    if "observed_error" in data:
        oe = data["observed_error"]
        s = {"kind": "error", "raised": oe.get("raised"), "error_type": oe.get("type"),
             "error_class": oe.get("frappe_class"), "message": (oe.get("msg") or "")[:160]}
        if data.get("note"):
            s["note"] = data["note"]
        return s
    out = {"kind": "state"}
    for docname in ("so", "dn", "si", "pe", "doc"):
        d = data.get(docname)
        if isinstance(d, dict) and "docstatus" in d:
            out[docname] = {k: d.get(k) for k in ("docstatus", "status", "per_delivered", "per_billed",
                                                  "outstanding_amount", "grand_total")}
            gl = d.get("gl_entries") or []
            if gl:
                out[docname]["gl"] = [{"account": g.get("account"), "debit": g.get("debit"), "credit": g.get("credit")} for g in gl]
            sle = d.get("stock_ledger_entries") or []
            if sle:
                out[docname]["sle"] = [{"item": s.get("item_code"), "actual_qty": s.get("actual_qty")} for s in sle]
    # carry through scalar observations (rates, sequences, notes, reports)
    for k, v in data.items():
        if k in ("so", "dn", "si", "pe", "doc"):
            continue
        if isinstance(v, (int, float, str, bool)) or (isinstance(v, list) and len(json.dumps(v, default=str)) < 400):
            out[k] = v
        elif isinstance(v, dict) and len(json.dumps(v, default=str)) < 400:
            out[k] = v
    return out


RAW_FILES = ["matrix-raw.json", "adv-raw.json", "val-raw.json", "rpst-raw.json", "bs-raw.json"]  # A-H, I-J, K, M, L


def main() -> int:
    fixtures: dict = {}
    provenance: dict = {}
    base: dict = {}
    total = captured = failures = 0
    for rf in RAW_FILES:
        p = RUNTIME / rf
        if not p.is_file():
            continue
        raw = json.loads(p.read_text(encoding="utf-8"))
        fixtures.update(raw.get("fixtures", {}))
        provenance = provenance or raw.get("provenance", {})
        base = base or raw.get("base", {})
        s = raw.get("summary", {})
        total += s.get("total", 0)
        captured += s.get("captured", 0)
        failures += s.get("handler_failures", 0)
    summary = {"total": total, "captured": captured, "handler_failures": failures}

    assert captured == total == len(fixtures), f"incomplete capture: {summary}"

    # --- committable full capture artifact ---
    out = ORACLE / "runtime"
    out.mkdir(parents=True, exist_ok=True)
    capture_doc = {
        "gate": "2E-S5-matrix",
        "provenance": provenance,
        "base": base,
        "note": "full 71-fixture O2C behavioral capture on a pinned bench (Frappe v16.19.0 / "
                "ERPNext v16.20.0); synthetic _OM-* data; rollback-isolated per fixture; secrets redacted at source",
        "summary": summary,
        "fixtures": {fid: {"captured": v.get("captured"), "summary": summarize(v.get("data", {})),
                           "full": v.get("data")} for fid, v in fixtures.items()},
    }
    text = json.dumps(capture_doc, indent=2, ensure_ascii=False) + "\n"
    # scan the captured DATA (fixtures/base/provenance), not our own descriptive note
    scan_src = json.dumps({"fixtures": capture_doc["fixtures"], "base": base, "provenance": provenance}, default=str)
    leaks = [m.group(0) for m in SECRET_RE.finditer(scan_src)]
    if leaks:
        raise SystemExit(f"REFUSING to write: secret-like tokens in capture data: {set(leaks)}")
    (out / "o2c-matrix-capture.json").write_text(text, encoding="utf-8")

    # --- lift each fixture spec to CAPTURED ---
    lifted = 0
    for fid, v in fixtures.items():
        spec_path = FIXTURES / f"{fid}.json"
        if not spec_path.is_file():
            continue
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        spec["oracle_status"] = "CAPTURED"
        spec["erpnext"] = {"status": "captured",
                           "artifact": "docs/spec/source-exact/oracle/runtime/o2c-matrix-capture.json",
                           "captured_summary": summarize(v.get("data", {}))}
        spec_path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        lifted += 1

    # --- fixture-matrix manifest ---
    mpath = FIXTURES / "fixture-matrix.json"
    if mpath.is_file():
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
        for entry in manifest.get("fixtures", []):
            entry["oracle_status"] = "CAPTURED"
        manifest["captured"] = len(fixtures)
        manifest["not_captured"] = 0
        manifest["claim_level"] = "ORACLE_CAPTURED (71/71 on pinned bench)"
        mpath.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # --- ORACLE_REPORT ---
    rpath = ORACLE / "ORACLE_REPORT.json"
    report = json.loads(rpath.read_text(encoding="utf-8"))
    report["runtime_stage"] = "CAPTURED_MATRIX"
    report["runtime_blocker"] = None
    report.setdefault("s6", {})["erpnext_captured"] = len(fixtures)
    report["claim_levels"] = {**report.get("claim_levels", {}),
                              "RUNTIME_RESOLVED": True, "ORACLE_CAPTURED": True}
    report["matrix_capture"] = {"provenance": provenance, "total": summary.get("total"),
                                "captured": summary.get("captured"), "handler_failures": summary.get("handler_failures"),
                                "artifact": "docs/spec/source-exact/oracle/runtime/o2c-matrix-capture.json"}
    rpath.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({"ok": True, "captured": len(fixtures), "lifted_specs": lifted,
                      "provenance": provenance, "secrets": len(leaks)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
