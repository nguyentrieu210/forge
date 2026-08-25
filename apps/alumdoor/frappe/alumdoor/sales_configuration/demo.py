from __future__ import annotations

import frappe

from alumdoor.sales_configuration.services.configured_product_service import resolve_configuration


def run_demo() -> dict:
	"""Create transaction-scoped demo masters, resolve one door, then roll everything back."""
	savepoint = "alumdoor_demo"
	frappe.db.savepoint(savepoint)
	try:
		_create_demo_data()
		return resolve_configuration(
			"DEMO-ROLLING-FULL",
			width=4200,
			height=3000,
			quantity=1,
			attributes={"MOTOR_TYPE": "YH"},
			save=True,
		)
	finally:
		frappe.db.rollback(save_point=savepoint)


def schema_status() -> list[dict]:
	return frappe.get_all(
		"DocType",
		filters={"module": "Sales Configuration"},
		fields=["name", "istable", "is_tree", "title_field", "search_fields"],
		order_by="name asc",
	)


def _create_demo_data() -> None:
	demo_uoms = {
		"each": "DEMO-EACH",
		"set": "DEMO-SET",
		"bar": "DEMO-BAR",
		"sqm": "DEMO-M2",
	}
	for name, symbol, whole_number in (
		(demo_uoms["each"], "cái", 1),
		(demo_uoms["set"], "bộ", 1),
		(demo_uoms["bar"], "thanh", 1),
		(demo_uoms["sqm"], "m²", 0),
	):
		_insert("Alumdoor UOM", uom_name=name, symbol=symbol, must_be_whole_number=whole_number)

	_insert(
		"Alumdoor Item Group",
		item_group_code="DEMO-COMPONENTS",
		item_group_name="Demo Components",
		is_group=1,
	)
	items = (
		("DEMO-LEAF", "Demo Rolling Door Leaf", "Component", demo_uoms["sqm"]),
		("DEMO-RAIL-3M", "Demo Rail 3m", "Component", demo_uoms["bar"]),
		("DEMO-RAIL-4M", "Demo Rail 4m", "Component", demo_uoms["bar"]),
		("DEMO-SHAFT-90", "Demo Shaft 90", "Component", demo_uoms["each"]),
		("DEMO-SHAFT-114", "Demo Shaft 114", "Component", demo_uoms["each"]),
		("DEMO-MOTOR-YH", "Demo Motor YH", "Accessory", demo_uoms["set"]),
	)
	for code, item_name, item_type, uom in items:
		_insert(
			"Alumdoor Item",
			item_code=code,
			item_name=item_name,
			item_group="DEMO-COMPONENTS",
			stock_uom=uom,
			item_type=item_type,
			is_stock_item=1,
			is_sales_item=0,
			is_purchase_item=1,
		)

	_insert("Door Type", code="DEMO-ROLLING", door_type_name="Demo Rolling Door")
	_insert(
		"Door System",
		system_code="DEMO-TAIWAN",
		system_name="Demo Taiwan System",
		door_type="DEMO-ROLLING",
	)
	_insert(
		"Configuration Attribute",
		attribute_code="MOTOR_TYPE",
		attribute_name="Motor Type",
		data_type="Select",
		required=1,
		values=[{"value": "YH", "label": "YH", "enabled": 1}],
	)
	_insert(
		"Door Formula",
		formula_code="DEMO-ROLLING-FORMULA",
		formula_name="Demo Rolling Door Geometry",
		door_type="DEMO-ROLLING",
		door_system="DEMO-TAIWAN",
		version=1,
		variables=[
			{
				"variable_name": "area",
				"expression": "width / 1000 * height / 1000 * quantity",
				"output_unit": demo_uoms["sqm"],
				"sequence": 10,
			}
		],
	)
	_insert(
		"Sales Package",
		package_code="DEMO-ROLLING-FULL",
		package_name="Demo Taiwan Rolling Door Full Package",
		door_type="DEMO-ROLLING",
		door_system="DEMO-TAIWAN",
		default_formula="DEMO-ROLLING-FORMULA",
		selling_uom=demo_uoms["set"],
		currency="VND",
		attributes=[{"attribute": "MOTOR_TYPE", "required": 1, "sequence": 10}],
		components=[
			{
				"component_role": "LEAF",
				"item": "DEMO-LEAF",
				"qty_formula": "quantity",
				"uom": demo_uoms["set"],
				"measure_formula": "area",
				"measure_uom": demo_uoms["sqm"],
				"sequence": 10,
			},
			{"component_role": "RAIL", "item_group": "DEMO-COMPONENTS", "qty": 0, "uom": demo_uoms["bar"], "sequence": 20},
			{"component_role": "SHAFT", "item_group": "DEMO-COMPONENTS", "qty": 0, "uom": demo_uoms["each"], "sequence": 30},
			{"component_role": "MOTOR", "item_group": "DEMO-COMPONENTS", "qty": 0, "uom": demo_uoms["set"], "sequence": 40},
		],
	)

	_component_rule("DEMO-RAIL-3M-RULE", "RAIL", "height", "<=", "3000", "DEMO-RAIL-3M", 2, demo_uoms["bar"], 20)
	_component_rule("DEMO-RAIL-4M-RULE", "RAIL", "height", ">", "3000", "DEMO-RAIL-4M", 2, demo_uoms["bar"], 10)
	_component_rule("DEMO-SHAFT-90-RULE", "SHAFT", "width", "<=", "3500", "DEMO-SHAFT-90", 1, demo_uoms["each"], 10)
	_component_rule("DEMO-SHAFT-114-RULE", "SHAFT", "width", ">", "3500", "DEMO-SHAFT-114", 1, demo_uoms["each"], 20)
	_component_rule("DEMO-MOTOR-YH-RULE", "MOTOR", "MOTOR_TYPE", "=", "YH", "DEMO-MOTOR-YH", 1, demo_uoms["set"], 20)

	_pricing_rule("DEMO-PRICE-LEAF", "LEAF", "Per Area", 500000)
	_pricing_rule("DEMO-PRICE-RAIL", "RAIL", "Per Qty", 200000)
	_pricing_rule("DEMO-PRICE-SHAFT", "SHAFT", "Per Qty", 1000000)
	_pricing_rule("DEMO-PRICE-MOTOR", "MOTOR", "Per Qty", 2500000)


def _component_rule(code, role, field, operator, value, item, qty, uom, priority):
	_insert(
		"Component Rule",
		rule_code=code,
		rule_name=code.replace("-", " ").title(),
		sales_package="DEMO-ROLLING-FULL",
		component_role=role,
		priority=priority,
		conditions=[
			{"condition_field": field, "operator": operator, "condition_value": value, "sequence": 10}
		],
		result_item=item,
		result_qty=qty,
		result_uom=uom,
	)


def _pricing_rule(code, role, price_type, rate):
	_insert(
		"Alumdoor Pricing Rule",
		rule_code=code,
		rule_name=code.replace("-", " ").title(),
		sales_package="DEMO-ROLLING-FULL",
		component_role=role,
		price_type=price_type,
		priority=10,
		rate=rate,
		currency="VND",
	)


def _insert(doctype: str, **values):
	doc = frappe.new_doc(doctype)
	doc.update(values)
	doc.insert(ignore_permissions=True)
	return doc
