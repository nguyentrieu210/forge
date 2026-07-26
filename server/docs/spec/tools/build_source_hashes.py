#!/usr/bin/env python3
"""Gate 2E — anchor every CloudForge source reference in the differential to a current
content hash, so `cloudforge_source` refs (which cite file:line) stay verifiable even
as line numbers drift. Writes docs/spec/source-exact/oracle/CLOUDFORGE_SOURCE_HASHES.json
mapping each referenced repo file -> {sha256, lines, bytes}.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DIFF = ROOT / "docs" / "spec" / "source-exact" / "oracle" / "differential"
OUT = ROOT / "docs" / "spec" / "source-exact" / "oracle" / "CLOUDFORGE_SOURCE_HASHES.json"


def main() -> int:
    refs: set[str] = set()
    for f in DIFF.glob("O2C-*.json"):
        rec = json.loads(f.read_text(encoding="utf-8"))
        for src in (rec.get("cloudforge", {}).get("source") or []):
            # strip a :line / :line-range[,range...] suffix to get the repo path
            path = re.sub(r":\d.*$", "", src.strip())
            refs.add(path)

    files = {}
    missing = []
    for rel in sorted(refs):
        p = ROOT / rel
        if not p.is_file():
            missing.append(rel)
            continue
        data = p.read_bytes()
        files[rel] = {
            "sha256": hashlib.sha256(data).hexdigest(),
            "lines": data.count(b"\n") + 1,
            "bytes": len(data),
        }

    manifest = {
        "gate": "2E-source-anchor",
        "note": "SHA-256 of every CloudForge source file cited by the O2C differential, "
                "captured at the current repo state; anchors file:line references to content.",
        "referenced_files": len(files),
        "missing_referenced_paths": missing,
        "files": files,
    }
    OUT.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "referenced_files": len(files), "missing": missing}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
