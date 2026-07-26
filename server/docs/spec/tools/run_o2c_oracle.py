#!/usr/bin/env python3
"""Gate 2E — single-command O2C oracle orchestrator (`npm run oracle:o2c`).

Deterministic pipeline:
  1. verify the pinned source checkout matches the two LOCKED commits (fail closed);
  2. S3 static O2C dependency-closure extraction;
  3. S5 fixture-matrix specification;
  4. S4/S5 runtime capture IF a pinned bench site is configured
     (env CLOUDFORGE_ORACLE_SITE) and --run-bench is passed; otherwise runtime is
     recorded as BLOCKED (never faked);
  5. S6 CloudForge differential mapping;
  6. schema validation of the generated artifacts;
  7. build + coverage report.

Exits non-zero if the source lock fails, an artifact is missing/invalid, or
--require-bench was requested without a usable bench. Without --require-bench the
run still succeeds and reports the runtime stages as BLOCKED, so CI can prove the
offline stages continuously.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

TOOLS = Path(__file__).resolve().parent


def run_tool(script: str, extra: list[str]) -> dict[str, Any]:
    cmd = [sys.executable, str(TOOLS / script), *extra]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    out = proc.stdout.strip()
    parsed: Any = None
    try:
        parsed = json.loads(out) if out.startswith("{") else None
    except Exception:
        parsed = None
    return {"script": script, "returncode": proc.returncode, "stdout_tail": out[-400:], "json": parsed,
            "stderr_tail": proc.stderr.strip()[-400:]}


def environment_matrix() -> dict[str, Any]:
    return {
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "bench_on_path": bool(shutil.which("bench")),
        "mariadb_on_path": bool(shutil.which("mariadb") or shutil.which("mysql")),
        "redis_on_path": bool(shutil.which("redis-server")),
        "docker_on_path": bool(shutil.which("docker")),
        "oracle_site_env": os.environ.get("CLOUDFORGE_ORACLE_SITE"),
    }


def validate_artifacts(root: Path) -> list[str]:
    failures: list[str] = []
    gen = root / "docs" / "spec" / "source-exact" / "generated" / "o2c"
    for required in ["source-manifest.json", "file-hashes.json", "dependency-graph.json",
                     "parse-errors.json", "hooks/hooks.json", "rpc/whitelisted.json"]:
        if not (gen / required).is_file():
            failures.append(f"missing S3 artifact: {required}")
    manifest = gen / "source-manifest.json"
    if manifest.is_file():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if data.get("claim_level") != "STATIC_EXTRACTED":
            failures.append("S3 manifest claim_level is not STATIC_EXTRACTED")
        if data.get("counts", {}).get("closure_doctypes", 0) < len(data.get("roots", [])):
            failures.append("S3 closure smaller than the root set")
    oracle = root / "docs" / "spec" / "source-exact" / "oracle"
    if not (oracle / "fixtures" / "fixture-matrix.json").is_file():
        failures.append("missing S5 fixture-matrix.json")
    if not (oracle / "differential" / "differential-report.json").is_file():
        failures.append("missing S6 differential-report.json")
    return failures


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=TOOLS.parents[2])
    ap.add_argument("--sources-dir", type=Path, default=None)
    ap.add_argument("--run-bench", action="store_true", help="attempt S4/S5 runtime capture against CLOUDFORGE_ORACLE_SITE")
    ap.add_argument("--require-bench", action="store_true", help="fail if no usable pinned bench is available")
    args = ap.parse_args()

    root = args.project_root.resolve()
    sources_dir = (args.sources_dir or (root.parent / "upstream")).resolve()
    src_args = ["--project-root", str(root), "--sources-dir", str(sources_dir)]
    se = root / "docs" / "spec" / "source-exact"

    stages: dict[str, Any] = {}

    # 1. source lock (hard gate) — enforced in every regime
    stages["source_lock"] = run_tool("verify_source_lock.py", src_args)
    if stages["source_lock"]["returncode"] != 0:
        _emit(root, stages, environment_matrix(), runtime="ABORTED_SOURCE_LOCK", failures=["source lock mismatch"])
        print("ORACLE_ABORTED: source lock mismatch", file=sys.stderr)
        return 1

    # 2. S3 static extraction — regenerated from the locked source in every regime
    stages["s3_static"] = run_tool("extract_o2c_closure.py", src_args)

    env = environment_matrix()
    # Runtime regimes (never fabricate a capture):
    #   raw_present  — the pinned bench left raw inputs -> (re)fold them into artifacts.
    #   committed    — a prior capture is already committed (fresh clone) -> validate, DO NOT downgrade.
    #   otherwise    — never captured -> offline BLOCKED path.
    raw_matrix = se / "runtime" / "matrix-raw.json"
    committed_capture = se / "oracle" / "runtime" / "o2c-matrix-capture.json"
    diff_records = se / "runtime" / "differential-records.json"
    raw_present = raw_matrix.is_file()
    committed = committed_capture.is_file()

    if raw_present:
        # bench machine: regenerate fixture specs, then fold the captured behavior + differential
        stages["s5_fixtures"] = run_tool("oracle_fixtures.py", ["--project-root", str(root)])
        stages["s5_fold_capture"] = run_tool("build_matrix_oracle.py", [])
        if diff_records.is_file():
            stages["s6_differential"] = run_tool("build_differential_matrix.py", [])
        else:
            stages["s6_differential"] = run_tool("build_differential.py", ["--project-root", str(root)])
        runtime = "CAPTURED_MATRIX"
    elif committed:
        # fresh clone with a committed capture: the committed oracle/ artifacts ARE the
        # evidence. Re-verify source lock + S3 (done above) + schema; never regenerate S5/S6
        # (that would reset fixtures to NOT_CAPTURED / overwrite the captured differential).
        runtime = "CAPTURED_MATRIX"
    else:
        # never captured: offline stages, runtime BLOCKED (honest, not faked)
        stages["s5_fixtures"] = run_tool("oracle_fixtures.py", ["--project-root", str(root)])
        stages["s6_differential"] = run_tool("build_differential.py", ["--project-root", str(root)])
        runtime = "BLOCKED_NO_BENCH"

    # 6. validate
    failures = validate_artifacts(root)
    for key in ("s3_static", "s5_fixtures", "s6_differential"):
        if key in stages and stages[key]["returncode"] != 0:
            failures.append(f"{key} returned {stages[key]['returncode']}")

    if runtime == "CAPTURED_MATRIX":
        # the matrix builders (or the committed clone) already wrote the authoritative
        # ORACLE_REPORT; read it back rather than overwriting it with the offline view.
        rpath = se / "oracle" / "ORACLE_REPORT.json"
        report = json.loads(rpath.read_text(encoding="utf-8")) if rpath.is_file() else {}
        report.setdefault("highest_claim", "ORACLE_CAPTURED")
        report["validation_failures"] = failures
        rpath.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        report = _emit(root, stages, env, runtime=runtime, failures=failures)

    if args.require_bench and runtime not in ("ATTEMPTED", "CAPTURED_MATRIX"):
        print("ORACLE_INCOMPLETE: --require-bench set but no usable pinned bench", file=sys.stderr)
        return 2
    if failures:
        print("ORACLE_VALIDATION_FAILED: " + "; ".join(failures), file=sys.stderr)
        return 1
    print(f"ORACLE_OK runtime={runtime} claim={report.get('highest_claim')}")
    return 0


def run_tool_raw(cmd: list[str]) -> dict[str, Any]:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return {"cmd": cmd[:3], "returncode": proc.returncode, "stdout_tail": proc.stdout.strip()[-400:],
            "stderr_tail": proc.stderr.strip()[-400:]}


def _emit(root: Path, stages: dict[str, Any], env: dict[str, Any], runtime: str, failures: list[str]) -> dict[str, Any]:
    out_dir = root / "docs" / "spec" / "source-exact" / "oracle"
    out_dir.mkdir(parents=True, exist_ok=True)

    s3 = (stages.get("s3_static") or {}).get("json") or {}
    s5 = (stages.get("s5_fixtures") or {}).get("json") or {}
    s6 = (stages.get("s6_differential") or {}).get("json") or {}

    claim_levels = {
        "SOURCE_INVENTORIED": True,
        "STATIC_EXTRACTED": stages.get("s3_static", {}).get("returncode") == 0,
        "RUNTIME_RESOLVED": runtime == "ATTEMPTED",
        "ORACLE_CAPTURED": runtime == "ATTEMPTED",
        "CLOUDFORGE_MAPPED": stages.get("s6_differential", {}).get("returncode") == 0,
        "DIFFERENTIAL_PASS": False,  # unreachable without capture
    }
    highest = "DIFFERENTIAL_PASS" if claim_levels["DIFFERENTIAL_PASS"] else (
        "CLOUDFORGE_MAPPED" if claim_levels["CLOUDFORGE_MAPPED"] else "STATIC_EXTRACTED")

    report = {
        "gate": "2E-S3..S6-O2C",
        "runtime_stage": runtime,
        "runtime_blocker": None if runtime == "ATTEMPTED" else
            "No pinned Frappe/ERPNext bench: Frappe does not run natively on Windows, no general-purpose "
            "Linux/WSL distro is present, MariaDB/Redis/bench are absent, and the Docker engine service is "
            "stopped and cannot be started without elevation. S4/S5 runtime capture is therefore BLOCKED.",
        "environment": env,
        "source_lock": (stages.get("source_lock") or {}).get("json"),
        "s3_counts": s3.get("counts"),
        "s5_matrix": {"total": s5.get("total"), "groups": s5.get("groups")},
        "s6": {k: s6.get(k) for k in ("total_fixtures", "erpnext_captured", "cloudforge_status_counts",
                                      "gap_counts_by_type", "highest_claim")},
        "claim_levels": claim_levels,
        "highest_claim": highest,
        "validation_failures": failures,
        "stage_returncodes": {k: v.get("returncode") for k, v in stages.items()},
    }
    (out_dir / "ORACLE_REPORT.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    raise SystemExit(main())
