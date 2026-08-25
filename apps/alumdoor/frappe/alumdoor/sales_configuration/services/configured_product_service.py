from __future__ import annotations

import json
import unicodedata
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

from alumdoor.sales_configuration.services.component_engine import resolve_components
from alumdoor.sales_configuration.services.formula_engine import evaluate_door_formula
from alumdoor.sales_configuration.services.pricing_engine import calculate_pricing


@frappe.whitelist()
def resolve_configuration(
	sales_package: str,
	width: float,
	height: float,
	quantity: float = 1,
	attributes: dict[str, Any] | str | None = None,
	save: bool | int | str = False,
) -> dict[str, Any]:
	"""Resolve a configured product. Width and height are expressed in millimetres."""
	if not frappe.db.exists("Sales Package", sales_package):
		frappe.throw(_("Sales Package {0} does not exist").format(sales_package), frappe.DoesNotExistError)
	if not frappe.has_permission("Sales Package", "read", doc=sales_package):
		frappe.throw(_("You are not permitted to read this Sales Package"), frappe.PermissionError)
	if _as_bool(save) and not frappe.has_permission("Configured Product", "create"):
		frappe.throw(_("You are not permitted to create a Configured Product"), frappe.PermissionError)

	width = flt(width)
	height = flt(height)
	quantity = flt(quantity)
	if width <= 0 or height <= 0 or quantity <= 0:
		frappe.throw(_("Width, height and quantity must be greater than zero"))

	package = frappe.get_doc("Sales Package", sales_package)
	if not package.enabled:
		frappe.throw(_("Sales Package {0} is disabled").format(sales_package))
	today = getdate(nowdate())
	if package.effective_from and getdate(package.effective_from) > today:
		frappe.throw(_("Sales Package {0} is not effective yet").format(sales_package))
	if package.effective_to and getdate(package.effective_to) < today:
		frappe.throw(_("Sales Package {0} has expired").format(sales_package))

	attributes = _parse_attributes(attributes)
	attributes = _validate_package_attributes(package, attributes)
	attributes = _normalize_pricing_attributes(attributes)
	context: dict[str, Any] = {
		"width": width,
		"height": height,
		"quantity": quantity,
		"unit_area": width / 1000 * height / 1000,
		"leaf_count": flt(attributes.get("leaf_count") or 0),
		"sales_package": package.name,
		"door_type": package.door_type,
		"door_system": package.door_system,
	}
	for key, value in attributes.items():
		context[key] = value
		context[key.lower()] = value
	context.setdefault("color", "")
	context.setdefault("ray_color", "")
	context.setdefault("ray_painted", 0)
	context.setdefault("rail_type", "")
	context.setdefault("v4_v5_finish", "")
	context.setdefault("v4_v5_length_m", 0.0)

	context = evaluate_door_formula(package.default_formula, context)
	context.setdefault("area", width / 1000 * height / 1000 * quantity)
	if not flt(context.get("v4_v5_length_m")) and context.get("v4_length_m") is not None:
		context["v4_v5_length_m"] = flt(context["v4_length_m"])
	context["pricing_basis"] = (
		"SET" if package.door_system == "CUON-TAM-LIEN-UC" and flt(context["area"]) < 4 else "AREA"
	)
	components = resolve_components(package, context)
	currency = package.currency or "VND"
	components, total = calculate_pricing(package.name, components, context, currency)

	result = {
		"sales_package": package.name,
		"door_type": package.door_type,
		"door_system": package.door_system,
		"formula": package.default_formula,
		"inputs": {"width": width, "height": height, "quantity": quantity, "attributes": attributes},
		"calculated_variables": context,
		"components": components,
		"currency": currency,
		"total": total,
	}
	if _as_bool(save):
		result["configured_product"] = _create_snapshot(result)
	return result


