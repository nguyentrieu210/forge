import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from alumdoor.sales_configuration.master_utils import (
	autoname_from_label,
	validate_enabled_link,
	validate_nonnegative,
)


class AlumdoorPartnerGroup(Document):
	def autoname(self):
		autoname_from_label(self, "group_code", "group_name", "NDT")

	def validate(self):
		validate_nonnegative(self, "payment_term_days", "sort_order")
		if flt(self.default_discount_percent) < 0 or flt(self.default_discount_percent) > 100:
			frappe.throw(_("Default Discount Percent must be between 0 and 100"))
		validate_enabled_link("Alumdoor Price List", self.default_price_list)
