import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { createFrappeSemanticAccessController } from "../dist/packages/semantic/src/frappe-access.js";

const registry = new SemanticModelRegistry([{
  id: "sales.orders",
  label: "Sales orders",
  source: { kind: "doctype", doctype: "Sales Order", state: "submitted" },
  grain: "one submitted sales order",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" }],
  metrics: [{ id: "count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }],
  maxRows: 100,
}]);

test("Frappe bridge delegates report permission and read scope for the same actor", async () => {
  const actor = { user_id: "alice@example.com", roles: ["Sales User"] };
  const events = [];
  const permissions = {
    async assert(input) { events.push(["assert", input]); },
    async getReadScope(receivedActor, tenantId, doctype) {
      events.push(["scope", receivedActor, tenantId, doctype]);
      return {
        mode: "all",
        actor_user_id: receivedActor.user_id,
        user_permissions: [{ allow_doctype: "Branch", fields: ["branch"], allowed_values: ["BR-1"] }],
      };
    },
  };
  const access = createFrappeSemanticAccessController(registry, permissions, actor);
  const scope = await access.authorize({ tenantId: "tenant-a", model: "sales.orders", permission: { doctype: "Sales Order", action: "report" } });
  assert.deepEqual(events[0], ["assert", { actor, tenantId: "tenant-a", doctype: "Sales Order", action: "report" }]);
  assert.deepEqual(events[1], ["scope", actor, "tenant-a", "Sales Order"]);
  assert.equal(scope.actor_user_id, "alice@example.com");
  assert.deepEqual(scope.user_permissions[0].allowed_values, ["BR-1"]);
});
