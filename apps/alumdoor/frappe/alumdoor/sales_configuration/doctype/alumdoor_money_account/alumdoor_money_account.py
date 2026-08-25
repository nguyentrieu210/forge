import frappe
from frappe import _
from frappe.model.document import Document

from alumdoor.sales_configuration.master_utils import autoname_from_label, validate_nonnegative


class AlumdoorMoneyAccount(Document):
	def autoname(self):
		autoname_from_label(self, "account_code", "account_name", "TK")

	def validate(self):
		validate_nonnegative(self, "sort_order")
		if self.account_type == "Bank" and not (self.bank_name and self.account_number):
			frappe.throw(_("Bank Name and Account Number are required for bank accounts"))
		if self.account_type == "Bank" and frappe.db.exists(
			"Alumdoor Money Account",
			{
				"bank_name": self.bank_name,
				"account_number": self.account_number,
				"name": ["!=", self.name],
			},
		):
			frappe.throw(_("This account number already exists at the selected bank"))
		if self.account_type == "Cash":
			self.bank_name = None
			self.account_number = None
			self.account_holder = None
