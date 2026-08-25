import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from alumdoor.sales_configuration.master_utils import (
	autoname_from_label,
	validate_date_range,
	validate_enabled_link,
	validate_nonnegative,
)


class AlumdoorOperationStandard(Document):
	def autoname(self):
		autoname_from_label(self, "operation_code", "operation_name", "CD")

	def validate(self):
		validate_enabled_link("Alumdoor Department", self.department)
		validate_enabled_link("Door System", self.door_system)
		validate_enabled_link("Sales Package", self.sales_package)
		validate_date_range(self)
		validate_nonnegative(self, "setup_minutes", "sequence")
		if flt(self.standard_minutes) <= 0:
			frappe.throw(_("Standard Minutes must be greater than zero"))
		if self.department:
			department_type = frappe.db.get_value("Alumdoor Department", self.department, "department_type")
			if department_type not in ("Production", "Coating"):
				frappe.throw(_("Operation Department must be Production or Coating"))
		if self.sales_package:
			package_system = frappe.db.get_value("Sales Package", self.sales_package, "door_system")
			if self.door_system and package_system != self.door_system:
				frappe.throw(_("Sales Package does not belong to the selected Door System"))
			if not self.door_system:
				self.door_system = package_system
