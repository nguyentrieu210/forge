import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.services.formula_engine import validate_expression


class ComponentRule(Document):
	def validate(self):
		self.component_role = (self.component_role or "").strip().upper().replace(" ", "_")
		if not self.result_item and not self.result_uom and not self.qty_formula and not self.result_qty:
			frappe.throw(_("Component Rule must define at least one result"))
		validate_expression(self.qty_formula)
		validate_expression(self.measure_formula)
