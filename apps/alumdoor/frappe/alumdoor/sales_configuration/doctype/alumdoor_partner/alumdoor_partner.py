import re

import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import (
	autoname_sequence,
	validate_enabled_link,
	validate_nonnegative,
)


class AlumdoorPartner(Document):
	def autoname(self):
		prefix = {"Customer": "KH", "Supplier": "NCC", "Both": "DT"}.get(self.partner_kind, "DT")
		autoname_sequence(self, "partner_code", prefix)

	def validate(self):
		validate_nonnegative(self, "credit_limit", "payment_term_days")
		validate_enabled_link("Alumdoor Partner Group", self.partner_group)
		validate_enabled_link("Alumdoor Partner Group", self.customer_group)
		validate_enabled_link("Alumdoor Partner Group", self.supplier_group)
		validate_enabled_link("Alumdoor Employee", self.assigned_employee)
		validate_enabled_link("Alumdoor Price List", self.default_price_list)
		for doctype, name in (("Contact", self.primary_contact), ("Address", self.primary_address)):
			if name and not frappe.db.exists(doctype, name):
				frappe.throw(_("{0} {1} does not exist").format(doctype, name))
		if self.tax_code:
			self.tax_code = re.sub(r"\s+", "", self.tax_code)
			if not re.fullmatch(r"\d{10}|\d{13}", self.tax_code):
				frappe.throw(_("Tax Code must contain 10 or 13 digits"))
		if self.partner_group:
			group_kind = frappe.db.get_value("Alumdoor Partner Group", self.partner_group, "partner_kind")
			if group_kind not in (self.partner_kind, "Both") and self.partner_kind != "Both":
				frappe.throw(_("Partner Group does not match Partner Kind"))
		for fieldname, expected_kind in (("customer_group", "Customer"), ("supplier_group", "Supplier")):
			group = self.get(fieldname)
			if group:
				kind = frappe.db.get_value("Alumdoor Partner Group", group, "partner_kind")
				if kind not in (expected_kind, "Both"):
					frappe.throw(_("{0} does not match its partner role").format(fieldname))
