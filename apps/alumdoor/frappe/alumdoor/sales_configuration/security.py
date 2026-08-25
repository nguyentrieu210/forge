from __future__ import annotations

from collections.abc import Iterable

import frappe
from frappe import _


OWNER_ROLE = "Alumdoor Owner"
ACCOUNTANT_ROLE = "Alumdoor Accountant"
SALES_ROLE = "Alumdoor Sales"
OPERATIONAL_ROLES = {OWNER_ROLE, ACCOUNTANT_ROLE, SALES_ROLE}


def current_roles() -> set[str]:
	roles = set(frappe.get_roles(frappe.session.user))
	# Frappe trả cho Administrator mọi Role tồn tại dù chưa được gán. Với ba role nghiệp vụ,
	# điều đó sẽ biến tài khoản kỹ thuật thành Owner + Accountant + Sales cùng lúc và làm test
	# quyền trở nên giả. Chỉ công nhận role Alumdoor có bản ghi Has Role thật.
	explicit_operational = set(
		frappe.get_all(
			"Has Role",
			filters={"parenttype": "User", "parent": frappe.session.user, "role": ["in", list(OPERATIONAL_ROLES)]},
			pluck="role",
		)
	)
	return roles.difference(OPERATIONAL_ROLES).union(explicit_operational)


def require_any_role(roles: Iterable[str], message: str | None = None) -> set[str]:
	required = set(roles)
	actual = current_roles()
	if not actual.intersection(required):
		frappe.throw(message or _("Bạn không có quyền thực hiện thao tác này"), frappe.PermissionError)
	return actual


def require_operational() -> set[str]:
	return require_any_role(OPERATIONAL_ROLES, _("Chỉ Chủ xưởng, Kế toán hoặc Sale được thao tác đơn hàng"))


def require_owner() -> set[str]:
	return require_any_role({OWNER_ROLE}, _("Chỉ Chủ xưởng được duyệt ngoại lệ"))


def require_owner_or_accountant() -> set[str]:
	return require_any_role(
		{OWNER_ROLE, ACCOUNTANT_ROLE},
		_("Chỉ Chủ xưởng hoặc Kế toán được thực hiện thao tác này"),
	)


def can_cancel_order(doc) -> None:
	roles = require_operational()
	if OWNER_ROLE in roles or ACCOUNTANT_ROLE in roles:
		return
	if SALES_ROLE in roles and doc.owner == frappe.session.user:
		return
	frappe.throw(_("Sale chỉ được hủy đơn do chính mình tạo"), frappe.PermissionError)
