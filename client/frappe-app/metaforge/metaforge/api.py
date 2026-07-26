# MetaForge orchestration API (§11 / appendix §R).
# Nguyên tắc: THIN — chỉ gộp ≥2 ghi cần atomic trong 1 txn, KHÔNG chứa business rule
# (rule vẫn ở Frappe). Mọi native call bên dưới đã grep-verify trên 16.29.0.

import hashlib
import json
from contextlib import contextmanager

import frappe
from frappe import _


@frappe.whitelist()
def get_boot():
	"""§1 — Boot DTO cho SPA (frappe.auth.get_logged_user chỉ trả username, không đủ).
	Wrap frappe.sessions bootinfo, chỉ trả các key SPA cần (KHÔNG passthrough toàn bộ)."""
	from frappe.boot import get_bootinfo
	from frappe.utils import get_fullname

	boot = get_bootinfo()
	sysdefaults = boot.get("sysdefaults", {}) or {}
	# v16: danh sách workspace nằm ở bootinfo.workspaces["pages"] (KHÔNG phải allowed_workspaces).
	workspaces = boot.get("workspaces") or {}
	pages = workspaces.get("pages") if isinstance(workspaces, dict) else None
	return {
		"user": frappe.session.user,
		# full_name = tên hiển thị (get_fullname), KHÔNG phải id/name tài khoản.
		"full_name": get_fullname(frappe.session.user) or frappe.session.user,
		"roles": frappe.get_roles(),
		"user_permissions": boot.get("user_permissions", {}),
		"lang": frappe.local.lang,
		# P2-CACHE-01 — cache scope (createScopeKey) cần site+version THẬT, không phải hằng số đoán:
		# site_name phân biệt 2 site DÙNG CHUNG 1 trình duyệt/localStorage (multi-tenant qua path/subdomain);
		# frappe_version phân biệt schema/contract giữa các bản Frappe khác nhau của CÙNG site sau nâng cấp.
		"site_name": frappe.local.site,
		"frappe_version": frappe.__version__,
		"csrf_token": frappe.sessions.get_csrf_token(),
		"sysdefaults": {
			"date_format": sysdefaults.get("date_format"),
			"number_format": sysdefaults.get("number_format"),
			"time_zone": sysdefaults.get("time_zone"),
			"currency": sysdefaults.get("currency"),
		},
		"allowed_workspaces": [p.get("name") for p in (pages or [])],
	}


@frappe.whitelist()
def workflow_action_with_comment(doctype: str, name: str, action: str, comment: str | None = None):
	"""§4/§11 — apply_workflow + add_comment trong 1 txn. CHỈ cho Workflow Action."""
	from frappe.model.workflow import apply_workflow

	doc = frappe.get_doc(doctype, name)
	doc = apply_workflow(doc, action)
	if comment:
		doc.add_comment("Comment", text=comment)
	return doc.as_dict()


@frappe.whitelist()
def get_workflow_transitions(doc):
	"""§4/§11 — bọc frappe.model.workflow.get_transitions + has_workflow (P1-WF-01, review độc lập).
	Native get_transitions() trả [] cả 2 trường hợp KHÁC NHAU: (a) doctype không có Workflow nào,
	(b) doctype CÓ Workflow nhưng user hiện tại không có transition khả dụng (hết quyền/state không
	kế tiếp được) — FE không phân biệt được 2 case này chỉ từ transitions rỗng, dẫn tới hiện nhầm
	Submit/Huỷ thủ công cho case (b) dù doctype có workflow. has_workflow tách bạch 2 case, xác định
	CHỈ từ get_workflow_name(doctype) (tồn tại Workflow active hay không — không phụ thuộc quyền user
	trên doc cụ thể, giống đọc DocType schema)."""
	from frappe.model.workflow import get_transitions, get_workflow_name

	parsed = frappe.parse_json(doc) if isinstance(doc, str) else doc
	doctype = parsed.get("doctype") if isinstance(parsed, dict) else None
	has_workflow = bool(get_workflow_name(doctype)) if doctype else False
	transitions = get_transitions(doc) if has_workflow else []
	return {"has_workflow": has_workflow, "transitions": transitions}


@frappe.whitelist()
def kanban_move_with_comment(
	board_name: str,
	docname: str,
	from_colname: str,
	to_colname: str,
	old_index,
	new_index,
	comment: str | None = None,
):
	"""§12/§11 — Kanban đổi cột (native update_order_for_single_card = set_value field) + comment.
	KHÔNG tái dùng workflow_action_with_comment (method đó nhận action, không nhận field/value)."""
	from frappe.desk.doctype.kanban_board.kanban_board import update_order_for_single_card

	board = update_order_for_single_card(
		board_name, docname, from_colname, to_colname, old_index, new_index
	)
	if comment:
		reference_doctype = frappe.db.get_value("Kanban Board", board_name, "reference_doctype")
		frappe.get_doc(reference_doctype, docname).add_comment("Comment", text=comment)
	return board.as_dict() if hasattr(board, "as_dict") else board


@frappe.whitelist()
def add_tree_node(**kwargs):
	"""§10/§11 — native treeview.add_node trả None (chỉ doc.save()). Wrapper trả doc đã tạo
	để SPA khỏi phải refetch cả cây."""
	from frappe.desk.treeview import make_tree_args

	args = make_tree_args(**frappe.form_dict)
	doc = frappe.get_doc(args)
	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def logout_other_sessions():
	"""§9/§11 — đăng xuất TẤT CẢ thiết bị KHÁC, giữ phiên hiện tại.
	Wrap frappe.sessions.clear_sessions (KHÔNG whitelisted → chỉ gọi qua orch này).
	PHẢI force=True: nếu không, get_sessions_to_clear chỉ dọn session VƯỢT
	simultaneous_sessions chứ không xoá hết session khác."""
	frappe.sessions.clear_sessions(
		user=frappe.session.user,
		keep_current=True,
		force=True,
	)
	frappe.db.commit()
	return {"message": _("Đã đăng xuất các thiết bị khác")}


@frappe.whitelist()
def get_capabilities(doctype=None, name=None):
	"""§9 — Effective capabilities FAIL-CLOSED cho form actions (P0-05). Nguồn sự thật =
	frappe.has_permission (gộp DocType perm + user permission + owner/share + docstatus + role).
	name=None ⇒ new-doc (doctype-level). KHÔNG optimistic: lỗi/không rõ ⇒ False.
	Trả {read,write,create,delete,submit,cancel,amend} (bool)."""
	if not doctype or not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType không hợp lệ"))
	if name and not frappe.db.exists(doctype, name):
		frappe.throw(_("Bản ghi không tồn tại"), frappe.DoesNotExistError)

	def can(ptype):
		try:
			return bool(frappe.has_permission(doctype, ptype, doc=name))
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


@frappe.whitelist()
def global_search(text=None, doctype=None, limit=20):
	"""§5 — Tìm bản ghi (scoped/xuyên DocType), PERMISSION-AWARE fail-closed.
	Contract khớp adapter.globalSearch: GET text/doctype?/limit? → [{doctype,name,title,content?}].
	- có doctype: frappe.get_list (đã lọc read-perm + user permission + query conditions).
	- không doctype: frappe.utils.global_search.search (index desk) rồi HẬU-LỌC has_permission
	  từng record (chỉ giữ cái user đọc được). text rỗng → []."""
	text = (text or "").strip()
	try:
		limit = max(1, min(int(limit or 20), 50))
	except (TypeError, ValueError):
		limit = 20
	if not text:
		return []

	if doctype:
		return _search_in_doctype(doctype, text, limit)

	from frappe.utils.global_search import search as _gs

	out = []
	try:
		raw = _gs(text, start=0, limit=limit * 3, doctype="") or []
	except Exception:
		raw = []
	for r in raw:
		dt, nm = r.get("doctype"), r.get("name")
		if not dt or not nm or not frappe.has_permission(dt, "read", doc=nm):
			continue
		out.append({"doctype": dt, "name": nm, "title": r.get("content") or nm, "content": r.get("content")})
		if len(out) >= limit:
			break
	return out


def _search_in_doctype(doctype, text, limit):
	if not frappe.has_permission(doctype, "read"):
		return []
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return []
	valid = {df.fieldname for df in meta.fields}
	valid.add("name")
	title_field = getattr(meta, "title_field", None) or "name"
	search_fields = ["name"]
	if title_field in valid:
		search_fields.append(title_field)
	try:
		for f in meta.get_search_fields() or []:
			if f in valid and f not in search_fields:
				search_fields.append(f)
	except Exception:
		pass
	search_fields = search_fields[:6]

	or_filters = [[doctype, f, "like", f"%{text}%"] for f in search_fields]
	select = ["name"] + ([title_field] if title_field != "name" and title_field in valid else [])
	try:
		rows = frappe.get_list(
			doctype,
			or_filters=or_filters,
			fields=select,
			limit_page_length=limit,
			order_by="modified desc",
		)
	except Exception:
		return []
	results = []
	for r in rows:
		title = (r.get(title_field) if title_field != "name" else None) or r.get("name")
		results.append({"doctype": doctype, "name": r.get("name"), "title": title})
	return results

# ─────────────────────────────────────────────────────────────────────────────
# MetaForge platform shell: business context, catalog, overview/process,
# display/i18n and effective-permission studio.
# Các API này chỉ đọc/quy chiếu quyền Frappe; quyền cuối vẫn do Frappe enforce.


def _json_arg(value, fallback):
	if value in (None, ""):
		return fallback
	try:
		return frappe.parse_json(value) if isinstance(value, str) else value
	except Exception:
		return fallback


def _has_doctype(doctype):
	try:
		return bool(frappe.db.exists("DocType", doctype))
	except Exception:
		return False


