import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.services.formula_engine import validate_expression


class DoorFormula(Document):
	def validate(self):
		if self.effective_from and self.effective_to and self.effective_from > self.effective_to:
			frappe.throw(_("Effective To must be on or after Effective From"))
		seen = set()
		for row in self.variables:
			if row.variable_name in seen:
				frappe.throw(_("Duplicate formula variable: {0}").format(row.variable_name))
			validate_expression(row.expression)
			seen.add(row.variable_name)
