#!/usr/bin/env python3
"""Generate source-derived documentation for pinned Frappe applications.

The scanner never imports or executes upstream application code. It performs:
- complete file inventory and SHA-256 hashing;
- lossless JSON capture for DocType/report/workspace/page metadata;
- Python AST extraction for symbols, hooks, lifecycle methods, RPC methods,
  database calls, SQL fingerprints, exceptions and document references;
- conservative JavaScript/TypeScript/Vue static extraction;
- dependency graph generation;
- human-readable Markdown dossiers plus machine-readable JSON indexes.

"100%" in this tool means every file in the supplied immutable source tree is
inventoried. Static extraction coverage and behavioral parity are reported as
separate metrics and are never inferred from inventory coverage.
"""
from __future__ import annotations

import argparse
import ast
import dataclasses
import datetime as dt
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Iterator

SCHEMA_VERSION = "1.0.0"
TOOL_VERSION = "1.0.0"

DEFAULT_EXCLUDES = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", ".venv", "venv", "env", "dist", "build",
    "sites", ".bench", ".idea", ".vscode",
}

TEXT_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".vue", ".json", ".md", ".txt",
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".xml", ".csv",
    ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".jinja", ".j2",
    ".sql", ".po", ".pot", ".sh", ".fish", ".ps1", ".patch", ".diff",
}

PYTHON_LIFECYCLE_METHODS = {
    "autoname", "before_insert", "after_insert", "validate", "before_validate",
    "before_save", "on_update", "before_submit", "on_submit", "before_cancel",
    "on_cancel", "before_update_after_submit", "on_update_after_submit",
    "on_trash", "after_delete", "onload", "onload_post_render",
}

FRAPPE_CALL_INTEREST = (
    "frappe.throw", "frappe.msgprint", "frappe.get_doc", "frappe.new_doc",
    "frappe.get_all", "frappe.get_list", "frappe.get_value", "frappe.set_value",
    "frappe.db.get_value", "frappe.db.get_all", "frappe.db.get_list",
    "frappe.db.set_value", "frappe.db.sql", "frappe.enqueue",
    "frappe.enqueue_doc", "frappe.publish_realtime", "frappe.get_cached_doc",
    "frappe.get_cached_value", "frappe.has_permission", "frappe.only_for",
    "get_mapped_doc", "make_gl_entries", "make_reverse_gl_entries",
    "make_sl_entries", "update_bin", "update_outstanding_amt",
)

DOC_CALL_SUFFIXES = {
    "get_doc", "new_doc", "get_cached_doc", "get_all", "get_list", "get_value",
    "get_cached_value", "set_value", "delete_doc", "rename_doc", "get_meta",
}

KIND_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|/)doctype/[^/]+/[^/]+\.json$"), "doctype_schema"),
    (re.compile(r"(^|/)doctype/[^/]+/[^/]+\.py$"), "doctype_controller"),
    (re.compile(r"(^|/)doctype/[^/]+/[^/]+\.(js|ts)$"), "doctype_client"),
    (re.compile(r"(^|/)report/[^/]+/[^/]+\.json$"), "report_schema"),
    (re.compile(r"(^|/)report/[^/]+/[^/]+\.py$"), "report_controller"),
    (re.compile(r"(^|/)report/[^/]+/[^/]+\.(js|ts)$"), "report_client"),
    (re.compile(r"(^|/)page/[^/]+/[^/]+\.(json|py|js|ts|vue)$"), "page"),
    (re.compile(r"(^|/)workspace/[^/]+/[^/]+\.json$"), "workspace"),
    (re.compile(r"(^|/)dashboard_chart/[^/]+/[^/]+\.json$"), "dashboard_chart"),
    (re.compile(r"(^|/)number_card/[^/]+/[^/]+\.json$"), "number_card"),
    (re.compile(r"(^|/)dashboard/[^/]+/[^/]+\.json$"), "dashboard"),
    (re.compile(r"(^|/)print_format/[^/]+/[^/]+\.json$"), "print_format"),
    (re.compile(r"(^|/)web_form/[^/]+/[^/]+\.json$"), "web_form"),
    (re.compile(r"(^|/)notification/[^/]+/[^/]+\.json$"), "notification"),
    (re.compile(r"(^|/)workflow/[^/]+/[^/]+\.json$"), "workflow"),
    (re.compile(r"(^|/)hooks\.py$"), "hooks"),
    (re.compile(r"(^|/)patches\.txt$"), "patches"),
    (re.compile(r"(^|/)fixtures?/"), "fixture"),
    (re.compile(r"(^|/)(tests?|test_[^/]+)/.*\.(py|js|ts|json)$"), "test"),
    (re.compile(r"(^|/)test_[^/]+\.py$"), "test"),
    (re.compile(r"(^|/)config/.*\.py$"), "config"),
    (re.compile(r"(^|/)public/.*\.(js|ts|vue|css|scss)$"), "public_asset"),
    (re.compile(r"(^|/)templates?/"), "template"),
    (re.compile(r"(^|/)translations?/"), "translation"),
]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def _json_default(obj: Any) -> Any:
    # ast.literal_eval of a set literal (e.g. {"a", "b"}) yields a Python set, which
    # is not JSON-serializable. Represent sets as sorted arrays (JSON has no set),
    # bytes as text, and fall back to str() so serialization never crashes.
    if isinstance(obj, (set, frozenset)):
        return sorted(obj, key=repr)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", "replace")
    return str(obj)


def json_dump(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False, default=_json_default) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-.").lower()
    return slug or "unnamed"