def _can_read_doctype(doctype):
	return _has_doctype(doctype) and bool(frappe.has_permission(doctype, "read"))


def _safe_list(doctype, fields, filters=None, limit=500, order_by=None):
	if not _can_read_doctype(doctype):
		return []
	try:
		return frappe.get_list(
			doctype,
			fields=fields,
			filters=filters or {},
			limit_page_length=limit,
			order_by=order_by,
		) or []
	except Exception:
		return []


def _user_default(key):
	try:
		return frappe.defaults.get_user_default(key)
	except Exception:
		return None


def _dimension(key, label, rows, default=None, required=True, depends_on=None):
	options = []
	for row in rows:
		value = row.get("value") or row.get("name")
		if not value:
			continue
		options.append({
			"value": value,
			"label": row.get("label") or row.get("title") or value,
			"description": row.get("description"),
			"company": row.get("company"),
			"parent": row.get("parent"),
			"fromDate": row.get("from_date") or row.get("year_start_date"),
			"toDate": row.get("to_date") or row.get("year_end_date"),
		})
	allowed = {o["value"] for o in options}
	if default not in allowed:
		default = options[0]["value"] if len(options) == 1 else None
	return {
		"key": key,
		"label": label,
		"enabled": bool(options),
		"required": bool(required and options),
		"locked": len(options) <= 1,
		"hidden": len(options) == 1,
		"dependsOn": depends_on,
		"defaultValue": default,
		"options": options,
	}



_CONTEXT_DIMENSION_ORDER = [
    "company", "fiscal_year", "branch", "warehouse", "cost_center", "project",
    "territory", "selling_price_list", "buying_price_list",
]


def _own_user_permission_types(user=None):
    """Return allowed dimensions derived from this user's own User Permission rows.

    Uses get_all intentionally: a normal user may not have read permission on User Permission,
    while the orchestration endpoint must still resolve the user's own effective scope. The
    returned values are only dimension *types*; actual options are still permission-filtered by
    the normal Frappe list APIs below.
    """
    user = user or frappe.session.user
    try:
        rows = frappe.get_all(
            "User Permission",
            filters={"user": user},
            fields=["allow"],
            limit_page_length=1000,
        ) or []
    except Exception:
        rows = []
    mapping = {
        "Company": "company",
        "Fiscal Year": "fiscal_year",
        "Warehouse": "warehouse",
        "Branch": "branch",
        "Cost Center": "cost_center",
        "Project": "project",
        "Territory": "territory",
        "Price List": "selling_price_list",
    }
    return {mapping.get(row.get("allow")) for row in rows if mapping.get(row.get("allow"))}


def _role_context_dimensions(roles, app_id=None):
    """Resolve dimensions from effective Frappe access, with role names only as hints.

    This avoids requiring custom role names to contain English keywords. User Permission rows still
    narrow the option lists; this function only decides which selectors are relevant.
    """
    roles = set(roles or [])
    role_text = " ".join(sorted(roles)).lower()
    app_text = str(app_id or "").lower()
    system = frappe.session.user == "Administrator" or "System Manager" in roles

    def can_read(doctype):
        try:
            return _has_doctype(doctype) and bool(frappe.has_permission(doctype, "read"))
        except Exception:
            return False

    allowed = set()
    business_role = any(token in role_text for token in (
        "account", "sales", "selling", "purchase", "buying", "stock", "warehouse",
        "manufactur", "project", "asset", "quality", "support", "crm", "hr", "employee",
    ))
    if system or business_role or can_read("Company"):
        allowed.add("company")
    if system or can_read("Fiscal Year") or any(can_read(dt) for dt in ("Sales Invoice", "Purchase Invoice", "Stock Entry", "Journal Entry")):
        allowed.add("fiscal_year")
    if system or (can_read("Warehouse") and any(can_read(dt) for dt in ("Stock Entry", "Delivery Note", "Purchase Receipt", "Work Order"))):
        allowed.add("warehouse")
    if system or (can_read("Branch") and any(can_read(dt) for dt in ("Employee", "Attendance", "Payroll Entry"))):
        allowed.add("branch")
    if system or can_read("Cost Center"):
        allowed.add("cost_center")
    if system or can_read("Project"):
        allowed.add("project")
    if system or can_read("Territory"):
        allowed.add("territory")
    if system or (can_read("Price List") and any(can_read(dt) for dt in ("Quotation", "Sales Order", "Sales Invoice"))):
        allowed.add("selling_price_list")
    if system or (can_read("Price List") and any(can_read(dt) for dt in ("Supplier Quotation", "Purchase Order", "Purchase Invoice"))):
        allowed.add("buying_price_list")

    # Explicit user scopes are authoritative evidence that the selector is relevant.
    allowed.update(_own_user_permission_types())

    # App hint never grants a dimension; it only keeps a dimension already supported by effective access.
    if any(token in app_text for token in ("wms", "stock", "warehouse")) and "warehouse" in allowed:
        allowed.add("warehouse")
    return allowed


def _stable_context_revision(dimensions, selection):
    payload = json.dumps({"dimensions": dimensions, "selection": selection}, sort_keys=True, default=str)
    return hashlib.sha256(
        f"{frappe.local.site}|{frappe.session.user}|{payload}".encode("utf-8")
    ).hexdigest()[:20]


@frappe.whitelist()
def get_business_context(app_id=None, dimensions=None, selection=None):
	"""Role/User-Permission aware Company/Fiscal Year/Warehouse context.
	App chỉ yêu cầu dimension; server quyết định option/default/lock theo quyền hiệu lực."""
	requested = _json_arg(dimensions, []) or []
	selected = _json_arg(selection, {}) or {}
	roles = set(frappe.get_roles())
	allowed_dimensions = _role_context_dimensions(roles, app_id)

	# App chỉ khai báo trần khả năng. Server luôn giao với role + User Permission hiện tại.
	requested = [key for key in requested if key in _CONTEXT_DIMENSION_ORDER]
	if requested:
		requested = [key for key in requested if key in allowed_dimensions]
	else:
		requested = [key for key in _CONTEXT_DIMENSION_ORDER if key in allowed_dimensions]
	if "company" not in requested and "company" in allowed_dimensions:
		requested.insert(0, "company")

	result = []
	company_value = selected.get("company") or _user_default("Company")

	if "company" in requested:
		rows = _safe_list("Company", ["name", "company_name", "abbr"], order_by="company_name asc")
		companies = [{"value": r.get("name"), "label": r.get("company_name") or r.get("name"), "description": r.get("abbr")} for r in rows]
		# Giống Warehouse: role quản trị toàn hệ thống được xem "Tất cả công ty" (không bắt buộc chọn 1).
		company_required = not bool(roles.intersection({"System Manager"}))
		d = _dimension("company", _("Công ty"), companies, company_value, required=company_required)
		result.append(d)
		if company_value not in {o["value"] for o in d["options"]}:
			company_value = d.get("defaultValue")

	if "fiscal_year" in requested:
		rows = _safe_list(
			"Fiscal Year",
			["name", "year_start_date", "year_end_date", "disabled"],
			filters={"disabled": 0},
			order_by="year_start_date desc",
		)
		fy = [{
			"value": r.get("name"),
			"label": r.get("name"),
			"from_date": str(r.get("year_start_date") or ""),
			"to_date": str(r.get("year_end_date") or ""),
		} for r in rows]
		result.append(_dimension("fiscal_year", _("Năm tài chính"), fy, selected.get("fiscal_year") or _user_default("fiscal_year")))

	if "branch" in requested:
		filters = {"company": company_value} if company_value else {}
		rows = _safe_list("Branch", ["name", "branch", "company"], filters=filters, order_by="name asc")
		branch = [{"value": r.get("name"), "label": r.get("branch") or r.get("name"), "company": r.get("company")} for r in rows]
		result.append(_dimension("branch", _("Chi nhánh"), branch, selected.get("branch") or _user_default("Branch"), depends_on="company"))

	if "warehouse" in requested:
		filters = {"is_group": 0}
		if company_value:
			filters["company"] = company_value
		rows = _safe_list("Warehouse", ["name", "warehouse_name", "company", "parent_warehouse"], filters=filters, order_by="warehouse_name asc")
		wh = [{
			"value": r.get("name"),
			"label": r.get("warehouse_name") or r.get("name"),
			"company": r.get("company"),
			"parent": r.get("parent_warehouse"),
		} for r in rows]
		warehouse_required = not bool(roles.intersection({"System Manager", "Stock Manager"}))
		result.append(_dimension("warehouse", _("Kho"), wh, selected.get("warehouse") or _user_default("Warehouse"), required=warehouse_required, depends_on="company"))

	for key, dt, title, field in (
		("cost_center", "Cost Center", _("Trung tâm chi phí"), "cost_center_name"),
		("project", "Project", _("Dự án"), "project_name"),
		("territory", "Territory", _("Khu vực"), "territory_name"),
		("selling_price_list", "Price List", _("Bảng giá bán"), "name"),
		("buying_price_list", "Price List", _("Bảng giá mua"), "name"),
	):
		if key not in requested:
			continue
		filters = {}
		if key == "selling_price_list": filters["selling"] = 1
		if key == "buying_price_list": filters["buying"] = 1
		rows = _safe_list(dt, ["name", field], filters=filters, order_by="name asc")
		opts = [{"value": r.get("name"), "label": r.get(field) or r.get("name")} for r in rows]
		result.append(_dimension(key, title, opts, selected.get(key) or _user_default(dt)))

	resolved = {}
	for d in result:
		allowed = {o["value"] for o in d["options"]}
		value = selected.get(d["key"])
		if value not in allowed:
			value = d.get("defaultValue")
		if value:
			resolved[d["key"]] = value

	# Fiscal Year là context nghiệp vụ, không chỉ label. Trả khoảng ngày đã resolve từ option
	# server để List/Report/Overview có thể áp xuyên suốt mà client không tự đoán lịch tài chính.
	fy_value = resolved.get("fiscal_year")
	if fy_value:
		for d in result:
			if d.get("key") != "fiscal_year":
				continue
			option = next((o for o in d.get("options", []) if o.get("value") == fy_value), None)
			if option:
				if option.get("fromDate"):
					resolved["date_from"] = option.get("fromDate")
				if option.get("toDate"):
					resolved["date_to"] = option.get("toDate")
			break

	return {
		"dimensions": result,
		"selection": resolved,
		"policies": _default_context_policies(),
		"revision": _stable_context_revision(result, resolved),
	}


