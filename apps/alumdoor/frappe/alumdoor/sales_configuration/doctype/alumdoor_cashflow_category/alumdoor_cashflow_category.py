from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import autoname_from_label, validate_enabled_link, validate_nonnegative


class AlumdoorCashflowCategory(Document):
	def autoname(self):
		autoname_from_label(self, "category_code", "category_name", "TC")

	def validate(self):
		validate_nonnegative(self, "sort_order")
		validate_enabled_link("Alumdoor Money Account", self.default_money_account)
