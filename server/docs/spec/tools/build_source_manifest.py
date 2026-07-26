#!/usr/bin/env python3
"""Compatibility wrapper for the source-exact parser.

New automation should call source_exact_parser.py directly. This wrapper keeps the
old CLI shape and writes its requested manifest file plus the complete generated
bundle in a sibling `<stem>-source-exact/` directory.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from source_exact_parser import DEFAULT_EXCLUDES, SourceScanner


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--app", required=True)
    ap.add_argument("--root", required=True, type=Path)
    ap.add_argument("--commit", required=True)
    ap.add_argument("--tag")
    ap.add_argument("--license", dest="license_name", default="UNKNOWN")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    bundle = args.out.parent / f"{args.out.stem}-source-exact"
    scanner = SourceScanner(
        app=args.app, root=args.root, commit=args.commit.lower(), tag=args.tag,
        license_name=args.license_name, out=bundle, max_text_bytes=20 * 1024 * 1024,
        excludes=DEFAULT_EXCLUDES, emit_markdown=True,
    )
    scanner.scan()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(bundle / "manifest.json", args.out)
    print(f"manifest={args.out}\nbundle={bundle}")
    return 0 if not scanner.errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