def _create_snapshot(result: dict[str, Any]) -> str:
	doc = frappe.new_doc("Configured Product")
	doc.update(
		{
			"sales_package": result["sales_package"],
			"door_type": result["door_type"],
			"door_system": result["door_system"],
			"width": result["inputs"]["width"],
			"height": result["inputs"]["height"],
			"quantity": result["inputs"]["quantity"],
			"area": result["calculated_variables"]["area"],
			"formula": result["formula"],
			"configuration_json": frappe.as_json(result["inputs"]["attributes"]),
			"calculated_variables_json": frappe.as_json(result["calculated_variables"]),
			"calculated_total": result["total"],
			"currency": result["currency"],
			"status": "Resolved",
		}
	)
	for attribute, value in result["inputs"]["attributes"].items():
		if frappe.db.exists("Configuration Attribute", attribute):
			doc.append("attributes", {"attribute": attribute, "value": str(value)})
	for component in result["components"]:
		doc.append(
			"components",
			{
				"component_role": component["component_role"],
				"item": component["item"],
				"qty": component["qty"],
				"uom": component["uom"],
				"measure_qty": component.get("measure_qty"),
				"measure_uom": component.get("measure_uom"),
				"rate": component["rate"],
				"amount": component["amount"],
				"source_rule": component["source_rule"],
				"pricing_rule": component["pricing_rule"],
			},
		)
	doc.insert()
	return doc.name


def _parse_attributes(value: dict[str, Any] | str | None) -> dict[str, Any]:
	if not value:
		return {}
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except ValueError as exc:
			raise frappe.ValidationError(_("Attributes must be valid JSON")) from exc
	if not isinstance(value, dict):
		raise frappe.ValidationError(_("Attributes must be an object"))
	return value


def _validate_package_attributes(package, attributes: dict[str, Any]) -> dict[str, Any]:
	attributes = dict(attributes)
	for row in package.attributes:
		attribute = frappe.get_doc("Configuration Attribute", row.attribute)
		if row.attribute not in attributes and row.default_value not in (None, ""):
			attributes[row.attribute] = row.default_value
		value = attributes.get(row.attribute)
		if value not in (None, "", []) and attribute.data_type == "Check":
			value = 1 if _as_bool(value) else 0
			attributes[row.attribute] = value
		if value not in (None, "", []) and attribute.data_type == "Number":
			value = flt(value)
			attributes[row.attribute] = value
		if (row.required or attribute.required) and value in (None, "", []):
			frappe.throw(_("Configuration attribute {0} is required").format(attribute.attribute_name))
		if value not in (None, "", []) and attribute.data_type == "Select" and attribute.values:
			allowed_values = {entry.value for entry in attribute.values if entry.enabled}
			if allowed_values and value not in allowed_values:
				frappe.throw(
					_("Invalid value {0} for configuration attribute {1}").format(
						value, attribute.attribute_name
					)
				)
		if value not in (None, "", []) and attribute.data_type == "Link":
			if not frappe.db.exists(attribute.link_doctype, value):
				frappe.throw(
					_("Value {0} does not exist in {1}").format(value, attribute.link_doctype)
				)
	return attributes


def _as_bool(value: Any) -> bool:
	return str(value).lower() in {"1", "true", "yes"}


def _normalize_pricing_attributes(attributes: dict[str, Any]) -> dict[str, Any]:
	result = dict(attributes)
	for attribute_name in ("COLOR", "RAY_COLOR"):
		color_key = next((key for key in result if key.upper() == attribute_name), None)
		if color_key and isinstance(result[color_key], str):
			color = unicodedata.normalize("NFD", result[color_key])
			color = "".join(char for char in color if unicodedata.category(char) != "Mn")
			color = color.upper().strip().replace("-", "_").replace(" ", "_")
			aliases = {
				"VAN_GO": "VAN_GO",
				"WOOD_GRAIN": "VAN_GO",
				"VANG_KEM": "VK",
				"VK": "VK",
				"GHI_SAN": "GS",
				"GS": "GS",
			}
			result[color_key] = aliases.get(color, color)
	length_key = next((key for key in result if key.upper() == "V4_V5_LENGTH_M"), None)
	if length_key:
		result[length_key] = flt(result[length_key])
	return result
