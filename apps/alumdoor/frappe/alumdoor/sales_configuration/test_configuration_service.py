from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from alumdoor.sales_configuration.demo import run_demo
from alumdoor.sales_configuration.services.configured_product_service import _normalize_pricing_attributes
from alumdoor.sales_configuration.services.configured_product_service import _validate_package_attributes
from alumdoor.sales_configuration.services.formula_engine import UnsafeExpression, safe_eval
from alumdoor.sales_configuration.services.pricing_engine import _adjustment_quantity, _condition_matches
from alumdoor.sales_configuration.services.quotation_service import _resolve_component_snapshot


class TestConfigurationService(IntegrationTestCase):
	def test_demo_configuration_resolution(self):
		result = run_demo()
		self.assertEqual(result["calculated_variables"]["area"], 12.6)
		self.assertEqual(result["total"], 10200000)
		components = {row["component_role"]: row for row in result["components"]}
		self.assertEqual(components["LEAF"]["qty"], 1)
		self.assertEqual(components["LEAF"]["measure_qty"], 12.6)
		self.assertEqual(components["LEAF"]["measure_uom"], "DEMO-M2")
		self.assertEqual(components["RAIL"]["item"], "DEMO-RAIL-3M")
		self.assertEqual(components["RAIL"]["qty"], 2)
		self.assertEqual(components["SHAFT"]["item"], "DEMO-SHAFT-114")
		self.assertEqual(components["MOTOR"]["item"], "DEMO-MOTOR-YH")
		self.assertTrue(result["configured_product"].startswith("CP-"))

	def test_formula_engine_rejects_unsafe_python(self):
		with self.assertRaises(UnsafeExpression):
			safe_eval("__import__('os').system('whoami')", {})

	def test_pricing_color_aliases_are_normalized(self):
		self.assertEqual(_normalize_pricing_attributes({"COLOR": "Vân gỗ"})["COLOR"], "VAN_GO")
		self.assertEqual(_normalize_pricing_attributes({"COLOR": "Vàng kem"})["COLOR"], "VK")
		self.assertEqual(_normalize_pricing_attributes({"COLOR": "Ghi sần"})["COLOR"], "GS")
		self.assertEqual(_normalize_pricing_attributes({"RAY_COLOR": "Vân gỗ"})["RAY_COLOR"], "VAN_GO")

	def test_stackable_adjustment_condition_and_quantity(self):
		rule = SimpleNamespace(
			condition_expression='door_system == "CUON-TAM-LIEN-UC" and unit_area > 4 and unit_area < 7',
			quantity_formula="quantity",
			price_type="Per Qty",
		)
		context = {"door_system": "CUON-TAM-LIEN-UC", "unit_area": 5.5, "quantity": 2}
		self.assertTrue(_condition_matches(rule, context))
		self.assertEqual(_adjustment_quantity(rule, context), 2)

	def test_check_and_number_attributes_are_normalized_before_formula_evaluation(self):
		package = SimpleNamespace(
			attributes=[
				SimpleNamespace(attribute="HAS_BUTTERFLY_BRACKET", default_value="0", required=0),
				SimpleNamespace(attribute="V4_V5_LENGTH_M", default_value="2.5", required=0),
			]
		)
		result = _validate_package_attributes(package, {})
		self.assertEqual(result["HAS_BUTTERFLY_BRACKET"], 0)
		self.assertEqual(result["V4_V5_LENGTH_M"], 2.5)

	@patch("alumdoor.sales_configuration.services.quotation_service.resolve_configuration")
	@patch("alumdoor.sales_configuration.services.quotation_service.frappe.get_doc")
	@patch("alumdoor.sales_configuration.services.quotation_service.frappe.get_all")
	def test_quotation_components_find_package_from_parent_sales_item(self, get_all, get_doc, resolve):
		get_all.side_effect = [
			["GERMAN-AL548N-FULL"],
			[SimpleNamespace(name="TP-ALD-548N", item_name="ĐỨC AL548N"), SimpleNamespace(name="TP-RAYHOP", item_name="RAY HỘP TD U76")],
		]
		get_doc.return_value = SimpleNamespace(enabled=1)
		resolve.return_value = {
			"sales_package": "GERMAN-AL548N-FULL",
			"components": [
				{"component_role": "DOOR_PANEL", "item": "TP-ALD-548N", "qty": 1, "uom": "Bộ"},
				{"component_role": "RAIL", "item": "TP-RAYHOP", "qty": 2, "uom": "Cái"},
			],
		}

		result = _resolve_component_snapshot("TP-ALD-548N", {"_pricing_width_field": "width_pb_nhua_m", "width_pb_nhua_m": 2, "height_m": 3.2, "qty": 1})

		self.assertEqual(result["sales_package"], "GERMAN-AL548N-FULL")
		self.assertEqual(result["components"][1]["qty"], 2)
		self.assertEqual(result["components"][1]["item_name"], "RAY HỘP TD U76")
		self.assertEqual(get_all.call_args_list[0].args[0], "Sales Package Component")
		self.assertEqual(get_all.call_args_list[0].kwargs["filters"]["item"], "TP-ALD-548N")
