from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from alumdoor.sales_configuration.services.sales_order_service import _effective_price_list


class TestSalesOrderService(IntegrationTestCase):
	@patch("alumdoor.sales_configuration.services.sales_order_service.frappe.db.get_value")
	def test_selected_selling_price_list_is_the_effective_price_list(self, get_value):
		get_value.return_value = SimpleNamespace(
			name="BG_KHACH_LE",
			price_usage="Selling",
			valid_from="2026-01-01",
			valid_to=None,
			enabled=1,
		)

		result = _effective_price_list(
			{"price_list": "BG_KHACH_LE"},
			{"price_list": "BG_DAI_LY"},
			"2026-08-25",
		)

		self.assertEqual(result, "BG_KHACH_LE")
		get_value.assert_called_once_with(
			"Alumdoor Price List",
			"BG_KHACH_LE",
			["name", "price_usage", "valid_from", "valid_to", "enabled"],
			as_dict=True,
		)

	@patch("alumdoor.sales_configuration.services.sales_order_service.frappe.db.get_value")
	def test_expired_selected_price_list_is_rejected(self, get_value):
		get_value.return_value = SimpleNamespace(
			name="BG_CU",
			price_usage="Selling",
			valid_from="2025-01-01",
			valid_to="2025-12-31",
			enabled=1,
		)

		with self.assertRaises(frappe.ValidationError):
			_effective_price_list(
				{"price_list": "BG_CU"},
				{"price_list": "BG_DAI_LY"},
				"2026-08-25",
			)
