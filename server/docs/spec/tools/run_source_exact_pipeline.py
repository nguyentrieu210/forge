#!/usr/bin/env python3
"""Run source acquisition and source-derived documentation for Frappe/ERPNext."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[3])
    ap.add_argument("--sources-dir", type=Path, required=True)
    ap.add_argument("--apps", default="frappe,erpnext")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--no-markdown", action="store_true")
    args = ap.parse_args()
    root = args.project_root.resolve()
    lock = json.loads((root / "source-lock.json").read_text(encoding="utf-8"))
    selected = {x.strip() for x in args.apps.split(",") if x.strip()}
    entries = [x for x in lock["sources"] if x["app"] in selected]
    if {x["app"] for x in entries} != selected:
        missing = selected - {x["app"] for x in entries}
        raise SystemExit(f"Apps missing from source-lock.json: {sorted(missing)}")
    for entry in entries:
        sha = entry.get("full_sha")
        if not isinstance(sha, str) or len(sha) != 40:
            raise SystemExit(f"Full SHA is not locked for {entry['app']}")
        repo_path = args.sources_dir.resolve() / f"{entry['app']}-{entry['tag']}"
        repo_slug = entry["repo"].removeprefix("https://github.com/").strip("/")
        if args.fetch:
            cmd = [sys.executable, str(root / "docs/spec/tools/fetch_pinned_source.py"),
                   "--repo", repo_slug, "--tag", entry["tag"], "--expected-commit", sha,
                   "--destination", str(repo_path)]
            if args.overwrite:
                cmd.append("--overwrite")
            run(cmd)
        if not repo_path.is_dir():
            raise SystemExit(f"Missing source checkout: {repo_path}; use --fetch or supply it")
        output = root / "docs/spec/source-exact/generated" / f"{entry['app']}-{entry['tag']}"
        cmd = [sys.executable, str(root / "docs/spec/tools/source_exact_parser.py"),
               "--app", entry["app"], "--root", str(repo_path), "--commit", sha,
               "--tag", entry["tag"], "--license", entry.get("license", "UNKNOWN"),
               "--out", str(output)]
        if args.no_markdown:
            cmd.append("--no-markdown")
        run(cmd)
    run([sys.executable, str(root / "docs/spec/tools/verify_source_exact.py"), "--project-root", str(root), "--apps", args.apps])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
