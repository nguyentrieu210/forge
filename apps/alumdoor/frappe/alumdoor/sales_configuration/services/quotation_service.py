from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

from alumdoor.sales_configuration.services.catalog_service import get_allowed_colors, validate_item_color
from alumdoor.sales_configuration.services.configured_product_service import resolve_configuration


def _payload(value: dict[str, Any] | str | None) -> dict[str, Any]:
	if isinstance(value, dict):
		return value
	if isinstance(value, str):
		try:
			parsed = json.loads(value)
		except ValueError as exc:
			raise frappe.ValidationError(_("Dữ liệu đơn hàng không hợp lệ")) from exc
		if isinstance(parsed, dict):
			return parsed
	frappe.throw(_("Dữ liệu đơn hàng không hợp lệ"), frappe.ValidationError)


def customer_context(customer: str) -> dict[str, Any]:
	partner = frappe.db.get_value(
		"Alumdoor Partner", customer,
		["name", "partner_name", "partner_kind", "partner_group", "customer_group", "default_price_list", "primary_contact", "phone", "assigned_employee", "enabled"],
		as_dict=True,
	)
	if not partner or not partner.enabled:
		frappe.throw(_("Khách hàng không tồn tại hoặc đã ngừng sử dụng"))
	if partner.partner_kind not in {"Customer", "Both"}:
		frappe.throw(_("Đối tác này hiện chỉ là nhà cung cấp; cần thêm vai trò khách hàng trước khi bán"))
	group = partner.customer_group or partner.partner_group
	group_doc = frappe.db.get_value("Alumdoor Partner Group", group, ["name", "group_name", "default_price_list", "enabled"], as_dict=True) if group else None
	if not group_doc or not group_doc.enabled:
		frappe.throw(_("Khách hàng chưa có nhóm bán hàng Đại lý/Khách lẻ hợp lệ"))
	price_list = partner.default_price_list or group_doc.default_price_list
	if not price_list:
		frappe.throw(_("Nhóm khách hàng {0} chưa có bảng giá mặc định").format(group_doc.group_name))
	return {
		"customer": partner.name, "customer_name": partner.partner_name,
		"customer_group": group_doc.name, "customer_group_name": group_doc.group_name,
		"price_list": price_list, "phone": partner.phone,
		"contact_person": partner.primary_contact, "assigned_employee": partner.assigned_employee,
	}


@frappe.whitelist(methods=["GET", "POST"])
def get_customer_context(customer: str) -> dict[str, Any]:
	return customer_context(customer)


_VARIANT_LABELS = {
	"STANDARD": "Tiêu chuẩn",
	"TANG_RAY": "Tặng ray",
	"CHI_LA": "Chỉ lá (không tặng ray)",
	"TRON_BO": "Trọn bộ",
	"TACH_MON": "Tách món",
	"KEO_TAY": "Kéo tay",
	"MOTOR_NGOAI": "Mô tơ ngoài",
}


def _ascii_upper(value: Any) -> str:
	raw = str(value or "").replace("Đ", "D").replace("đ", "d").replace("²", "2")
	return unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii").upper()


def _item_mode(item_code: str) -> tuple[str, str]:
	"""Return the commercial mode encoded in a legacy SKU and its comparable family key."""
	code = _ascii_upper(item_code)
	patterns = (
		("TRON_BO", r"TRON[_ -]?BO"),
		("TACH_MON", r"TACH[_ -]?MON"),
		("TACH_MON", r"(?<![A-Z0-9])TM(?![A-Z0-9])"),
		("MOTOR_NGOAI", r"(?<![A-Z0-9])MTN(?![A-Z0-9])"),
		("KEO_TAY", r"(?<![A-Z0-9])KT(?![A-Z0-9])"),
	)
	for mode, pattern in patterns:
		if re.search(pattern, code):
			family = re.sub(pattern, "{MODE}", code)
			return mode, re.sub(r"[\s_-]+", "-", family).strip("-")
	return "", re.sub(r"[\s_-]+", "-", code).strip("-")


