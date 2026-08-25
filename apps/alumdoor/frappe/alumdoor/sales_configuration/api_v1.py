from __future__ import annotations

import frappe

from alumdoor.sales_configuration.services.sales_order_service import (
	approve_order as _approve_order,
	calculate_order as _calculate_order,
	cancel_order as _cancel_order,
	get_customer_context as _get_customer_context,
	get_item_sales_context as _get_item_sales_context,
	reject_order as _reject_order,
	save_order as _save_order,
	submit_order as _submit_order,
)


@frappe.whitelist(methods=["GET", "POST"])
def get_customer_context(customer: str):
	return _get_customer_context(customer)


@frappe.whitelist(methods=["GET", "POST"])
def get_item_sales_context(item_code: str, customer_group: str | None = None):
	return _get_item_sales_context(item_code, customer_group)


@frappe.whitelist(methods=["POST"])
def calculate_order(data=None):
	return _calculate_order(data)


@frappe.whitelist(methods=["POST"])
def save_order(data=None, name=None, modified=None, idempotency_key=None):
	return _save_order(data, name=name, modified=modified, idempotency_key=idempotency_key)


@frappe.whitelist(methods=["POST"])
def submit_order(name: str, expected_modified: str | None = None, idempotency_key: str | None = None):
	return _submit_order(name, expected_modified=expected_modified, idempotency_key=idempotency_key)


@frappe.whitelist(methods=["POST"])
def approve_order(name: str, note: str | None = None, expected_modified: str | None = None, idempotency_key: str | None = None):
	return _approve_order(name, note, expected_modified=expected_modified, idempotency_key=idempotency_key)


@frappe.whitelist(methods=["POST"])
def reject_order(name: str, reason: str, expected_modified: str | None = None, idempotency_key: str | None = None):
	return _reject_order(name, reason, expected_modified=expected_modified, idempotency_key=idempotency_key)


@frappe.whitelist(methods=["POST"])
def cancel_order(name: str, reason: str, expected_modified: str | None = None, idempotency_key: str | None = None):
	return _cancel_order(name, reason, expected_modified=expected_modified, idempotency_key=idempotency_key)
