from __future__ import annotations

import re
import unicodedata

import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils import flt


def normalize_code(value: str | None) -> str:
	text = (value or "").strip().upper().replace("Đ", "D")
	text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
	return re.sub(r"[^A-Z0-9]+", "_", text).strip("_")[:80]


def autoname_from_label(doc, code_field: str, label_field: str, prefix: str = "") -> None:
	code = normalize_code(doc.get(code_field))
	if not code:
		code = normalize_code(doc.get(label_field))
	if prefix and code and not code.startswith(f"{prefix}_"):
		code = f"{prefix}_{code}"
	if not code:
		frappe.throw(_("A name is required to generate the document code"))
	doc.set(code_field, code)
	doc.name = code


def autoname_sequence(doc, code_field: str, prefix: str) -> None:
	code = normalize_code(doc.get(code_field))
	if not code:
		code = make_autoname(f"{prefix}-.#####")
	doc.set(code_field, code)
	doc.name = code


def validate_date_range(doc, from_field: str = "effective_from", to_field: str = "effective_to") -> None:
	start = doc.get(from_field)
	end = doc.get(to_field)
	if start and end and start > end:
		frappe.throw(_("End date must be on or after start date"))


def validate_nonnegative(doc, *fieldnames: str) -> None:
	for fieldname in fieldnames:
		if flt(doc.get(fieldname)) < 0:
			frappe.throw(_("{0} cannot be negative").format(doc.meta.get_label(fieldname)))


def validate_enabled_link(doctype: str, name: str | None, enabled_field: str = "enabled") -> None:
	if not name:
		return
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} does not exist").format(doctype, name))
	if frappe.db.has_column(doctype, enabled_field):
		value = frappe.db.get_value(doctype, name, enabled_field)
		is_disabled = bool(value) if enabled_field == "disabled" else not bool(value)
		if is_disabled:
			frappe.throw(_("{0} {1} is disabled").format(doctype, name))
