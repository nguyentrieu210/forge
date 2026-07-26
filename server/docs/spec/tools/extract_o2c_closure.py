#!/usr/bin/env python3
"""Gate 2E S3 — static source extraction for the O2C dependency closure.

Reads the SHA-verified pinned Frappe/ERPNext source (NOT a running site) and emits
a narrow, O2C-focused manifest under docs/spec/source-exact/generated/o2c/. Starts
from the four root documents, follows child-table edges into their closure, records
field-level schema, controller identity + lifecycle + ledger entry points +
whitelisted methods + mapping functions, doc_events hooks, and the two reports.

Every gap is classified (never silently dropped):
  STATIC_RESOLVED | RUNTIME_REQUIRED | DYNAMIC_EVAL_REQUIRED | MANUAL_REVIEW_REQUIRED | OUT_OF_SCOPE

This is source-truth only. Effective (custom-field/property-setter-merged) metadata,
report columns built in Python, hook merge order and depends_on/fetch_from evaluation
are RUNTIME_REQUIRED and are resolved by S4 (frappe_runtime_export.py) on a bench.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
from pathlib import Path
from typing import Any

PARSER_VERSION = "o2c-closure-1.0.0"

ROOTS = ["Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"]
# Side-effect / projection targets pulled into the closure explicitly.
LEDGER_DOCTYPES = ["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry", "Bin"]
REPORTS = [
    ("Accounts Receivable", "accounts", "accounts_receivable"),
    ("Stock Balance", "stock", "stock_balance"),
]
TABLE_FIELDTYPES = {"Table", "Table MultiSelect"}
FIELD_ATTRS = [
    "fieldname", "fieldtype", "label", "options", "reqd", "read_only", "hidden",
    "precision", "default", "depends_on", "mandatory_depends_on", "read_only_depends_on",
    "allow_on_submit", "no_copy", "unique", "fetch_from", "in_list_view",
    "search_index", "in_standard_filter", "bold", "collapsible",
]
# Substrings that mark a ledger / status / projection entry point in a controller.
LEDGER_PATTERNS = re.compile(
    r"(gl_entr|make_gl|sl_entries|stock_ledger|update_stock|update_bin|reserved_qty|"
    r"payment_ledger|outstanding|set_status|update_status|per_delivered|per_billed|"
    r"delivery_status|billing_status|update_billing|update_delivery|repost|advance_paid)",
    re.IGNORECASE,
)
LIFECYCLE_METHODS = {
    "validate", "before_validate", "before_save", "before_insert", "after_insert",
    "before_submit", "on_submit", "before_cancel", "on_cancel", "on_update",
    "on_update_after_submit", "on_change", "before_update_after_submit", "on_trash",
    "after_delete", "set_status", "update_status",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class App:
    def __init__(self, name: str, root: Path, commit: str, tag: str, license_name: str) -> None:
        self.name = name
        self.root = root                # repo root (contains the package dir)
        self.pkg = root / name          # python package dir (erpnext/ or frappe/)
        self.commit = commit
        self.tag = tag
        self.license_name = license_name


class Extractor:
    def __init__(self, apps: list[App], out_dir: Path) -> None:
        self.apps = apps
        self.out = out_dir
        self.file_hashes: dict[str, str] = {}
        self.gaps: list[dict[str, Any]] = []
        self.doctype_index: dict[str, tuple[App, Path]] = {}
        self.build_index()

    # ---- helpers ----
    def rel(self, app: App, path: Path) -> str:
        return f"{app.name}-{app.tag}/" + path.relative_to(app.root).as_posix()

    def record_file(self, app: App, path: Path) -> str:
        key = self.rel(app, path)
        if key not in self.file_hashes:
            self.file_hashes[key] = sha256_file(path)
        return key

    def gap(self, kind: str, subject: str, detail: str) -> None:
        self.gaps.append({"classification": kind, "subject": subject, "detail": detail})

    # ---- doctype index ----
    def build_index(self) -> None:
        for app in self.apps:
            if not app.pkg.is_dir():
                continue
            for path in app.pkg.rglob("*.json"):
                parts = path.parts
                if "doctype" not in parts:
                    continue
                if path.stem != path.parent.name:
                    continue  # only the canonical <folder>/<folder>.json
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if not isinstance(data, dict):
                    continue
                if data.get("doctype") not in (None, "DocType"):
                    continue
                name = data.get("name")
                if isinstance(name, str) and ("fields" in data or "istable" in data or "module" in data):
                    self.doctype_index.setdefault(name, (app, path))

    def load_doctype_json(self, name: str) -> tuple[App, Path, dict[str, Any]] | None:
        found = self.doctype_index.get(name)
        if not found:
            return None
        app, path = found
        data = json.loads(path.read_text(encoding="utf-8"))
        return app, path, data

    # ---- closure ----
    def compute_closure(self) -> list[str]:
        seen: dict[str, None] = {}
        queue = list(ROOTS)
        link_boundaries: set[str] = set()
        while queue:
            name = queue.pop(0)
            if name in seen:
                continue
            seen[name] = None
            loaded = self.load_doctype_json(name)
            if not loaded:
                self.gap("RUNTIME_REQUIRED", f"DocType:{name}",
                         "referenced doctype has no static JSON in the pinned closure (may be a core/virtual doctype resolved at runtime)")
                continue
            _, _, data = loaded
            for field in data.get("fields", []) or []:
                if not isinstance(field, dict):
                    continue
                ftype = field.get("fieldtype")
                opt = field.get("options")
                if ftype in TABLE_FIELDTYPES and isinstance(opt, str) and opt:
                    queue.append(opt)  # recurse fully into child tables
                elif ftype == "Link" and isinstance(opt, str) and opt:
                    link_boundaries.add(opt)  # boundary master — referenced, not recursed
        # explicit ledger/projection targets
        for name in LEDGER_DOCTYPES:
            if name not in seen:
                queue = [name]
                # add ledger doctype (and its own child tables) to the closure
                while queue:
                    n = queue.pop(0)
                    if n in seen:
                        continue
                    seen[n] = None
                    loaded = self.load_doctype_json(n)
                    if not loaded:
                        self.gap("RUNTIME_REQUIRED", f"DocType:{n}", "ledger doctype missing static JSON")
                        continue
                    _, _, data = loaded
                    for field in data.get("fields", []) or []:
                        if isinstance(field, dict) and field.get("fieldtype") in TABLE_FIELDTYPES and field.get("options"):
                            queue.append(field["options"])
        self.link_boundaries = sorted(link_boundaries - set(seen))
        return sorted(seen)

    # ---- field extraction ----
    def extract_fields(self, data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        fields: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        for field in data.get("fields", []) or []:
            if not isinstance(field, dict):
                continue
            record = {attr: field.get(attr) for attr in FIELD_ATTRS if attr in field}
            fields.append(record)
            ftype = field.get("fieldtype")
            opt = field.get("options")
            if ftype in TABLE_FIELDTYPES and opt:
                edges.append({"kind": "child_table", "via": field.get("fieldname"), "target": opt})
            elif ftype == "Link" and opt:
                edges.append({"kind": "link", "via": field.get("fieldname"), "target": opt})
            elif ftype == "Dynamic Link" and opt:
                edges.append({"kind": "dynamic_link", "via": field.get("fieldname"), "target_field": opt})
            # note dynamic evaluation dependencies
            if field.get("depends_on") or field.get("mandatory_depends_on") or field.get("read_only_depends_on"):
                self.gap("DYNAMIC_EVAL_REQUIRED", f"{data.get('name')}.{field.get('fieldname')}",
                         "depends_on expression is evaluated at runtime (JS/py eval)")
            if field.get("fetch_from"):
                self.gap("RUNTIME_REQUIRED", f"{data.get('name')}.{field.get('fieldname')}",
                         f"fetch_from '{field.get('fetch_from')}' resolves against a live linked document")
        return fields, edges

    # ---- controller extraction ----
    def extract_controller(self, name: str, app: App, json_path: Path) -> dict[str, Any] | None:
        py_path = json_path.with_suffix(".py")
        if not py_path.is_file():
            return None
        self.record_file(app, py_path)
        source = py_path.read_text(encoding="utf-8", errors="replace")
        try:
            tree = ast.parse(source)
        except SyntaxError as exc:
            self.gap("MANUAL_REVIEW_REQUIRED", f"controller:{name}", f"python parse error: {exc}")
            return {"name": name, "source_path": self.rel(app, py_path), "file_hash": self.file_hashes[self.rel(app, py_path)],
                    "parse_error": str(exc)}

        classes: list[dict[str, Any]] = []
        whitelisted: list[str] = []
        mapping_functions: list[str] = []

        def dotted(node: ast.AST) -> str:
            if isinstance(node, ast.Name):
                return node.id
            if isinstance(node, ast.Attribute):
                if isinstance(node.value, (ast.Name, ast.Attribute)):
                    return f"{dotted(node.value)}.{node.attr}"
                return node.attr  # receiver is a Call/Subscript/etc — keep just the method name
            return type(node).__name__

        def has_whitelist(dec_list: list[ast.expr]) -> bool:
            for dec in dec_list:
                target = dec.func if isinstance(dec, ast.Call) else dec
                if dotted(target).endswith("whitelist"):
                    return True
            return False

        def calls_in(node: ast.AST) -> set[str]:
            names: set[str] = set()
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call):
                    names.add(dotted(sub.func))
            return names

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                methods = [n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
                method_calls: set[str] = set()
                cls_whitelisted = []
                for n in node.body:
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        method_calls |= calls_in(n)
                        if has_whitelist(n.decorator_list):
                            cls_whitelisted.append(f"{node.name}.{n.name}")
                ledger_points = sorted({c for c in (method_calls | set(methods)) if LEDGER_PATTERNS.search(c)})
                classes.append({
                    "class": node.name,
                    "bases": [dotted(b) for b in node.bases],
                    "methods": sorted(methods),
                    "lifecycle_methods": sorted(set(methods) & LIFECYCLE_METHODS),
                    "ledger_entry_points": ledger_points,
                })
                whitelisted.extend(cls_whitelisted)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # module-level function
                if has_whitelist(node.decorator_list):
                    whitelisted.append(node.name)
                if any(dotted(c.func).endswith("get_mapped_doc") for c in ast.walk(node) if isinstance(c, ast.Call)):
                    mapping_functions.append(node.name)

        if mapping_functions:
            self.gap("RUNTIME_REQUIRED", f"controller:{name}",
                     f"get_mapped_doc mapping functions {mapping_functions} build target docs at runtime (field mapping + postprocess)")
        # Identify the primary controller class (PascalCase of the doctype) and sort it first;
        # the other ClassDefs in the module are usually exception types.
        primary = name.replace(" ", "")
        for cls in classes:
            cls["is_primary"] = cls["class"] == primary
        classes.sort(key=lambda c: (not c["is_primary"], c["class"]))
        primary_class = primary if any(c["is_primary"] for c in classes) else (classes[0]["class"] if classes else None)
        return {
            "name": name,
            "source_path": self.rel(app, py_path),
            "file_hash": self.file_hashes[self.rel(app, py_path)],
            "primary_class": primary_class,
            "classes": classes,
            "whitelisted_methods": sorted(set(whitelisted)),
            "mapping_functions": sorted(set(mapping_functions)),
            "extraction_confidence": "STATIC_RESOLVED",
            "unresolved": "actual posting amounts, MRO merge with mixins, and dynamic getattr dispatch are RUNTIME_REQUIRED",
        }

    def extract_client_script(self, name: str, app: App, json_path: Path) -> dict[str, Any] | None:
        js_path = json_path.with_suffix(".js")
        if not js_path.is_file():
            return None
        self.record_file(app, js_path)
        self.gap("DYNAMIC_EVAL_REQUIRED", f"client_script:{name}",
                 "client-side (browser JS) behavior is not statically executed; runtime/UX parity is out of oracle scope")
        return {"name": name, "source_path": self.rel(app, js_path),
                "file_hash": self.file_hashes[self.rel(app, js_path)],
                "note": "client script recorded by hash only; behavior DYNAMIC_EVAL_REQUIRED"}

    # ---- hooks ----
    def extract_hooks(self, closure: set[str]) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        for app in self.apps:
            hooks_path = app.pkg / "hooks.py"
            if not hooks_path.is_file():
                continue
            self.record_file(app, hooks_path)
            try:
                tree = ast.parse(hooks_path.read_text(encoding="utf-8", errors="replace"))
            except SyntaxError as exc:
                self.gap("MANUAL_REVIEW_REQUIRED", f"hooks:{app.name}", f"parse error: {exc}")
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Assign):
                    continue
                if not any(isinstance(t, ast.Name) and t.id == "doc_events" for t in node.targets):
                    continue
                if not isinstance(node.value, ast.Dict):
                    self.gap("DYNAMIC_EVAL_REQUIRED", f"hooks:{app.name}.doc_events",
                             "doc_events is not a literal dict; resolve on a bench")
                    continue
                # Extract per key so one non-literal value cannot drop the whole map.
                for key_node, val_node in zip(node.value.keys, node.value.values):
                    try:
                        key = ast.literal_eval(key_node)
                    except Exception:
                        continue
                    if not (key == "*" or key in closure):
                        continue
                    try:
                        merged.setdefault(app.name, {})[key] = ast.literal_eval(val_node)
                    except Exception:
                        merged.setdefault(app.name, {})[key] = {"$dynamic": "non-literal handler expression; resolve on bench"}
                        self.gap("DYNAMIC_EVAL_REQUIRED", f"hooks:{app.name}.doc_events['{key}']",
                                 "handler value is a non-literal expression")
        self.gap("RUNTIME_REQUIRED", "hooks.doc_events",
                 "final merge order across apps + '*' wildcard application is resolved by frappe.get_hooks at runtime (S4)")
        return merged

    # ---- reports ----
    def extract_reports(self) -> list[dict[str, Any]]:
        out = []
        erpnext = next((a for a in self.apps if a.name == "erpnext"), None)
        if not erpnext:
            return out
        for report_name, module, folder in REPORTS:
            base = erpnext.pkg / module / "report" / folder
            json_path = base / f"{folder}.json"
            py_path = base / f"{folder}.py"
            record: dict[str, Any] = {"name": report_name}
            if json_path.is_file():
                self.record_file(erpnext, json_path)
                data = json.loads(json_path.read_text(encoding="utf-8"))
                record.update({
                    "source_path": self.rel(erpnext, json_path),
                    "file_hash": self.file_hashes[self.rel(erpnext, json_path)],
                    "report_type": data.get("report_type"),
                    "ref_doctype": data.get("ref_doctype"),
                    "roles": [r.get("role") for r in data.get("roles", []) if isinstance(r, dict)],
                    "columns_in_json": bool(data.get("columns")),
                })
            if py_path.is_file():
                self.record_file(erpnext, py_path)
                record["query_source"] = self.rel(erpnext, py_path)
                record["query_hash"] = self.file_hashes[self.rel(erpnext, py_path)]
                self.gap("RUNTIME_REQUIRED", f"report:{report_name}",
                         "Script Report columns/rows are built in Python at runtime; capture via S5 report fixtures")
            record["extraction_confidence"] = "STATIC_EXTRACTED"
            out.append(record)
        return out

    # ---- orchestrate ----
    def run(self) -> dict[str, Any]:
        closure = self.compute_closure()
        closure_set = set(closure)
        (self.out / "doctypes").mkdir(parents=True, exist_ok=True)
        (self.out / "controllers").mkdir(parents=True, exist_ok=True)
        (self.out / "reports").mkdir(parents=True, exist_ok=True)
        (self.out / "hooks").mkdir(parents=True, exist_ok=True)
        (self.out / "rpc").mkdir(parents=True, exist_ok=True)
        (self.out / "client-scripts").mkdir(parents=True, exist_ok=True)

        doctype_records = []
        graph_nodes = []
        graph_edges = []
        controllers = []
        client_scripts = []
        rpc = {}

        for name in closure:
            loaded = self.load_doctype_json(name)
            if not loaded:
                continue
            app, path, data = loaded
            self.record_file(app, path)
            fields, edges = self.extract_fields(data)
            is_child = bool(data.get("istable"))
            record = {
                "name": name,
                "app": app.name,
                "module": data.get("module"),
                "source_path": self.rel(app, path),
                "file_hash": self.file_hashes[self.rel(app, path)],
                "commit": app.commit,
                "parser_version": PARSER_VERSION,
                "is_child_table": is_child,
                "is_submittable": bool(data.get("is_submittable")),
                "autoname": data.get("autoname"),
                "naming_rule": data.get("naming_rule"),
                "track_changes": bool(data.get("track_changes")),
                "fields": fields,
                "permissions": data.get("permissions", []),
                "edges": edges,
                "extraction_confidence": "STATIC_RESOLVED",
            }
            # controller (roots + any doctype with a .py)
            controller = self.extract_controller(name, app, path)
            if controller:
                record["controller"] = {"source_path": controller["source_path"], "file_hash": controller["file_hash"]}
                controllers.append(controller)
                if controller.get("whitelisted_methods"):
                    rpc[name] = controller["whitelisted_methods"]
            client = self.extract_client_script(name, app, path)
            if client:
                client_scripts.append(client)
                record["client_script"] = client["source_path"]
            (self.out / "doctypes" / f"{name}.json").write_text(
                json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            doctype_records.append({"name": name, "app": app.name, "is_child": is_child,
                                    "is_submittable": record["is_submittable"], "field_count": len(fields)})
            graph_nodes.append({"id": name, "app": app.name, "kind": "child_table" if is_child else "doctype"})
            for edge in edges:
                graph_edges.append({"from": name, **edge})

        for controller in controllers:
            (self.out / "controllers" / f"{controller['name']}.json").write_text(
                json.dumps(controller, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        for client in client_scripts:
            (self.out / "client-scripts" / f"{client['name']}.json").write_text(
                json.dumps(client, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        hooks = self.extract_hooks(closure_set)
        (self.out / "hooks" / "hooks.json").write_text(
            json.dumps({"doc_events": hooks, "note": "filtered to O2C closure + '*'; merge order RUNTIME_REQUIRED"},
                       indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (self.out / "rpc" / "whitelisted.json").write_text(
            json.dumps(rpc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        reports = self.extract_reports()
        for report in reports:
            fname = report["name"].replace(" ", "_")
            (self.out / "reports" / f"{fname}.json").write_text(
                json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        # boundary link masters (referenced, deliberately not recursed to avoid the full scan)
        for master in self.link_boundaries:
            self.gap("OUT_OF_SCOPE", f"master:{master}",
                     "linked master referenced by the closure but not a primary O2C document; boundary reference only")

        (self.out / "dependency-graph.json").write_text(
            json.dumps({"nodes": graph_nodes, "edges": graph_edges,
                        "link_boundaries": self.link_boundaries}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (self.out / "file-hashes.json").write_text(
            json.dumps(self.file_hashes, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")

        gap_counts: dict[str, int] = {}
        for gap in self.gaps:
            gap_counts[gap["classification"]] = gap_counts.get(gap["classification"], 0) + 1
        (self.out / "parse-errors.json").write_text(
            json.dumps({"gaps": self.gaps, "counts_by_classification": gap_counts}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8")

        manifest = {
            "schema_version": "1.0.0",
            "parser_version": PARSER_VERSION,
            "gate": "2E-S3",
            "scope": "O2C dependency closure (static source only)",
            "apps": [{"app": a.name, "tag": a.tag, "commit": a.commit, "license": a.license_name} for a in self.apps],
            "roots": ROOTS,
            "ledger_doctypes": LEDGER_DOCTYPES,
            "reports": [r[0] for r in REPORTS],
            "closure_doctypes": doctype_records,
            "counts": {
                "closure_doctypes": len(doctype_records),
                "child_tables": sum(1 for d in doctype_records if d["is_child"]),
                "controllers": len(controllers),
                "client_scripts": len(client_scripts),
                "reports": len(reports),
                "whitelisted_methods": sum(len(v) for v in rpc.values()),
                "files_hashed": len(self.file_hashes),
                "link_boundaries": len(self.link_boundaries),
                "gaps": gap_counts,
            },
            "claim_level": "STATIC_EXTRACTED",
            "runtime_claim": "RUNTIME_RESOLVED requires S4 (frappe_runtime_export.py on a pinned bench); NOT satisfied here",
        }
        (self.out / "source-manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[3])
    ap.add_argument("--sources-dir", type=Path, default=None)
    args = ap.parse_args()
    project_root = args.project_root.resolve()
    sources_dir = (args.sources_dir or (project_root.parent / "upstream")).resolve()
    lock = json.loads((project_root / "source-lock.json").read_text(encoding="utf-8"))
    locked = {s["app"]: s for s in lock.get("sources", [])}

    apps = [
        App("frappe", sources_dir / "frappe-v16.19.0", locked["frappe"]["full_sha"], "v16.19.0", locked["frappe"].get("license", "MIT")),
        App("erpnext", sources_dir / "erpnext-v16.20.0", locked["erpnext"]["full_sha"], "v16.20.0", locked["erpnext"].get("license", "GPL-3.0")),
    ]
    out_dir = project_root / "docs" / "spec" / "source-exact" / "generated" / "o2c"
    manifest = Extractor(apps, out_dir).run()
    print(json.dumps({"ok": True, "out": str(out_dir), "counts": manifest["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
