import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_time

from alumdoor.sales_configuration.master_utils import autoname_from_label, validate_nonnegative


class AlumdoorWorkShift(Document):
	def autoname(self):
		autoname_from_label(self, "shift_code", "shift_name", "CA")

	def validate(self):
		validate_nonnegative(self, "break_minutes")
		start = get_time(self.start_time)
		end = get_time(self.end_time)
		start_minutes = start.hour * 60 + start.minute
		end_minutes = end.hour * 60 + end.minute
		duration = (end_minutes - start_minutes) % (24 * 60)
		if duration == 0:
			frappe.throw(_("Shift start and end time must be different"))
		if cint(self.break_minutes) >= duration:
			frappe.throw(_("Break Minutes must be shorter than shift duration"))
		self.working_minutes = duration - cint(self.break_minutes)
