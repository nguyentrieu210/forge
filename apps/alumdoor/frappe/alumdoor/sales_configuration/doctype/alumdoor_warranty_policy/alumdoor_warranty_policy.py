import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint

from alumdoor.sales_configuration.master_utils import (
	autoname_from_label,
	validate_date_range,
	validate_enabled_link,
	validate_nonnegative,
)


class AlumdoorWarrantyPolicy(Document):
	def autoname(self):
		autoname_from_label(self, "policy_code", "policy_name", "BH")

	def validate(self):
		scopes = [self.item, self.item_group, self.door_system]
		if sum(bool(value) for value in scopes) != 1:
			frappe.throw(_("Choose exactly one Item, Item Group or Door System"))
		validate_enabled_link("Alumdoor Item", self.item, "disabled")
		validate_enabled_link("Alumdoor Item Group", self.item_group)
		validate_enabled_link("Door System", self.door_system)
		validate_nonnegative(self, "warranty_months")
		if cint(self.warranty_months) == 0:
			frappe.throw(_("Warranty Months must be greater than zero"))
		validate_date_range(self)
