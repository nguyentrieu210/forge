#!/usr/bin/env python3
"""Fetch and verify an immutable public GitHub source archive.

This utility resolves annotated/lightweight tags through the official GitHub API,
requires the resolved commit to match the locked 40-character SHA, downloads the
zipball, performs path-safe extraction, and writes an acquisition receipt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import ssl
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

USER_AGENT = "CloudForge-SourceExact/1.0"


def request_json(url: str, token: str | None) -> Any:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT,
               "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as response:
        return json.load(response)


def download(url: str, target: Path, token: str | None) -> tuple[str, int, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT,
               "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    h = hashlib.sha256(); size = 0
    with urllib.request.urlopen(req, timeout=300, context=ssl.create_default_context()) as response, target.open("wb") as out:
        final_url = response.geturl()
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            out.write(block); h.update(block); size += len(block)
    return h.hexdigest(), size, final_url


def resolve_commit(owner: str, repo: str, tag: str, token: str | None) -> str:
    encoded = urllib.parse.quote(tag, safe="")
    ref = request_json(f"https://api.github.com/repos/{owner}/{repo}/git/ref/tags/{encoded}", token)
    obj = ref["object"]
    # Annotated tags point to a tag object; lightweight tags point directly to a commit.
    while obj.get("type") == "tag":
        obj = request_json(obj["url"], token)["object"]
    if obj.get("type") != "commit":
        raise RuntimeError(f"Tag {tag} resolved to unsupported object type {obj.get('type')!r}")
    sha = obj.get("sha")
    if not isinstance(sha, str) or len(sha) != 40:
        raise RuntimeError(f"Invalid resolved commit SHA: {sha!r}")
    return sha.lower()


def safe_extract(archive: Path, destination: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    dest_resolved = destination.resolve()
    with zipfile.ZipFile(archive) as zf:
        roots = set()
        for info in zf.infolist():
            member = Path(info.filename)
            if member.is_absolute() or ".." in member.parts:
                raise RuntimeError(f"Unsafe archive member: {info.filename}")
            if member.parts:
                roots.add(member.parts[0])
            target = (destination / member).resolve()
            if target != dest_resolved and dest_resolved not in target.parents:
                raise RuntimeError(f"Archive path escapes destination: {info.filename}")
        zf.extractall(destination)
    if len(roots) != 1:
        raise RuntimeError(f"Expected one archive root, found {sorted(roots)}")
    return destination / next(iter(roots))


def tree_fingerprint(root: Path) -> tuple[str, int]:
    h = hashlib.sha256(); count = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        fh = hashlib.sha256(path.read_bytes()).hexdigest()
        h.update(rel.encode()); h.update(b"\0"); h.update(fh.encode()); h.update(b"\n")
        count += 1
    return h.hexdigest(), count


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", required=True, help="owner/repository")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--expected-commit", required=True)
    ap.add_argument("--destination", required=True, type=Path)
    ap.add_argument("--receipt", type=Path)
    ap.add_argument("--token-env", default="GITHUB_TOKEN")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()
    if "/" not in args.repo:
        raise SystemExit("--repo must be owner/repository")
    owner, repo = args.repo.split("/", 1)
    expected = args.expected_commit.lower()
    if len(expected) != 40:
        raise SystemExit("--expected-commit must be a full 40-character SHA")
    token = os.environ.get(args.token_env)
    resolved = resolve_commit(owner, repo, args.tag, token)
    if resolved != expected:
        raise SystemExit(f"LOCK MISMATCH: tag resolved to {resolved}, expected {expected}")
    destination = args.destination.resolve()
    if destination.exists():
        if not args.overwrite:
            raise SystemExit(f"Destination exists: {destination}; pass --overwrite")
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cloudforge-source-") as td:
        temp = Path(td)
        archive = temp / f"{repo}-{args.tag}.zip"
        archive_url = f"https://api.github.com/repos/{owner}/{repo}/zipball/{urllib.parse.quote(args.tag, safe='')}"
        archive_hash, archive_size, final_url = download(archive_url, archive, token)
        extracted = safe_extract(archive, temp / "extract")
        shutil.move(str(extracted), str(destination))
    tree_hash, file_count = tree_fingerprint(destination)
    receipt = {
        "schema_version": "1.0.0", "repository": f"https://github.com/{owner}/{repo}",
        "tag": args.tag, "resolved_commit": resolved, "archive_sha256": archive_hash,
        "archive_size_bytes": archive_size, "download_final_host": urllib.parse.urlparse(final_url).hostname,
        "tree_sha256": tree_hash, "file_count": file_count, "destination": str(destination),
    }
    receipt_path = args.receipt or destination.with_name(destination.name + ".acquisition.json")
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
