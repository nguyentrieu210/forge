from frappe.utils.nestedset import NestedSet


class AlumdoorItemGroup(NestedSet):
	nsm_parent_field = "parent_item_group"
