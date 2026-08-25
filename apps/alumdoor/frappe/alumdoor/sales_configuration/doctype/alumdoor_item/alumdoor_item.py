import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class AlumdoorItem(Document):
	def validate(self):
		if self.is_stock_item and not self.stock_uom:
			frappe.throw(_("Stock UOM is required for stock items"))
		seen = set()
		for row in self.uom_conversions:
			if row.uom in seen:
				frappe.throw(_("Duplicate UOM conversion: {0}").format(row.uom))
			if flt(row.conversion_factor) <= 0:
				frappe.throw(_("UOM conversion factor must be greater than zero"))
			seen.add(row.uom)