def _sales_options(item: dict[str, Any]) -> list[dict[str, Any]]:
	item_code = str(item.get("name") or "")
	mode, family = _item_mode(item_code)
	if flt(item.get("rate_with_rail")) > 0:
		return [
			{"price_variant": "CHI_LA", "label": _VARIANT_LABELS["CHI_LA"], "target_item": item_code, "rate": flt(item.get("standard_selling_rate"))},
			{"price_variant": "TANG_RAY", "label": _VARIANT_LABELS["TANG_RAY"], "target_item": item_code, "rate": flt(item.get("rate_with_rail")), "minimum_area_sqm": 8},
		]

	if mode:
		siblings = frappe.get_all(
			"Alumdoor Item",
			filters={"item_group": item.get("item_group"), "is_sales_item": 1, "disabled": 0},
			fields=["name", "item_name"],
			limit_page_length=500,
		)
		options: list[dict[str, Any]] = []
		for sibling in siblings:
			sibling_mode, sibling_family = _item_mode(sibling.name)
			if sibling_mode and sibling_family == family:
				options.append({"price_variant": sibling_mode, "label": _VARIANT_LABELS[sibling_mode], "target_item": sibling.name, "item_name": sibling.item_name})
		if options:
			order = {"KEO_TAY": 1, "MOTOR_NGOAI": 2, "TRON_BO": 3, "TACH_MON": 4}
			return sorted({row["price_variant"]: row for row in options}.values(), key=lambda row: order.get(row["price_variant"], 99))
		return [{"price_variant": mode, "label": _VARIANT_LABELS[mode], "target_item": item_code}]

	return [{"price_variant": "STANDARD", "label": _VARIANT_LABELS["STANDARD"], "target_item": item_code}]


def _item_sales_context(item: dict[str, Any], customer_group: str | None = None) -> dict[str, Any]:
	allowed_rows = get_allowed_colors(item["name"])
	ray_color_rows = frappe.get_all(
		"Alumdoor Color",
		filters={"enabled": 1, "applies_to_accessories": 1},
		fields=["name", "color_name"],
		order_by="sort_order asc, color_name asc",
		limit_page_length=500,
	)
	options = _sales_options(item)
	current_option = next((row for row in options if row["target_item"] == item["name"]), options[0])
	encoded_mode, _ = _item_mode(item["name"])
	gift_pair = any(row["price_variant"] == "TANG_RAY" for row in options) and any(row["price_variant"] == "CHI_LA" for row in options)
	group = _ascii_upper(item.get("item_group"))
	logic = _ascii_upper(item.get("logic_group"))
	uom = _ascii_upper(item.get("stock_uom"))
	customer_kind = _ascii_upper(customer_group)
	is_door = uom == "M2" and (str(item.get("item_type")) == "Finished Product" or group.startswith("CUA-"))
	is_german_door = group == "CUA-CN-DUC" or "CUA CN DUC" in logic or "CUA DUC" in logic
	is_split = current_option["price_variant"] == "TACH_MON"
	visible = {"item", "qty", "uom", "priced_qty", "rate", "net_amount"}
	required = {"item", "qty"}
	read_only = {"uom", "priced_qty", "rate", "net_amount"}
	labels = {
		"width_pb_ray_m": "Rộng PB ray",
		"width_pb_nhua_m": "Rộng PB nhựa",
		"height_m": "Cao PB",
		"mesh_height_m": "Cao lưới",
		"cut_width_m": "Rộng cắt lá",
		"length_m": "Dài một cây/đoạn",
		"price_variant": "Cách bán",
	}
	if allowed_rows:
		visible.add("color")
	if len(options) > 1 and not encoded_mode and not gift_pair:
		visible.add("price_variant")
	if is_door:
		visible.add("height_m")
		required.add("height_m")
		if is_split:
			visible.add("cut_width_m")
			required.add("cut_width_m")
		elif is_german_door:
			if "DAI LY" in customer_kind:
				visible.add("width_pb_nhua_m")
				required.add("width_pb_nhua_m")
			else:
				visible.add("width_pb_ray_m")
				required.add("width_pb_ray_m")
		else:
			visible.add("width_pb_ray_m")
			required.add("width_pb_ray_m")
		if "LUOI" in logic or group == "CUA-LUOI":
			visible.add("mesh_height_m")
			required.add("mesh_height_m")
		if "DAI LOAN" in logic or "SIEU TRUONG" in logic or group in {"CUA-DAI-LOAN", "CUA-SIEU-TRUONG"}:
			visible.add("has_butterfly_bracket")
		if current_option["price_variant"] == "TRON_BO":
			visible.update({"ray_painted", "ray_color"})
	elif uom in {"M", "MET"}:
		visible.add("length_m")
		required.add("length_m")

	return {
		"item": item["name"],
		"item_name": item.get("item_name"),
		"item_group": item.get("item_group"),
		"uom": item.get("stock_uom"),
		"visible_fields": sorted(visible),
		"required_fields": sorted(required),
		"read_only_fields": sorted(read_only),
		"field_labels": labels,
		"sales_options": options,
		"selected_price_variant": current_option["price_variant"],
		"default_discount_percentage": flt(frappe.db.get_value("Alumdoor Item Group", item.get("item_group"), "default_discount_percentage")),
		"allowed_colors": [row["name"] for row in allowed_rows],
		"color_labels": {row["name"]: row["color_name"] for row in allowed_rows},
		"ray_colors": [row["name"] for row in ray_color_rows],
		"ray_color_labels": {row["name"]: row["color_name"] for row in ray_color_rows},
	}


