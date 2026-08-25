from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import autoname_from_label


class AlumdoorFaultReason(Document):
	def autoname(self):
		autoname_from_label(self, "reason_code", "reason_name", "LOI")
