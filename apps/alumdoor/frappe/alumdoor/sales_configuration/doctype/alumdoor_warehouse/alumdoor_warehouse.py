from frappe.utils.nestedset import NestedSet


class AlumdoorWarehouse(NestedSet):
	nsm_parent_field = "parent_warehouse"
