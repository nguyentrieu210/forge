from __future__ import annotations

import frappe


def execute():
	if frappe.db.exists("Alumdoor Item Group", "CUA-CN-DUC"):
		frappe.db.set_value("Alumdoor Item Group", "CUA-CN-DUC", "default_discount_percentage", 15)
