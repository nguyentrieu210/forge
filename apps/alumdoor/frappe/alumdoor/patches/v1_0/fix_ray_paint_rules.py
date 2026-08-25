from __future__ import annotations

import frappe


def execute():
	if frappe.db.exists("Alumdoor Color", "VAN_GO"):
		frappe.db.set_value("Alumdoor Color", "VAN_GO", "applies_to_accessories", 1)

	conditions = {
		"SUR-RAIL-WOOD-GRAIN-55": 'ray_painted and ray_color == "VAN_GO" and (rail_type == "U76_BOX" or rail_type == "U100_STEEL" or rail_type == "U76_SINGLE" or rail_type == "U70_STEEL")',
		"SUR-RAIL-OTHER-COLOR-15": 'ray_painted and ray_color != "" and ray_color != "VAN_GO" and ray_color != "VK" and ray_color != "GS" and (rail_type == "U76_BOX" or rail_type == "U100_STEEL" or rail_type == "U76_SINGLE" or rail_type == "U70_STEEL")',
	}
	for rule_name, condition in conditions.items():
		if frappe.db.exists("Alumdoor Pricing Rule", rule_name):
			frappe.db.set_value("Alumdoor Pricing Rule", rule_name, "condition_expression", condition)
