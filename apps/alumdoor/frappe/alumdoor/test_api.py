import frappe
from frappe.tests import IntegrationTestCase

from alumdoor import api


class TestAlumdoorApi(IntegrationTestCase):
	def test_manifest_is_valid_and_permission_filtered(self):
		manifest = api.get_app_manifest("alumdoor")
		self.assertEqual(manifest["id"], "alumdoor")
		self.assertEqual(manifest["home"], {"doctype": "Alumdoor Sales Order"})
		nav_keys = {row["key"] for row in manifest["nav"]}
		self.assertTrue(
			{
				"Sales Package",
				"Surface Finish",
				"Alumdoor Color",
				"Alumdoor Material Specification",
				"Alumdoor Partner",
				"Alumdoor Partner Group",
				"Alumdoor Employee",
				"Alumdoor Department",
				"Alumdoor Price List",
				"Alumdoor Item Price",
				"Alumdoor Operation Standard",
				"Alumdoor Work Shift",
				"Alumdoor Fault Reason",
				"Alumdoor Warranty Policy",
				"Alumdoor Coating Rate",
				"Alumdoor Money Account",
				"Alumdoor Cashflow Category",
			}.issubset(nav_keys)
		)

	def test_runtime_core_contract(self):
		boot = api.get_boot()
		self.assertEqual(boot["site_name"], frappe.local.site)
		self.assertTrue(boot["csrf_token"])
		self.assertEqual(api.get_business_context("alumdoor")["dimensions"], [])
		self.assertEqual(api.get_application_catalog("alumdoor")["apps"][0]["key"], "alumdoor")
		self.assertEqual(api.get_overview()["key"], "alumdoor")
		translations = api.translate_strings('["Configured Product", "Package Code", "Resolved"]')
		self.assertEqual(translations["Configured Product"], "Sản phẩm đã cấu hình")
		self.assertEqual(translations["Package Code"], "Mã gói")
		self.assertEqual(translations["Resolved"], "Đã tính cấu hình")

	def test_list_view_contract(self):
		result = api.get_list_view("Sales Package", fields='["name", "package_name"]')
		self.assertIn("rows", result)
		self.assertIn("count", result)
		self.assertTrue(result["capabilities"]["read"])
