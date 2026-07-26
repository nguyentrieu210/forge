#!/usr/bin/env python3
"""Gate 2E acceptance #1: prove the local source checkout matches the two LOCKED
full commits exactly. Recomputes the same tree fingerprint the fetcher recorded
and compares it, the resolved commit, and the file count against
`source-lock.json` + the per-app `.acquisition.json`. Exits non-zero on any drift
so no downstream oracle stage can run against an unpinned/tampered tree.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

REQUIRED = {"frappe": "v16.19.0", "erpnext": "v16.20.0"}


def tree_fingerprint(root: Path) -> tuple[str, int]:
    # Identical algorithm to fetch_pinned_source.tree_fingerprint.
    h = hashlib.sha256()
    count = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        fh = hashlib.sha256(path.read_bytes()).hexdigest()
        h.update(rel.encode())
        h.update(b"\0")
        h.update(fh.encode())
        h.update(b"\n")
        count += 1
    return h.hexdigest(), count


def check_app(app: str, tag: str, locked_sha: str, sources_dir: Path) -> dict[str, Any]:
    root = sources_dir / f"{app}-{tag}"
    receipt_path = sources_dir / f"{app}-{tag}.acquisition.json"
    failures: list[str] = []
    if not root.is_dir():
        return {"app": app, "ok": False, "failures": [f"source tree missing: {root}"]}
    if not receipt_path.is_file():
        return {"app": app, "ok": False, "failures": [f"acquisition receipt missing: {receipt_path}"]}
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("resolved_commit", "").lower() != locked_sha.lower():
        failures.append(f"resolved_commit {receipt.get('resolved_commit')} != locked {locked_sha}")
    if receipt.get("tag") != tag:
        failures.append(f"tag {receipt.get('tag')} != expected {tag}")
    actual_hash, actual_count = tree_fingerprint(root)
    if actual_hash != receipt.get("tree_sha256"):
        failures.append(f"tree_sha256 drift: {actual_hash} != recorded {receipt.get('tree_sha256')}")
    if actual_count != receipt.get("file_count"):
        failures.append(f"file_count drift: {actual_count} != recorded {receipt.get('file_count')}")
    return {
        "app": app, "tag": tag, "locked_sha": locked_sha,
        "resolved_commit": receipt.get("resolved_commit"),
        "tree_sha256": actual_hash, "file_count": actual_count,
        "ok": not failures, "failures": failures,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[3])
    ap.add_argument("--sources-dir", type=Path, default=None)
    args = ap.parse_args()

    project_root = args.project_root.resolve()
    sources_dir = (args.sources_dir or (project_root.parent / "upstream")).resolve()
    lock = json.loads((project_root / "source-lock.json").read_text(encoding="utf-8"))
    locked = {s["app"]: s for s in lock.get("sources", [])}

    results = []
    for app, tag in REQUIRED.items():
        entry = locked.get(app, {})
        sha = entry.get("full_sha")
        if not sha or entry.get("status") != "LOCKED":
            results.append({"app": app, "ok": False, "failures": ["source-lock full_sha not LOCKED"]})
            continue
        if entry.get("tag") != tag:
            results.append({"app": app, "ok": False, "failures": [f"source-lock tag {entry.get('tag')} != {tag}"]})
            continue
        results.append(check_app(app, tag, sha, sources_dir))

    ok = all(r["ok"] for r in results)
    report = {"ok": ok, "sources_dir": str(sources_dir), "apps": results}
    print(json.dumps(report, indent=2))
    if not ok:
        print("SOURCE_LOCK_MISMATCH", file=sys.stderr)
        return 1
    print("SOURCE_LOCK_VERIFIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