def _default_context_policies():
	"""Policy mặc định cho các miền ERP phổ biến. Chỉ map field đã biết của Frappe;
	DocType custom có thể bổ sung policy qua app manifest nhưng backend vẫn enforce permission."""
	policies = {}

	def add(names, supported, list_filters=None, create_defaults=None, date_field=None):
		for name in names:
			policies[name] = {
				"supported": supported,
				"listFilters": list_filters or {},
				"createDefaults": create_defaults or {},
			}
			if date_field:
				policies[name]["dateField"] = date_field

	# Stock / buying / selling
	add(["Stock Entry"], ["company", "fiscal_year", "warehouse"], {"company": "company"}, {"company": "company", "warehouse": "from_warehouse"}, "posting_date")
	add(["Warehouse Transfer"], ["company", "fiscal_year", "warehouse"], {"company": "company", "warehouse": "source_warehouse"}, {"company": "company", "warehouse": "source_warehouse"}, "posting_date")
	add(["Purchase Receipt", "Delivery Note"], ["company", "fiscal_year", "warehouse"], {"company": "company"}, {"company": "company", "warehouse": "set_warehouse"}, "posting_date")
	add(["Stock Reconciliation"], ["company", "fiscal_year", "warehouse"], {"company": "company", "warehouse": "warehouse"}, {"company": "company", "warehouse": "warehouse"}, "posting_date")
	add(["Material Request"], ["company", "fiscal_year", "warehouse"], {"company": "company", "warehouse": "set_warehouse"}, {"company": "company", "warehouse": "set_warehouse"}, "transaction_date")
	add(["Purchase Order", "Sales Order", "Quotation", "Supplier Quotation"], ["company", "fiscal_year"], {"company": "company"}, {"company": "company"}, "transaction_date")
	add(["Pick List", "Packing Slip"], ["company", "fiscal_year"], {"company": "company"}, {"company": "company"}, "posting_date")

	# Accounting
	add(["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"], ["company", "fiscal_year"], {"company": "company"}, {"company": "company"}, "posting_date")

	# Manufacturing / projects / assets / HR
	add(["Work Order", "Production Plan"], ["company", "fiscal_year", "warehouse"], {"company": "company"}, {"company": "company"}, "planned_start_date")
	add(["Job Card"], ["company", "fiscal_year"], {"company": "company"}, {"company": "company"}, "posting_date")
	add(["Project", "Asset"], ["company", "fiscal_year"], {"company": "company"}, {"company": "company"})
	add(["Employee"], ["company", "branch"], {"company": "company", "branch": "branch"}, {"company": "company", "branch": "branch"})
	add(["Attendance"], ["company", "fiscal_year", "branch"], {"company": "company", "branch": "branch"}, {"company": "company", "branch": "branch"}, "attendance_date")
	add(["Payroll Entry"], ["company", "fiscal_year", "branch"], {"company": "company", "branch": "branch"}, {"company": "company", "branch": "branch"}, "posting_date")

	return policies



_DOMAIN_ALIASES = {
    "stock": "stock", "warehouse": "stock", "inventory": "stock",
    "selling": "selling", "sales": "selling", "crm": "crm",
    "buying": "buying", "purchase": "buying",
    "accounts": "accounts", "accounting": "accounts",
    "manufacturing": "manufacturing", "production": "manufacturing",
    "hr": "hr", "human_resources": "hr", "human resource": "hr",
    "projects": "projects", "project": "projects",
    "assets": "assets", "asset": "assets",
    "support": "support", "helpdesk": "support",
    "quality": "quality",
}


def _domain_key(value):
    raw = frappe.scrub(str(value or ""))
    return _DOMAIN_ALIASES.get(raw)


def _can_open_catalog_item(kind, target):
    if kind == "doctype":
        return _can_read_doctype(target)
    if kind == "report":
        if not _has_doctype("Report"):
            return False
        try:
            if not frappe.db.exists("Report", target):
                return False
            ref_dt = frappe.db.get_value("Report", target, "ref_doctype")
            return bool(not ref_dt or _can_read_doctype(ref_dt))
        except Exception:
            return False
    if kind == "page":
        try:
            return bool(frappe.db.exists("Page", target))
        except Exception:
            return False
    if kind == "dashboard":
        try:
            return bool(frappe.db.exists("Dashboard", target) or frappe.db.exists("Dashboard Chart", target) or frappe.db.exists("Number Card", target))
        except Exception:
            return False
    return False


def _catalog_kind(raw_type):
	v = (raw_type or "").lower()
	if "report" in v: return "report"
	if "page" in v: return "page"
	if "dashboard" in v: return "dashboard"
	return "doctype"


def _catalog_route(kind, target):
	if kind == "doctype": return f"/app/{target}"
	if kind == "report": return f"/report/{target}"
	if kind == "page": return f"/page/{target}"
	if kind == "dashboard": return f"/dashboard/{target}"
	return f"/{target}"


def _normalize_workspace_section(label, links, kind="other", order=0):
	items = []
	for i, link in enumerate(links or []):
		if not isinstance(link, dict):
			continue
		target = link.get("link_to") or link.get("name") or link.get("route")
		if not target:
			continue
		item_kind = _catalog_kind(link.get("type"))
		# Backend permission lọc ở item level cho cả DocType/Report/Page/Dashboard.
		if not _can_open_catalog_item(item_kind, target):
			continue
		items.append({
			"key": target,
			"label": link.get("label") or target,
			"kind": item_kind,
			"route": _catalog_route(item_kind, target),
			"icon": link.get("icon"),
			"doctype": target if item_kind == "doctype" else None,
			"report": target if item_kind == "report" else None,
			"page": target if item_kind == "page" else None,
			"order": i,
		})
	return {"key": frappe.scrub(label or kind), "label": label or _("Khác"), "kind": kind, "items": items, "order": order}


@frappe.whitelist()
def get_application_catalog(app_id=None):
	"""Catalog ứng dụng permission-aware từ toàn bộ Workspace Frappe.

	Không trả menu phẳng: Module/App → Workspace → Section → Item. Server lọc quyền trước khi
	frontend render; item không đọc được không bao giờ xuất hiện trong catalog.
	"""
	def _items(value):
		if isinstance(value, list):
			return value
		if isinstance(value, dict):
			return value.get("items") or []
		return []

	def _section_kind(label, links):
		text = (label or "").lower()
		link_types = " ".join(str((link or {}).get("type") or (link or {}).get("link_type") or "").lower() for link in links if isinstance(link, dict))
		if any(token in text for token in ("report", "báo cáo", "analytics", "phân tích")) or "report" in link_types:
			return "reports"
		if any(token in text for token in ("setting", "setup", "thiết lập", "cấu hình")):
			return "settings"
		if any(token in text for token in ("master", "danh mục", "maintain", "reference")):
			return "masters"
		if any(token in text for token in ("tool", "công cụ", "utility")):
			return "tools"
		return "transactions"

	try:
		from frappe.desk.desktop import get_workspaces
		ws_payload = get_workspaces() or {}
		pages = ws_payload.get("pages", []) if isinstance(ws_payload, dict) else (ws_payload or [])
	except Exception:
		pages = []

	apps_by_key = {}
	for wi, page in enumerate(pages):
		if not isinstance(page, dict):
			continue
		name = page.get("name") or page.get("title")
		if not name:
			continue
		try:
			from frappe.desk.desktop import get_desktop_page
			payload = get_desktop_page(page=frappe.as_json({"name": name, "title": page.get("title"), "public": page.get("public")})) or {}
		except Exception:
			payload = {}

		workspace_label = page.get("title") or page.get("label") or name
		module = page.get("module") or page.get("category") or workspace_label
		app_key = frappe.scrub(module)
		# app_id có thể là module key; app custom vẫn có thể yêu cầu toàn catalog bằng app_id rỗng.
		if app_id and app_id not in (app_key, module, frappe.scrub(str(app_id))):
			# Không loại workspace khi app_id là id sản phẩm (vd aphvh-wms), vì catalogMode=hybrid cần
			# Workspace Stock đầy đủ. Chỉ filter khi id trùng một module có thật sẽ được xử lý client.
			pass

		domain_key = _domain_key(module) or _domain_key(workspace_label)
		sections = []
		if domain_key:
			sections.extend([
				{"key": "overview", "label": _("Tổng quan"), "kind": "overview", "items": [{"key": f"overview:{name}", "label": _("Tổng quan"), "kind": "route", "route": f"/overview/{domain_key}", "order": 0}], "order": 0},
				{"key": "process", "label": _("Quy trình"), "kind": "process", "items": [{"key": f"process:{name}", "label": _("Quy trình"), "kind": "route", "route": f"/process/{domain_key}", "order": 0}], "order": 1},
			])

		for ci, card in enumerate(_items(payload.get("cards"))):
			if not isinstance(card, dict):
				continue
			links = _items(card.get("links"))
			section = _normalize_workspace_section(card.get("label"), links, _section_kind(card.get("label"), links), ci + 10)
			if section.get("items"):
				sections.append(section)

		shortcuts = _items(payload.get("shortcuts"))
		if shortcuts:
			section = _normalize_workspace_section(_("Lối tắt"), shortcuts, "tools", 80)
			if section.get("items"):
				sections.append(section)

		quick_lists = _items(payload.get("quick_lists"))
		if quick_lists:
			section = _normalize_workspace_section(_("Danh sách nhanh"), quick_lists, "transactions", 85)
			if section.get("items"):
				sections.append(section)

		# Dashboard artifacts không phải link card chuẩn; giữ route rõ và fail-visible ở frontend nếu
		# chưa có renderer chuyên biệt.
		for key, label, kind, route_prefix, order in (
			("number_cards", _("Chỉ số"), "overview", "/dashboard", 90),
			("charts", _("Biểu đồ"), "overview", "/dashboard", 91),
			("custom_blocks", _("Khối tùy chỉnh"), "other", "/page", 99),
		):
			rows = _items(payload.get(key))
			items = []
			for ri, row in enumerate(rows):
				if not isinstance(row, dict):
					continue
				target = row.get("name") or row.get("label") or row.get("chart_name") or row.get("document_type")
				if not target:
					continue
				items.append({"key": f"{key}:{target}", "label": row.get("label") or row.get("name") or target, "kind": "dashboard" if key != "custom_blocks" else "page", "route": f"{route_prefix}/{target}", "order": ri})
			if items:
				sections.append({"key": key, "label": label, "kind": kind, "items": items, "order": order})

		workspace = {
			"key": name,
			"label": workspace_label,
			"icon": page.get("icon"),
			"module": module,
			"route": f"/workspace/{frappe.utils.quote(name)}",
			"public": bool(page.get("public")),
			"sections": sorted(sections, key=lambda item: item.get("order") or 0),
			"order": wi,
		}
		if app_key not in apps_by_key:
			apps_by_key[app_key] = {"key": app_key, "label": module, "icon": page.get("icon"), "module": module, "workspaces": [], "order": wi}
		apps_by_key[app_key]["workspaces"].append(workspace)

	apps = sorted(apps_by_key.values(), key=lambda item: item.get("order") or 0)
	for app in apps:
		app["workspaces"] = sorted(app.get("workspaces") or [], key=lambda item: item.get("order") or 0)
	return {"apps": apps, "generatedAt": frappe.utils.now_datetime().isoformat()}


