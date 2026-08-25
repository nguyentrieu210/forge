from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, getdate, now, nowdate

from alumdoor.sales_configuration.security import can_cancel_order, require_operational, require_owner
from alumdoor.sales_configuration.trust import check_expected_modified, execute_once, record_audit
from alumdoor.sales_configuration.services.quotation_service import (
	_ascii_upper,
	_payload,
	_preview_line,
	customer_context,
	get_item_sales_context as _get_item_sales_context,
)


EDITABLE_STATUSES = {"Draft", "Approved", "Production Requested", "In Production", "Ready to Deliver"}


@contextmanager
def _service_write():
	previous = getattr(frappe.flags, "in_alumdoor_sales_order_service", False)
	frappe.flags.in_alumdoor_sales_order_service = True
	try:
		yield
	finally:
		frappe.flags.in_alumdoor_sales_order_service = previous


def _j(value: Any) -> str:
	return json.dumps(value, ensure_ascii=False, default=str)


def _is_dealer(group_name: str | None) -> bool:
	return "DAI LY" in _ascii_upper(group_name)


def _is_german(item_code: str) -> bool:
	item_group, logic_group = frappe.db.get_value(
		"Alumdoor Item", item_code, ["item_group", "logic_group"]
	) or ("", "")
	text = f"{_ascii_upper(item_group)} {_ascii_upper(logic_group)}"
	return item_group == "CUA-CN-DUC" or "CUA DUC" in text or "CUA CN DUC" in text


def _default_discount(item_code: str, group_name: str | None) -> float:
	if not (_is_dealer(group_name) and _is_german(item_code)):
		return 0
	item_group = frappe.db.get_value("Alumdoor Item", item_code, "item_group")
	configured = flt(frappe.db.get_value("Alumdoor Item Group", item_group, "default_discount_percentage"))
	return configured or 15


def get_customer_context(customer: str) -> dict[str, Any]:
	"""Sales-order bootstrap boundary; the frontend must not call quotation endpoints."""
	require_operational()
	return customer_context(customer)


def get_item_sales_context(item_code: str, customer_group: str | None = None) -> dict[str, Any]:
	"""Return field/color/sales-option metadata through the Sales Order service."""
	require_operational()
	return _get_item_sales_context(item_code, customer_group)


def _effective_price_list(values: dict[str, Any], context: dict[str, Any], posting_date: str) -> str:
	requested = str(values.get("price_list") or context["price_list"] or "").strip()
	row = frappe.db.get_value(
		"Alumdoor Price List",
		requested,
		["name", "price_usage", "valid_from", "valid_to", "enabled"],
		as_dict=True,
	)
	if not row or not row.enabled or row.price_usage != "Selling":
		frappe.throw(_("Bảng giá {0} không phải bảng giá bán đang sử dụng").format(requested))
	date = getdate(posting_date)
	if row.valid_from and getdate(row.valid_from) > date:
		frappe.throw(_("Bảng giá {0} chưa có hiệu lực vào ngày đơn").format(requested))
	if row.valid_to and getdate(row.valid_to) < date:
		frappe.throw(_("Bảng giá {0} đã hết hiệu lực vào ngày đơn").format(requested))
	return str(row.name)


def _transport_amount(components: list[dict[str, Any]]) -> float:
	return sum(
		flt(row.get("amount"))
		for row in components
		if "TRANSPORT" in _ascii_upper(row.get("component_role"))
		or "VAN CHUYEN" in _ascii_upper(row.get("item_name") or row.get("item"))
	)


