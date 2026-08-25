from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.tests import IntegrationTestCase

from alumdoor.sales_configuration.security import (
	ACCOUNTANT_ROLE,
	OWNER_ROLE,
	SALES_ROLE,
	can_cancel_order,
	current_roles,
	require_owner,
)
from alumdoor.sales_configuration.trust import check_expected_modified, execute_once, record_audit


class TestOperationalSecurity(IntegrationTestCase):
	def test_administrator_only_gets_explicit_operational_roles(self):
		frappe.set_user("Administrator")
		roles = current_roles()
		self.assertIn(OWNER_ROLE, roles)
		self.assertNotIn(ACCOUNTANT_ROLE, roles)
		self.assertNotIn(SALES_ROLE, roles)

	def test_real_sales_user_is_blocked_from_owner_approval_path(self):
		email = f"alumdoor-sale-test-{uuid4().hex[:8]}@example.com"
		user = frappe.new_doc("User")
		user.update({"email": email, "first_name": "Sale Test", "enabled": 1, "send_welcome_email": 0})
		user.append("roles", {"role": SALES_ROLE})
		user.insert(ignore_permissions=True)
		try:
			frappe.set_user(email)
			self.assertIn(SALES_ROLE, frappe.get_roles())
			with self.assertRaises(frappe.PermissionError):
				require_owner()
		finally:
			frappe.set_user("Administrator")

	@patch("alumdoor.sales_configuration.security.current_roles", return_value={SALES_ROLE})
	def test_sales_cannot_approve(self, _roles):
		with self.assertRaises(frappe.PermissionError):
			require_owner()

	@patch("alumdoor.sales_configuration.security.current_roles", return_value={SALES_ROLE})
	def test_sales_can_cancel_only_own_order(self, _roles):
		with self.assertRaises(frappe.PermissionError):
			can_cancel_order(SimpleNamespace(owner="another@example.com"))
		can_cancel_order(SimpleNamespace(owner=frappe.session.user))

	@patch("alumdoor.sales_configuration.security.current_roles", return_value={ACCOUNTANT_ROLE})
	def test_accountant_can_cancel_any_order(self, _roles):
		can_cancel_order(SimpleNamespace(owner="another@example.com"))

	@patch("alumdoor.sales_configuration.security.current_roles", return_value={OWNER_ROLE})
	def test_owner_can_approve(self, _roles):
		require_owner()


class TestTrustLayer(IntegrationTestCase):
	def test_expected_modified_is_mandatory_and_exact(self):
		doc = SimpleNamespace(modified="2026-08-25 10:00:00.000000")
		with self.assertRaises(frappe.TimestampMismatchError):
			check_expected_modified(doc, None)
		with self.assertRaises(frappe.TimestampMismatchError):
			check_expected_modified(doc, "2026-08-25 09:59:59.000000")
		check_expected_modified(doc, "2026-08-25 10:00:00.000000")

	def test_idempotency_replays_same_response_and_rejects_different_payload(self):
		key = str(uuid4())
		calls = []

		def operation(request_id):
			calls.append(request_id)
			return {"name": "DH-TEST", "ok": True}

		first = execute_once("sales_order.create", key, {"customer": "KH-1"}, operation)
		second = execute_once("sales_order.create", key, {"customer": "KH-1"}, operation)
		self.assertEqual(first, second)
		self.assertEqual(len(calls), 1)
		with self.assertRaises(frappe.DuplicateEntryError):
			execute_once("sales_order.create", key, {"customer": "KH-2"}, operation)

	def test_audit_event_records_actor_action_and_request(self):
		request_id = uuid4().hex[:8].upper()
		record_audit(
			"sales_order.cancel",
			"Alumdoor Sales Order",
			"DH-TEST",
			request_id,
			before={"status": "Draft"},
			after={"status": "Cancelled"},
			reason="Khách đổi kế hoạch",
		)
		row = frappe.db.get_value(
			"Alumdoor Audit Event",
			{"request_id": request_id},
			["actor", "action", "reference_name", "reason"],
			as_dict=True,
		)
		self.assertEqual(row.actor, frappe.session.user)
		self.assertEqual(row.action, "sales_order.cancel")
		self.assertEqual(row.reference_name, "DH-TEST")
		self.assertEqual(row.reason, "Khách đổi kế hoạch")
