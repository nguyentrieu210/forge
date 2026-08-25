import frappe
from frappe import _
from frappe.model.document import Document


class ConfigurationAttribute(Document):
	def validate(self):
		if self.data_type == "Link" and not self.link_doctype:
			frappe.throw(_("Link DocType is required when Data Type is Link"))
		seen = set()
		for row in self.values:
			if row.value in seen:
				frappe.throw(_("Duplicate attribute value: {0}").format(row.value))
			seen.add(row.value)
