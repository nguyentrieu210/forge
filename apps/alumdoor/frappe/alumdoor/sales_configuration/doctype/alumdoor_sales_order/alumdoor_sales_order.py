from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class AlumdoorSalesOrder(Document):
	def autoname(self):
		from frappe.model.naming import make_autoname

		self.name = make_autoname("DH-.YYYY.-.#####")
		self.order_code = self.name

	def validate(self):
		if not getattr(frappe.flags, "in_alumdoor_sales_order_service", False):
			frappe.throw(_("Đơn hàng chỉ được ghi qua dịch vụ nghiệp vụ Alumdoor"), frappe.PermissionError)
		if not self.items:
			frappe.throw(_("Đơn hàng phải có ít nhất một dòng hàng"))
		if flt(self.vat_percent) < 0 or flt(self.vat_percent) > 100:
			frappe.throw(_("VAT phải nằm trong khoảng 0 đến 100%"))
		if flt(self.deposit_amount) < 0 or flt(self.deposit_amount) > flt(self.grand_total):
			frappe.throw(_("Tiền cọc phải từ 0 đến tổng thanh toán"))
		if self.is_stock_locked and self.has_value_changed("is_stock_locked") and not getattr(frappe.flags, "in_alumdoor_stock_service", False):
			frappe.throw(_("Chỉ xác nhận xuất kho mới được khóa đơn"), frappe.PermissionError)