def calculate_order(data: dict[str, Any] | str | None, *, strict: bool = False) -> dict[str, Any]:
	require_operational()
	values = _payload(data)
	lines = values.get("items") or []
	if not isinstance(lines, list) or not lines:
		frappe.throw(_("Đơn hàng phải có ít nhất một dòng hàng"))
	context = customer_context(str(values.get("customer") or ""))
	posting_date = values.get("order_date") or nowdate()
	price_list = _effective_price_list(values, context, posting_date)
	calculated: list[dict[str, Any]] = []
	approval_reasons: list[str] = []
	order_transport = 0.0
	for index, source in enumerate(lines, 1):
		if not isinstance(source, dict):
			frappe.throw(_("Dòng hàng {0} không hợp lệ").format(index))
		line = dict(source)
		item_code = str(line.get("item") or "").strip()
		default_discount = _default_discount(item_code, context["customer_group_name"])
		if line.get("discount_percentage") in (None, ""):
			line["discount_percentage"] = default_discount
		preview = _preview_line(
			line, price_list, posting_date,
			require_color=strict, require_components=strict,
			customer_group=context["customer_group_name"],
		)
		requested_discount = flt(preview.get("discount_percentage"))
		if abs(requested_discount - default_discount) > 0.0001:
			approval_reasons.append(
				_("Dòng {0}: chiết khấu {1}% khác mức mặc định {2}%").format(index, requested_discount, default_discount)
			)
		components = preview.get("components") or []
		transport = _transport_amount(components)
		order_transport = max(order_transport, transport)
		preview["adjustment_amount"] = flt(preview.get("adjustment_amount")) - transport
		preview["net_amount"] = flt(preview.get("amount")) - flt(preview.get("discount_amount")) + flt(preview["adjustment_amount"])
		preview["line_key"] = str(source.get("line_key") or uuid.uuid4())
		preview["is_manufactured_item"] = int(frappe.db.get_value("Alumdoor Item", preview["item"], "is_manufactured_item") or 0)
		preview["explain_json"] = _j({
			"formula": "Khối lượng × Đơn giá - Chiết khấu + Phụ thu dòng",
			"physical_quantity": preview.get("qty"), "priced_quantity": preview.get("priced_qty"),
			"price_basis": preview.get("price_basis"), "transport_moved_to_order": transport,
		})
		calculated.append(preview)
	if price_list != context["price_list"]:
		approval_reasons.append(_("Bảng giá khác bảng mặc định của khách hàng"))
	subtotal = sum(flt(row.get("amount")) for row in calculated)
	discount_amount = sum(flt(row.get("discount_amount")) for row in calculated)
	line_adjustment = sum(flt(row.get("adjustment_amount")) for row in calculated)
	order_adjustment = order_transport
	before_vat = subtotal - discount_amount + line_adjustment + order_adjustment
	vat_percent = flt(values.get("vat_percent") if values.get("vat_percent") not in (None, "") else 8)
	vat_amount = before_vat * vat_percent / 100
	grand_total = before_vat + vat_amount
	deposit = flt(values.get("deposit_amount"))
	if deposit < 0 or deposit > grand_total:
		frappe.throw(_("Tiền cọc phải từ 0 đến tổng thanh toán"))
	paid = flt(values.get("paid_amount"))
	return {
		"customer_context": {**context, "default_price_list": context["price_list"], "price_list": price_list},
		"price_list": price_list, "items": calculated,
		"currency": "VND", "subtotal": subtotal, "discount_amount": discount_amount,
		"line_adjustment_amount": line_adjustment, "order_adjustment_amount": order_adjustment,
		"vat_percent": vat_percent, "vat_amount": vat_amount, "grand_total": grand_total,
		"deposit_amount": deposit, "paid_amount": paid, "outstanding_amount": max(grand_total - paid - deposit, 0),
		"approval_required": bool(approval_reasons), "approval_reasons": approval_reasons,
	}


def _clean_line(row: dict[str, Any]) -> dict[str, Any]:
	allowed = {field.fieldname for field in frappe.get_meta("Alumdoor Sales Order Item").fields}
	return {key: value for key, value in row.items() if key in allowed}


def _snapshot(doc) -> dict[str, Any]:
	return {key: value for key, value in doc.as_dict().items() if key not in {"modified", "modified_by", "creation", "owner"}}