@frappe.whitelist(methods=["GET", "POST"])
def get_item_sales_context(item_code: str, customer_group: str | None = None) -> dict[str, Any]:
	item = frappe.db.get_value(
		"Alumdoor Item",
		item_code,
		["name", "item_name", "item_group", "stock_uom", "item_type", "logic_group", "standard_selling_rate", "rate_with_rail", "includes_free_rail", "disabled", "is_sales_item"],
		as_dict=True,
	)
	if not item or item.disabled or not item.is_sales_item:
		frappe.throw(_("Mặt hàng {0} không phải mặt hàng bán đang sử dụng").format(item_code))
	return _item_sales_context(item, customer_group)


def _priced_qty(price_basis: str, line: dict[str, Any]) -> float:
	quantity = max(flt(line.get("qty") or line.get("set_count") or line.get("qty_bar") or 1), 0)
	# Nguồn rộng do metadata của đúng mã hàng/nhóm khách quyết định. Không được lấy một
	# cột rộng khác làm fallback: Đức đại lý dùng PB nhựa, khách lẻ dùng PB ray, còn
	# tách món dùng rộng cắt lá. Lấy nhầm vẫn ra một con số "đẹp" nhưng sai tiền.
	width_field = str(line.get("_pricing_width_field") or "")
	width = flt(line.get(width_field)) if width_field in {"width_pb_nhua_m", "width_pb_ray_m", "cut_width_m"} else 0
	if price_basis == "Per Area":
		return width * flt(line.get("height_m")) * quantity
	if price_basis == "Per Meter":
		return flt(line.get("length_m")) * quantity
	if price_basis == "Per Set":
		return quantity
	return quantity


def _fallback_basis(uom: str, item_group: str) -> str:
	code = str(uom or "").upper().replace("²", "2")
	if code == "M2" or item_group.startswith("CUA-"):
		return "Per Area"
	if code in {"M", "MET", "MÉT"}:
		return "Per Meter"
	if code in {"BO", "BỘ", "SET"}:
		return "Per Set"
	return "Per Qty"


def _price_for_item(item: dict[str, Any], price_list: str, line: dict[str, Any], posting_date: str) -> dict[str, Any]:
	variant = str(line.get("price_variant") or "STANDARD")
	rows = frappe.get_all(
		"Alumdoor Item Price", filters={"enabled": 1, "price_list": price_list, "item": item.name, "price_variant": variant},
		fields=["name", "uom", "price_basis", "rate", "min_qty", "valid_from", "valid_to"],
		order_by="min_qty desc, modified desc", limit_page_length=100,
	)
	date = getdate(posting_date)
	for row in rows:
		if row.valid_from and getdate(row.valid_from) > date:
			continue
		if row.valid_to and getdate(row.valid_to) < date:
			continue
		qty = _priced_qty(row.price_basis, line)
		if qty >= flt(row.min_qty):
			return {"source": row.name, "uom": row.uom, "price_basis": row.price_basis, "rate": flt(row.rate), "priced_qty": qty}
	frappe.throw(
		_("Chưa có giá {0} cho mã {1} trong bảng {2} vào ngày đơn").format(
			_VARIANT_LABELS.get(variant, variant), item.name, price_list
		)
	)


_CALCULATED_CONFIGURATION_FIELDS = {
	"width", "height", "quantity", "area", "unit_area", "leaf_count", "rail_length_m",
	"mesh_area", "mesh_full_charge_area", "pricing_basis", "sales_package", "door_type", "door_system",
}


