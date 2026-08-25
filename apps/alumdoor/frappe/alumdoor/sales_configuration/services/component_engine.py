from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt

from alumdoor.sales_configuration.services.formula_engine import safe_eval


def resolve_components(package_doc, context: Mapping[str, Any]) -> list[dict[str, Any]]:
	components: dict[str, dict[str, Any]] = {}
	for row in sorted(package_doc.components, key=lambda item: (item.sequence or 0, item.idx)):
		role = _normalize_role(row.component_role)
		if role in components:
			frappe.throw(_("Duplicate component role in Sales Package: {0}").format(role))
		qty = safe_eval(row.qty_formula, context) if row.qty_formula else row.qty
		measure_qty = safe_eval(row.measure_formula, context) if row.measure_formula else None
		components[role] = {
			"component_role": role,
			"item": row.item,
			"item_group": row.item_group,
			"qty": flt(qty),
			"uom": row.uom,
			"measure_qty": flt(measure_qty) if measure_qty is not None else None,
			"measure_uom": row.measure_uom,
			"optional": bool(row.optional),
			"sequence": row.sequence or row.idx,
			"notes": row.notes,
			"source_rule": None,
		}

	rule_names = frappe.get_all(
		"Component Rule",
		filters={"sales_package": package_doc.name, "enabled": 1},
		order_by="priority desc, modified desc",
		pluck="name",
	)
	resolved_roles: set[str] = set()
	for rule_name in rule_names:
		rule = frappe.get_doc("Component Rule", rule_name)
		role = _normalize_role(rule.component_role)
		if role in resolved_roles or not _conditions_match(rule.conditions, context):
			continue
		component = components.setdefault(
			role,
			{
				"component_role": role,
				"item": None,
				"item_group": None,
				"qty": 0,
				"uom": None,
				"measure_qty": None,
				"measure_uom": None,
				"optional": False,
				"sequence": 999,
				"notes": None,
				"source_rule": None,
			},
		)
		if rule.result_item:
			component["item"] = rule.result_item
		if rule.qty_formula:
			component["qty"] = flt(safe_eval(rule.qty_formula, context))
		elif rule.result_qty is not None:
			component["qty"] = flt(rule.result_qty)
		if rule.result_uom:
			component["uom"] = rule.result_uom
		if rule.measure_formula:
			component["measure_qty"] = flt(safe_eval(rule.measure_formula, context))
		if rule.measure_uom:
			component["measure_uom"] = rule.measure_uom
		component["source_rule"] = rule.name
		resolved_roles.add(role)

	result = sorted(components.values(), key=lambda item: item["sequence"])
	for component in result:
		if not component["optional"] and not component["item"]:
			frappe.throw(
				_("No Item was resolved for required component role {0}").format(component["component_role"])
			)
		if component["qty"] < 0:
			frappe.throw(_("Component quantity cannot be negative"))
		if component.get("measure_qty") is not None and component["measure_qty"] < 0:
			frappe.throw(_("Component measure quantity cannot be negative"))
	return result


def _conditions_match(conditions, context: Mapping[str, Any]) -> bool:
	for condition in sorted(conditions, key=lambda row: (row.sequence or 0, row.idx)):
		actual = context.get(condition.condition_field)
		expected = _parse_value(condition.condition_value)
		operator = condition.operator
		if operator == "=" and actual != expected:
			return False
		if operator == "!=" and actual == expected:
			return False
		if operator == ">" and not (actual is not None and actual > expected):
			return False
		if operator == ">=" and not (actual is not None and actual >= expected):
			return False
		if operator == "<" and not (actual is not None and actual < expected):
			return False
		if operator == "<=" and not (actual is not None and actual <= expected):
			return False
		if operator == "in" and actual not in _as_collection(expected):
			return False
		if operator == "not in" and actual in _as_collection(expected):
			return False
		if operator == "is set" and actual in (None, "", []):
			return False
		if operator == "is not set" and actual not in (None, "", []):
			return False
	return True


def _parse_value(value: Any) -> Any:
	if not isinstance(value, str):
		return value
	text = value.strip()
	if not text:
		return ""
	try:
		return json.loads(text)
	except (TypeError, ValueError):
		return text


def _as_collection(value: Any) -> list[Any]:
	if isinstance(value, (list, tuple, set)):
		return list(value)
	if isinstance(value, str):
		return [part.strip() for part in value.split(",")]
	return [value]


def _normalize_role(value: str) -> str:
	return (value or "").strip().upper().replace(" ", "_")
