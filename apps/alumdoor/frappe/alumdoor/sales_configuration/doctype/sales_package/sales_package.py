import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.services.formula_engine import validate_expression


class SalesPackage(Document):
	def validate(self):
		if self.effective_from and self.effective_to and self.effective_from > self.effective_to:
			frappe.throw(_("Effective To must be on or after Effective From"))
		if self.door_system:
			system_door_type = frappe.db.get_value("Door System", self.door_system, "door_type")
			if system_door_type and system_door_type != self.door_type:
				frappe.throw(_("Door System does not belong to the selected Door Type"))

		attribute_names = set()
		for row in self.attributes:
			if row.attribute in attribute_names:
				frappe.throw(_("Duplicate package attribute: {0}").format(row.attribute))
			attribute_names.add(row.attribute)

		component_roles = set()
		for row in self.components:
			role = (row.component_role or "").strip().upper().replace(" ", "_")
			if role in component_roles:
				frappe.throw(_("Duplicate component role: {0}").format(role))
			if not row.item and not row.item_group and not row.optional:
				frappe.throw(_("Required component {0} needs an Item or Item Group").format(role))
			validate_expression(row.qty_formula)
			validate_expression(row.measure_formula)
			row.component_role = role
			component_roles.add(role)
