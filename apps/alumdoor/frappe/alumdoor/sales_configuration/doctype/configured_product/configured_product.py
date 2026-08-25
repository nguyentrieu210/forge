import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname


class ConfiguredProduct(Document):
	def autoname(self):
		self.name = make_autoname("CP-.#####")
		self.configured_product_id = self.name

	def validate(self):
		if self.width <= 0 or self.height <= 0 or self.quantity <= 0:
			frappe.throw(_("Width, height and quantity must be greater than zero"))
		for fieldname in ("configuration_json", "calculated_variables_json"):
			value = self.get(fieldname)
			if value:
				try:
					json.loads(value)
				except ValueError as exc:
					raise frappe.ValidationError(_("{0} must contain valid JSON").format(fieldname)) from exc