def _meta_fields(doctype):
    try:
        meta = frappe.get_meta(doctype)
        return meta, {d.fieldname for d in meta.fields}
    except Exception:
        return None, set()


def _context_filters(context, doctype, include_warehouse=True):
    filters = {}
    if not context:
        return filters
    meta, fields = _meta_fields(doctype)
    if context.get("company") and "company" in fields:
        filters["company"] = context["company"]
    if context.get("branch") and "branch" in fields:
        filters["branch"] = context["branch"]
    if include_warehouse and context.get("warehouse"):
        # Direct parent fields only. Child-table warehouse scope is handled by contextual list/count.
        for fieldname in (
            "warehouse", "set_warehouse", "source_warehouse", "from_warehouse",
            "target_warehouse", "to_warehouse",
        ):
            if fieldname in fields:
                filters[fieldname] = context["warehouse"]
                break
    date_field = next((fieldname for fieldname in (
        "posting_date", "transaction_date", "attendance_date", "schedule_date",
        "planned_start_date", "start_date", "date",
    ) if fieldname in fields), None)
    if date_field and context.get("date_from") and context.get("date_to"):
        filters[date_field] = ["between", [context["date_from"], context["date_to"]]]
    elif date_field and context.get("date_from"):
        filters[date_field] = [">=", context["date_from"]]
    elif date_field and context.get("date_to"):
        filters[date_field] = ["<=", context["date_to"]]
    return filters


def _filter_rows(filters):
    """Normalize dict/list filters to Frappe list-filter rows."""
    if not filters:
        return []
    if isinstance(filters, dict):
        rows = []
        for fieldname, value in filters.items():
            if isinstance(value, (list, tuple)) and len(value) == 2 and isinstance(value[0], str):
                rows.append([fieldname, value[0], value[1]])
            else:
                rows.append([fieldname, "=", value])
        return rows
    return [list(row) for row in filters if isinstance(row, (list, tuple)) and len(row) >= 3]


def _warehouse_parent_names(doctype, warehouse, base_context=None, limit=10000):
    """Resolve documents that touch a warehouse through parent or child-table fields.

    Final parent reads still go through frappe.get_list, so normal document permissions remain the
    security boundary. This helper only computes a candidate-name scope.
    """
    if not warehouse:
        return None
    meta, fields = _meta_fields(doctype)
    if not meta:
        return None
    names = set()
    found_scope_field = False
    direct_fields = [fieldname for fieldname in (
        "warehouse", "set_warehouse", "source_warehouse", "from_warehouse",
        "target_warehouse", "to_warehouse",
    ) if fieldname in fields]
    if direct_fields:
        found_scope_field = True
    context_without_warehouse = _context_filters(base_context or {}, doctype, include_warehouse=False)
    for fieldname in direct_fields:
        filters = dict(context_without_warehouse)
        filters[fieldname] = warehouse
        try:
            names.update(frappe.get_list(doctype, filters=filters, pluck="name", limit_page_length=limit) or [])
        except Exception:
            pass

    child_warehouse_fields = (
        "warehouse", "s_warehouse", "t_warehouse", "source_warehouse", "target_warehouse",
        "from_warehouse", "to_warehouse",
    )
    for table_field in getattr(meta, "fields", []) or []:
        if getattr(table_field, "fieldtype", None) != "Table" or not getattr(table_field, "options", None):
            continue
        child_meta, child_fields = _meta_fields(table_field.options)
        if not child_meta:
            continue
        for fieldname in child_warehouse_fields:
            if fieldname not in child_fields:
                continue
            found_scope_field = True
            try:
                rows = frappe.get_all(
                    table_field.options,
                    filters={"parenttype": doctype, fieldname: warehouse},
                    pluck="parent",
                    limit_page_length=limit,
                ) or []
                names.update(rows)
            except Exception:
                pass
    return sorted(names) if found_scope_field else None


def _contextual_filters(doctype, filters, context):
    context = context or {}
    rows = _filter_rows(filters)
    # Company/branch/date are safe direct filters.
    rows.extend(_filter_rows(_context_filters(context, doctype, include_warehouse=False)))
    warehouse = context.get("warehouse")
    if warehouse:
        names = _warehouse_parent_names(doctype, warehouse, context)
        if names is not None:
            # Empty list must be fail-closed, not interpreted as no filter.
            rows.append(["name", "in", names or ["__metaforge_no_match__"]])
    return rows


@frappe.whitelist()
def get_contextual_list(doctype=None, fields=None, filters=None, or_filters=None, order_by=None, limit_start=0, page_length=20, context=None):
    if not doctype or not _can_read_doctype(doctype):
        frappe.throw(_("Không đủ quyền đọc DocType"), frappe.PermissionError)
    fields = _json_arg(fields, ["name"]) or ["name"]
    filters = _json_arg(filters, []) or []
    or_filters = _json_arg(or_filters, []) or []
    context = _json_arg(context, {}) or {}
    try:
        limit_start = max(0, int(limit_start or 0))
        page_length = max(1, min(int(page_length or 20), 500))
    except (TypeError, ValueError):
        limit_start, page_length = 0, 20
    return frappe.get_list(
        doctype,
        fields=fields,
        filters=_contextual_filters(doctype, filters, context),
        or_filters=or_filters,
        order_by=order_by or "modified desc",
        limit_start=limit_start,
        limit_page_length=page_length,
    ) or []


def _count_rows(doctype, filters=None, or_filters=None):
    """Đếm bản ghi CÓ KIỂM QUYỀN (get_list, không phải db.count).

    Frappe v16 CẤM truyền hàm SQL dạng chuỗi vào `fields` ("count(name) as count") — phải dùng cú
    pháp dict. Cách viết cũ ném ValidationError, và vì mọi chỗ gọi đều bọc `except: return 0` nên
    TOÀN BỘ chỉ số Tổng quan âm thầm về 0 mà không có dấu hiệu gì. Gom về một chỗ để không lặp lại.
    """
    rows = frappe.get_list(
        doctype,
        fields=[{"COUNT": "*"}],
        filters=filters or {},
        or_filters=or_filters or [],
        limit_page_length=1,
    ) or []
    if not rows:
        return 0
    row = rows[0]
    # Tên cột trả về tuỳ phiên bản (count/COUNT(*)/...) — lấy giá trị đầu tiên thay vì đoán khoá.
    value = next(iter(row.values()), 0) if isinstance(row, dict) else (row[0] if row else 0)
    return int(value or 0)


@frappe.whitelist()
def get_contextual_count(doctype=None, filters=None, or_filters=None, context=None):
    if not doctype or not _can_read_doctype(doctype):
        frappe.throw(_("Không đủ quyền đọc DocType"), frappe.PermissionError)
    filters = _json_arg(filters, []) or []
    or_filters = _json_arg(or_filters, []) or []
    context = _json_arg(context, {}) or {}
    return _count_rows(doctype, _contextual_filters(doctype, filters, context), or_filters)


def _safe_context_count(doctype, filters=None, context=None):
    if not _can_read_doctype(doctype):
        return 0
    try:
        return _count_rows(doctype, _contextual_filters(doctype, filters or {}, context or {}))
    except Exception:
        # KHÔNG nuốt im lặng: chính kiểu bọc này đã giấu lỗi cú pháp count() của Frappe v16 khiến
        # mọi chỉ số Tổng quan về 0. Vẫn trả 0 để 1 chỉ số hỏng không làm sập cả dashboard.
        frappe.log_error(frappe.get_traceback(), f"metaforge overview count: {doctype}")
        return 0


