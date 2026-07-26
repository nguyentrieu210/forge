#!/usr/bin/env python3
"""Export deterministic runtime metadata from a pinned Frappe site.

The module can be used in two ways:

1. Standalone from a bench environment:
   ./env/bin/python /path/to/frappe_runtime_export.py --site oracle.local --sites-path ./sites --out export.json
2. Imported into an installed app and called by Bench execute:
   bench --site oracle.local execute myapp.frappe_runtime_export.export_runtime --output_path /tmp/export.json

The export contains configuration/metadata only. It intentionally does not dump
business documents, credentials, API secrets, sessions or user passwords.
"""
from __future__ import annotations

import argparse
import datetime as dt
import decimal
import hashlib
import importlib
import inspect
import json
import os
import platform
import sys
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "1.0.0"
METADATA_DOCTYPES = [
    "Custom Field", "Property Setter", "Report", "Workspace", "Page", "Workflow",
    "Print Format", "Notification", "Web Form", "Dashboard", "Dashboard Chart",
    "Number Card", "Module Def", "Role", "DocPerm", "Workflow State", "Workflow Action Master",
]
SENSITIVE_KEYS = {
    "password", "passwd", "secret", "api_key", "api_secret", "access_token",
    "refresh_token", "encryption_key", "db_password", "redis_password",
}


def canonical(value: Any, key: str | None = None) -> Any:
    if key and key.lower() in SENSITIVE_KEYS:
        return "<redacted>"
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return format(value, ".17g")
    if isinstance(value, decimal.Decimal):
        return {"$decimal": format(value, "f")}
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return {"$datetime": value.isoformat()}
    if isinstance(value, bytes):
        return {"$bytes_sha256": hashlib.sha256(value).hexdigest(), "length": len(value)}
    if isinstance(value, dict):
        return {str(k): canonical(v, str(k)) for k, v in sorted(value.items(), key=lambda item: str(item[0]))}
    if isinstance(value, (list, tuple)):
        return [canonical(x) for x in value]
    if isinstance(value, set):
        return sorted((canonical(x) for x in value), key=lambda x: json.dumps(x, sort_keys=True, default=str))
    if hasattr(value, "as_dict"):
        return canonical(value.as_dict())
    if inspect.isfunction(value) or inspect.ismethod(value) or inspect.isclass(value):
        return {"$callable": f"{value.__module__}.{value.__qualname__}"}
    return {"$repr": repr(value), "$type": f"{type(value).__module__}.{type(value).__qualname__}"}


def json_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def app_version(app: str) -> dict[str, Any]:
    try:
        module = importlib.import_module(app)
        version = getattr(module, "__version__", None)
        path = getattr(module, "__file__", None)
    except Exception as exc:
        return {"app": app, "version": None, "module_path": None, "error": f"{type(exc).__name__}: {exc}"}
    return {"app": app, "version": version, "module_path": path}


def safe_fields(frappe: Any, doctype: str, requested: list[str]) -> list[str]:
    try:
        meta = frappe.get_meta(doctype)
        valid = {"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"}
        valid.update(x.fieldname for x in meta.fields if getattr(x, "fieldname", None))
        return [x for x in requested if x in valid]
    except Exception:
        return ["name"]


def export_named_documents(frappe: Any, doctype: str) -> dict[str, Any]:
    if not frappe.db.exists("DocType", doctype):
        return {"doctype": doctype, "status": "NOT_INSTALLED", "documents": []}
    names = frappe.get_all(doctype, pluck="name", order_by="name asc", ignore_permissions=True)
    documents = []
    errors = []
    for name in names:
        try:
            doc = frappe.get_doc(doctype, name)
            documents.append(canonical(doc.as_dict()))
        except Exception as exc:
            errors.append({"name": name, "error": f"{type(exc).__name__}: {exc}"})
    return {"doctype": doctype, "status": "EXPORTED", "documents": documents, "errors": errors}


def controller_identity(frappe: Any, doctype: str) -> dict[str, Any]:
    try:
        controller = frappe.get_controller(doctype)
        return {
            "class": f"{controller.__module__}.{controller.__qualname__}",
            "mro": [f"{x.__module__}.{x.__qualname__}" for x in controller.__mro__],
            "source_file": inspect.getsourcefile(controller),
        }
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


def export_doctypes(frappe: Any, selected: set[str] | None = None) -> list[dict[str, Any]]:
    names = frappe.get_all("DocType", pluck="name", order_by="name asc", ignore_permissions=True)
    if selected:
        names = [x for x in names if x in selected]
    output = []
    for name in names:
        try:
            original = frappe.get_doc("DocType", name).as_dict()
            effective = frappe.get_meta(name).as_dict(no_nulls=False)
            custom_fields = frappe.get_all(
                "Custom Field", filters={"dt": name}, fields=["*"], order_by="idx asc, name asc",
                ignore_permissions=True,
            ) if frappe.db.exists("DocType", "Custom Field") else []
            property_setters = frappe.get_all(
                "Property Setter", filters={"doc_type": name}, fields=["*"], order_by="name asc",
                ignore_permissions=True,
            ) if frappe.db.exists("DocType", "Property Setter") else []
            output.append({
                "name": name,
                "module": original.get("module"),
                "original": canonical(original),
                "effective_meta": canonical(effective),
                "custom_fields": canonical(custom_fields),
                "property_setters": canonical(property_setters),
                "controller": controller_identity(frappe, name),
            })
        except Exception as exc:
            output.append({"name": name, "error": f"{type(exc).__name__}: {exc}"})
    return output


