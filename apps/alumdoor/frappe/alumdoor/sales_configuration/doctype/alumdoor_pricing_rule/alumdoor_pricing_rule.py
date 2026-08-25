import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.services.formula_engine import validate_expression


class AlumdoorPricingRule(Document):
	def validate(self):
		self.component_role = (self.component_role or "").strip().upper().replace(" ", "_")
		self.rule_scope = self.rule_scope or "Component"
		if self.rule_scope == "Component" and not self.sales_package:
			frappe.throw(_("Sales Package is required for component pricing rules"))
		if self.rule_scope == "Adjustment" and not self.adjustment_item:
			frappe.throw(_("Adjustment Item is required for adjustment pricing rules"))
		if self.effective_from and self.effective_to and self.effective_from > self.effective_to:
			frappe.throw(_("Effective To must be on or after Effective From"))
		if self.price_type == "Formula" and not self.formula:
			frappe.throw(_("Formula is required for Formula price type"))
		validate_expression(self.formula)
		validate_expression(self.condition_expression)
		validate_expression(self.quantity_formula)