def _safe_context_list(doctype, fields, filters=None, context=None, limit=20, order_by="modified desc"):
    if not _can_read_doctype(doctype):
        return []
    try:
        return frappe.get_list(
            doctype,
            fields=fields,
            filters=_contextual_filters(doctype, filters or {}, context or {}),
            limit_page_length=limit,
            order_by=order_by,
        ) or []
    except Exception:
        return []


def _activity_fields(doctype):
    meta, fields = _meta_fields(doctype)
    if not meta:
        return ["name", "modified", "owner"], None
    candidates = [getattr(meta, "title_field", None), "subject", "title", "customer_name", "supplier_name", "item_name", "full_name"]
    title_field = next((fieldname for fieldname in candidates if fieldname and fieldname in fields), None)
    requested = ["name", "modified", "owner"]
    if title_field and title_field not in requested:
        requested.append(title_field)
    return requested, title_field


def _safe_count(doctype, filters=None):
	if not _can_read_doctype(doctype):
		return 0
	try:
		return _count_rows(doctype, filters or {})
	except Exception:
		frappe.log_error(frappe.get_traceback(), f"metaforge count: {doctype}")
		return 0


def _route(dt, filters=None):
	if not filters:
		return f"/app/{dt}"
	return f"/app/{dt}?filters={frappe.utils.quote(frappe.as_json(filters))}"


_DOMAIN_CONFIG = {
	"stock": {
		"label": "Tổng quan kho",
		"metrics": [
			("items", "Mặt hàng", "Item", {}, "package"),
			("warehouses", "Kho hoạt động", "Warehouse", {"is_group": 0}, "warehouse"),
			("stock_entries", "Phiếu kho chờ xử lý", "Stock Entry", {"docstatus": 0}, "clipboard-list"),
			("material_requests", "Yêu cầu vật tư", "Material Request", {"docstatus": 0}, "shopping-cart"),
			("reconciliations", "Kiểm kê chờ xử lý", "Stock Reconciliation", {"docstatus": 0}, "scan-line"),
		],
		"actions": [("receipt", "Nhập kho", "Purchase Receipt"), ("delivery", "Xuất kho", "Delivery Note"), ("transfer", "Chuyển kho", "Stock Entry"), ("count", "Kiểm kê", "Stock Reconciliation")],
	},
	"selling": {"label": "Tổng quan bán hàng", "metrics": [("customers", "Khách hàng", "Customer", {}, "users"), ("orders", "Đơn bán chờ xử lý", "Sales Order", {"docstatus": 0}, "file-text"), ("deliveries", "Phiếu giao chờ xử lý", "Delivery Note", {"docstatus": 0}, "truck"), ("invoices", "Hóa đơn chờ xử lý", "Sales Invoice", {"docstatus": 0}, "receipt")], "actions": [("quotation", "Báo giá", "Quotation"), ("order", "Đơn bán", "Sales Order"), ("delivery", "Giao hàng", "Delivery Note"), ("invoice", "Hóa đơn", "Sales Invoice")]},
	"buying": {"label": "Tổng quan mua hàng", "metrics": [("suppliers", "Nhà cung cấp", "Supplier", {}, "users"), ("requests", "Yêu cầu mua", "Material Request", {"docstatus": 0}, "shopping-cart"), ("orders", "Đơn mua chờ xử lý", "Purchase Order", {"docstatus": 0}, "file-text"), ("receipts", "Phiếu nhận chờ xử lý", "Purchase Receipt", {"docstatus": 0}, "package-check")], "actions": [("request", "Yêu cầu mua", "Material Request"), ("order", "Đơn mua", "Purchase Order"), ("receipt", "Nhận hàng", "Purchase Receipt"), ("invoice", "Hóa đơn mua", "Purchase Invoice")]},
	"manufacturing": {"label": "Tổng quan sản xuất", "metrics": [("bom", "BOM", "BOM", {}, "list-tree"), ("plans", "Kế hoạch chờ xử lý", "Production Plan", {"docstatus": 0}, "calendar"), ("orders", "Lệnh sản xuất", "Work Order", {"docstatus": 0}, "factory"), ("jobs", "Công việc đang mở", "Job Card", {"docstatus": 0}, "wrench")], "actions": [("plan", "Kế hoạch", "Production Plan"), ("work", "Lệnh sản xuất", "Work Order"), ("job", "Job Card", "Job Card")]},
	"accounts": {"label": "Tổng quan kế toán", "metrics": [("sales_invoices", "Hóa đơn bán chờ xử lý", "Sales Invoice", {"docstatus": 0}, "receipt"), ("purchase_invoices", "Hóa đơn mua chờ xử lý", "Purchase Invoice", {"docstatus": 0}, "receipt-text"), ("payments", "Thanh toán chờ xử lý", "Payment Entry", {"docstatus": 0}, "wallet-cards"), ("journals", "Bút toán chờ xử lý", "Journal Entry", {"docstatus": 0}, "book-open")], "actions": [("sales", "Hóa đơn bán", "Sales Invoice"), ("purchase", "Hóa đơn mua", "Purchase Invoice"), ("payment", "Thanh toán", "Payment Entry"), ("journal", "Bút toán", "Journal Entry")]},
	"crm": {"label": "Tổng quan CRM", "metrics": [("leads", "Lead đang mở", "Lead", {"status": ["!=", "Converted"]}, "user-plus"), ("opportunities", "Cơ hội đang mở", "Opportunity", {"status": ["not in", ["Converted", "Lost"]]}, "target"), ("customers", "Khách hàng", "Customer", {}, "users")], "actions": [("lead", "Lead", "Lead"), ("opportunity", "Cơ hội", "Opportunity"), ("customer", "Khách hàng", "Customer")]},
	"hr": {"label": "Tổng quan nhân sự", "metrics": [("employees", "Nhân viên đang hoạt động", "Employee", {"status": "Active"}, "users"), ("attendance", "Chấm công hôm nay", "Attendance", {}, "calendar-check"), ("leave", "Đơn nghỉ chờ duyệt", "Leave Application", {"status": "Open"}, "calendar-off"), ("payroll", "Bảng lương chờ xử lý", "Payroll Entry", {"docstatus": 0}, "banknote")], "actions": [("employee", "Nhân viên", "Employee"), ("attendance", "Chấm công", "Attendance"), ("leave", "Đơn nghỉ", "Leave Application"), ("payroll", "Bảng lương", "Payroll Entry")]},
	"projects": {"label": "Tổng quan dự án", "metrics": [("projects", "Dự án đang mở", "Project", {"status": "Open"}, "briefcase"), ("tasks", "Công việc đang mở", "Task", {"status": ["not in", ["Completed", "Cancelled"]]}, "list-checks"), ("timesheets", "Bảng công chờ duyệt", "Timesheet", {"docstatus": 0}, "clock")], "actions": [("project", "Dự án", "Project"), ("task", "Công việc", "Task"), ("timesheet", "Bảng công", "Timesheet")]},
	"assets": {"label": "Tổng quan tài sản", "metrics": [("assets", "Tài sản", "Asset", {}, "package"), ("maintenance", "Bảo trì đang mở", "Asset Maintenance", {"docstatus": 0}, "wrench"), ("movement", "Điều chuyển chờ xử lý", "Asset Movement", {"docstatus": 0}, "move")], "actions": [("asset", "Tài sản", "Asset"), ("maintenance", "Bảo trì", "Asset Maintenance"), ("movement", "Điều chuyển", "Asset Movement")]},
	"support": {"label": "Tổng quan hỗ trợ", "metrics": [("issues", "Yêu cầu đang mở", "Issue", {"status": "Open"}, "life-buoy"), ("sla", "Yêu cầu quá SLA", "Issue", {"status": "Open"}, "alarm-clock"), ("customers", "Khách hàng", "Customer", {}, "users")], "actions": [("issue", "Yêu cầu hỗ trợ", "Issue"), ("customer", "Khách hàng", "Customer")]},
	"quality": {"label": "Tổng quan chất lượng", "metrics": [("inspection", "Kiểm tra chờ xử lý", "Quality Inspection", {"docstatus": 0}, "badge-check"), ("action", "Hành động chất lượng", "Quality Action", {"status": "Open"}, "clipboard-check"), ("review", "Đánh giá chất lượng", "Quality Review", {"docstatus": 0}, "search-check")], "actions": [("inspection", "Kiểm tra", "Quality Inspection"), ("action", "Hành động", "Quality Action"), ("review", "Đánh giá", "Quality Review")]},
}


def _stock_aggregate_metrics(context):
	"""Best-effort KPI tồn kho thật, permission-aware. Thiếu ERPNext/Bin field thì trả rỗng."""
	if not _can_read_doctype("Bin"):
		return []
	filters = {}
	warehouse = context.get("warehouse")
	if warehouse:
		filters["warehouse"] = warehouse
	elif context.get("company") and _can_read_doctype("Warehouse"):
		warehouses = [r.get("name") for r in _safe_list("Warehouse", ["name"], filters={"company": context.get("company"), "is_group": 0}, limit=2000) if r.get("name")]
		if warehouses:
			filters["warehouse"] = ["in", warehouses]
	try:
		rows = frappe.get_list("Bin", filters=filters, fields=["sum(actual_qty) as qty", "sum(stock_value) as value", "count(distinct item_code) as items"], limit_page_length=1)
		row = (rows or [{}])[0]
		metrics = [
			{"key": "actual_qty", "label": _("Tổng số lượng tồn"), "value": float(row.get("qty") or 0), "tone": "info", "icon": "boxes", "route": "/report/Stock Balance"},
			{"key": "stock_value", "label": _("Tổng giá trị tồn"), "value": float(row.get("value") or 0), "tone": "success", "icon": "coins", "route": "/report/Stock Balance"},
			{"key": "stock_items", "label": _("Mặt hàng có tồn"), "value": int(row.get("items") or 0), "tone": "neutral", "icon": "package", "route": "/report/Stock Balance"},
		]
	except Exception:
		metrics = []
	if _can_read_doctype("Batch"):
		try:
			from frappe.utils import add_days, nowdate
			expiring = _safe_count("Batch", {"disabled": 0, "expiry_date": ["between", [nowdate(), add_days(nowdate(), 30)]]})
			metrics.append({"key": "expiring_batches", "label": _("Lô sắp hết hạn"), "value": expiring, "tone": "warning" if expiring else "success", "icon": "calendar-clock", "route": _route("Batch", {"disabled": 0, "expiry_date": ["between", [nowdate(), add_days(nowdate(), 30)]]})})
		except Exception:
			pass
	return metrics


