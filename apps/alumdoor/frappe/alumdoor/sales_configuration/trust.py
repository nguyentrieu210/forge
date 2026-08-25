from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from hashlib import sha256
from typing import Any, TypeVar

import frappe
from frappe import _


T = TypeVar("T")


def _json(value: Any) -> str:
	return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str, separators=(",", ":"))


def check_expected_modified(doc, expected_modified: str | None) -> None:
	if not str(expected_modified or "").strip():
		frappe.throw(_("Thiếu phiên bản modified của chứng từ"), frappe.TimestampMismatchError)
	if str(doc.modified) != str(expected_modified):
		frappe.throw(
			_("Chứng từ đã được người khác cập nhật. Hãy tải lại trước khi thao tác."),
			frappe.TimestampMismatchError,
		)


def execute_once(action: str, idempotency_key: str | None, payload: Any, operation: Callable[[str], T]) -> T:
	key = str(idempotency_key or "").strip()
	try:
		uuid.UUID(key)
	except (ValueError, AttributeError, TypeError):
		frappe.throw(_("idempotency_key phải là UUID hợp lệ"))

	payload_hash = sha256(_json(payload).encode("utf-8")).hexdigest()
	probe = frappe.new_doc("Alumdoor Request Key")
	probe.update({
		"user": frappe.session.user,
		"action": action,
		"idempotency_key": key,
		"payload_hash": payload_hash,
	})
	probe.set_new_name()
	existing = frappe.db.get_value(
		"Alumdoor Request Key",
		probe.name,
		["payload_hash", "response_json"],
		as_dict=True,
	)
	if existing:
		if existing.payload_hash != payload_hash:
			frappe.throw(_("Khóa chống trùng đã được dùng với dữ liệu khác"), frappe.DuplicateEntryError)
		if not existing.response_json:
			frappe.throw(_("Yêu cầu trùng đang được xử lý. Vui lòng chờ."), frappe.ValidationError)
		return json.loads(existing.response_json)

	probe.insert(ignore_permissions=True)
	request_id = key.split("-")[0].upper()
	result = operation(request_id)
	probe.reference_name = str(result.get("name") or "") if isinstance(result, dict) else ""
	probe.response_json = _json(result)
	probe.save(ignore_permissions=True)
	return result


def record_audit(
	action: str,
	reference_doctype: str,
	reference_name: str,
	request_id: str,
	*,
	before: Any = None,
	after: Any = None,
	reason: str | None = None,
) -> None:
	event = frappe.new_doc("Alumdoor Audit Event")
	event.update({
		"actor": frappe.session.user,
		"action": action,
		"reference_doctype": reference_doctype,
		"reference_name": reference_name,
		"before_json": _json(before) if before is not None else None,
		"after_json": _json(after) if after is not None else None,
		"reason": str(reason or "").strip() or None,
		"request_id": request_id,
		"ip": str(getattr(frappe.local, "request_ip", "") or ""),
	})
	event.insert(ignore_permissions=True)
