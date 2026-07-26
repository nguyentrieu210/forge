#!/usr/bin/env python3
"""Offline release gate for MetaForge orchestration definitions."""
from __future__ import annotations
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "frappe-app" / "metaforge" / "metaforge" / "api.py"
source = API.read_text(encoding="utf-8")
compile(source, str(API), "exec")
tree = ast.parse(source)
assignments: dict[str, object] = {}
functions: set[str] = set()
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        functions.add(node.name)
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in {"_PROCESS_TEMPLATES", "_DOMAIN_CONFIG"}:
                assignments[target.id] = ast.literal_eval(node.value)

required_functions = {
    "get_business_context", "get_contextual_list", "get_contextual_count", "get_application_catalog",
    "get_overview", "get_processes", "get_access_profile", "set_user_roles", "add_user_permission",
    "remove_user_permission", "explain_permission", "resolve_display_values", "translate_strings",
}
missing = sorted(required_functions - functions)
if missing:
    raise SystemExit(f"Missing product endpoints: {', '.join(missing)}")

processes = assignments.get("_PROCESS_TEMPLATES")
if not isinstance(processes, dict) or not processes:
    raise SystemExit("_PROCESS_TEMPLATES missing or empty")
for domain, definitions in processes.items():
    if not isinstance(definitions, list) or not definitions:
        raise SystemExit(f"Process domain {domain!r} is empty")
    for definition in definitions:
        stages = definition.get("stages") or []
        if not stages:
            raise SystemExit(f"Process {domain}/{definition.get('key')} has no stages")
        keys: set[str] = set()
        signatures: set[str] = set()
        for stage in stages:
            required = {"key", "label", "doctype", "filters"}
            missing_stage = required - set(stage)
            if missing_stage:
                raise SystemExit(f"Stage {domain}/{definition.get('key')} missing {sorted(missing_stage)}")
            if stage["key"] in keys:
                raise SystemExit(f"Duplicate stage key {domain}/{definition.get('key')}/{stage['key']}")
            keys.add(stage["key"])
            signature = repr((stage["doctype"], stage["filters"]))
            if signature in signatures:
                raise SystemExit(f"Duplicate semantic stage in {domain}/{definition.get('key')}: {signature}")
            signatures.add(signature)

overviews = assignments.get("_DOMAIN_CONFIG")
if not isinstance(overviews, dict) or not overviews:
    raise SystemExit("_DOMAIN_CONFIG missing or empty")
missing_process_domains = sorted(set(overviews) - set(processes))
if missing_process_domains:
    raise SystemExit(f"Overview domains without Process definitions: {missing_process_domains}")

print(f"PASS Python compile: {API.relative_to(ROOT)}")
print(f"PASS Required endpoints: {len(required_functions)}")
print(f"PASS Overview domains: {len(overviews)}")
print(f"PASS Process domains: {len(processes)}")
print("PASS No duplicate stage keys/filters inside a process")
