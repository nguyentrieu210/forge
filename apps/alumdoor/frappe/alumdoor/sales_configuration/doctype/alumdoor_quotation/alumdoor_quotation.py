from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from alumdoor.sales_configuration.services.catalog_service import validate_item_color


class AlumdoorQuotation(Document):
	def autoname(self):
		from frappe.model.naming import make_autoname

		self.name = make_autoname("BG-.YYYY.-.#####")
		self.quotation_code = self.name

	def validate(self):
		if not self.items:
			frappe.throw(_("Báo giá phải có ít nhất một dòng hàng"))
		kind, enabled = frappe.db.get_value("Alumdoor Partner", self.customer, ["partner_kind", "enabled"]) or (None, None)
		if not enabled or kind not in {"Customer", "Both"}:
			frappe.throw(_("Đối tác được chọn chưa có vai trò khách hàng đang sử dụng"))
		if flt(self.vat_percent) < 0 or flt(self.vat_percent) > 100:
			frappe.throw(_("VAT phải nằm trong khoảng 0 đến 100%"))

		self.total_area = self.subtotal = self.discount_amount = self.surcharge_amount = 0
		for row in self.items:
			validate_item_color(row.item, row.color)
			quantity = max(flt(row.qty or row.set_count or 1), 0)
			width = flt(row.cut_width_m if row.price_variant == "TACH_MON" else row.width_pb_nhua_m or row.width_pb_ray_m)
			self.total_area += width * flt(row.height_m) * quantity
			self.subtotal += flt(row.amount)
			self.discount_amount += flt(row.discount_amount)
			adjustment = flt(row.adjustment_amount)
			if adjustment >= 0:
				self.surcharge_amount += adjustment
			else:
				self.discount_amount += abs(adjustment)
		self.vat_amount = (self.subtotal - self.discount_amount + self.surcharge_amount) * flt(self.vat_percent) / 100
		self.grand_total = self.subtotal - self.discount_amount + self.surcharge_amount + self.vat_amount
		self.outstanding_amount = self.grand_total - flt(self.deposit_amount)