def _save_order_once(
	data: dict[str, Any] | str | None,
	name: str | None,
	modified: str | None,
	request_id: str,
) -> dict[str, Any]:
	values = _payload(data)
	result = calculate_order(values, strict=True)
	old_snapshot = None
	audit_before = None
	requires_reapproval = False
	revision_reason = str(values.get("revision_reason") or "").strip()
	if name:
		doc = frappe.get_doc("Alumdoor Sales Order", name)
		check_expected_modified(doc, modified)
		audit_before = _snapshot(doc)
		if doc.is_stock_locked:
			frappe.throw(_("Đơn đã xác nhận xuất kho nên bị khóa vĩnh viễn"))
		if doc.status not in EDITABLE_STATUSES:
			frappe.throw(_("Trạng thái hiện tại không cho phép sửa đơn"))
		requires_reapproval = doc.status != "Draft"
		if requires_reapproval and not revision_reason:
			frappe.throw(_("Đơn đã vào vận hành; bắt buộc nhập lý do sửa"))
		if requires_reapproval:
			old_snapshot = _snapshot(doc)
	else:
		doc = frappe.new_doc("Alumdoor Sales Order")
	context = result["customer_context"]
	doc.update({
		"customer": context["customer"], "customer_name_snapshot": context["customer_name"],
		"customer_group": context["customer_group_name"], "price_list": result["price_list"],
		"order_date": values.get("order_date") or nowdate(), "delivery_date": values.get("delivery_date"),
		"contact_person": context.get("contact_person"), "phone": context.get("phone"),
		"assigned_employee": values.get("assigned_employee") or context.get("assigned_employee"),
		"payment_method": values.get("payment_method") or "Công nợ", "money_account": values.get("money_account"),
		"install_address": values.get("install_address"), "shipping_note": values.get("shipping_note"), "notes": values.get("notes"),
		**{key: result[key] for key in ("currency", "subtotal", "discount_amount", "line_adjustment_amount", "order_adjustment_amount", "vat_percent", "vat_amount", "grand_total", "deposit_amount", "paid_amount", "outstanding_amount")},
	})
	doc.set("items", [])
	for row in result["items"]:
		doc.append("items", _clean_line(row))
	approval_reasons = list(result["approval_reasons"])
	if requires_reapproval:
		approval_reasons.append(_("Đơn đã duyệt bị sửa; Chủ xưởng phải duyệt lại toàn bộ"))
		doc.revision_no = int(doc.revision_no or 0) + 1
		doc.status = "Draft"
		doc.approval_status = "Invalidated"
	doc.approval_reasons_json = _j(approval_reasons)
	doc.snapshot_json = _j({"customer": context, "calculation": result, "saved_at": now()})
	with _service_write():
		if doc.is_new():
			doc.insert()
		else:
			doc.save()
		if requires_reapproval and old_snapshot is not None:
			revision = frappe.new_doc("Alumdoor Order Revision")
			revision.update({
				"sales_order": doc.name, "revision_no": doc.revision_no,
				"reason": revision_reason, "before_json": _j(old_snapshot),
				"after_json": _j(_snapshot(doc)), "diff_json": _j({"recalculated": True}),
				"changed_by": frappe.session.user, "changed_at": now(),
			})
			revision.insert(ignore_permissions=True)
		record_audit(
			"sales_order.update" if name else "sales_order.create",
			"Alumdoor Sales Order",
			doc.name,
			request_id,
			before=audit_before,
			after=_snapshot(doc),
			reason=revision_reason,
		)
	result["approval_reasons"] = approval_reasons
	result["approval_required"] = bool(approval_reasons)
	return {"name": doc.name, "doc": doc.as_dict(), **result}


def save_order(
	data: dict[str, Any] | str | None,
	name: str | None = None,
	modified: str | None = None,
	idempotency_key: str | None = None,
) -> dict[str, Any]:
	require_operational()
	action = "sales_order.update" if name else "sales_order.create"
	return execute_once(
		action,
		idempotency_key,
		{"name": name, "modified": modified, "data": data},
		lambda request_id: _save_order_once(data, name, modified, request_id),
	)


def _create_deposit(doc) -> None:
	if flt(doc.deposit_amount) <= 0 or doc.deposit_payment:
		return
	if not doc.money_account:
		frappe.throw(_("Có tiền cọc thì bắt buộc chọn quỹ / tài khoản ngân hàng"))
	payment = frappe.new_doc("Alumdoor Payment Entry")
	payment.update({
		"flow_type": "RECEIPT", "sales_order": doc.name, "partner": doc.customer,
		"amount": doc.deposit_amount, "money_account": doc.money_account, "posting_date": nowdate(),
		"reason": _("Thu cọc lần đầu khi xác nhận đơn"), "status": "Submitted",
		"idempotency_key": f"deposit:{doc.name}",
	})
	payment.insert(ignore_permissions=True)
	doc.deposit_payment = payment.name
	doc.paid_amount = flt(doc.paid_amount) + flt(payment.amount)
	doc.outstanding_amount = max(flt(doc.grand_total) - flt(doc.paid_amount), 0)


def _create_production_request(doc) -> None:
	if not any(row.is_manufactured_item for row in doc.items):
		return
	existing = frappe.db.exists("Alumdoor Production Request", {"sales_order": doc.name})
	if existing:
		return
	request = frappe.new_doc("Alumdoor Production Request")
	request.update({
		"sales_order": doc.name, "order_revision_no": doc.revision_no,
		"required_date": doc.delivery_date, "status": "Open",
		"snapshot_json": _j({"order": doc.name, "revision": doc.revision_no, "items": [row.as_dict() for row in doc.items if row.is_manufactured_item]}),
	})
	request.insert(ignore_permissions=True)
	doc.status = "Production Requested"


def _submit_order_once(name: str, expected_modified: str | None, request_id: str) -> dict[str, Any]:
	doc = frappe.get_doc("Alumdoor Sales Order", name)
	check_expected_modified(doc, expected_modified)
	before = _snapshot(doc)
	if doc.is_stock_locked:
		frappe.throw(_("Đơn đã khóa xuất kho"))
	if doc.status != "Draft":
		frappe.throw(_("Chỉ đơn nháp mới được gửi"))
	reasons = json.loads(doc.approval_reasons_json or "[]")
	with _service_write():
		if reasons:
			doc.status = "Pending Owner Approval"
			doc.approval_status = "Pending"
		else:
			doc.status = "Approved"
			doc.approval_status = "Not Required"
			_create_deposit(doc)
			_create_production_request(doc)
		doc.save()
		record_audit("sales_order.submit", "Alumdoor Sales Order", doc.name, request_id, before=before, after=_snapshot(doc))
	return {"name": doc.name, "status": doc.status, "approval_status": doc.approval_status, "doc": doc.as_dict()}


