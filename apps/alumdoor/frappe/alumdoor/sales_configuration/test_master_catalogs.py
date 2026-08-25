import frappe
from frappe.tests import IntegrationTestCase


class TestMasterCatalogValidation(IntegrationTestCase):
	def test_work_shift_calculates_minutes(self):
		doc = frappe.new_doc("Alumdoor Work Shift")
		doc.start_time = "08:00:00"
		doc.end_time = "17:00:00"
		doc.break_minutes = 60
		doc.validate()
		self.assertEqual(doc.working_minutes, 480)

	def test_partner_rejects_invalid_tax_code(self):
		doc = frappe.new_doc("Alumdoor Partner")
		doc.partner_kind = "Customer"
		doc.tax_code = "ABC-123"
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_item_price_requires_exactly_one_scope(self):
		doc = frappe.new_doc("Alumdoor Item Price")
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_warranty_requires_scope_and_positive_duration(self):
		doc = frappe.new_doc("Alumdoor Warranty Policy")
		doc.warranty_months = 12
		with self.assertRaises(frappe.ValidationError):
			doc.validate()

	def test_cash_account_clears_bank_fields(self):
		doc = frappe.new_doc("Alumdoor Money Account")
		doc.account_type = "Cash"
		doc.bank_name = "ACB"
		doc.account_number = "123"
		doc.account_holder = "Test"
		doc.validate()
		self.assertIsNone(doc.bank_name)
		self.assertIsNone(doc.account_number)
		self.assertIsNone(doc.account_holder)

	def test_material_spec_rejects_negative_dimension(self):
		doc = frappe.new_doc("Alumdoor Material Specification")
		doc.weight_kg_per_m = -1
		with self.assertRaises(frappe.ValidationError):
			doc.validate()
