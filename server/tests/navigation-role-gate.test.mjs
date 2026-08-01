import test from "node:test";
import assert from "node:assert/strict";
import { hasRequiredNavRole } from "../dist/packages/frappe-api/src/router.js";

const dailyLedgerRoles = ["General Accountant", "Chief Accountant", "Director"];

test("sensitive navigation requires an explicit business role", () => {
  assert.equal(hasRequiredNavRole({ user_id: "general@example.test", roles: ["General Accountant"] }, dailyLedgerRoles), true);
  assert.equal(hasRequiredNavRole({ user_id: "system@example.test", roles: ["System Manager"] }, dailyLedgerRoles), false);
  assert.equal(hasRequiredNavRole({ user_id: "accounts@example.test", roles: ["Accounts Manager"] }, dailyLedgerRoles), false);
  assert.equal(hasRequiredNavRole({ user_id: "Administrator", roles: [] }, dailyLedgerRoles), true);
  assert.equal(hasRequiredNavRole({ user_id: "stock@example.test", roles: ["Stock User"] }, undefined), true);
});
