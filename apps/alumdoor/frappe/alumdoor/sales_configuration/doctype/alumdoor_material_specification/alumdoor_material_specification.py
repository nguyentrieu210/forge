import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from alumdoor.sales_configuration.master_utils import (
	autoname_from_label,
	validate_date_range,
	validate_enabled_link,
)


class AlumdoorMaterialSpecification(Document):
	def autoname(self):
		autoname_from_label(self, "spec_code", "spec_name", "QC")

	def validate(self):
		validate_enabled_link("Alumdoor Item", self.item, "disabled")
		validate_enabled_link("Surface Finish", self.default_surface_finish)
		validate_date_range(self)
		for fieldname in (
			"thickness_min_mm",
			"thickness_max_mm",
			"profile_pitch_mm",
			"weight_kg_per_m",
			"weight_kg_per_m2",
			"standard_length_m",
		):
			if flt(self.get(fieldname)) < 0:
				frappe.throw(_("{0} cannot be negative").format(self.meta.get_label(fieldname)))
		if self.thickness_min_mm and self.thickness_max_mm and flt(self.thickness_min_mm) > flt(self.thickness_max_mm):
			frappe.throw(_("Maximum Thickness must be greater than or equal to Minimum Thickness"))
