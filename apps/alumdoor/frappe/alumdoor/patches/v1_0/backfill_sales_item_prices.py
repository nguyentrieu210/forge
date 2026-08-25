from __future__ import annotations

import frappe
from frappe.utils import flt

from alumdoor.sales_configuration.services.quotation_service import _fallback_basis, _item_mode


SOURCE_REFERENCE = "danh mục sản phẩm.xlsx · Sheet1 · Giá niêm yết/Giá có ray"
SELLING_PRICE_LISTS = ("BG_DAI_LY", "BG_KHACH_LE")


def _variants(item) -> list[tuple[str, float]]:
	if flt(item.rate_with_rail) > 0:
		return [("CHI_LA", flt(item.standard_selling_rate)), ("TANG_RAY", flt(item.rate_with_rail))]
	mode, _ = _item_mode(item.name)
	return [(mode or "STANDARD", flt(item.standard_selling_rate))]


def execute():
	if not frappe.db.exists("DocType", "Alumdoor Item Price"):
		return
	items = frappe.get_all(
		"Alumdoor Item",
		filters={"is_sales_item": 1, "disabled": 0},
		fields=["name", "item_group", "stock_uom", "standard_selling_rate", "rate_with_rail"],
		limit_page_length=0,
	)
	for price_list in SELLING_PRICE_LISTS:
		if not frappe.db.exists("Alumdoor Price List", price_list):
			continue
		for item in items:
			basis = _fallback_basis(item.stock_uom, item.item_group)
			for variant, rate in _variants(item):
				if rate <= 0 or frappe.db.exists(
					"Alumdoor Item Price",
					{"price_list": price_list, "item": item.name, "price_variant": variant, "enabled": 1},
				):
					continue
				doc = frappe.new_doc("Alumdoor Item Price")
				doc.update({
					"price_list": price_list,
					"item": item.name,
					"price_variant": variant,
					"uom": item.stock_uom,
					"price_basis": basis,
					"rate": rate,
					"min_qty": 0,
					"enabled": 1,
					"source_reference": SOURCE_REFERENCE,
				})
				doc.insert(ignore_permissions=True)
