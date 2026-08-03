import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate, orderDocument } from "./helpers.mjs";

const now = "2026-08-03T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-0001",
    currency: "USD",
    items: ["ITEM-001"],
    warehouses: ["Stores"],
    accounts: ["Debtors", "Sales", "Output Tax"],
  });
  store.seedStock({ itemCode: "ITEM-001", warehouse: "Stores", qty: "20.000000", valuationRate: "5.00" });
  store.seedMaster("Vehicle", "TRUCK-1", "demo", { license_plate: "51C-12345" });
  store.seedMaster("Driver", "DRIVER-1", "demo", {
    full_name: "Nguyen Van Driver",
    email: "driver@example.com",
    address: "ADDR-DRIVER",
  });
  store.seedMaster("Address", "ADDR-DRIVER", "demo", { address_line1: "Depot" });
  store.seedMaster("Address", "ADDR-CUST", "demo", { address_line1: "Customer site" });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => now) };
}

async function seedDelivery(kernel) {
  await createAndSubmit(kernel, {
    doctype: "Sales Order",
    name: "SO-1",
    document: { ...orderDocument("2", "10"), transaction_date: "2026-08-03" },
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
      items: [{ row_id: "DNI-1", item_code: "ITEM-001", qty: "2", rate: "10", warehouse: "Stores" }],
    },
  });
}

function tripDocument(overrides = {}) {
  return {
    company: "Demo",
    vehicle: "TRUCK-1",
    driver: "DRIVER-1",
    departure_time: "2026-08-03T09:00:00.000Z",
    delivery_stops: [{
      row_id: "STOP-1",
      delivery_note: "DN-1",
      customer: "FORGED-CUSTOMER",
      address: "ADDR-CUST",
      distance: "12.5",
      estimated_arrival: "2026-08-03T09:45:00.000Z",
      visited: true,
    }],
    ...overrides,
  };
}

test("Delivery Trip requires submitted Delivery Notes and server-normalizes route lineage", async () => {
  const { store, kernel } = setup();
  await seedDelivery(kernel);
  await createAndSubmit(kernel, { doctype: "Delivery Trip", name: "TRIP-1", document: tripDocument({ delivery_stops: [{
    row_id: "STOP-1", delivery_note: "DN-1", customer: "CUST-0001", address: "ADDR-CUST", distance: "12.5", estimated_arrival: "2026-08-03T09:45:00.000Z", visited: true,
  }] }) });

  const trip = await store.getDocument("demo", "Delivery Trip", "TRIP-1");
  assert.equal(trip.status, "Scheduled");
  assert.equal(trip.data.driver_name, "Nguyen Van Driver");
  assert.equal(trip.data.driver_email, "driver@example.com");
  assert.equal(trip.data.total_distance, "12.50");
  assert.equal(trip.data.delivery_stops[0].customer, "CUST-0001");
  assert.equal(trip.data.delivery_stops[0].visited, false, "POD is separate evidence; clients cannot mark a trip stop visited directly");

  await assert.rejects(createAndSubmit(kernel, {
    doctype: "Delivery Trip",
    name: "TRIP-BAD",
    document: tripDocument({ delivery_stops: [
      { row_id: "1", delivery_note: "DN-1", customer: "WRONG", address: "ADDR-CUST", distance: "1" },
    ] }),
  }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("Proof of Delivery binds one stop, requires evidence, and supports cancel-amend correction", async () => {
  const { store, kernel } = setup();
  await seedDelivery(kernel);
  await createAndSubmit(kernel, {
    doctype: "Delivery Trip",
    name: "TRIP-1",
    document: tripDocument({ delivery_stops: [{ row_id: "STOP-1", delivery_note: "DN-1", customer: "CUST-0001", address: "ADDR-CUST", distance: "12.5" }] }),
  });

  const base = {
    delivery_trip: "TRIP-1",
    stop_row_id: "STOP-1",
    delivery_note: "DN-1",
    delivered_at: "2026-08-03T10:00:00.000Z",
    outcome: "Delivered",
    recipient_name: "  Customer Receiver  ",
    proof_reference: "  file:pod-photo-1  ",
  };
  await createAndSubmit(kernel, { doctype: "Proof of Delivery", name: "POD-TRIP-1-STOP-1", document: base });
  const pod = await store.getDocument("demo", "Proof of Delivery", "POD-TRIP-1-STOP-1");
  assert.equal(pod.status, "Delivered");
  assert.equal(pod.data.customer, "CUST-0001");
  assert.equal(pod.data.recipient_name, "Customer Receiver");
  assert.equal(pod.data.proof_reference, "file:pod-photo-1");

  await assert.rejects(mutate(kernel, {
    commandId: "pod-duplicate",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-STOP-1",
    action: "create",
    expectedVersion: null,
    document: base,
  }), (error) => error.code === "DOCUMENT_ALREADY_EXISTS");

  await mutate(kernel, {
    commandId: "pod-cancel",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-STOP-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  await mutate(kernel, {
    commandId: "pod-amend-create",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-STOP-1-1",
    action: "create",
    expectedVersion: null,
    amendedFrom: "POD-TRIP-1-STOP-1",
    document: { ...base, outcome: "Partial", exception_reason: "One package damaged" },
  });
  await mutate(kernel, {
    commandId: "pod-amend-submit",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-STOP-1-1",
    action: "submit",
    expectedVersion: 1,
    document: { ...base, outcome: "Partial", exception_reason: "One package damaged" },
  });
  const corrected = await store.getDocument("demo", "Proof of Delivery", "POD-TRIP-1-STOP-1-1");
  assert.equal(corrected.amended_from, "POD-TRIP-1-STOP-1");
  assert.equal(corrected.status, "Partial");
});

test("POD rejects pre-departure evidence, wrong stop lineage and failure without reason", async () => {
  const { kernel } = setup();
  await seedDelivery(kernel);
  await createAndSubmit(kernel, {
    doctype: "Delivery Trip",
    name: "TRIP-1",
    document: tripDocument({ delivery_stops: [{ row_id: "STOP-1", delivery_note: "DN-1", customer: "CUST-0001", address: "ADDR-CUST", distance: "12.5" }] }),
  });

  await assert.rejects(mutate(kernel, {
    commandId: "pod-early",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-STOP-1",
    action: "create",
    expectedVersion: null,
    document: {
      delivery_trip: "TRIP-1", stop_row_id: "STOP-1", delivery_note: "DN-1",
      delivered_at: "2026-08-03T08:59:59.000Z", outcome: "Delivered", recipient_name: "R", proof_reference: "P",
    },
  }), (error) => error.code === "VALIDATION_ERROR");

  await assert.rejects(mutate(kernel, {
    commandId: "pod-wrong-stop",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-OTHER",
    action: "create",
    expectedVersion: null,
    document: {
      delivery_trip: "TRIP-1", stop_row_id: "OTHER", delivery_note: "DN-1",
      delivered_at: "2026-08-03T10:00:00.000Z", outcome: "Delivered", recipient_name: "R", proof_reference: "P",
    },
  }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  await assert.rejects(mutate(kernel, {
    commandId: "pod-fail-no-reason",
    doctype: "Proof of Delivery",
    name: "POD-TRIP-1-STOP-1",
    action: "create",
    expectedVersion: null,
    document: {
      delivery_trip: "TRIP-1", stop_row_id: "STOP-1", delivery_note: "DN-1",
      delivered_at: "2026-08-03T10:00:00.000Z", outcome: "Failed",
    },
  }), (error) => error.code === "VALIDATION_ERROR");
});
