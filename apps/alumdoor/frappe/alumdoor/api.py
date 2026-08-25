"""Thin API contract used by the Forge/MetaForge frontend.

Frappe remains authoritative for authentication, permissions, validation, and
database access.  This module only shapes Frappe data for the shared frontend.
"""

from __future__ import annotations

from urllib.parse import quote

import frappe
from frappe import _


_NAV_ITEMS = (
	("Alumdoor Sales Order", "Đơn hàng", "Bán hàng", "file-text"),
	("Alumdoor Production Request", "Yêu cầu sản xuất", "Sản xuất", "factory"),
	("Alumdoor Payment Entry", "Thu chi theo đơn", "Thu chi", "landmark"),
	("Sales Package", "Gói bán hàng", "Bán hàng", "boxes"),
	("Door Type", "Loại cửa", "Cấu hình cửa", "door-open"),
	("Door System", "Hệ cửa", "Cấu hình cửa", "panels-top-left"),
	("Configuration Attribute", "Thuộc tính cấu hình", "Cấu hình cửa", "list-filter"),
	("Surface Finish", "Loại bề mặt", "Danh mục", "layers"),
	("Alumdoor Color", "Màu sắc & bề mặt", "Danh mục", "palette"),
	("Alumdoor Material Specification", "Quy cách vật tư", "Danh mục", "scan-line"),
	("Alumdoor Partner", "Đối tác", "Danh mục", "handshake"),
	("Alumdoor Partner Group", "Nhóm đối tác", "Danh mục", "users-round"),
	("Alumdoor Employee", "Nhân viên", "Danh mục", "user-round"),
	("Alumdoor Department", "Bộ phận", "Danh mục", "network"),
	("Door Formula", "Công thức cửa", "Cấu hình cửa", "calculator"),
	("Component Rule", "Quy tắc linh kiện", "Cấu hình cửa", "workflow"),
	("Alumdoor Price List", "Bảng giá", "Giá bán", "tags"),
	("Alumdoor Item Price", "Dòng bảng giá", "Giá bán", "badge-dollar-sign"),
	("Alumdoor Pricing Rule", "Quy tắc giá", "Giá bán", "badge-dollar-sign"),
	("Alumdoor Operation Standard", "Công đoạn & định mức", "Sản xuất", "timer"),
	("Alumdoor Work Shift", "Ca làm việc", "Sản xuất", "clock-3"),
	("Alumdoor Fault Reason", "Nguyên nhân lỗi", "Bảo hành", "triangle-alert"),
	("Alumdoor Warranty Policy", "Chính sách bảo hành", "Bảo hành", "shield-check"),
	("Alumdoor Coating Rate", "Bảng giá gia công sơn", "Sơn", "paintbrush"),
	("Alumdoor Money Account", "Quỹ & tài khoản", "Thu chi", "landmark"),
	("Alumdoor Cashflow Category", "Loại thu chi", "Thu chi", "arrow-left-right"),
	("Alumdoor Item", "Vật tư hàng hóa", "Danh mục", "package"),
	("Alumdoor Item Group", "Nhóm vật tư", "Danh mục", "folder-tree"),
	("Alumdoor UOM", "Đơn vị tính", "Danh mục", "ruler"),
	("Alumdoor Warehouse", "Kho", "Danh mục", "warehouse"),
)


def _json_arg(value, fallback):
	if value in (None, ""):
		return fallback
	if isinstance(value, str):
		try:
			return frappe.parse_json(value)
		except Exception:
			return fallback
	return value


