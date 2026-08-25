import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import (
	normalize_code,
	validate_date_range,
	validate_enabled_link,
	validate_nonnegative,
)


class AlumdoorCoatingRate(Document):
	def autoname(self):
		code = normalize_code(self.rate_code)
		if not code:
			parts = [self.supplier, self.coating_part, self.door_system or self.item_group, self.surface_finish]
			code = normalize_code("_".join(part for part in parts if part))
		if not code:
			frappe.throw(_("Supplier and Surface Finish are required to generate Rate Code"))
		self.rate_code = f"SON_{code}" if not code.startswith("SON_") else code
		self.name = self.rate_code

	def validate(self):
		validate_enabled_link("Alumdoor Partner", self.supplier)
		validate_enabled_link("Door System", self.door_system)
		validate_enabled_link("Alumdoor Item Group", self.item_group)
		validate_enabled_link("Surface Finish", self.surface_finish)
		validate_date_range(self)
		validate_nonnegative(self, "rate", "minimum_charge")
		kind = frappe.db.get_value("Alumdoor Partner", self.supplier, "partner_kind")
		if kind not in ("Supplier", "Both"):
			frappe.throw(_("Coating supplier must be a Supplier or Both partner"))
		if not (self.door_system or self.item_group):
			frappe.throw(_("Door System or Item Group is required"))
