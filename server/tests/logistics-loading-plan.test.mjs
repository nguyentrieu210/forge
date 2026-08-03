import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate, orderDocument } from "./helpers.mjs";

const now = () => "2026-08-03T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-0001",
    currency: "USD",
    items: ["ITEM-001", "ITEM-002"],
    warehouses: ["Stores"],
    accounts: ["Debtors", "Sales", "Output Tax"],
  });
  store.seedStock({ itemCode: "ITEM-001", warehouse: "Stores", qty: "20.000000", valuationRate: "5.00" });
  store.seedStock({ itemCode: "ITEM-002", warehouse: "Stores", qty: "20.000000", valuationRate: "3.00" });
  store.seedMaster("Vehicle", "TRUCK-1", "demo", { license_plate: "51C-12345" });
  store.seedMaster("Driver", "DRIVER-1", "demo", { full_name: "Driver One" });
  store.seedMaster("Address", "ADDR-CUST", "demo", { address_line1: "Customer" });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function seedTrip(kernel) {
  await createAndSubmit(kernel, {
    doctype: "Sales Order",
    name: "SO-1",
    document: {
      ...orderDocument("2", "10"),
      transaction_date: "2026-08-03",
      items: [
        { row_id: "SOI-1", item_code: "ITEM-001", qty: "2", rate: "10" },
        { row_id: "SOI-2", item_code: "ITEM-002", qty: "3", rate: "6" },
      ],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Delivery Note",
    name: "DN-1",
    document: {
      customer: "CUST-0001",
      company: "Demo",
      currency: "USD",
      posting_at: "2026-08-03T08:30:00.000Z",
      against_sales_order: "SO-1",
      issue_purpose: "Bán hàng",
      items: [
        { row_id: "DNI-1", item_code: "ITEM-001", qty: "2", rate: "10", warehouse: "Stores" },
        { row_id: "DNI-2", item_code: "ITEM-002", qty: "3", rate: "6", warehouse: "Stores" },
      ],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Delivery Trip",
    name: "TRIP-1",
    document: {
      company: "Demo",
      vehicle: "TRUCK-1",
      driver: "DRIVER-1",
      departure_time: "2026-08-03T09:00:00.000Z",
      delivery_stops: [{ row_id: "STOP-1", delivery_note: "DN-1", customer: "CUST-0001", address: "ADDR-CUST", distance: "12.5" }],
    },
  });
}

test("Loading Plan derives every load row from submitted Delivery Notes and ignores forged client rows", async () => {
  const { store, kernel } = setup();
  await seedTrip(kernel);
  await createAndSubmit(kernel, {
    doctype: "Loading Plan",
    name: "LOAD-TRIP-1",
    document: {
      delivery_trip: "TRIP-1",
      loaded_at: "2026-08-03T08:50:00.000Z",
      company: "FORGED",
      vehicle: "FORGED",
      items: [{ row_id: "FAKE", delivery_note: "FAKE", item_code: "FAKE", qty: "999", warehouse: "FAKE" }],
    },
  });
  const loading = await store.getDocument("demo", "Loading Plan", "LOAD-TRIP-1");
  assert.equal(loading.status, "Loaded");
  assert.equal(loading.data.company, "Demo");
  assert.equal(loading.data.vehicle, "TRUCK-1");
  assert.deepEqual(
    loading.data.items.map((row) => [row.delivery_note, row.item_code, row.qty, row.warehouse]),
    [["DN-1", "ITEM-001", "2.000000", "Stores"], ["DN-1", "ITEM-002", "3.000000", "Stores"]],
  );
});

test("Loading Plan follows cancel-amend correction and rejects nonexistent submitted trip", async () => {
  const { store, kernel } = setup();
  await seedTrip(kernel);
  await createAndSubmit(kernel, { doctype: "Loading Plan", name: "LOAD-TRIP-1", document: { delivery_trip: "TRIP-1", loaded_at: "2026-08-03T08:50:00.000Z" } });
  await mutate(kernel, { commandId: "load-cancel", doctype: "Loading Plan", name: "LOAD-TRIP-1", action: "cancel", expectedVersion: 2, document: {} });
  await createAndSubmit(kernel, { doctype: "Loading Plan", name: "LOAD-TRIP-1-1", amendedFrom: "LOAD-TRIP-1", document: { delivery_trip: "TRIP-1", loaded_at: "2026-08-03T08:55:00.000Z" } });
  assert.equal((await store.getDocument("demo", "Loading Plan", "LOAD-TRIP-1-1")).amended_from, "LOAD-TRIP-1");

  await assert.rejects(createAndSubmit(kernel, { doctype: "Loading Plan", name: "LOAD-MISSING", document: { delivery_trip: "MISSING", loaded_at: "2026-08-03T08:55:00.000Z" } }), (error) => error.code === "VALIDATION_ERROR" || error.code === "REFERENCE_VALIDATION_FAILED");
});
