#!/usr/bin/env python3
"""Generate or verify the immutable content manifest for a release source tree."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest_path = root / "RELEASE_CONTENT_MANIFEST.json"
excluded_dirs = {"dist", "node_modules", ".git", ".wrangler", "coverage", "__pycache__", "backups"}
excluded_files = {manifest_path.name, "PROMOTION_EVIDENCE.json"}
excluded_suffixes = {".log", ".pyc"}
excluded_secret_prefixes = (".dev.vars", ".env")
excluded_prefixes = {
    "docs/spec/source-exact/generated",
    "docs/spec/source-exact/oracle/fixtures",
    "docs/spec/source-exact/oracle/differential",
    "docs/spec/source-exact/runtime",
}


def files():
    result = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        relative_posix = relative.as_posix()
        if any(part in excluded_dirs for part in relative.parts):
            continue
        if any(relative_posix == prefix or relative_posix.startswith(f"{prefix}/") for prefix in excluded_prefixes):
            continue
        if (
            not path.is_file()
            or path.name in excluded_files
            or path.suffix in excluded_suffixes
            or path.name.startswith(excluded_secret_prefixes)
        ):
            continue
        result.append(path)
    return sorted(result, key=lambda item: item.relative_to(root).as_posix())


def build():
    entries = []
    tree = hashlib.sha256()
    for path in files():
        relative = path.relative_to(root).as_posix()
        payload = path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        size = len(payload)
        entries.append({"path": relative, "sha256": digest, "size": size})
        tree.update(relative.encode())
        tree.update(b"\0")
        tree.update(digest.encode())
        tree.update(b"\0")
        tree.update(str(size).encode())
        tree.update(b"\n")
    package = json.loads((root / "package.json").read_text())
    return {
        "format": 1,
        "package": package["name"],
        "version": package["version"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "file_count": len(entries),
        "tree_sha256": tree.hexdigest(),
        "excluded": sorted(excluded_dirs | excluded_files | excluded_prefixes | set(excluded_secret_prefixes)),
        "files": entries,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    current = build()
    if args.verify:
        expected = json.loads(manifest_path.read_text())
        for field in ["format", "package", "version", "file_count", "tree_sha256", "files"]:
            if expected.get(field) != current.get(field):
                print("RELEASE_CONTENT_MANIFEST_CURRENT_BEGIN")
                print(json.dumps(current, indent=2))
                print("RELEASE_CONTENT_MANIFEST_CURRENT_END")
                raise SystemExit(f"RELEASE_MANIFEST_MISMATCH:{field}")
        print(f"RELEASE_CONTENT_MANIFEST_PASS files={current['file_count']} tree={current['tree_sha256']}")
        return
    manifest_path.write_text(json.dumps(current, indent=2) + "\n")
    print(f"RELEASE_CONTENT_MANIFEST_WRITTEN files={current['file_count']} tree={current['tree_sha256']}")


if __name__ == "__main__":
    main()