def dotted_name(node: ast.AST | None) -> str | None:
    if node is None:
        return None
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = dotted_name(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    if isinstance(node, ast.Call):
        return dotted_name(node.func)
    if isinstance(node, ast.Subscript):
        return dotted_name(node.value)
    return None


def _jsonify(value: Any) -> Any:
    # Normalize ast.literal_eval output to JSON-safe structures: sets -> sorted
    # lists, tuples -> lists, and non-primitive dict keys (e.g. tuple keys) -> repr,
    # so serializing source literals never fails on set values or tuple keys.
    if isinstance(value, (set, frozenset)):
        return sorted((_jsonify(v) for v in value), key=repr)
    if isinstance(value, (tuple, list)):
        return [_jsonify(v) for v in value]
    if isinstance(value, dict):
        out: dict[Any, Any] = {}
        for k, v in value.items():
            key = k if (isinstance(k, (str, int, float, bool)) or k is None) else repr(k)
            out[key] = _jsonify(v)
        return out
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return value


def literal(node: ast.AST | None, *, max_string: int = 2000) -> Any:
    if node is None:
        return None
    try:
        value = ast.literal_eval(node)
    except Exception:
        return None
    if isinstance(value, str) and len(value) > max_string:
        return {"sha256": sha256_text(value), "length": len(value), "excerpt": value[:240]}
    return _jsonify(value)


def ast_expr(node: ast.AST | None) -> str | None:
    if node is None:
        return None
    try:
        return ast.unparse(node)
    except Exception:
        return None


def normalize_sql(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def classify_path(rel: str) -> str:
    normalized = rel.replace("\\", "/")
    for rx, kind in KIND_PATTERNS:
        if rx.search(normalized):
            return kind
    suffix = Path(normalized).suffix.lower()
    if suffix == ".py":
        return "python_module"
    if suffix in {".js", ".jsx", ".ts", ".tsx", ".vue"}:
        return "client_module"
    if suffix == ".json":
        return "json_data"
    if suffix in {".md", ".txt", ".rst"}:
        return "documentation"
    if suffix in {".html", ".jinja", ".j2"}:
        return "template"
    if suffix in {".sql"}:
        return "sql"
    if suffix in {".po", ".pot", ".csv"}:
        return "translation_or_data"
    return "other"


def module_of(rel: str) -> str:
    parts = Path(rel).parts
    for anchor in ("doctype", "report", "page", "workspace", "dashboard_chart", "number_card"):
        if anchor in parts:
            idx = parts.index(anchor)
            return parts[idx - 1] if idx > 0 else "root"
    # Frappe apps usually have app/app/module/...; use the second component when possible.
    return parts[1] if len(parts) > 1 else (parts[0] if parts else "root")


def path_entity_name(rel: str, anchor: str) -> str | None:
    parts = Path(rel).parts
    if anchor not in parts:
        return None
    idx = parts.index(anchor)
    if idx + 1 >= len(parts):
        return None
    return parts[idx + 1].replace("_", " ").title()


def is_probably_binary(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return False
    try:
        sample = path.read_bytes()[:4096]
    except OSError:
        return True
    return b"\x00" in sample


def read_text(path: Path, max_bytes: int) -> tuple[str | None, str | None]:
    try:
        size = path.stat().st_size
        if size > max_bytes:
            return None, f"TEXT_TOO_LARGE:{size}>{max_bytes}"
        return path.read_text(encoding="utf-8"), None
    except UnicodeDecodeError:
        try:
            return path.read_text(encoding="utf-8", errors="replace"), "UTF8_REPLACEMENT_USED"
        except OSError as exc:
            return None, f"READ_ERROR:{exc}"
    except OSError as exc:
        return None, f"READ_ERROR:{exc}"


@dataclasses.dataclass
class PythonExtraction:
    imports: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    assignments: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    functions: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    classes: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    calls: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    whitelisted_methods: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    lifecycle_methods: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    throws: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    sql: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    document_references: list[dict[str, Any]] = dataclasses.field(default_factory=list)
    mappings: list[dict[str, Any]] = dataclasses.field(default_factory=list)


class PythonVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.out = PythonExtraction()
        self.scope: list[str] = []
        self.class_stack: list[str] = []

    def qualified(self, name: str) -> str:
        return ".".join([*self.scope, name]) if self.scope else name

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.out.imports.append({"module": alias.name, "as": alias.asname, "line": node.lineno})

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = ("." * node.level) + (node.module or "")
        for alias in node.names:
            self.out.imports.append({
                "module": module, "name": alias.name, "as": alias.asname, "line": node.lineno
            })

    def visit_Assign(self, node: ast.Assign) -> None:
        if not self.scope:
            val = literal(node.value)
            rendered = ast_expr(node.value) if val is None else None
            for target in node.targets:
                name = dotted_name(target)
                if name:
                    self.out.assignments.append({
                        "name": name, "value": val, "expression": rendered,
                        "line": node.lineno,
                    })
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        if not self.scope:
            name = dotted_name(node.target)
            if name:
                val = literal(node.value)
                self.out.assignments.append({
                    "name": name, "annotation": ast_expr(node.annotation), "value": val,
                    "expression": ast_expr(node.value) if val is None else None,
                    "line": node.lineno,
                })
        self.generic_visit(node)

    def _function_record(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> dict[str, Any]:
        decorators = [ast_expr(x) for x in node.decorator_list]
        args = []
        all_args = [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]
        defaults: list[ast.AST | None] = [None] * (len(node.args.posonlyargs) + len(node.args.args) - len(node.args.defaults))
        defaults += list(node.args.defaults)
        defaults += list(node.args.kw_defaults)
        for arg, default in zip(all_args, defaults):
            args.append({
                "name": arg.arg,
                "annotation": ast_expr(arg.annotation),
                "default": literal(default),
                "default_expression": ast_expr(default) if default is not None and literal(default) is None else None,
            })
        if node.args.vararg:
            args.append({"name": "*" + node.args.vararg.arg, "annotation": ast_expr(node.args.vararg.annotation)})
        if node.args.kwarg:
            args.append({"name": "**" + node.args.kwarg.arg, "annotation": ast_expr(node.args.kwarg.annotation)})
        return {
            "name": node.name,
            "qualified_name": self.qualified(node.name),
            "async": isinstance(node, ast.AsyncFunctionDef),
            "line_start": node.lineno,
            "line_end": getattr(node, "end_lineno", node.lineno),
            "decorators": [x for x in decorators if x],
            "arguments": args,
            "returns": ast_expr(node.returns),
            "docstring": ast.get_docstring(node),
            "class": self.class_stack[-1] if self.class_stack else None,
        }

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        rec = self._function_record(node)
        self.out.functions.append(rec)
        if any((d or "").startswith("frappe.whitelist") for d in rec["decorators"]):
            allow_guest = any("allow_guest=True" in (d or "") for d in rec["decorators"])
            xss_safe = any("xss_safe=True" in (d or "") for d in rec["decorators"])
            self.out.whitelisted_methods.append({**rec, "allow_guest": allow_guest, "xss_safe": xss_safe})
        if node.name in PYTHON_LIFECYCLE_METHODS:
            self.out.lifecycle_methods.append(rec)
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.visit_FunctionDef(node)  # type: ignore[arg-type]

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        rec = {
            "name": node.name,
            "qualified_name": self.qualified(node.name),
            "bases": [ast_expr(x) for x in node.bases],
            "decorators": [ast_expr(x) for x in node.decorator_list],
            "line_start": node.lineno,
            "line_end": getattr(node, "end_lineno", node.lineno),
            "docstring": ast.get_docstring(node),
            "methods": [x.name for x in node.body if isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef))],
        }
        self.out.classes.append(rec)
        self.scope.append(node.name)
        self.class_stack.append(node.name)
        self.generic_visit(node)
        self.class_stack.pop()
        self.scope.pop()

    def visit_Call(self, node: ast.Call) -> None:
        name = dotted_name(node.func) or "<dynamic>"
        positional = [literal(x) for x in node.args[:6]]
        keyword_values = {
            kw.arg or "**": literal(kw.value) if literal(kw.value) is not None else ast_expr(kw.value)
            for kw in node.keywords[:12]
        }
        interesting = any(name == value or name.endswith("." + value) for value in FRAPPE_CALL_INTEREST)
        if interesting:
            self.out.calls.append({
                "name": name, "line": node.lineno, "scope": ".".join(self.scope) or None,
                "args": positional, "keywords": keyword_values,
            })
        if name.endswith("throw") or name.endswith("msgprint"):
            message = literal(node.args[0]) if node.args else None
            self.out.throws.append({
                "call": name, "line": node.lineno, "scope": ".".join(self.scope) or None,
                "message": message, "message_expression": ast_expr(node.args[0]) if node.args and message is None else None,
                "exception": keyword_values.get("exc"),
            })
        if name.endswith("db.sql") or name == "frappe.db.sql":
            sql_value = literal(node.args[0], max_string=2_000_000) if node.args else None
            if isinstance(sql_value, str):
                normalized = normalize_sql(sql_value)
                self.out.sql.append({
                    "line": node.lineno, "scope": ".".join(self.scope) or None,
                    "sha256": sha256_text(normalized), "length": len(normalized),
                    "excerpt": normalized[:500],
                })
            else:
                self.out.sql.append({
                    "line": node.lineno, "scope": ".".join(self.scope) or None,
                    "dynamic": True, "expression": ast_expr(node.args[0]) if node.args else None,
                })
        suffix = name.split(".")[-1]
        if suffix in DOC_CALL_SUFFIXES and node.args:
            doctype = literal(node.args[0])
            if isinstance(doctype, str):
                self.out.document_references.append({
                    "operation": suffix, "doctype": doctype, "line": node.lineno,
                    "scope": ".".join(self.scope) or None,
                })
        if suffix == "get_mapped_doc":
            source = literal(node.args[0]) if node.args else None
            target = None
            if len(node.args) >= 3:
                mapping = literal(node.args[2])
                if isinstance(mapping, dict):
                    first = mapping.get(source) if isinstance(source, str) else None
                    if isinstance(first, dict):
                        target = first.get("doctype")
            self.out.mappings.append({
                "source": source, "target": target, "line": node.lineno,
                "scope": ".".join(self.scope) or None,
                "mapping_expression": ast_expr(node.args[2]) if len(node.args) >= 3 else None,
            })
        self.generic_visit(node)


def parse_python(text: str, rel: str) -> dict[str, Any]:
    tree = ast.parse(text, filename=rel, type_comments=True)
    visitor = PythonVisitor()
    visitor.visit(tree)
    return dataclasses.asdict(visitor.out)


JS_IMPORT_RE = re.compile(
    r"(?:import\s+(?P<what>[^;\n]+?)\s+from\s+|require\s*\()(?P<quote>['\"])(?P<module>[^'\"]+)(?P=quote)",
    re.MULTILINE,
)
JS_FUNCTION_RE = re.compile(
    r"(?:(?:export\s+)?(?:async\s+)?function\s+|(?:export\s+)?class\s+)([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)
JS_RPC_METHOD_RE = re.compile(r"\bmethod\s*:\s*(['\"])([^'\"]+)\1")
JS_FORM_ON_RE = re.compile(r"frappe\.ui\.form\.on\s*\(\s*(['\"])([^'\"]+)\1\s*,\s*\{", re.MULTILINE)
JS_LISTVIEW_RE = re.compile(r"frappe\.listview_settings\s*\[\s*(['\"])([^'\"]+)\1\s*\]")
JS_QUERY_REPORT_RE = re.compile(r"frappe\.query_reports\s*\[\s*(['\"])([^'\"]+)\1\s*\]")
JS_ROUTE_RE = re.compile(r"frappe\.set_route\s*\(([^\n;]+)")
JS_EVENT_KEY_RE = re.compile(r"^\s*([A-Za-z_$][\w$]*)\s*(?:\([^)]*\))?\s*\{", re.MULTILINE)
JS_FIELDNAME_RE = re.compile(r"\bfieldname\s*:\s*(['\"])([^'\"]+)\1")


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def extract_vue_script(text: str) -> str:
    chunks = re.findall(r"<script\b[^>]*>(.*?)</script>", text, flags=re.IGNORECASE | re.DOTALL)
    return "\n".join(chunks) if chunks else text


def parse_client(text: str, rel: str) -> dict[str, Any]:
    scan = extract_vue_script(text) if rel.endswith(".vue") else text
    imports = [
        {"module": m.group("module"), "binding": (m.group("what") or "").strip() or None,
         "line": line_number(scan, m.start())}
        for m in JS_IMPORT_RE.finditer(scan)
    ]
    rpc_methods = [
        {"method": m.group(2), "line": line_number(scan, m.start())}
        for m in JS_RPC_METHOD_RE.finditer(scan)
    ]
    forms = []
    for m in JS_FORM_ON_RE.finditer(scan):
        # Conservative event extraction from the next bounded object fragment.
        fragment = scan[m.end():m.end() + 20_000]
        events = []
        for em in JS_EVENT_KEY_RE.finditer(fragment):
            if em.group(1) not in events:
                events.append(em.group(1))
            if len(events) >= 100:
                break
        forms.append({"doctype": m.group(2), "line": line_number(scan, m.start()), "events": events})
    return {
        "imports": imports,
        "symbols": [
            {"name": m.group(1), "line": line_number(scan, m.start())}
            for m in JS_FUNCTION_RE.finditer(scan)
        ],
        "rpc_methods": rpc_methods,
        "form_handlers": forms,
        "listview_doctypes": [
            {"doctype": m.group(2), "line": line_number(scan, m.start())}
            for m in JS_LISTVIEW_RE.finditer(scan)
        ],
        "query_reports": [
            {"report": m.group(2), "line": line_number(scan, m.start())}
            for m in JS_QUERY_REPORT_RE.finditer(scan)
        ],
        "routes": [
            {"expression": m.group(1).strip()[:500], "line": line_number(scan, m.start())}
            for m in JS_ROUTE_RE.finditer(scan)
        ],
        "fieldnames": sorted(set(m.group(2) for m in JS_FIELDNAME_RE.finditer(scan))),
        "static_parser": "regex-conservative",
    }


def parse_doctype_json(doc: dict[str, Any], rel: str, app: str) -> dict[str, Any]:
    name = doc.get("name") or path_entity_name(rel, "doctype")
    fields = []
    dependencies = []
    for position, field in enumerate(doc.get("fields") or [], start=1):
        if not isinstance(field, dict):
            continue
        normalized = {**field, "_position": position}
        fields.append(normalized)
        fieldtype = field.get("fieldtype")
        options = field.get("options")
        if fieldtype in {"Link", "Table", "Table MultiSelect"} and isinstance(options, str) and options:
            dependencies.append({
                "type": "doctype_field", "from": name, "to": options,
                "fieldname": field.get("fieldname"), "fieldtype": fieldtype,
            })
        elif fieldtype == "Dynamic Link" and isinstance(options, str) and options:
            dependencies.append({
                "type": "dynamic_link_selector", "from": name, "to_field": options,
                "fieldname": field.get("fieldname"),
            })
    return {
        "app": app,
        "name": name,
        "module": doc.get("module") or module_of(rel),
        "source_path": rel,
        "identity": {
            "custom": doc.get("custom"), "istable": doc.get("istable"),
            "issingle": doc.get("issingle"), "is_virtual": doc.get("is_virtual"),
            "is_submittable": doc.get("is_submittable"), "editable_grid": doc.get("editable_grid"),
        },
        "naming": {
            "autoname": doc.get("autoname"), "naming_rule": doc.get("naming_rule"),
            "title_field": doc.get("title_field"), "search_fields": doc.get("search_fields"),
        },
        "behavior": {
            "track_changes": doc.get("track_changes"), "track_seen": doc.get("track_seen"),
            "track_views": doc.get("track_views"), "allow_rename": doc.get("allow_rename"),
            "allow_import": doc.get("allow_import"), "quick_entry": doc.get("quick_entry"),
            "read_only": doc.get("read_only"), "in_create": doc.get("in_create"),
        },
        "sorting": {"sort_field": doc.get("sort_field"), "sort_order": doc.get("sort_order")},
        "fields": fields,
        "permissions": doc.get("permissions") or [],
        "states": doc.get("states") or [],
        "links": doc.get("links") or [],
        "actions": doc.get("actions") or [],
        "index_web_pages_for_search": doc.get("index_web_pages_for_search"),
        "dependencies": dependencies,
        # Lossless normalized source metadata. This is necessary for deterministic regeneration.
        "source_metadata": doc,
    }


def parse_report_json(doc: dict[str, Any], rel: str, app: str) -> dict[str, Any]:
    name = doc.get("name") or path_entity_name(rel, "report")
    ref = doc.get("ref_doctype") or doc.get("reference_doctype")
    return {
        "app": app, "name": name, "module": doc.get("module") or module_of(rel),
        "source_path": rel, "report_type": doc.get("report_type"),
        "reference_doctype": ref, "is_standard": doc.get("is_standard"),
        "prepared_report": doc.get("prepared_report"), "add_total_row": doc.get("add_total_row"),
        "disabled": doc.get("disabled"), "roles": doc.get("roles") or [],
        "columns": doc.get("columns") or [], "filters": doc.get("filters") or [],
        "source_metadata": doc,
        "dependencies": ([{"type": "report_doctype", "from": name, "to": ref}] if ref else []),
    }


def markdown_table(headers: list[str], rows: Iterable[Iterable[Any]]) -> str:
    def esc(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=_json_default)
        return str(value).replace("|", "\\|").replace("\n", "<br>")
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    out.extend("| " + " | ".join(esc(x) for x in row) + " |" for row in rows)
    return "\n".join(out)


def render_doctype_markdown(item: dict[str, Any], controller: dict[str, Any] | None,
                             clients: list[dict[str, Any]], related_reports: list[dict[str, Any]]) -> str:
    lines = [
        f"# {item.get('name')}", "",
        f"- App: `{item.get('app')}`",
        f"- Module: `{item.get('module')}`",
        f"- Source: `{item.get('source_path')}`",
        f"- Submittable: `{item.get('identity', {}).get('is_submittable')}`",
        f"- Child table: `{item.get('identity', {}).get('istable')}`",
        f"- Single: `{item.get('identity', {}).get('issingle')}`",
        f"- Autoname: `{item.get('naming', {}).get('autoname')}`",
        "",
        "## Fields", "",
    ]
    lines.append(markdown_table(
        ["#", "fieldname", "label", "type", "options", "reqd", "readonly", "default", "depends_on", "permlevel"],
        ((f.get("_position"), f.get("fieldname"), f.get("label"), f.get("fieldtype"), f.get("options"),
          f.get("reqd"), f.get("read_only"), f.get("default"), f.get("depends_on") or f.get("mandatory_depends_on"),
          f.get("permlevel")) for f in item.get("fields", [])),
    ))
    lines += ["", "## Permissions", ""]
    lines.append(markdown_table(
        ["role", "read", "write", "create", "submit", "cancel", "delete", "amend", "if_owner", "permlevel"],
        ((p.get("role"), p.get("read"), p.get("write"), p.get("create"), p.get("submit"),
          p.get("cancel"), p.get("delete"), p.get("amend"), p.get("if_owner"), p.get("permlevel"))
         for p in item.get("permissions", [])),
    ))
    lines += ["", "## States", "", "```json", json.dumps(item.get("states", []), ensure_ascii=False, indent=2), "```", ""]
    lines += ["## Links and actions", "", "```json",
              json.dumps({"links": item.get("links", []), "actions": item.get("actions", [])}, ensure_ascii=False, indent=2),
              "```", ""]
    if controller:
        py = controller.get("python") or {}
        lines += ["## Controller", "", f"Source: `{controller.get('source_path')}`", ""]
        lines.append(markdown_table(
            ["method", "class", "lines", "decorators"],
            ((m.get("name"), m.get("class"), f"{m.get('line_start')}-{m.get('line_end')}", m.get("decorators"))
             for m in py.get("functions", [])),
        ))
        lines += ["", "### Lifecycle", ""]
        lines.append(markdown_table(
            ["method", "class", "lines"],
            ((m.get("name"), m.get("class"), f"{m.get('line_start')}-{m.get('line_end')}")
             for m in py.get("lifecycle_methods", [])),
        ))
        lines += ["", "### Whitelisted methods", ""]
        lines.append(markdown_table(
            ["method", "allow_guest", "lines"],
            ((m.get("qualified_name"), m.get("allow_guest"), f"{m.get('line_start')}-{m.get('line_end')}")
             for m in py.get("whitelisted_methods", [])),
        ))
        lines += ["", "### Exceptions/messages", ""]
        lines.append(markdown_table(
            ["call", "line", "scope", "message/expression"],
            ((x.get("call"), x.get("line"), x.get("scope"), x.get("message") or x.get("message_expression"))
             for x in py.get("throws", [])),
        ))
        lines += ["", "### Document references", ""]
        lines.append(markdown_table(
            ["operation", "doctype", "line", "scope"],
            ((x.get("operation"), x.get("doctype"), x.get("line"), x.get("scope"))
             for x in py.get("document_references", [])),
        ))
    if clients:
        lines += ["", "## Client behavior", ""]
        for client in clients:
            lines += [f"### `{client.get('source_path')}`", ""]
            data = client.get("client") or {}
            lines.append(markdown_table(
                ["doctype", "line", "events"],
                ((x.get("doctype"), x.get("line"), x.get("events")) for x in data.get("form_handlers", [])),
            ))
            lines += ["", "RPC methods: " + ", ".join(f"`{x.get('method')}`" for x in data.get("rpc_methods", [])), ""]
    if related_reports:
        lines += ["", "## Related reports", ""]
        lines.append(markdown_table(
            ["report", "type", "source"],
            ((r.get("name"), r.get("report_type"), r.get("source_path")) for r in related_reports),
        ))
    lines += ["", "## Lossless source metadata", "", "```json",
              json.dumps(item.get("source_metadata"), ensure_ascii=False, indent=2), "```", ""]
    return "\n".join(lines)


def render_python_markdown(record: dict[str, Any]) -> str:
    py = record.get("python") or {}
    lines = [f"# `{record.get('source_path')}`", "", f"Kind: `{record.get('kind')}`", "", "## Imports", ""]
    lines.append(markdown_table(["module", "name", "as", "line"],
                                ((x.get("module"), x.get("name"), x.get("as"), x.get("line")) for x in py.get("imports", []))))
    lines += ["", "## Classes", ""]
    lines.append(markdown_table(["class", "bases", "methods", "lines"],
                                ((x.get("qualified_name"), x.get("bases"), x.get("methods"),
                                  f"{x.get('line_start')}-{x.get('line_end')}") for x in py.get("classes", []))))
    lines += ["", "## Functions", ""]
    lines.append(markdown_table(["function", "class", "decorators", "lines"],
                                ((x.get("qualified_name"), x.get("class"), x.get("decorators"),
                                  f"{x.get('line_start')}-{x.get('line_end')}") for x in py.get("functions", []))))
    lines += ["", "## Calls of interest", ""]
    lines.append(markdown_table(["call", "line", "scope", "args", "keywords"],
                                ((x.get("name"), x.get("line"), x.get("scope"), x.get("args"), x.get("keywords"))
                                 for x in py.get("calls", []))))
    lines += ["", "## SQL fingerprints", ""]
    lines.append(markdown_table(["line", "scope", "sha256", "excerpt/dynamic"],
                                ((x.get("line"), x.get("scope"), x.get("sha256"), x.get("excerpt") or x.get("expression"))
                                 for x in py.get("sql", []))))
    return "\n".join(lines) + "\n"


class SourceScanner:
    def __init__(self, *, app: str, root: Path, commit: str, tag: str | None,
                 license_name: str, out: Path, max_text_bytes: int,
                 excludes: set[str], emit_markdown: bool) -> None:
        self.app = app
        self.root = root.resolve()
        self.commit = commit
        self.tag = tag
        self.license_name = license_name
        self.out = out.resolve()
        self.max_text_bytes = max_text_bytes
        self.excludes = excludes
        self.emit_markdown = emit_markdown
        self.generated_at = utc_now()
        self.files: list[dict[str, Any]] = []
        self.doctypes: list[dict[str, Any]] = []
        self.reports: list[dict[str, Any]] = []
        self.python_modules: list[dict[str, Any]] = []
        self.client_modules: list[dict[str, Any]] = []
        self.json_documents: list[dict[str, Any]] = []
        self.hooks: list[dict[str, Any]] = []
        self.errors: list[dict[str, Any]] = []
        self.dependencies: list[dict[str, Any]] = []

    def iter_files(self) -> Iterator[Path]:
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = sorted(d for d in dirnames if d not in self.excludes)
            base = Path(dirpath)
            for filename in sorted(filenames):
                yield base / filename

    def scan(self) -> None:
        if not self.root.is_dir():
            raise SystemExit(f"Source root does not exist: {self.root}")
        if not re.fullmatch(r"[0-9a-fA-F]{40}", self.commit):
            raise SystemExit("--commit must be a full 40-character hexadecimal SHA")
        self.out.mkdir(parents=True, exist_ok=True)
        for path in self.iter_files():
            self.scan_file(path)
        self.build_dependency_graph()
        self.write_outputs()

    def scan_file(self, path: Path) -> None:
        rel = path.relative_to(self.root).as_posix()
        kind = classify_path(rel)
        try:
            source_hash = sha256_file(path)
            size = path.stat().st_size
        except OSError as exc:
            self.errors.append({"source_path": rel, "stage": "inventory", "error": str(exc)})
            return
        record: dict[str, Any] = {
            "artifact_key": f"{self.app}:{self.commit}:{kind}:{rel}",
            "app": self.app, "commit": self.commit, "tag": self.tag,
            "license": self.license_name, "module": module_of(rel), "kind": kind,
            "source_path": rel, "source_hash": source_hash, "size_bytes": size,
            "extension": path.suffix.lower(), "parse_status": "inventoried",
        }
        if is_probably_binary(path):
            record["parse_status"] = "binary_inventoried"
            self.files.append(record)
            return
        text, warning = read_text(path, self.max_text_bytes)
        if text is None:
            record["parse_status"] = "text_not_parsed"
            record["parse_note"] = warning
            self.files.append(record)
            return
        if warning:
            record["parse_note"] = warning
        try:
            if path.suffix.lower() == ".json":
                parsed = json.loads(text)
                record["json"] = parsed
                record["parse_status"] = "parsed"
                json_entry = {
                    "app": self.app, "source_path": rel, "kind": kind,
                    "source_hash": source_hash, "document": parsed,
                }
                self.json_documents.append(json_entry)
                if kind == "doctype_schema" and isinstance(parsed, dict):
                    item = parse_doctype_json(parsed, rel, self.app)
                    item["source_hash"] = source_hash
                    self.doctypes.append(item)
                elif kind == "report_schema" and isinstance(parsed, dict):
                    item = parse_report_json(parsed, rel, self.app)
                    item["source_hash"] = source_hash
                    self.reports.append(item)
            elif path.suffix.lower() == ".py":
                py = parse_python(text, rel)
                record["python"] = py
                record["parse_status"] = "parsed"
                self.python_modules.append(record)
                if kind == "hooks":
                    hook_assignments = {x["name"]: x for x in py.get("assignments", [])}
                    self.hooks.append({
                        "app": self.app, "source_path": rel, "source_hash": source_hash,
                        "assignments": hook_assignments,
                    })
            elif path.suffix.lower() in {".js", ".jsx", ".ts", ".tsx", ".vue"}:
                client = parse_client(text, rel)
                record["client"] = client
                record["parse_status"] = "parsed_static"
                self.client_modules.append(record)
            elif kind == "patches":
                patches = []
                for number, line in enumerate(text.splitlines(), start=1):
                    value = line.strip()
                    if value and not value.startswith("#") and not value.startswith("["):
                        patches.append({"patch": value, "line": number})
                record["patches"] = patches
                record["parse_status"] = "parsed"
            else:
                record["parse_status"] = "text_inventoried"
        except (json.JSONDecodeError, SyntaxError, ValueError, RecursionError) as exc:
            record["parse_status"] = "parse_error"
            record["parse_error"] = f"{type(exc).__name__}: {exc}"
            self.errors.append({
                "source_path": rel, "kind": kind, "stage": "parse",
                "error": record["parse_error"],
            })
        self.files.append(record)

    def build_dependency_graph(self) -> None:
        seen: set[tuple[Any, ...]] = set()

        def add(edge: dict[str, Any]) -> None:
            key = tuple(sorted((k, json.dumps(v, sort_keys=True, ensure_ascii=False)) for k, v in edge.items()))
            if key not in seen:
                seen.add(key)
                self.dependencies.append(edge)

        for doctype in self.doctypes:
            for edge in doctype.get("dependencies", []):
                add({"app": self.app, **edge, "source_path": doctype.get("source_path")})
        for report in self.reports:
            for edge in report.get("dependencies", []):
                add({"app": self.app, **edge, "source_path": report.get("source_path")})
        for rec in self.python_modules:
            source = rec["source_path"]
            for imp in rec.get("python", {}).get("imports", []):
                add({
                    "app": self.app, "type": "python_import", "from": source,
                    "to": imp.get("module"), "symbol": imp.get("name"), "line": imp.get("line"),
                    "source_path": source,
                })
            for ref in rec.get("python", {}).get("document_references", []):
                add({
                    "app": self.app, "type": "python_doctype_reference", "from": source,
                    "to": ref.get("doctype"), "operation": ref.get("operation"),
                    "line": ref.get("line"), "source_path": source,
                })
            for mapping in rec.get("python", {}).get("mappings", []):
                add({
                    "app": self.app, "type": "document_mapping", "from": mapping.get("source") or source,
                    "to": mapping.get("target"), "line": mapping.get("line"), "source_path": source,
                })
        for rec in self.client_modules:
            source = rec["source_path"]
            for imp in rec.get("client", {}).get("imports", []):
                add({
                    "app": self.app, "type": "client_import", "from": source,
                    "to": imp.get("module"), "line": imp.get("line"), "source_path": source,
                })
            for rpc in rec.get("client", {}).get("rpc_methods", []):
                add({
                    "app": self.app, "type": "client_rpc", "from": source,
                    "to": rpc.get("method"), "line": rpc.get("line"), "source_path": source,
                })
        def walk_hook_values(value: Any, path: list[str]) -> Iterator[tuple[list[str], str]]:
            if isinstance(value, str):
                yield path, value
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    yield from walk_hook_values(item, [*path, str(index)])
            elif isinstance(value, dict):
                for key, item in value.items():
                    yield from walk_hook_values(item, [*path, str(key)])

        for hook_file in self.hooks:
            source = hook_file["source_path"]
            for hook_name, assignment in hook_file.get("assignments", {}).items():
                value = assignment.get("value")
                for path, target in walk_hook_values(value, [hook_name]):
                    add({
                        "app": self.app, "type": "hook", "from": ":".join(path),
                        "to": target, "source_path": source,
                    })

    def write_outputs(self) -> None:
        kind_counts = Counter(x["kind"] for x in self.files)
        parse_counts = Counter(x["parse_status"] for x in self.files)
        total_files = len(self.files)
        unreadable = sum(1 for x in self.errors if x.get("stage") == "inventory")
        inventory_coverage = 100.0 if total_files and unreadable == 0 else (
            round((total_files / (total_files + unreadable)) * 100, 6) if total_files + unreadable else 0.0
        )
        structured = [x for x in self.files if x["kind"] in {
            "doctype_schema", "doctype_controller", "doctype_client", "report_schema",
            "report_controller", "report_client", "hooks", "page", "workspace",
            "dashboard_chart", "number_card", "dashboard", "print_format", "web_form",
            "notification", "workflow", "patches",
        }]
        structured_ok = sum(1 for x in structured if x["parse_status"] in {
            "parsed", "parsed_static", "text_inventoried",
        })
        static_coverage = round((structured_ok / len(structured)) * 100, 6) if structured else 100.0
        dynamic_markers = sum(
            1 for rec in self.python_modules
            for sql in rec.get("python", {}).get("sql", []) if sql.get("dynamic")
        )
        coverage = {
            "schema_version": SCHEMA_VERSION,
            "app": self.app, "commit": self.commit, "tag": self.tag,
            "generated_at": self.generated_at,
            "source_inventory": {
                "files_seen": total_files, "unreadable_files": unreadable,
                "coverage_percent": inventory_coverage,
                "claim": "COMPLETE" if inventory_coverage == 100.0 else "INCOMPLETE",
            },
            "static_extraction": {
                "structured_artifacts": len(structured), "successfully_extracted": structured_ok,
                "coverage_percent": static_coverage,
                "parse_errors": len(self.errors), "dynamic_sql_markers": dynamic_markers,
                "claim": "COMPLETE_FOR_SUPPORTED_STATIC_SYNTAX" if static_coverage == 100.0 and not self.errors else "INCOMPLETE",
            },
            "behavioral_parity": {
                "coverage_percent": None,
                "claim": "NOT_PROVEN_BY_STATIC_SCAN",
                "requires": [
                    "runtime metadata export from a pinned Frappe site",
                    "controller call tracing", "golden document/ledger/report fixtures",
                    "differential tests", "manual review of dynamic and external integrations",
                ],
            },
            "counts_by_kind": dict(sorted(kind_counts.items())),
            "counts_by_parse_status": dict(sorted(parse_counts.items())),
        }
        summary = {
            "schema_version": SCHEMA_VERSION, "tool_version": TOOL_VERSION,
            "generated_at": self.generated_at, "app": self.app, "tag": self.tag,
            "commit": self.commit, "license": self.license_name,
            "root_tree_fingerprint": self.tree_fingerprint(),
            "counts": {
                "files": total_files, "doctypes": len(self.doctypes), "reports": len(self.reports),
                "python_modules": len(self.python_modules), "client_modules": len(self.client_modules),
                "hooks_files": len(self.hooks), "dependencies": len(self.dependencies),
                "whitelisted_methods": sum(len(x.get("python", {}).get("whitelisted_methods", [])) for x in self.python_modules),
                "parse_errors": len(self.errors),
            },
            "coverage": coverage,
        }
        manifest = {
            "schema_version": SCHEMA_VERSION, "tool_version": TOOL_VERSION,
            "generated_at": self.generated_at, "app": self.app, "tag": self.tag,
            "commit": self.commit, "license": self.license_name,
            "root": str(self.root), "root_tree_fingerprint": summary["root_tree_fingerprint"],
            "artifact_count": len(self.files), "artifacts": self.files,
        }
        whitelisted = []
        calls = []
        for rec in self.python_modules:
            for item in rec.get("python", {}).get("whitelisted_methods", []):
                whitelisted.append({"source_path": rec["source_path"], **item})
            for item in rec.get("python", {}).get("calls", []):
                calls.append({"source_path": rec["source_path"], **item})
        json_dump(self.out / "summary.json", summary)
        json_dump(self.out / "coverage.json", coverage)
        json_dump(self.out / "manifest.json", manifest)
        json_dump(self.out / "doctype-index.json", {"schema_version": SCHEMA_VERSION, "doctypes": self.doctypes})
        json_dump(self.out / "report-index.json", {"schema_version": SCHEMA_VERSION, "reports": self.reports})
        json_dump(self.out / "python-index.json", {"schema_version": SCHEMA_VERSION, "modules": self.python_modules})
        json_dump(self.out / "client-index.json", {"schema_version": SCHEMA_VERSION, "modules": self.client_modules})
        json_dump(self.out / "json-index.json", {"schema_version": SCHEMA_VERSION, "documents": self.json_documents})
        json_dump(self.out / "hooks-index.json", {"schema_version": SCHEMA_VERSION, "hooks": self.hooks})
        json_dump(self.out / "dependency-graph.json", {"schema_version": SCHEMA_VERSION, "edges": self.dependencies})
        json_dump(self.out / "whitelisted-methods.json", {"schema_version": SCHEMA_VERSION, "methods": whitelisted})
        json_dump(self.out / "frappe-calls.json", {"schema_version": SCHEMA_VERSION, "calls": calls})
        json_dump(self.out / "parse-errors.json", {"schema_version": SCHEMA_VERSION, "errors": self.errors})
        if self.emit_markdown:
            self.write_markdown(summary)

    def tree_fingerprint(self) -> str:
        h = hashlib.sha256()
        for item in sorted(self.files, key=lambda x: x["source_path"]):
            h.update(item["source_path"].encode("utf-8"))
            h.update(b"\0")
            h.update(item["source_hash"].encode("ascii"))
            h.update(b"\n")
        return h.hexdigest()

    def write_markdown(self, summary: dict[str, Any]) -> None:
        docs_root = self.out / "docs"
        by_controller: dict[str, dict[str, Any]] = {}
        client_by_doctype: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for rec in self.python_modules:
            if rec["kind"] == "doctype_controller":
                name = path_entity_name(rec["source_path"], "doctype")
                if name:
                    by_controller[name.lower()] = rec
        for rec in self.client_modules:
            for handler in rec.get("client", {}).get("form_handlers", []):
                name = handler.get("doctype")
                if name:
                    client_by_doctype[name.lower()].append(rec)
            path_name = path_entity_name(rec["source_path"], "doctype")
            if path_name:
                client_by_doctype[path_name.lower()].append(rec)
        reports_by_doctype: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for report in self.reports:
            if report.get("reference_doctype"):
                reports_by_doctype[str(report["reference_doctype"]).lower()].append(report)
        seen_paths: set[Path] = set()
        for item in self.doctypes:
            name = str(item.get("name") or "unnamed")
            target = docs_root / "doctypes" / slugify(str(item.get("module") or "root")) / f"{slugify(name)}.md"
            if target in seen_paths:
                target = target.with_name(f"{target.stem}-{item.get('source_hash', '')[:8]}.md")
            seen_paths.add(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(render_doctype_markdown(
                item, by_controller.get(name.lower()), client_by_doctype.get(name.lower(), []),
                reports_by_doctype.get(name.lower(), []),
            ), encoding="utf-8")
        for rec in self.python_modules:
            target = docs_root / "python" / (slugify(rec["source_path"]) + ".md")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(render_python_markdown(rec), encoding="utf-8")
        readme = [
            f"# Source-derived specification: {self.app}", "",
            f"- Tag: `{self.tag}`",
            f"- Commit: `{self.commit}`",
            f"- License: `{self.license_name}`",
            f"- Generated: `{self.generated_at}`",
            f"- Tree fingerprint: `{summary['root_tree_fingerprint']}`",
            "",
            "## Counts", "",
            markdown_table(["metric", "value"], summary["counts"].items()), "",
            "## Coverage contract", "",
            "`source_inventory.coverage_percent = 100` means every file in this immutable checkout was read and hashed.",
            "It does **not** mean every runtime branch, database-specific behavior, customization, hook mutation, background job, or external integration has been behaviorally reproduced.",
            "Behavioral parity remains blocked until runtime exports and differential oracle fixtures are green.",
            "",
            "## Machine-readable outputs", "",
            "- `manifest.json`: complete file inventory and extracted payloads.",
            "- `doctype-index.json`: lossless DocType metadata, permissions, states, links and dependencies.",
            "- `python-index.json`: AST-derived symbols, lifecycle methods, hooks, SQL fingerprints and document calls.",
            "- `client-index.json`: conservative client event/RPC/route extraction.",
            "- `report-index.json`: report metadata and reference DocTypes.",
            "- `dependency-graph.json`: cross-artifact graph.",
            "- `coverage.json`: separate inventory/static/behavioral claims.",
            "- `parse-errors.json`: every unresolved parse issue; never silently ignored.",
            "",
        ]
        (self.out / "README.md").write_text("\n".join(readme), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--app", required=True)
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--commit", required=True)
    p.add_argument("--tag")
    p.add_argument("--license", dest="license_name", default="UNKNOWN")
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--max-text-bytes", type=int, default=20 * 1024 * 1024)
    p.add_argument("--exclude", action="append", default=[])
    p.add_argument("--no-markdown", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    scanner = SourceScanner(
        app=args.app, root=args.root, commit=args.commit.lower(), tag=args.tag,
        license_name=args.license_name, out=args.out, max_text_bytes=args.max_text_bytes,
        excludes=DEFAULT_EXCLUDES | set(args.exclude), emit_markdown=not args.no_markdown,
    )
    scanner.scan()
    summary = json.loads((args.out / "summary.json").read_text(encoding="utf-8"))
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=_json_default))
    return 0 if not summary["counts"]["parse_errors"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
