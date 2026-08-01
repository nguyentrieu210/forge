import test from "node:test";
import assert from "node:assert/strict";
import {
  inventoryCoordinatorKey,
  isInventoryCoordinatedCommand,
  resolveInventoryCoordinatorKey,
} from "../dist/apps/tenant-worker/src/inventory-coordinator.js";

function command({ doctype = "Stock Entry", action = "submit", company = "Demo", name = "DOC-1", document } = {}) {
  return {
    schema_version: 1,
    command_id: `${name}-${action}`,
    tenant_id: "demo",
    aggregate: { doctype, name },
    action,
    expected_version: action === "create" ? null : 2,
    payload_hash: "a".repeat(64),
    document: document ?? (company ? { company } : {}),
    actor: { user_id: "tester@example.test", roles: ["System Manager"] },
  };
}

function reader({ sourceCompany = "Demo", warehouseCompany = "Demo" } = {}) {
  return {
    async getDocument(_tenantId, doctype, name) {
      if (doctype === "Sales Order" && name === "SO-1") {
        return { data: sourceCompany ? { company: sourceCompany } : {} };
      }
      return null;
    },
    async getMasterRecordData(_tenantId, recordType, name) {
      if (recordType === "Warehouse" && name === "KHO-1") {
        return warehouseCompany ? { company: warehouseCompany } : {};
      }
      return null;
    },
    async listMasterRecordData(_tenantId, recordType) {
      return recordType === "Company" ? [{ name: "Demo", data: {} }] : [];
    },
  };
}

test("different Stock Entry names in one company share the same inventory coordinator", () => {
  const first = inventoryCoordinatorKey(command({ name: "STE-A" }));
  const second = inventoryCoordinatorKey(command({ name: "STE-B" }));
  assert.equal(first, "inventory:demo:Demo");
  assert.equal(second, first);
});

test("Work Order, Cut Order and Stock Reconciliation submit share the Stock Entry company lock", () => {
  const stockEntry = inventoryCoordinatorKey(command({ doctype: "Stock Entry", name: "STE-1" }));
  for (const doctype of ["Work Order", "Cut Order", "Stock Reconciliation"]) {
    assert.equal(inventoryCoordinatorKey(command({ doctype, name: `${doctype}-1` })), stockEntry);
  }
});

test("reservation create resolves source company and shares the inventory lock", async () => {
  const reservation = command({
    doctype: "Stock Reservation",
    action: "create",
    company: "",
    name: "GC-1",
    document: {
      item_code: "NHOM-1",
      source_doctype: "Sales Order",
      source_name: "SO-1",
      warehouse: "KHO-1",
      qty_reserved: 2,
      min_length_m: 3.5,
    },
  });
  assert.equal(inventoryCoordinatorKey(reservation), null);
  assert.equal(await resolveInventoryCoordinatorKey(reservation, reader()), "inventory:demo:Demo");
  assert.equal(isInventoryCoordinatedCommand(reservation), true);
});

test("reservation warehouse cannot cross the source company boundary", async () => {
  const reservation = command({
    doctype: "Stock Reservation",
    action: "create",
    company: "",
    name: "GC-CROSS",
    document: {
      item_code: "NHOM-1",
      source_doctype: "Sales Order",
      source_name: "SO-1",
      warehouse: "KHO-1",
      qty_reserved: 1,
      min_length_m: 3.5,
    },
  });
  await assert.rejects(
    () => resolveInventoryCoordinatorKey(reservation, reader({ sourceCompany: "Company A", warehouseCompany: "Company B" })),
    /không thuộc công ty Company A/,
  );
});

test("reservation terminal transitions stay document-local because they no longer compete for availability", () => {
  const released = command({ doctype: "Stock Reservation", action: "save", company: "Demo", name: "GC-1" });
  const impossibleSubmit = command({ doctype: "Stock Reservation", action: "submit", company: "Demo", name: "GC-1" });
  assert.equal(isInventoryCoordinatedCommand(released), true);
  assert.equal(isInventoryCoordinatedCommand(impossibleSubmit), false);
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
