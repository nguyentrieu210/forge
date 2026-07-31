import test from "node:test";
import assert from "node:assert/strict";
import { inventoryCoordinatorKey, isInventoryCoordinatedCommand } from "../dist/apps/tenant-worker/src/inventory-coordinator.js";

function command({ doctype = "Stock Entry", action = "submit", company = "Demo", name = "DOC-1" } = {}) {
  return {
    schema_version: 1,
    command_id: `${name}-${action}`,
    tenant_id: "demo",
    aggregate: { doctype, name },
    action,
    expected_version: action === "submit" ? 1 : 2,
    payload_hash: "a".repeat(64),
    document: company ? { company } : {},
    actor: { user_id: "tester@example.test", roles: ["System Manager"] },
  };
}

test("different Stock Entry names in one company share the same inventory coordinator", () => {
  const first = inventoryCoordinatorKey(command({ name: "STE-A" }));
  const second = inventoryCoordinatorKey(command({ name: "STE-B" }));
  assert.equal(first, "inventory:demo:Demo");
  assert.equal(second, first);
});

test("Work Order and Stock Entry submit share the same company lock", () => {
  const workOrder = inventoryCoordinatorKey(command({ doctype: "Work Order", name: "WO-1" }));
  const stockEntry = inventoryCoordinatorKey(command({ doctype: "Stock Entry", name: "STE-1" }));
  assert.equal(workOrder, stockEntry);
});

test("companies remain isolated and names are safely encoded", () => {
  assert.equal(inventoryCoordinatorKey(command({ company: "Công ty A" })), "inventory:demo:C%C3%B4ng%20ty%20A");
  assert.notEqual(
    inventoryCoordinatorKey(command({ company: "Company A" })),
    inventoryCoordinatorKey(command({ company: "Company B" })),
  );
});

test("cancel resolves the company from the existing document when payload is empty", () => {
  const cancel = command({ action: "cancel", company: "", name: "STE-CANCEL" });
  assert.equal(inventoryCoordinatorKey(cancel, { company: "Demo" }), "inventory:demo:Demo");
});

test("draft mutations and unrelated doctypes stay on their ordinary document key", () => {
  const create = command({ action: "create" });
  const sales = command({ doctype: "Sales Order" });
  assert.equal(inventoryCoordinatorKey(create), null);
  assert.equal(inventoryCoordinatorKey(sales), null);
  assert.equal(isInventoryCoordinatedCommand(create), false);
  assert.equal(isInventoryCoordinatedCommand(command()), true);
});
