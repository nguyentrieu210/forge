from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

from alumdoor.sales_configuration.services.formula_engine import safe_eval


def calculate_pricing(
	sales_package: str,
	components: list[dict[str, Any]],
	context: Mapping[str, Any],
	currency: str,
) -> tuple[list[dict[str, Any]], float]:
	pricing_rules = _get_active_rules(sales_package)
	rules_by_role: dict[str, list[Any]] = {}
	adjustment_rules = []
	for rule in pricing_rules:
		if rule.rule_scope == "Adjustment":
			adjustment_rules.append(rule)
			continue
		rules_by_role.setdefault(rule.component_role.upper(), []).append(rule)

	total = 0.0
	priced_components: list[dict[str, Any]] = []
	for component in components:
		component = dict(component)
		rules = rules_by_role.get(component["component_role"], [])
		rule = next(
			(
				entry
				for entry in rules
				if (not entry.currency or entry.currency == currency) and _condition_matches(entry, context)
			),
			None,
		)
		if not rule:
			component.update({"rate": 0.0, "amount": 0.0, "pricing_rule": None})
			priced_components.append(component)
			continue

		qty = flt(component["qty"])
		measure_qty = flt(component.get("measure_qty")) if component.get("measure_qty") is not None else qty
		rate = flt(rule.rate)
		price_context = {**context, "qty": measure_qty, "production_qty": qty, "rate": rate}
		if rule.price_type == "Fixed":
			amount = rate
		elif rule.price_type == "Per Qty":
			amount = qty * rate
		elif rule.price_type == "Per Meter":
			amount = measure_qty * rate
		elif rule.price_type == "Per Area":
			amount = flt(context.get("area")) * rate
		elif rule.price_type == "Formula":
			amount = flt(safe_eval(rule.formula, price_context))
		elif rule.price_type == "Item Price":
			rate = flt(frappe.db.get_value("Alumdoor Item", component["item"], "standard_selling_rate"))
			amount = measure_qty * rate
		else:
			frappe.throw(_("Unsupported price type: {0}").format(rule.price_type))

		if rule.min_value:
			amount = max(amount, flt(rule.min_value))
		if rule.max_value:
			amount = min(amount, flt(rule.max_value))
		component.update(
			{
				"rate": rate,
				"amount": flt(amount),
				"pricing_rule": rule.name,
			}
		)
		total += flt(amount)
		priced_components.append(component)

	for sequence, rule in enumerate(adjustment_rules, start=1000):
		if (rule.currency and rule.currency != currency) or not _condition_matches(rule, context):
			continue
		quantity = _adjustment_quantity(rule, context)
		if quantity <= 0:
			continue
		rate = flt(rule.rate)
		if rule.price_type == "Item Price":
			rate = flt(frappe.db.get_value("Alumdoor Item", rule.adjustment_item, "standard_selling_rate"))
		price_context = {**context, "qty": quantity, "rate": rate}
		if rule.price_type == "Fixed":
			amount = rate
		elif rule.price_type in ("Per Qty", "Per Meter", "Item Price", "Per Area"):
			amount = quantity * rate
		elif rule.price_type == "Formula":
			amount = flt(safe_eval(rule.formula, price_context))
		else:
			frappe.throw(_("Unsupported price type: {0}").format(rule.price_type))

		if rule.min_value:
			amount = max(amount, flt(rule.min_value))
		if rule.max_value:
			amount = min(amount, flt(rule.max_value))
		if rule.adjustment_type == "Discount":
			amount = -abs(amount)
		amount = flt(amount)
		if not amount:
			continue
		uom = rule.adjustment_uom or frappe.db.get_value("Alumdoor Item", rule.adjustment_item, "stock_uom")
		priced_components.append(
			{
				"component_role": rule.component_role,
				"item": rule.adjustment_item,
				"item_group": None,
				"qty": quantity,
				"uom": uom,
				"optional": False,
				"sequence": sequence,
				"notes": rule.rule_name,
				"source_rule": None,
				"rate": rate,
				"amount": amount,
				"pricing_rule": rule.name,
			}
		)
		total += amount
	return priced_components, flt(total)


def _get_active_rules(sales_package: str) -> list[Any]:
	today = getdate(nowdate())
	names = frappe.get_all(
		"Alumdoor Pricing Rule",
		filters={"enabled": 1},
		order_by="priority desc, modified desc",
		pluck="name",
	)
	result = []
	for name in names:
		rule = frappe.get_doc("Alumdoor Pricing Rule", name)
		if rule.sales_package and rule.sales_package != sales_package:
			continue
		if rule.effective_from and getdate(rule.effective_from) > today:
			continue
		if rule.effective_to and getdate(rule.effective_to) < today:
			continue
		result.append(rule)
	return result


def _condition_matches(rule, context: Mapping[str, Any]) -> bool:
	if not rule.condition_expression:
		return True
	return bool(safe_eval(rule.condition_expression, context))


def _adjustment_quantity(rule, context: Mapping[str, Any]) -> float:
	if rule.quantity_formula:
		return flt(safe_eval(rule.quantity_formula, context))
	if rule.price_type == "Per Area":
		return flt(context.get("area"))
	return 1.0
