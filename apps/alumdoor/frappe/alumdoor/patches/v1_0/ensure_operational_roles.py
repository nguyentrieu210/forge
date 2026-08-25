from __future__ import annotations

import frappe

from alumdoor.sales_configuration.security import ACCOUNTANT_ROLE, OWNER_ROLE, SALES_ROLE


def execute() -> None:
	for role_name in (OWNER_ROLE, ACCOUNTANT_ROLE, SALES_ROLE):
		if not frappe.db.exists("Role", role_name):
			role = frappe.new_doc("Role")
			role.role_name = role_name
			role.desk_access = 1
			role.insert(ignore_permissions=True)

	# Administrator vẫn là tài khoản kỹ thuật, nhưng site phát triển phải có một Chủ xưởng
	# thật để kiểm thử đúng cùng permission path với người dùng vận hành.
	if frappe.db.exists("User", "Administrator"):
		user = frappe.get_doc("User", "Administrator")
		if not any(row.role == OWNER_ROLE for row in user.roles):
			user.append("roles", {"role": OWNER_ROLE})
			user.save(ignore_permissions=True)