def _configuration_attributes_from_rule(rule) -> dict[str, Any]:
	"""Reverse only declarative equality conditions from the Item's matching component rule."""
	attributes: dict[str, Any] = {}
	for condition in rule.conditions:
		field = str(condition.condition_field or "").strip()
		if condition.operator != "=" or field.lower() in _CALCULATED_CONFIGURATION_FIELDS:
			continue
		value: Any = condition.condition_value
		try:
			value = json.loads(value)
		except (TypeError, ValueError):
			pass
		attributes[field] = value
	return attributes


def _resolve_component_snapshot(item_code: str, values: dict[str, Any]) -> dict[str, Any] | None:
	"""Resolve the canonical Sales Package behind a sale Item without hard-coding door families."""
	width_field = str(values.get("_pricing_width_field") or "")
	width = flt(values.get(width_field)) if width_field in {"width_pb_nhua_m", "width_pb_ray_m", "cut_width_m"} else 0
	height = flt(values.get("height_m"))
	quantity = max(flt(values.get("qty") or values.get("set_count") or 1), 0)
	if width <= 0 or height <= 0 or quantity <= 0:
		return None
	# Mặt hàng bán là thành phần cha (DOOR_PANEL/PRODUCT...) của Sales Package. Component Rule
	# chỉ quyết định các cấu kiện con như ray, lá đáy, ron; tìm `result_item == item_code` sẽ
	# không bao giờ thấy gói của TP-ALD-548N vì result_item của các rule là mã RAY. Đây là lý do
	# màn bán trước đây luôn trả `components: []` dù gói đã có đủ cấu kiện.
	package_names = frappe.get_all(
		"Sales Package Component",
		filters={"item": item_code, "parenttype": "Sales Package"},
		order_by="parent asc",
		pluck="parent",
	)
	if not package_names:
		return None
	errors: list[str] = []
	for package_name in dict.fromkeys(package_names):
		package = frappe.get_doc("Sales Package", package_name)
		if not package.enabled:
			continue
		attributes: dict[str, Any] = {}
		if values.get("color"):
			attributes.setdefault("COLOR", values.get("color"))
		if values.get("ray_color"):
			attributes.setdefault("RAY_COLOR", values.get("ray_color"))
		attributes.setdefault("RAY_PAINTED", 1 if values.get("ray_painted") else 0)
		attributes.setdefault("HAS_BUTTERFLY_BRACKET", 1 if values.get("has_butterfly_bracket") else 0)
		try:
			resolved = resolve_configuration(
				package_name,
				width * 1000,
				height * 1000,
				quantity,
				attributes,
				False,
			)
		except Exception as exc:  # keep commercial preview usable; saving handles the error below
			errors.append(str(exc))
			continue
		components = resolved.get("components") or []
		if not any(str(component.get("item") or "") == item_code for component in components):
			continue
		item_names = {
			row.name: row.item_name
			for row in frappe.get_all(
				"Alumdoor Item",
				filters={"name": ["in", [component.get("item") for component in components if component.get("item")]]},
				fields=["name", "item_name"],
				limit_page_length=500,
			)
		}
		for component in components:
			component["item_name"] = item_names.get(component.get("item"), component.get("item"))
		return {
			"sales_package": resolved.get("sales_package"),
			"formula": resolved.get("formula"),
			"calculated_variables": resolved.get("calculated_variables") or {},
			"components": components,
			"total": flt(resolved.get("total")),
		}
	return {"component_error": errors[0] if errors else _("Không resolve được cấu kiện từ gói bán hàng")}