@frappe.whitelist()
def get_overview(domain="stock", context=None):
	context = _json_arg(context, {}) or {}
	key = _domain_key(domain)
	if not key or key not in _DOMAIN_CONFIG:
		return {"key": str(domain or ""), "label": _("Chưa cấu hình tổng quan"), "subtitle": "", "metrics": [], "charts": [], "tasks": [], "activities": [], "actions": [], "unsupported": True}
	config = _DOMAIN_CONFIG[key]
	metrics, tasks, actions, activities = [], [], [], []
	if key == "stock":
		metrics.extend(_stock_aggregate_metrics(context))
	activity_seen = set()
	for metric_key, label, dt, base_filters, icon in config.get("metrics", []):
		filters = dict(base_filters)
		filters.update(_context_filters(context, dt))
		count = _safe_context_count(dt, base_filters, context)
		metrics.append({"key": metric_key, "label": _(label), "value": count, "tone": "warning" if count and base_filters else "info", "icon": icon, "route": _route(dt, filters) if _has_doctype(dt) else None})
		if base_filters and _has_doctype(dt):
			tasks.append({"key": metric_key, "label": _(label), "count": count, "tone": "warning" if count else "success", "route": _route(dt, filters)})
		# Hoạt động gần đây: chỉ lấy DocType user đọc được; giữ tối đa 8 item toàn dashboard.
		if len(activities) < 8 and _has_doctype(dt) and dt not in activity_seen:
			activity_seen.add(dt)
			activity_fields, title_field = _activity_fields(dt)
			for row in _safe_context_list(dt, activity_fields, context=context, limit=2, order_by="modified desc"):
				name = str(row.get("name") or "")
				title = str(row.get(title_field) or name) if title_field else name
				activities.append({
					"key": f"{dt}:{name}",
					"label": f"{_(dt)} · {title}",
					"description": (_("Mã: {0} · Cập nhật bởi {1}").format(name, row.get("owner") or "") if title != name else _("Cập nhật bởi {0}").format(row.get("owner") or "")),
					"timestamp": str(row.get("modified") or ""),
					"route": f"/app/{dt}/{frappe.utils.quote(name)}",
					"actor": row.get("owner"),
				})
	for action_key, label, dt in config.get("actions", []):
		if _has_doctype(dt) and frappe.has_permission(dt, "create"):
			actions.append({"key": action_key, "label": _(label), "icon": "plus", "route": f"/app/{dt}/new", "capability": "create"})
	# Biểu đồ live tối thiểu nhưng thật: phân bố các KPI theo context hiện tại. Workspace Dashboard
	# Chart chuyên biệt vẫn có thể được thêm sau mà không đổi contract OverviewDashboard.
	charts = []
	if metrics:
		charts.append({
			"key": "workload",
			"label": _("Phân bố dữ liệu nghiệp vụ"),
			"type": "bar",
			"labels": [m.get("label") for m in metrics],
			"series": [{"name": _("Số lượng"), "values": [int(m.get("value") or 0) for m in metrics]}],
		})
	return {
		"key": key,
		"label": _(config.get("label")),
		"subtitle": " · ".join([v for v in (context.get("company"), context.get("fiscal_year"), context.get("warehouse")) if v]),
		"metrics": metrics,
		"charts": charts,
		"tasks": tasks,
		"activities": sorted(activities, key=lambda row: row.get("timestamp") or "", reverse=True)[:8],
		"actions": actions,
	}


