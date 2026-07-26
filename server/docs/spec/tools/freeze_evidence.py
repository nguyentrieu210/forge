#!/usr/bin/env python3
"""Gate 2E — freeze the current O2C oracle evidence into an immutable, SHA-256'd
snapshot so later capture phases (K/M/L) cannot silently overwrite prior evidence.

Writes docs/spec/source-exact/oracle/snapshots/<label>/:
  - manifest.json  : label, note, counts, per-file {path, sha256, bytes}, bundle_sha256
  - copies of the aggregate artifacts (capture, differential-report, ORACLE_REPORT)

Usage:
  python freeze_evidence.py --label AJ-86 --note "A-J complete: 86 fixtures, 46 PASS"
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ORACLE = ROOT / "docs" / "spec" / "source-exact" / "oracle"
SNAPSHOTS = ORACLE / "snapshots"


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--label", required=True)
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    out = SNAPSHOTS / args.label
    out.mkdir(parents=True, exist_ok=True)

    # hash every committable oracle file except the snapshots tree itself
    files = []
    for p in sorted(ORACLE.rglob("*.json")):
        if SNAPSHOTS in p.parents or p.parent == SNAPSHOTS:
            continue
        rel = p.relative_to(ROOT).as_posix()
        files.append({"path": rel, "sha256": sha256_file(p), "bytes": p.stat().st_size})

    bundle_src = "\n".join(f"{f['path']}:{f['sha256']}" for f in files)
    bundle_sha = hashlib.sha256(bundle_src.encode()).hexdigest()

    report = json.loads((ORACLE / "ORACLE_REPORT.json").read_text(encoding="utf-8"))
    s6 = report.get("s6", {})
    manifest = {
        "label": args.label,
        "note": args.note,
        "gate": "2E-evidence-freeze",
        "counts": {
            "files": len(files),
            "fixtures": s6.get("total_fixtures"),
            "differential_pass": s6.get("differential_pass_count"),
            "claim_level_counts": s6.get("claim_level_counts"),
            "cloudforge_status_counts": s6.get("cloudforge_status_counts"),
        },
        "matrix_capture": report.get("matrix_capture"),
        "files": files,
        "bundle_sha256": bundle_sha,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # copy the aggregate artifacts for an at-a-glance immutable record
    for rel in ["runtime/o2c-matrix-capture.json", "differential/differential-report.json", "ORACLE_REPORT.json"]:
        src = ORACLE / rel
        if src.is_file():
            shutil.copy2(src, out / rel.replace("/", "__"))

    print(json.dumps({"ok": True, "label": args.label, "files": len(files),
                      "bundle_sha256": bundle_sha, "fixtures": s6.get("total_fixtures"),
                      "differential_pass": s6.get("differential_pass_count")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
