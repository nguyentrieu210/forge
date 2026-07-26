#!/usr/bin/env python3
"""Fail closed when source-derived documentation is incomplete or inconsistent."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[3])
    ap.add_argument("--apps", default="frappe,erpnext")
    ap.add_argument("--allow-static-errors", action="store_true")
    args = ap.parse_args(); root = args.project_root.resolve()
    selected = {x.strip() for x in args.apps.split(",") if x.strip()}
    lock = load(root / "source-lock.json")
    failures: list[str] = []
    results = []
    entries = {x["app"]: x for x in lock.get("sources", [])}
    for app in sorted(selected):
        entry = entries.get(app)
        if not entry:
            failures.append(f"{app}: absent from source-lock.json"); continue
        sha = entry.get("full_sha")
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
            failures.append(f"{app}: full SHA is not locked"); continue
        out = root / "docs/spec/source-exact/generated" / f"{app}-{entry['tag']}"
        required = ["summary.json", "coverage.json", "manifest.json", "doctype-index.json",
                    "report-index.json", "python-index.json", "client-index.json",
                    "dependency-graph.json", "parse-errors.json"]
        missing = [x for x in required if not (out / x).is_file()]
        if missing:
            failures.append(f"{app}: missing generated outputs {missing}"); continue
        summary = load(out / "summary.json"); coverage = load(out / "coverage.json")
        if summary.get("commit") != sha:
            failures.append(f"{app}: generated commit {summary.get('commit')} != lock {sha}")
        inventory = coverage.get("source_inventory", {})
        if inventory.get("coverage_percent") != 100.0 or inventory.get("claim") != "COMPLETE":
            failures.append(f"{app}: source inventory is not complete")
        static = coverage.get("static_extraction", {})
        if not args.allow_static_errors and (static.get("parse_errors") or static.get("coverage_percent") != 100.0):
            failures.append(f"{app}: static extraction has errors or gaps")
        behavior = coverage.get("behavioral_parity", {})
        if behavior.get("claim") == "PROVEN":
            failures.append(f"{app}: static scanner must never claim behavioral parity")
        results.append({"app": app, "summary": summary.get("counts"), "coverage": coverage})
    report = {"ok": not failures, "apps": sorted(selected), "results": results, "failures": failures}
    report_path = root / "docs/spec/source-exact/verification.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