def _can_read(doctype: str) -> bool:
	return bool(frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read"))


def _nav_items():
	return [
		{
			"key": doctype,
			"label": _(label),
			"kind": "doctype",
			"group": _(group),
			"icon": icon,
		}
		for doctype, label, group, icon in _NAV_ITEMS
		if _can_read(doctype)
	]


@frappe.whitelist()
def get_boot():
	"""Return the narrow boot DTO expected by Forge Runtime."""
	from frappe.boot import get_bootinfo
	from frappe.utils import get_fullname

	boot = get_bootinfo()
	sysdefaults = boot.get("sysdefaults", {}) or {}
	workspaces = boot.get("workspaces") or {}
	pages = workspaces.get("pages") if isinstance(workspaces, dict) else []
	return {
		"user": frappe.session.user,
		"full_name": get_fullname(frappe.session.user) or frappe.session.user,
		"roles": frappe.get_roles(),
		"user_permissions": boot.get("user_permissions", {}),
		"lang": "vi",
		"site_name": frappe.local.site,
		"frappe_version": frappe.__version__,
		"csrf_token": frappe.sessions.get_csrf_token(),
		"sysdefaults": {
			"date_format": sysdefaults.get("date_format"),
			"number_format": sysdefaults.get("number_format"),
			"time_zone": sysdefaults.get("time_zone"),
			"currency": sysdefaults.get("currency") or "VND",
		},
		"allowed_workspaces": [page.get("name") for page in (pages or []) if page.get("name")],
	}


@frappe.whitelist()
def get_app_manifest(app=None):
	"""Return a permission-filtered Alumdoor manifest for the shared Runtime."""
	if app and app not in {"alumdoor", "Alumdoor"}:
		frappe.throw(_("Ứng dụng không tồn tại"), frappe.DoesNotExistError)

	nav = _nav_items()
	if not nav:
		frappe.throw(_("Tài khoản chưa có quyền truy cập dữ liệu Alumdoor"), frappe.PermissionError)
	home = "Alumdoor Sales Order" if any(row["key"] == "Alumdoor Sales Order" for row in nav) else nav[0]["key"]
	return {
		"id": "alumdoor",
		"name": "Alumdoor",
		"version": "0.1.0",
		"brand": "enterprise",
		"design": {"density": "comfortable", "radius": "soft", "content_width": "fluid"},
		"locale": {"currency": "VND", "dateFormat": "dd/mm/yyyy", "numberFormat": "#.###,##"},
		"home": {"doctype": home},
		"catalogMode": "manifest",
		"domain": "alumdoor",
		"nav": nav,
	}


@frappe.whitelist()
def get_application_catalog(app_id=None):
	manifest = get_app_manifest(app_id)
	sections = []
	for order, group in enumerate(dict.fromkeys(item.get("group", "Khác") for item in manifest["nav"]), 1):
		items = []
		for item_order, item in enumerate((row for row in manifest["nav"] if row.get("group") == group), 1):
			items.append(
				{
					"key": item["key"],
					"label": item["label"],
					"kind": "doctype",
					"doctype": item["key"],
					"route": f"/app/{item['key']}",
					"icon": item.get("icon"),
					"order": item_order,
				}
			)
		sections.append({"key": f"group-{order}", "label": group, "kind": "masters", "items": items, "order": order})
	return {
		"apps": [
			{
				"key": "alumdoor",
				"label": "Alumdoor",
				"icon": "factory",
				"module": "Sales Configuration",
				"workspaces": [
					{
						"key": "alumdoor",
						"label": "Alumdoor",
						"icon": "factory",
						"module": "Sales Configuration",
						"route": "/",
						"public": False,
						"sections": sections,
					}
				],
			}
		],
		"generatedAt": frappe.utils.now_datetime().isoformat(),
	}


@frappe.whitelist()
def get_business_context(app_id=None, dimensions=None, selection=None):
	"""Pure Alumdoor has no ERPNext Company/Fiscal Year global dimensions."""
	return {"dimensions": [], "selection": {}, "policies": {}, "revision": "alumdoor-v1"}


def _readable_count(doctype: str) -> int:
	if not _can_read(doctype):
		return 0
	rows = frappe.get_list(doctype, fields=[{"COUNT": "*"}], limit=1) or []
	return int(next(iter(rows[0].values()), 0) or 0) if rows else 0


@frappe.whitelist()
def get_overview(domain="alumdoor", context=None):
	"""Small permission-aware dashboard for the pure-Frappe Alumdoor foundation."""
	metrics = []
	for key, label, doctype, icon in (
		("sales-orders", "Đơn hàng", "Alumdoor Sales Order", "file-text"),
		("production-requests", "Yêu cầu sản xuất", "Alumdoor Production Request", "factory"),
		("packages", "Gói bán hàng", "Sales Package", "boxes"),
		("items", "Vật tư hàng hóa", "Alumdoor Item", "package"),
		("pricing", "Quy tắc giá", "Alumdoor Pricing Rule", "badge-dollar-sign"),
	):
		if _can_read(doctype):
			metrics.append(
				{
					"key": key,
					"label": label,
					"value": _readable_count(doctype),
					"icon": icon,
					"route": f"/app/{quote(doctype)}",
				}
			)

	activities = []
	if _can_read("Alumdoor Sales Order"):
		for row in frappe.get_list(
			"Alumdoor Sales Order",
			fields=["name", "customer_name_snapshot", "status", "modified", "owner"],
			order_by="modified desc",
			limit=8,
		):
			activities.append(
				{
					"key": row.name,
					"label": row.customer_name_snapshot or row.name,
					"description": _("Đơn {0} · {1}").format(row.name, row.status),
					"timestamp": row.modified,
					"actor": row.owner,
					"route": f"/app/Alumdoor%20Sales%20Order/{quote(row.name)}",
				}
			)

	actions = []
	if frappe.has_permission("Alumdoor Sales Order", "create"):
		actions.append(
			{
				"key": "new-sales-order",
				"label": "Tạo đơn hàng",
				"icon": "plus",
				"route": "/app/Alumdoor%20Sales%20Order/new",
				"capability": "create",
			}
		)
	return {
		"key": "alumdoor",
		"label": "Tổng quan Alumdoor",
		"subtitle": "Dữ liệu cấu hình cửa trên Frappe",
		"metrics": metrics,
		"charts": [],
		"tasks": [],
		"activities": activities,
		"actions": actions,
	}


@frappe.whitelist()
def get_capabilities(doctype=None, name=None):
	if not doctype or not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType không hợp lệ"))
	if name and not frappe.db.exists(doctype, name):
		frappe.throw(_("Bản ghi không tồn tại"), frappe.DoesNotExistError)

	def can(permission):
		try:
			return bool(frappe.has_permission(doctype, permission, doc=name))
		except Exception:
			return False

	submittable = bool(frappe.get_meta(doctype).is_submittable)
	return {
		"read": can("read"),
		"write": can("write"),
		"create": can("create"),
		"delete": can("delete"),
		"submit": can("submit") if submittable else False,
		"cancel": can("cancel") if submittable else False,
		"amend": can("amend") if submittable else False,
	}


def _list_args(fields=None, filters=None, or_filters=None, limit_start=0, page_length=20):
	try:
		start = max(0, int(limit_start or 0))
		length = max(1, min(int(page_length or 20), 500))
	except (TypeError, ValueError):
		start, length = 0, 20
	return {
		"fields": _json_arg(fields, ["name"]) or ["name"],
		"filters": _json_arg(filters, []) or [],
		"or_filters": _json_arg(or_filters, []) or [],
		"limit_start": start,
		"limit": length,
	}


@frappe.whitelist()
def get_contextual_list(
	doctype=None,
	fields=None,
	filters=None,
	or_filters=None,
	order_by=None,
	limit_start=0,
	page_length=20,
	context=None,
):
	if not doctype or not _can_read(doctype):
		frappe.throw(_("Không đủ quyền đọc DocType"), frappe.PermissionError)
	args = _list_args(fields, filters, or_filters, limit_start, page_length)
	return frappe.get_list(doctype, order_by=order_by or "modified desc", **args) or []


@frappe.whitelist()
def get_contextual_count(doctype=None, filters=None, or_filters=None, context=None):
	if not doctype or not _can_read(doctype):
		frappe.throw(_("Không đủ quyền đọc DocType"), frappe.PermissionError)
	rows = frappe.get_list(
		doctype,
		fields=[{"COUNT": "*"}],
		filters=_json_arg(filters, []) or [],
		or_filters=_json_arg(or_filters, []) or [],
		limit=1,
	) or []
	if not rows:
		return 0
	return int(next(iter(rows[0].values()), 0) or 0)


@frappe.whitelist()
def get_list_view(
	doctype=None,
	fields=None,
	filters=None,
	or_filters=None,
	order_by=None,
	limit_start=0,
	page_length=20,
	context=None,
):
	return {
		"rows": get_contextual_list(
			doctype, fields, filters, or_filters, order_by, limit_start, page_length, context
		),
		"count": get_contextual_count(doctype, filters, or_filters, context),
		"capabilities": get_capabilities(doctype),
		"display_values": [],
	}


@frappe.whitelist()
def global_search(text=None, doctype=None, limit=20):
	text = str(text or "").strip()
	if not text:
		return []
	try:
		limit = max(1, min(int(limit or 20), 50))
	except (TypeError, ValueError):
		limit = 20
	targets = [doctype] if doctype else [row[0] for row in _NAV_ITEMS]
	results = []
	for target in targets:
		if not target or not _can_read(target):
			continue
		meta = frappe.get_meta(target)
		title_field = meta.title_field if meta.title_field and meta.has_field(meta.title_field) else "name"
		fields = ["name"] + ([title_field] if title_field != "name" else [])
		rows = frappe.get_list(
			target,
			fields=fields,
			or_filters=[[target, "name", "like", f"%{text}%"], [target, title_field, "like", f"%{text}%"]],
			limit=max(1, limit - len(results)),
		)
		for row in rows:
			results.append({"doctype": target, "name": row.name, "title": row.get(title_field) or row.name})
			if len(results) >= limit:
				return results
	return results


@frappe.whitelist(methods=["POST"])
def resolve_display_values(items=None):
	values = _json_arg(items, []) or []
	if len(values) > 100:
		frappe.throw(_("Tối đa 100 giá trị mỗi lần"))
	result = []
	for item in values:
		doctype, name = item.get("doctype"), item.get("name")
		if not doctype or not name or not _can_read(doctype) or not frappe.has_permission(doctype, "read", doc=name):
			result.append({"doctype": doctype, "name": name, "label": name or "", "missing": True})
			continue
		meta = frappe.get_meta(doctype)
		title_field = meta.title_field if meta.title_field and meta.has_field(meta.title_field) else "name"
		label = frappe.db.get_value(doctype, name, title_field) or name
		result.append({"doctype": doctype, "name": name, "label": label})
	return result


@frappe.whitelist(methods=["POST"])
def translate_strings(strings=None, lang=None):
	values = _json_arg(strings, []) or []
	if len(values) > 500:
		frappe.throw(_("Tối đa 500 chuỗi mỗi lần"))
	return {str(value): _(str(value), lang=lang or "vi") for value in values if value is not None}


@frappe.whitelist()
def get_workflow_transitions(doc):
	from frappe.model.workflow import get_transitions, get_workflow_name

	parsed = _json_arg(doc, {}) or {}
	doctype = parsed.get("doctype") if isinstance(parsed, dict) else None
	has_workflow = bool(get_workflow_name(doctype)) if doctype else False
	return {"has_workflow": has_workflow, "transitions": get_transitions(parsed) if has_workflow else []}


@frappe.whitelist()
def get_print_formats(doctype=None, name=None):
	if not doctype or not _can_read(doctype):
		return []
	formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0},
		fields=["name", "standard", "print_format_type"],
		order_by="name asc",
	)
	return formats or []
