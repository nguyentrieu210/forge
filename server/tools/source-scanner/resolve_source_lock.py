
#!/usr/bin/env python3
from __future__ import annotations
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
lock_path = root / "source-lock.json"
lock = json.loads(lock_path.read_text())
for source in lock["sources"]:
    tag = source["tag"]
    repo = source["repo"] + ".git"
    candidates = [f"refs/tags/{tag}^{{}}", f"refs/tags/{tag}"]
    sha = None
    for ref in candidates:
        proc = subprocess.run(["git", "ls-remote", repo, ref], text=True, capture_output=True)
        if proc.returncode == 0 and proc.stdout.strip():
            sha = proc.stdout.split()[0]
            break
    source["full_sha"] = sha
    source["status"] = "LOCKED" if sha else "FULL_SHA_PENDING"
lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"locked": sum(1 for s in lock["sources"] if s["status"] == "LOCKED"), "total": len(lock["sources"])}, indent=2))
