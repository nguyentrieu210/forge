import frappe
from frappe import _
from frappe.model.document import Document


class AlumdoorColor(Document):
	def validate(self):
		if self.secondary_color and self.primary_color == self.secondary_color:
			frappe.throw(_("Primary Color and Secondary Color must be different"))
