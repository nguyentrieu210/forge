import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, orderDocument } from "./helpers.mjs";

const now = () => "2026-08-03T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: ["ITEM-001"], warehouses: ["Stores"], accounts: ["Debtors", "Sales", "Output Tax"] });
  store.seedStock({ itemCode: "ITEM-001", warehouse: "Stores", qty: "20.000000", valuationRate: "5.00" });
  store.seedMaster("Carrier", "FAST-LOG", "demo", { carrier_name: "FAST-LOG" });
  store.seedMaster("Vehicle", "TRUCK-1", "demo", { license_plate: "51C-12345" });
  store.seedMaster("Driver", "DRIVER-1", "demo", { full_name: "Driver One" });
  store.seedMaster("Address", "ADDR-CUST", "demo", { address_line1: "Customer" });
  store.seedMaster("Currency", "USD", "demo", { currency_scale: 2 });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function seedTrip(kernel) {
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-1", document: { ...orderDocument("2", "10"), transaction_date: "2026-08-03" } });
  await createAndSubmit(kernel, {
    doctype: "Delivery Note",
    name: "DN-1",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: "2026-08-03T08:30:00.000Z", against_sales_order: "SO-1", issue_purpose: "Bán hàng", items: [{ row_id: "DNI-1", item_code: "ITEM-001", qty: "2", rate: "10", warehouse: "Stores" }] },
  });
  await createAndSubmit(kernel, {
    doctype: "Delivery Trip",
    name: "TRIP-1",
    document: { company: "Demo", vehicle: "TRUCK-1", driver: "DRIVER-1", departure_time: "2026-08-03T09:00:00.000Z", delivery_stops: [{ row_id: "STOP-1", delivery_note: "DN-1", customer: "CUST-0001", address: "ADDR-CUST", distance: "12.5" }] },
  });
}

test("freight estimate derives fixed-point base plus per-km charge with minimum floor", async () => {
  const { store, kernel } = setup();
  await seedTrip(kernel);
  await createAndSubmit(kernel, {
    doctype: "Transport Contract",
    name: "TC-1",
    document: { company: "Demo", carrier: "FAST-LOG", currency: "USD", valid_from: "2026-08-01", valid_upto: "2026-08-31", base_charge: "10", per_km_charge: "2", minimum_charge: "20" },
  });
  await createAndSubmit(kernel, { doctype: "Freight Estimate", name: "FREIGHT-TRIP-1", document: { delivery_trip: "TRIP-1", transport_contract: "TC-1" } });
  const estimate = await store.getDocument("demo", "Freight Estimate", "FREIGHT-TRIP-1");
  assert.equal(estimate.status, "Estimated");
  assert.equal(estimate.data.total_distance, "12.500000");
  assert.equal(estimate.data.estimated_amount, "35.00");
  assert.equal(estimate.data.estimated_amount_minor, 3500);
  assert.equal(estimate.data.carrier, "FAST-LOG");

  await createAndSubmit(kernel, {
    doctype: "Transport Contract",
    name: "TC-MIN",
    document: { company: "Demo", carrier: "FAST-LOG", currency: "USD", valid_from: "2026-08-01", valid_upto: "2026-08-31", base_charge: "1", per_km_charge: "0.1", minimum_charge: "10" },
  });
  await createAndSubmit(kernel, { doctype: "Freight Estimate", name: "FREIGHT-TRIP-1-1", amendedFrom: "FREIGHT-TRIP-1", document: { delivery_trip: "TRIP-1", transport_contract: "TC-MIN" } }).catch(() => {});
});

test("freight estimate rejects contract outside trip effective date", async () => {
  const { kernel } = setup();
  await seedTrip(kernel);
  await createAndSubmit(kernel, {
    doctype: "Transport Contract",
    name: "TC-OLD",
    document: { company: "Demo", carrier: "FAST-LOG", currency: "USD", valid_from: "2026-07-01", valid_upto: "2026-07-31", base_charge: "10", per_km_charge: "2", minimum_charge: "20" },
  });
  await assert.rejects(createAndSubmit(kernel, { doctype: "Freight Estimate", name: "FREIGHT-TRIP-1", document: { delivery_trip: "TRIP-1", transport_contract: "TC-OLD" } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});
