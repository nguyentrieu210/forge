import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import autoname_sequence, validate_enabled_link


class AlumdoorEmployee(Document):
	def autoname(self):
		autoname_sequence(self, "employee_code", "NV")

	def validate(self):
		validate_enabled_link("Alumdoor Department", self.department)
		if self.department and frappe.db.get_value("Alumdoor Department", self.department, "is_group"):
			frappe.throw(_("Employees cannot be assigned to a group department"))
		if self.user and not frappe.db.get_value("User", self.user, "enabled"):
			frappe.throw(_("User is disabled"))