def _preview_line(values: dict[str, Any], price_list: str, posting_date: str, require_color: bool = False, require_components: bool = False, customer_group: str | None = None) -> dict[str, Any]:
	values = dict(values)
	item_code = str(values.get("item") or "").strip()
	item = frappe.db.get_value(
		"Alumdoor Item", item_code,
		["name", "item_name", "item_group", "stock_uom", "item_type", "logic_group", "standard_selling_rate", "rate_with_rail", "includes_free_rail", "disabled", "is_sales_item"], as_dict=True,
	)
	if not item or item.disabled or not item.is_sales_item:
		frappe.throw(_("Mặt hàng {0} không phải mặt hàng bán đang sử dụng").format(item_code))
	sales_context = _item_sales_context(item, customer_group)
	# `required_fields` là hợp đồng nguồn đo của từng loại cửa. Chỉ một trong các cột
	# rộng được quyền nuôi Khối lượng; các cột còn lại dù client gửi lên cũng bị bỏ qua.
	pricing_width_field = next(
		(
			field
			for field in ("cut_width_m", "width_pb_nhua_m", "width_pb_ray_m")
			if field in set(sales_context.get("required_fields") or [])
		),
		None,
	)
	values["_pricing_width_field"] = pricing_width_field
	options = sales_context["sales_options"]
	current_options = [row for row in options if row["target_item"] == item_code]
	requested_variant = str(values.get("price_variant") or "").strip()
	gift_option = next((row for row in current_options if row["price_variant"] == "TANG_RAY"), None)
	leaf_option = next((row for row in current_options if row["price_variant"] == "CHI_LA"), None)
	if gift_option and leaf_option:
		area_for_variant = flt(values.get(pricing_width_field)) * flt(values.get("height_m")) * max(flt(values.get("qty") or values.get("set_count") or 1), 0)
		requested_variant = "TANG_RAY" if area_for_variant >= flt(gift_option.get("minimum_area_sqm")) else "CHI_LA"
	elif not requested_variant or requested_variant == "STANDARD":
		requested_variant = str(sales_context["selected_price_variant"])
	if not any(row["price_variant"] == requested_variant for row in current_options):
		frappe.throw(_("Cách bán {0} không áp dụng cho mã mặt hàng {1}").format(_VARIANT_LABELS.get(requested_variant, requested_variant), item_code))
	values["price_variant"] = requested_variant
	if requested_variant != "TRON_BO":
		values["ray_painted"] = 0
		values["ray_color"] = None
	if require_components:
		for required_field in sales_context.get("required_fields") or []:
			if required_field in {"item", "color", "has_butterfly_bracket", "ray_painted"}:
				continue
			if flt(values.get(required_field)) <= 0:
				label = sales_context.get("field_labels", {}).get(required_field) or required_field
				frappe.throw(_("Thiếu {0} để tính Khối lượng cho {1}").format(label, item_code))
	allowed_rows = get_allowed_colors(item_code)
	allowed = [row["name"] for row in allowed_rows]
	color = str(values.get("color") or "").strip()
	if color and color not in allowed:
		validate_item_color(item_code, color)
	if require_color and allowed and not color:
		validate_item_color(item_code, color)

	price = _price_for_item(item, price_list, values, posting_date)
	amount = flt(price["priced_qty"]) * flt(price["rate"])
	requested_discount = values.get("discount_percentage")
	if requested_discount in (None, ""):
		requested_discount = sales_context.get("default_discount_percentage")
	discount_percentage = min(max(flt(requested_discount), 0), 100)
	discount_amount = amount * discount_percentage / 100
	component_snapshot = _resolve_component_snapshot(item_code, values)
	adjustment_rows = (component_snapshot or {}).get("components") or []
	automatic_adjustment = sum(
		flt(component.get("amount"))
		for component in adjustment_rows
		if int(component.get("sequence") or 0) >= 1000
		or str(component.get("component_role") or "").startswith(("SURCHARGE_", "DISCOUNT_"))
	)
	adjustment_amount = flt(automatic_adjustment if component_snapshot and not component_snapshot.get("component_error") else values.get("adjustment_amount"))
	net_amount = amount - discount_amount + adjustment_amount
	quantity = max(flt(values.get("qty") or values.get("set_count") or values.get("qty_bar") or 1), 0)
	area_width = values.get(pricing_width_field) if pricing_width_field else None
	area = flt(area_width) * flt(values.get("height_m")) * quantity
	if require_components and component_snapshot and component_snapshot.get("component_error"):
		frappe.throw(_("Không tính được cấu kiện cho {0}: {1}").format(item_code, component_snapshot["component_error"]))
	# Trường điều khiển nội bộ không thuộc DocType và không được trả về client/snapshot.
	values.pop("_pricing_width_field", None)
	return {
		**values, "item": item.name, "item_name": item.item_name, "color": color or None,
		"uom": price["uom"] or item.stock_uom, "qty": quantity or 1, "set_count": quantity or 1,
		"priced_qty": price["priced_qty"], "price_basis": price["price_basis"], "rate": price["rate"], "amount": amount,
		"discount_percentage": discount_percentage, "discount_amount": discount_amount,
		"adjustment_amount": adjustment_amount, "net_amount": net_amount, "area": area,
		"allowed_colors": allowed, "color_labels": {row["name"]: row["color_name"] for row in allowed_rows},
		"sales_context": sales_context,
		"sales_package": (component_snapshot or {}).get("sales_package"),
		"components": (component_snapshot or {}).get("components", []),
		"component_error": (component_snapshot or {}).get("component_error"),
		"component_snapshot_json": json.dumps(component_snapshot or {}, ensure_ascii=False),
		"pricing_snapshot_json": json.dumps({"price_source": price["source"], "price_list": price_list, "posting_date": posting_date}, ensure_ascii=False),
	}


