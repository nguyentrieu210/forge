from frappe.www.login import get_context as frappe_login_get_context


def get_context(context):
	"""Reuse Frappe's native login context and authentication flow."""
	return frappe_login_get_context(context)
