import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import (
	autoname_from_label,
	validate_date_range,
	validate_enabled_link,
	validate_nonnegative,
)


class AlumdoorPriceList(Document):
	def autoname(self):
		autoname_from_label(self, "price_list_code", "price_list_name", "BG")

	def validate(self):
		validate_date_range(self, "valid_from", "valid_to")
		validate_nonnegative(self, "priority")
		validate_enabled_link("Alumdoor Partner Group", self.partner_group)
		if self.partner_group:
			kind = frappe.db.get_value("Alumdoor Partner Group", self.partner_group, "partner_kind")
			if self.price_usage == "Selling" and kind == "Supplier":
				frappe.throw(_("Selling Price List cannot target a supplier-only group"))
			if self.price_usage == "Buying" and kind == "Customer":
				frappe.throw(_("Buying Price List cannot target a customer-only group"))