_PROCESS_TEMPLATES = {
    "stock": [
        {"key": "inbound", "label": "Nhập kho", "stages": [
            {"key": "purchase_order", "label": "Đơn mua đang chờ nhận", "doctype": "Purchase Order", "filters": {"docstatus": 1, "status": ["not in", ["Completed", "Closed", "Cancelled"]]}},
            {"key": "receipt", "label": "Phiếu nhận hàng nháp", "doctype": "Purchase Receipt", "filters": {"docstatus": 0}},
            {"key": "quality", "label": "Kiểm tra chất lượng", "doctype": "Quality Inspection", "filters": {"docstatus": 0}},
            {"key": "putaway", "label": "Put-away", "doctype": "Stock Entry", "filters": {"docstatus": 0, "stock_entry_type": "Material Transfer"}},
        ]},
        {"key": "outbound", "label": "Xuất kho", "stages": [
            {"key": "sales_order", "label": "Đơn bán chờ giao", "doctype": "Sales Order", "filters": {"docstatus": 1, "status": ["not in", ["Completed", "Closed", "Cancelled"]]}},
            {"key": "pick", "label": "Pick List", "doctype": "Pick List", "filters": {"docstatus": 0}},
            {"key": "packing", "label": "Đóng gói", "doctype": "Packing Slip", "filters": {"docstatus": 0}},
            {"key": "delivery", "label": "Phiếu giao hàng", "doctype": "Delivery Note", "filters": {"docstatus": 0}},
        ]},
        {"key": "transfer", "label": "Chuyển kho", "stages": [
            {"key": "request", "label": "Yêu cầu chuyển", "doctype": "Material Request", "filters": {"docstatus": 0, "material_request_type": "Material Transfer"}},
            {"key": "approved_request", "label": "Yêu cầu đã duyệt", "doctype": "Material Request", "filters": {"docstatus": 1, "material_request_type": "Material Transfer", "status": ["not in", ["Transferred", "Cancelled", "Stopped"]]}},
            {"key": "transfer_draft", "label": "Phiếu chuyển đang soạn", "doctype": "Stock Entry", "filters": {"docstatus": 0, "stock_entry_type": "Material Transfer"}},
            {"key": "transfer_done", "label": "Đã ghi sổ chuyển kho", "doctype": "Stock Entry", "filters": {"docstatus": 1, "stock_entry_type": "Material Transfer"}},
        ]},
        {"key": "count", "label": "Kiểm kê", "stages": [
            {"key": "draft", "label": "Đợt kiểm kê đang chuẩn bị", "doctype": "Stock Reconciliation", "filters": {"docstatus": 0}},
            {"key": "posted", "label": "Đã ghi nhận chênh lệch", "doctype": "Stock Reconciliation", "filters": {"docstatus": 1}},
        ]},
        {"key": "replenishment", "label": "Bổ sung hàng", "stages": [
            {"key": "request", "label": "Yêu cầu bổ sung", "doctype": "Material Request", "filters": {"docstatus": 0}},
            {"key": "purchase", "label": "Đơn mua đang mở", "doctype": "Purchase Order", "filters": {"docstatus": 1, "status": ["not in", ["Completed", "Closed", "Cancelled"]]}},
            {"key": "receipt", "label": "Nhận hàng", "doctype": "Purchase Receipt", "filters": {"docstatus": 0}},
        ]},
    ],
    "selling": [{"key": "sales", "label": "Bán hàng", "stages": [
        {"key": "lead", "label": "Lead mới", "doctype": "Lead", "filters": {"status": ["not in", ["Converted", "Do Not Contact"]]}},
        {"key": "opportunity", "label": "Cơ hội đang mở", "doctype": "Opportunity", "filters": {"status": ["not in", ["Converted", "Lost", "Closed"]]}},
        {"key": "quotation", "label": "Báo giá nháp", "doctype": "Quotation", "filters": {"docstatus": 0}},
        {"key": "order", "label": "Đơn bán đang mở", "doctype": "Sales Order", "filters": {"docstatus": 1, "status": ["not in", ["Completed", "Closed", "Cancelled"]]}},
        {"key": "delivery", "label": "Phiếu giao nháp", "doctype": "Delivery Note", "filters": {"docstatus": 0}},
        {"key": "invoice", "label": "Hóa đơn nháp", "doctype": "Sales Invoice", "filters": {"docstatus": 0}},
    ]}],
    "buying": [{"key": "buying", "label": "Mua hàng", "stages": [
        {"key": "request", "label": "Yêu cầu vật tư", "doctype": "Material Request", "filters": {"docstatus": 0}},
        {"key": "quotation", "label": "Báo giá nhà cung cấp", "doctype": "Supplier Quotation", "filters": {"docstatus": 0}},
        {"key": "order", "label": "Đơn mua đang mở", "doctype": "Purchase Order", "filters": {"docstatus": 1, "status": ["not in", ["Completed", "Closed", "Cancelled"]]}},
        {"key": "receipt", "label": "Phiếu nhận nháp", "doctype": "Purchase Receipt", "filters": {"docstatus": 0}},
        {"key": "invoice", "label": "Hóa đơn mua nháp", "doctype": "Purchase Invoice", "filters": {"docstatus": 0}},
    ]}],
    "manufacturing": [{"key": "production", "label": "Sản xuất", "stages": [
        {"key": "plan", "label": "Kế hoạch sản xuất", "doctype": "Production Plan", "filters": {"docstatus": 0}},
        {"key": "work", "label": "Lệnh sản xuất đang mở", "doctype": "Work Order", "filters": {"docstatus": 1, "status": ["not in", ["Completed", "Stopped", "Cancelled"]]}},
        {"key": "transfer", "label": "Cấp nguyên liệu", "doctype": "Stock Entry", "filters": {"docstatus": 0, "stock_entry_type": "Material Transfer for Manufacture"}},
        {"key": "job", "label": "Job Card đang mở", "doctype": "Job Card", "filters": {"docstatus": 0}},
        {"key": "manufacture", "label": "Nhập thành phẩm", "doctype": "Stock Entry", "filters": {"docstatus": 0, "stock_entry_type": "Manufacture"}},
    ]}],
    "hr": [{"key": "employee", "label": "Vòng đời nhân sự", "stages": [
        {"key": "recruit", "label": "Ứng viên", "doctype": "Job Applicant", "filters": {"status": ["not in", ["Rejected", "Accepted"]]}},
        {"key": "onboard", "label": "Onboarding", "doctype": "Employee Onboarding", "filters": {"docstatus": 0}},
        {"key": "attendance", "label": "Chấm công", "doctype": "Attendance", "filters": {"docstatus": 0}},
        {"key": "payroll", "label": "Bảng lương", "doctype": "Payroll Entry", "filters": {"docstatus": 0}},
        {"key": "review", "label": "Đánh giá", "doctype": "Appraisal", "filters": {"docstatus": 0}},
        {"key": "offboard", "label": "Offboarding", "doctype": "Employee Separation", "filters": {"docstatus": 0}},
    ]}],
    "accounts": [{"key": "accounting", "label": "Kế toán", "stages": [
        {"key": "sales", "label": "Hóa đơn bán nháp", "doctype": "Sales Invoice", "filters": {"docstatus": 0}},
        {"key": "purchase", "label": "Hóa đơn mua nháp", "doctype": "Purchase Invoice", "filters": {"docstatus": 0}},
        {"key": "payment", "label": "Thu/Chi nháp", "doctype": "Payment Entry", "filters": {"docstatus": 0}},
        {"key": "journal", "label": "Bút toán nháp", "doctype": "Journal Entry", "filters": {"docstatus": 0}},
    ]}],
    "crm": [{"key": "crm", "label": "Khách hàng & bán hàng", "stages": [
        {"key": "lead", "label": "Lead mới", "doctype": "Lead", "filters": {"status": ["not in", ["Converted", "Do Not Contact"]]}},
        {"key": "opportunity", "label": "Cơ hội đang mở", "doctype": "Opportunity", "filters": {"status": ["not in", ["Converted", "Lost", "Closed"]]}},
        {"key": "quotation", "label": "Báo giá", "doctype": "Quotation", "filters": {"docstatus": 0}},
        {"key": "customer", "label": "Khách hàng", "doctype": "Customer", "filters": {}},
    ]}],
    "projects": [{"key": "project", "label": "Thực hiện dự án", "stages": [
        {"key": "project", "label": "Dự án đang mở", "doctype": "Project", "filters": {"status": "Open"}},
        {"key": "task", "label": "Công việc đang mở", "doctype": "Task", "filters": {"status": ["not in", ["Completed", "Cancelled"]]}},
        {"key": "timesheet", "label": "Bảng công nháp", "doctype": "Timesheet", "filters": {"docstatus": 0}},
        {"key": "billing", "label": "Hóa đơn dự án", "doctype": "Sales Invoice", "filters": {"docstatus": 0}},
    ]}],
    "assets": [{"key": "asset", "label": "Vòng đời tài sản", "stages": [
        {"key": "asset", "label": "Tài sản", "doctype": "Asset", "filters": {}},
        {"key": "movement", "label": "Điều chuyển nháp", "doctype": "Asset Movement", "filters": {"docstatus": 0}},
        {"key": "maintenance", "label": "Bảo trì", "doctype": "Asset Maintenance", "filters": {"docstatus": 0}},
        {"key": "repair", "label": "Sửa chữa", "doctype": "Asset Repair", "filters": {"docstatus": 0}},
    ]}],
    "support": [{"key": "support", "label": "Xử lý hỗ trợ", "stages": [
        {"key": "open", "label": "Tiếp nhận", "doctype": "Issue", "filters": {"status": "Open"}},
        {"key": "replied", "label": "Đang trao đổi", "doctype": "Issue", "filters": {"status": "Replied"}},
        {"key": "resolved", "label": "Đã xử lý", "doctype": "Issue", "filters": {"status": "Resolved"}},
        {"key": "closed", "label": "Đã đóng", "doctype": "Issue", "filters": {"status": "Closed"}},
    ]}],
    "quality": [{"key": "quality", "label": "Kiểm soát chất lượng", "stages": [
        {"key": "goal", "label": "Mục tiêu", "doctype": "Quality Goal", "filters": {}},
        {"key": "inspection", "label": "Kiểm tra chờ xử lý", "doctype": "Quality Inspection", "filters": {"docstatus": 0}},
        {"key": "action", "label": "Khắc phục đang mở", "doctype": "Quality Action", "filters": {"status": "Open"}},
        {"key": "review", "label": "Đánh giá", "doctype": "Quality Review", "filters": {"docstatus": 0}},
    ]}],
}


def _valid_stage_filters(doctype, requested):
    meta, fields = _meta_fields(doctype)
    if not meta:
        return {}
    valid = {"name", "docstatus", "owner", "modified"} | fields
    return {fieldname: value for fieldname, value in (requested or {}).items() if fieldname in valid}


def _overdue_count(doctype, filters, context=None):
    try:
        meta, fields = _meta_fields(doctype)
        date_field = next((fieldname for fieldname in (
            "due_date", "schedule_date", "expected_delivery_date", "required_by", "end_date",
        ) if fieldname in fields), None)
        if not date_field:
            return 0
        overdue_filters = dict(filters or {})
        overdue_filters[date_field] = ["<", frappe.utils.nowdate()]
        return _safe_context_count(doctype, overdue_filters, context or {})
    except Exception:
        return 0


@frappe.whitelist()
def get_processes(domain="stock", context=None):
    context = _json_arg(context, {}) or {}
    key = _domain_key(domain)
    if not key or key not in _PROCESS_TEMPLATES:
        return {"processes": [], "unsupported": True, "domain": str(domain or "")}
    definitions = []
    for definition in _PROCESS_TEMPLATES[key]:
        stages, edges = [], []
        for stage in definition.get("stages", []):
            dt = stage.get("doctype")
            if not dt or not _can_read_doctype(dt):
                continue
            filters = _valid_stage_filters(dt, stage.get("filters"))
            filters.update(_context_filters(context, dt))
            count = _safe_context_count(dt, stage.get("filters") or {}, context)
            overdue = _overdue_count(dt, stage.get("filters") or {}, context)
            stage_item = {
                "key": stage.get("key"),
                "label": _(stage.get("label")),
                "sourceType": "doctype",
                "source": dt,
                "route": _route(dt, filters),
                "description": _("Mở danh sách {0} theo đúng trạng thái và phạm vi hiện tại").format(_(dt)),
                "counter": {"count": count, "overdue": overdue},
                "status": "warning" if overdue else ("ready" if count else "complete"),
                "filters": filters,
            }
            stages.append(stage_item)
        for left, right in zip(stages, stages[1:]):
            edges.append({"from": left["key"], "to": right["key"]})
        if stages:
            definitions.append({
                "key": definition.get("key"),
                "label": _(definition.get("label")),
                "app": key,
                "requiredContexts": [name for name in ("company", "fiscal_year", "warehouse") if context.get(name)],
                "stages": stages,
                "edges": edges,
            })
    return {"processes": definitions, "domain": key}


@contextmanager
def _temporary_user(user):
    original = frappe.session.user
    if not user or user == original:
        yield
        return
    frappe.set_user(user)
    try:
        yield
    finally:
        frappe.set_user(original)


def _can_administer_access():
    return frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()


@frappe.whitelist()
def get_access_profile(user=None):
    requested_user = user or frappe.session.user
    if requested_user != frappe.session.user and not _can_administer_access():
        frappe.throw(_("Không đủ quyền xem người dùng khác"), frappe.PermissionError)
    if not frappe.db.exists("User", requested_user):
        frappe.throw(_("Người dùng không tồn tại"), frappe.DoesNotExistError)

    user_doc = frappe.get_doc("User", requested_user)
    assigned_roles = [row.role for row in (user_doc.roles or []) if row.role]
    role_profile = getattr(user_doc, "role_profile_name", None) or None
    roles = frappe.get_roles(requested_user)
    try:
        rows = frappe.get_all(
            "User Permission",
            fields=["name", "allow", "for_value", "applicable_for", "is_default", "hide_descendants"],
            filters={"user": requested_user},
            limit_page_length=2000,
        ) or []
    except Exception:
        rows = []
    by_dt = {}
    for row in rows:
        allow = row.get("allow")
        if not allow:
            continue
        by_dt.setdefault(allow, []).append({
            "id": row.get("name"),
            "value": row.get("for_value"),
            "label": row.get("for_value"),
            "applicableFor": row.get("applicable_for"),
            "isDefault": bool(row.get("is_default")),
            "hideDescendants": bool(row.get("hide_descendants")),
        })
    scopes = [{"doctype": dt, "values": values} for dt, values in sorted(by_dt.items())]
    full_name = frappe.db.get_value("User", requested_user, "full_name") or requested_user
    applications, workspaces = [], []
    with _temporary_user(requested_user):
        try:
            catalog = get_application_catalog() or {}
            for app in catalog.get("apps", []):
                applications.append(app.get("label") or app.get("key"))
                workspaces.extend(ws.get("label") or ws.get("key") for ws in app.get("workspaces", []))
        except Exception:
            pass
    return {
        "user": requested_user,
        "fullName": full_name,
        "roles": roles,
        "assignedRoles": assigned_roles,
        "roleProfile": role_profile,
        "scopes": scopes,
        "applications": [value for value in applications if value],
        "workspaces": [value for value in workspaces if value],
        "canManage": _can_administer_access(),
    }


