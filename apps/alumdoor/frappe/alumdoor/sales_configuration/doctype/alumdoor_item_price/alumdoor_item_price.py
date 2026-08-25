import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from alumdoor.sales_configuration.master_utils import validate_date_range, validate_enabled_link, validate_nonnegative


class AlumdoorItemPrice(Document):
	def validate(self):
		if bool(self.item) == bool(self.sales_package):
			frappe.throw(_("Choose exactly one Item or Sales Package"))
		validate_enabled_link("Alumdoor Price List", self.price_list)
		validate_enabled_link("Alumdoor Item", self.item, "disabled") if self.item else None
		validate_enabled_link("Sales Package", self.sales_package)
		validate_enabled_link("Alumdoor UOM", self.uom)
		validate_date_range(self, "valid_from", "valid_to")
		validate_nonnegative(self, "rate", "min_qty")
		self.price_variant = str(self.price_variant or "STANDARD").strip().upper()
		self._validate_no_overlap()

	def _validate_no_overlap(self):
		filters = {
			"price_list": self.price_list,
			"price_variant": self.price_variant,
			"uom": self.uom,
			"min_qty": flt(self.min_qty),
			"enabled": 1,
		}
		if self.item:
			filters["item"] = self.item
			filters["sales_package"] = ["is", "not set"]
		else:
			filters["sales_package"] = self.sales_package
			filters["item"] = ["is", "not set"]
		for row in frappe.get_all("Alumdoor Item Price", filters=filters, fields=["name", "valid_from", "valid_to"]):
			if row.name == self.name:
				continue
			start_a = getdate(self.valid_from or "1900-01-01")
			end_a = getdate(self.valid_to or "2999-12-31")
			start_b = getdate(row.valid_from or "1900-01-01")
			end_b = getdate(row.valid_to or "2999-12-31")
			if start_a <= end_b and start_b <= end_a:
				frappe.throw(_("Item Price overlaps with {0}").format(row.name))
