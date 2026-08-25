import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import autoname_from_label, validate_enabled_link, validate_nonnegative


class AlumdoorDepartment(Document):
	def autoname(self):
		autoname_from_label(self, "department_code", "department_name", "BP")

	def validate(self):
		validate_nonnegative(self, "sort_order")
		if self.parent_department:
			validate_enabled_link("Alumdoor Department", self.parent_department)
			if self.parent_department == self.name:
				frappe.throw(_("Department cannot be its own parent"))