def get_db_type(frappe: Any) -> str:
    return str(getattr(frappe.db, "db_type", None) or getattr(frappe.conf, "db_type", None) or "mariadb").lower()


def table_indexes(frappe: Any, table: str) -> list[dict[str, Any]]:
    db_type = get_db_type(frappe)
    try:
        if db_type in {"postgres", "postgresql"}:
            return canonical(frappe.db.sql(
                "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = %s ORDER BY indexname",
                table, as_dict=True,
            ))
        quoted = table.replace("`", "``")
        return canonical(frappe.db.sql(f"SHOW INDEX FROM `{quoted}`", as_dict=True))
    except Exception as exc:
        return [{"error": f"{type(exc).__name__}: {exc}"}]


def export_database_schema(frappe: Any, doctype_names: Iterable[str]) -> dict[str, Any]:
    tables = []
    for doctype in doctype_names:
        table = "tab" + doctype
        try:
            columns = frappe.db.get_table_columns(doctype)
            tables.append({"doctype": doctype, "table": table, "columns": canonical(columns),
                           "indexes": table_indexes(frappe, table)})
        except Exception as exc:
            tables.append({"doctype": doctype, "table": table, "error": f"{type(exc).__name__}: {exc}"})
    return {"db_type": get_db_type(frappe), "tables": tables}


def export_hooks(frappe: Any) -> dict[str, Any]:
    try:
        hooks = frappe.get_hooks()
        return canonical(hooks)
    except Exception as exc:
        return {"$error": f"{type(exc).__name__}: {exc}"}


def export_runtime(output_path: str | None = None, include_doctypes: list[str] | None = None,
                   include_db_schema: bool = True) -> dict[str, Any]:
    import frappe

    selected = set(include_doctypes or []) or None
    installed = frappe.get_installed_apps()
    doctypes = export_doctypes(frappe, selected)
    names = [x["name"] for x in doctypes if "error" not in x]
    metadata_documents = [export_named_documents(frappe, x) for x in METADATA_DOCTYPES]
    by_type = {x["doctype"]: x for x in metadata_documents}
    data: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "site": getattr(frappe.local, "site", None),
            "db_type": get_db_type(frappe),
            "language": getattr(frappe.local, "lang", None),
            "system_settings": canonical({
                "time_zone": frappe.db.get_single_value("System Settings", "time_zone") if frappe.db.exists("DocType", "System Settings") else None,
                "country": frappe.db.get_single_value("System Settings", "country") if frappe.db.exists("DocType", "System Settings") else None,
            }),
        },
        "installed_apps": [app_version(x) for x in installed],
        "hooks": export_hooks(frappe),
        "doctypes": doctypes,
        "reports": by_type.get("Report", {}).get("documents", []),
        "workspaces": by_type.get("Workspace", {}).get("documents", []),
        "pages": by_type.get("Page", {}).get("documents", []),
        "workflows": by_type.get("Workflow", {}).get("documents", []),
        "print_formats": by_type.get("Print Format", {}).get("documents", []),
        "notifications": by_type.get("Notification", {}).get("documents", []),
        "web_forms": by_type.get("Web Form", {}).get("documents", []),
        "dashboards": by_type.get("Dashboard", {}).get("documents", []),
        "dashboard_charts": by_type.get("Dashboard Chart", {}).get("documents", []),
        "number_cards": by_type.get("Number Card", {}).get("documents", []),
        "metadata_documents": metadata_documents,
        "database": export_database_schema(frappe, names) if include_db_schema else {"status": "SKIPPED"},
    }
    data = canonical(data)
    data["export_hash"] = json_hash(data)
    if output_path:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return data


def cli() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--site", required=True)
    ap.add_argument("--sites-path", default="sites")
    ap.add_argument("--out", required=True)
    ap.add_argument("--doctype", action="append", default=[])
    ap.add_argument("--no-db-schema", action="store_true")
    args = ap.parse_args()
    import frappe
    frappe.init(site=args.site, sites_path=args.sites_path)
    frappe.connect()
    try:
        result = export_runtime(args.out, args.doctype, not args.no_db_schema)
        print(json.dumps({"output": args.out, "export_hash": result["export_hash"],
                          "doctypes": len(result["doctypes"])}, indent=2))
    finally:
        frappe.destroy()
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