def submit_order(
	name: str,
	expected_modified: str | None = None,
	idempotency_key: str | None = None,
) -> dict[str, Any]:
	require_operational()
	return execute_once(
		"sales_order.submit",
		idempotency_key,
		{"name": name, "expected_modified": expected_modified},
		lambda request_id: _submit_order_once(name, expected_modified, request_id),
	)


def _approve_order_once(
	name: str,
	note: str | None,
	expected_modified: str | None,
	request_id: str,
) -> dict[str, Any]:
	require_owner()
	doc = frappe.get_doc("Alumdoor Sales Order", name)
	check_expected_modified(doc, expected_modified)
	before = _snapshot(doc)
	if doc.status != "Pending Owner Approval":
		frappe.throw(_("Đơn không ở trạng thái chờ duyệt"))
	with _service_write():
		doc.approval_status = "Approved"
		doc.status = "Approved"
		if note:
			doc.notes = ((doc.notes or "") + "\nDuyệt: " + note).strip()
		_create_deposit(doc)
		_create_production_request(doc)
		doc.save()
		record_audit("sales_order.approve", "Alumdoor Sales Order", doc.name, request_id, before=before, after=_snapshot(doc), reason=note)
	return {"name": doc.name, "status": doc.status, "doc": doc.as_dict()}


def approve_order(
	name: str,
	note: str | None = None,
	expected_modified: str | None = None,
	idempotency_key: str | None = None,
) -> dict[str, Any]:
	require_owner()
	return execute_once(
		"sales_order.approve",
		idempotency_key,
		{"name": name, "note": note, "expected_modified": expected_modified},
		lambda request_id: _approve_order_once(name, note, expected_modified, request_id),
	)


def _reject_order_once(
	name: str,
	reason: str,
	expected_modified: str | None,
	request_id: str,
) -> dict[str, Any]:
	require_owner()
	if not str(reason or "").strip():
		frappe.throw(_("Bắt buộc nhập lý do từ chối"))
	doc = frappe.get_doc("Alumdoor Sales Order", name)
	check_expected_modified(doc, expected_modified)
	before = _snapshot(doc)
	if doc.status != "Pending Owner Approval":
		frappe.throw(_("Đơn không ở trạng thái chờ duyệt"))
	with _service_write():
		doc.status = "Rejected"
		doc.approval_status = "Rejected"
		doc.notes = ((doc.notes or "") + f"\nTừ chối: {reason}").strip()
		doc.save()
		record_audit("sales_order.reject", "Alumdoor Sales Order", doc.name, request_id, before=before, after=_snapshot(doc), reason=reason)
	return {"name": doc.name, "status": doc.status}


def reject_order(
	name: str,
	reason: str,
	expected_modified: str | None = None,
	idempotency_key: str | None = None,
) -> dict[str, Any]:
	require_owner()
	return execute_once(
		"sales_order.reject",
		idempotency_key,
		{"name": name, "reason": reason, "expected_modified": expected_modified},
		lambda request_id: _reject_order_once(name, reason, expected_modified, request_id),
	)


def _cancel_order_once(
	name: str,
	reason: str,
	expected_modified: str | None,
	request_id: str,
) -> dict[str, Any]:
	if not str(reason or "").strip():
		frappe.throw(_("Bắt buộc nhập lý do hủy"))
	doc = frappe.get_doc("Alumdoor Sales Order", name)
	can_cancel_order(doc)
	check_expected_modified(doc, expected_modified)
	before = _snapshot(doc)
	if doc.is_stock_locked:
		frappe.throw(_("Đơn đã xác nhận xuất kho nên không thể hủy"))
	with _service_write():
		doc.status = "Cancelled"
		doc.refund_due = flt(doc.paid_amount)
		doc.notes = ((doc.notes or "") + f"\nHủy: {reason}").strip()
		doc.save()
		record_audit("sales_order.cancel", "Alumdoor Sales Order", doc.name, request_id, before=before, after=_snapshot(doc), reason=reason)
	return {"name": doc.name, "status": doc.status, "refund_due": doc.refund_due}


def cancel_order(
	name: str,
	reason: str,
	expected_modified: str | None = None,
	idempotency_key: str | None = None,
) -> dict[str, Any]:
	require_operational()
	return execute_once(
		"sales_order.cancel",
		idempotency_key,
		{"name": name, "reason": reason, "expected_modified": expected_modified},
		lambda request_id: _cancel_order_once(name, reason, expected_modified, request_id),
	)
