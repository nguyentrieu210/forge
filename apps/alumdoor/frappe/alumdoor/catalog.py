"""Permission-aware health measurements for Alumdoor master data."""

import frappe


_MASTER_DOCTYPES = (
	"Alumdoor Item",
	"Alumdoor Item Group",
	"Alumdoor UOM",
	"Alumdoor Warehouse",
	"Door Type",
	"Door System",
	"Configuration Attribute",
	"Surface Finish",
	"Alumdoor Color",
	"Alumdoor Material Specification",
	"Alumdoor Partner Group",
	"Alumdoor Partner",
	"Alumdoor Department",
	"Alumdoor Employee",
	"Door Formula",
	"Sales Package",
	"Component Rule",
	"Alumdoor Price List",
	"Alumdoor Item Price",
	"Alumdoor Pricing Rule",
	"Alumdoor Operation Standard",
	"Alumdoor Work Shift",
	"Alumdoor Fault Reason",
	"Alumdoor Warranty Policy",
	"Alumdoor Coating Rate",
	"Alumdoor Money Account",
	"Alumdoor Cashflow Category",
)


@frappe.whitelist()
def readiness():
	result = {}
	for doctype in _MASTER_DOCTYPES:
		if not frappe.db.exists("DocType", doctype) or not frappe.has_permission(doctype, "read"):
			continue
		rows = frappe.get_list(doctype, fields=[{"COUNT": "*"}], limit=1) or []
		total = int(next(iter(rows[0].values()), 0) or 0) if rows else 0
		result[doctype] = {"total": total}
	return result
