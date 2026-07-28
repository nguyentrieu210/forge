#!/usr/bin/env python3
"""Validate the bounded Alumdoor 1.19 metadata release on a local tenant export."""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import sqlite3
import tempfile
from pathlib import Path


def stable(value):
    if isinstance(value, list):
        return [stable(item) for item in value]
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--parts", required=True, help="Glob for ordered SQL part files")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    parts = [Path(item) for item in sorted(glob.glob(args.parts))]
    if not parts:
        raise AssertionError(f"No SQL parts match {args.parts}")
    oversized = {part.name: part.stat().st_size for part in parts if part.stat().st_size > 80_000}
    if oversized:
        raise AssertionError(f"Metadata parts exceed 80 KB: {oversized}")
    content_hash = hashlib.sha256(
        json.dumps(stable(manifest), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    with tempfile.TemporaryDirectory(prefix="forge-alumdoor-release-") as folder:
        db = sqlite3.connect(Path(folder) / "release.sqlite3")
        try:
            db.executescript(Path(args.backup).read_text(encoding="utf-8"))
            baseline_documents = db.execute(
                "SELECT COUNT(*) FROM documents WHERE tenant_id='alu'"
            ).fetchone()[0]
            for part in parts:
                db.executescript(part.read_text(encoding="utf-8"))

            installed = db.execute(
                """
                SELECT version,content_hash,manifest_json
                FROM installed_apps WHERE tenant_id='alu' AND app_id='alumdoor'
                """
            ).fetchone()
            if installed is None:
                raise AssertionError("Alumdoor app disappeared")
            version, stored_hash, stored_manifest_text = installed
            stored_manifest = json.loads(stored_manifest_text)
            if version != "1.19.0":
                raise AssertionError(f"Wrong app version: {version}")
            if stored_hash != content_hash:
                raise AssertionError(f"Wrong content hash: {stored_hash} != {content_hash}")
            if stored_manifest != manifest:
                raise AssertionError("Stored manifest differs from compiler-normalized manifest")

            definitions = db.execute(
                "SELECT COUNT(*) FROM doctype_definitions WHERE tenant_id='alu' AND disabled=0"
            ).fetchone()[0]
            manifest_names = {entry["name"] for entry in manifest["doctypes"]}
            for required in {
                "Legacy Sales Order",
                "Legacy Sales Order Item",
                "Legacy Goods Intake",
                "Warranty Claim",
                "Production Standard",
            }:
                if required not in manifest_names:
                    raise AssertionError(f"Manifest misses {required}")
                row = db.execute(
                    "SELECT metadata_json FROM doctype_definitions WHERE tenant_id='alu' AND doctype=?",
                    (required,),
                ).fetchone()
                if row is None or json.loads(row[0])["name"] != required:
                    raise AssertionError(f"Definition missing or invalid: {required}")

            ownership = db.execute(
                "SELECT COUNT(*) FROM app_objects WHERE tenant_id='alu' AND app_id='alumdoor'"
            ).fetchone()[0]
            expected_ownership = (
                len(manifest["doctypes"])
                + len(manifest["workflows"])
                + len(manifest["print_formats"])
                + len(manifest["roles"])
                + len(manifest["fixtures"])
                + len(manifest["custom_fields"])
            )
            if ownership != expected_ownership:
                raise AssertionError(f"Ownership count {ownership} != {expected_ownership}")
            if db.execute(
                "SELECT COUNT(*) FROM documents WHERE tenant_id='alu'"
            ).fetchone()[0] != baseline_documents:
                raise AssertionError("Metadata release changed business documents")

            revisions_before = dict(db.execute(
                "SELECT doctype,revision FROM doctype_definitions WHERE tenant_id='alu'"
            ).fetchall())
            for part in parts:
                db.executescript(part.read_text(encoding="utf-8"))
            revisions_after = dict(db.execute(
                "SELECT doctype,revision FROM doctype_definitions WHERE tenant_id='alu'"
            ).fetchall())
            if revisions_before != revisions_after:
                raise AssertionError("Second metadata run churned revisions")
            quick_check = db.execute("PRAGMA quick_check").fetchone()[0]
            if quick_check != "ok":
                raise AssertionError(f"SQLite quick_check failed: {quick_check}")
        finally:
            db.close()

    print(json.dumps({
        "status": "PASS",
        "parts": len(parts),
        "largest_part_bytes": max(part.stat().st_size for part in parts),
        "version": version,
        "content_hash": stored_hash,
        "manifest_doctypes": len(manifest["doctypes"]),
        "active_definitions": definitions,
        "owned_objects": ownership,
        "documents_unchanged": baseline_documents,
        "idempotent_second_run": True,
        "quick_check": quick_check,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