@frappe.whitelist(methods=["POST"])
def preview_quotation_line(data=None, price_list: str | None = None, quotation_date: str | None = None, customer_group: str | None = None) -> dict[str, Any]:
	values = _payload(data)
	if not price_list:
		frappe.throw(_("Chưa xác định được bảng giá từ khách hàng"))
	return _preview_line(values, price_list, quotation_date or nowdate(), customer_group=customer_group)


@frappe.whitelist(methods=["POST"])
def save_quotation(data=None, name: str | None = None, modified: str | None = None) -> dict[str, Any]:
	values = _payload(data)
	lines = values.get("items") or []
	if not isinstance(lines, list) or not lines:
		frappe.throw(_("Đơn hàng phải có ít nhất một dòng hàng"))
	context = customer_context(str(values.get("customer") or ""))
	if name:
		doc = frappe.get_doc("Alumdoor Quotation", name)
		if modified and str(doc.modified) != str(modified):
			frappe.throw(_("Đơn hàng đã được người khác cập nhật. Hãy tải lại trước khi lưu."), frappe.TimestampMismatchError)
		if doc.status != "Draft":
			frappe.throw(_("Chỉ đơn hàng nháp mới được sửa"))
	else:
		doc = frappe.new_doc("Alumdoor Quotation")
	posting_date = values.get("quotation_date") or nowdate()
	doc.update({
		"customer": context["customer"], "customer_group": context["customer_group"], "price_list": context["price_list"],
		"quotation_date": posting_date, "delivery_date": values.get("delivery_date"),
		"contact_person": values.get("contact_person") or context.get("contact_person"), "phone": values.get("phone") or context.get("phone"),
		"assigned_employee": values.get("assigned_employee") or context.get("assigned_employee"),
		"payment_method": values.get("payment_method") or "Công nợ", "money_account": values.get("money_account"),
		"vat_percent": flt(values.get("vat_percent")), "install_address": values.get("install_address"),
		"shipping_note": values.get("shipping_note"), "notes": values.get("notes"),
		"deposit_amount": flt(values.get("deposit_amount")), "currency": "VND", "status": "Draft",
	})
	doc.set("items", [])
	for index, line in enumerate(lines, 1):
		if not isinstance(line, dict):
			frappe.throw(_("Dòng đơn hàng {0} không hợp lệ").format(index))
		preview = _preview_line(line, context["price_list"], posting_date, require_color=True, require_components=True, customer_group=context["customer_group_name"])
		for transient in ("allowed_colors", "color_labels", "sales_context", "area", "components", "component_error"):
			preview.pop(transient, None)
		doc.append("items", preview)
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return {"name": doc.name, "doc": doc.as_dict()}


@frappe.whitelist(methods=["POST"])
def set_quotation_status(name: str, status: str) -> dict[str, Any]:
	if status not in {"Draft", "Sent", "Accepted", "Rejected", "Cancelled"}:
		frappe.throw(_("Trạng thái đơn hàng không hợp lệ"))
	doc = frappe.get_doc("Alumdoor Quotation", name)
	allowed = {"Draft": {"Sent", "Cancelled"}, "Sent": {"Accepted", "Rejected", "Cancelled"}, "Accepted": set(), "Rejected": {"Draft"}, "Cancelled": set()}
	if status not in allowed.get(doc.status, set()):
		frappe.throw(_("Không thể chuyển đơn hàng từ {0} sang {1}").format(doc.status, status))
	doc.status = status
	doc.save()
	return {"name": doc.name, "status": doc.status, "modified": doc.modified}