@frappe.whitelist(methods=["POST"])
def add_user_permission(user=None, allow=None, for_value=None, applicable_for=None, is_default=0, hide_descendants=0):
    if not _can_administer_access():
        frappe.throw(_("Không đủ quyền quản lý phạm vi dữ liệu"), frappe.PermissionError)
    if not user or not allow or not for_value:
        frappe.throw(_("Thiếu user/allow/for_value"))
    if not frappe.db.exists("User", user) or not frappe.db.exists(allow, for_value):
        frappe.throw(_("User Permission không hợp lệ"))
    duplicate = frappe.db.exists("User Permission", {
        "user": user, "allow": allow, "for_value": for_value, "applicable_for": applicable_for or "",
    })
    if duplicate:
        return frappe.get_doc("User Permission", duplicate).as_dict()
    doc = frappe.get_doc({
        "doctype": "User Permission",
        "user": user,
        "allow": allow,
        "for_value": for_value,
        "applicable_for": applicable_for or None,
        "is_default": 1 if int(is_default or 0) else 0,
        "hide_descendants": 1 if int(hide_descendants or 0) else 0,
    })
    doc.insert()
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def remove_user_permission(name=None):
    if not _can_administer_access():
        frappe.throw(_("Không đủ quyền quản lý phạm vi dữ liệu"), frappe.PermissionError)
    if not name or not frappe.db.exists("User Permission", name):
        frappe.throw(_("User Permission không tồn tại"), frappe.DoesNotExistError)
    frappe.delete_doc("User Permission", name)
    return {"ok": True}


@frappe.whitelist(methods=["POST"])
def set_user_roles(user=None, roles=None, role_profile=None):
    if not _can_administer_access():
        frappe.throw(_("Không đủ quyền gán Role"), frappe.PermissionError)
    if not user or not frappe.db.exists("User", user):
        frappe.throw(_("Người dùng không tồn tại"), frappe.DoesNotExistError)
    if user == "Administrator":
        frappe.throw(_("Không chỉnh Role của Administrator từ Permission Center"), frappe.PermissionError)

    requested_profile = str(role_profile or "").strip() or None
    if requested_profile:
        if not frappe.db.exists("Role Profile", requested_profile):
            frappe.throw(_("Role Profile không tồn tại"), frappe.DoesNotExistError)
        desired = frappe.get_all(
            "Has Role",
            filters={"parent": requested_profile, "parenttype": "Role Profile"},
            pluck="role",
            limit_page_length=1000,
        ) or []
    else:
        desired = _json_arg(roles, []) or []

    desired = sorted({
        role for role in desired
        if role and role not in {"All", "Guest"} and frappe.db.exists("Role", role)
    })
    current_roles = set(frappe.get_roles(user))
    if user == frappe.session.user and frappe.session.user != "Administrator" and "System Manager" in current_roles and "System Manager" not in desired:
        frappe.throw(_("Không thể tự gỡ System Manager khỏi tài khoản đang đăng nhập"), frappe.PermissionError)

    doc = frappe.get_doc("User", user)
    doc.role_profile_name = requested_profile
    doc.set("roles", [])
    for role in desired:
        doc.append("roles", {"role": role})
    doc.save()
    return {"user": user, "roles": frappe.get_roles(user), "roleProfile": requested_profile}


def _permlevel_access(meta, roles, ptype):
	"""permlevel → allow theo DocPerm thực; System Manager/Administrator vẫn phải qua capability tổng."""
	access = {}
	for rule in getattr(meta, "permissions", []) or []:
		if rule.role not in roles:
			continue
		level = int(rule.permlevel or 0)
		if bool(getattr(rule, ptype, 0)):
			access[level] = True
	return access


@frappe.whitelist()
def explain_permission(doctype=None, name=None, context=None, user=None):
	if not doctype or not _has_doctype(doctype):
		frappe.throw(_("DocType không hợp lệ"))
	requested_user = user or frappe.session.user
	if requested_user != frappe.session.user and not _can_administer_access():
		frappe.throw(_("Không đủ quyền phân tích người dùng khác"), frappe.PermissionError)
	context = _json_arg(context, {}) or {}
	with _temporary_user(requested_user):
		caps = get_capabilities(doctype, name)
		roles = set(frappe.get_roles())
	trace = []
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		meta = None

	if meta:
		for rule in getattr(meta, "permissions", []) or []:
			if rule.role not in roles:
				continue
			grants = [p for p in ("read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "import", "share", "print", "email") if bool(getattr(rule, p, 0))]
			trace.append({
				"source": "role",
				"effect": "allow" if grants else "info",
				"label": rule.role,
				"detail": _("Permlevel {0}: {1}").format(rule.permlevel or 0, ", ".join(grants) or _("không cấp thao tác")),
			})

	profile = get_access_profile(requested_user)
	for scope in profile.get("scopes", []):
		values = [v.get("label") for v in scope.get("values", []) if v.get("label")]
		trace.append({"source": "user_permission", "effect": "info", "label": scope.get("doctype"), "detail": ", ".join(values)})
		# Trace rõ context global có nằm trong User Permission hay không. Backend query/save vẫn enforce.
		key = {"Company": "company", "Warehouse": "warehouse", "Branch": "branch", "Cost Center": "cost_center"}.get(scope.get("doctype"))
		if key and context.get(key):
			allowed = {v.get("value") for v in scope.get("values", [])}
			trace.append({
				"source": "user_permission",
				"effect": "allow" if context.get(key) in allowed else "deny",
				"label": _("Context {0}").format(scope.get("doctype")),
				"detail": str(context.get(key)),
			})

	for ptype, allowed in caps.items():
		trace.append({"source": "system", "effect": "allow" if allowed else "deny", "label": ptype, "detail": _("Kết quả quyền hiệu lực từ Frappe")})

	field_rules = []
	if meta:
		read_levels = _permlevel_access(meta, roles, "read")
		write_levels = _permlevel_access(meta, roles, "write")
		administrator = requested_user == "Administrator"
		for df in meta.fields:
			if not df.fieldname:
				continue
			level = int(df.permlevel or 0)
			can_read_level = administrator or bool(read_levels.get(level)) or (level == 0 and bool(caps.get("read")))
			can_write_level = administrator or bool(write_levels.get(level)) or (level == 0 and bool(caps.get("write")))
			can_read = bool(caps.get("read") and can_read_level and not getattr(df, "hidden", 0))
			can_write = bool(caps.get("write") and can_write_level and not getattr(df, "read_only", 0) and not getattr(df, "hidden", 0))
			reasons = [_("permlevel {0}").format(level)]
			if getattr(df, "hidden", 0): reasons.append(_("field hidden"))
			if getattr(df, "read_only", 0): reasons.append(_("field read-only"))
			if not can_read_level: reasons.append(_("role không có read ở permlevel này"))
			if not can_write_level: reasons.append(_("role không có write ở permlevel này"))
			field_rules.append({"fieldname": df.fieldname, "read": can_read, "write": can_write, "masked": False, "reason": "; ".join(reasons)})
	return {"user": requested_user, "doctype": doctype, "name": name, "capabilities": caps, "trace": trace, "fieldRules": field_rules}


@frappe.whitelist(methods=["POST"])
def resolve_display_values(items=None):
	items = _json_arg(items, []) or []
	if len(items) > 100:
		frappe.throw(_("Tối đa 100 giá trị mỗi lần"))
	out = []
	for item in items:
		dt, name = item.get("doctype"), item.get("name")
		if not dt or not name or not _can_read_doctype(dt) or not frappe.has_permission(dt, "read", doc=name):
			out.append({"doctype": dt, "name": name, "label": name or "", "missing": True})
			continue
		try:
			meta = frappe.get_meta(dt)
			title_field = meta.title_field or "name"
			fields = [title_field]
			if getattr(meta, "image_field", None): fields.append(meta.image_field)
			row = frappe.db.get_value(dt, name, fields, as_dict=True) or {}
			raw_label = row.get(title_field) or name
			# Cho nhãn đi qua _(): các doctype DANH MỤC HỆ THỐNG của ERPNext có tên bản ghi là chuỗi
			# tiếng Anh cố định ("Material Transfer", "Material Receipt", "Purchase"…). Đó là GIÁ TRỊ
			# nên không dịch được ở tầng metadata như label field — phải dịch lúc hiển thị.
			#
			# An toàn với dữ liệu người dùng: _() trả lại NGUYÊN VĂN khi không có bản ghi Translation
			# tương ứng, nên tên khách hàng/nhà cung cấp/mặt hàng không bị đụng tới.
			out.append({
				"doctype": dt,
				"name": name,
				"label": _(raw_label) if isinstance(raw_label, str) else raw_label,
				"image": row.get(getattr(meta, "image_field", "")) if getattr(meta, "image_field", None) else None,
			})
		except Exception:
			out.append({"doctype": dt, "name": name, "label": name, "missing": True})
	return out


@frappe.whitelist(methods=["POST"])
def translate_strings(strings=None, lang=None):
	values = _json_arg(strings, []) or []
	if len(values) > 500:
		frappe.throw(_("Tối đa 500 chuỗi mỗi lần"))
	return {str(value): _(str(value), lang=lang or frappe.local.lang) for value in values if value is not None}
