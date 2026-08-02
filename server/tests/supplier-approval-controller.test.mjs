import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementPurchaseOrderController,
  ProcurementRequestForQuotationController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const actor = { user_id: "Administrator", roles: ["System Manager", "Purchase Manager"] };
const now = "2026-08-03T00:00:00.000Z";

function seed(store, supplierData) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, supplierData);
  store.seedMaster("Item", "ITEM-A", tenant, { stock_uom: "Kg", default_purchase_uom: "Kg" });
}

async function plan(controller, store, action, name, document) {
  const existing = await store.getDocument(tenant, controller.doctype, name);
  return controller.buildPlan({
    command: {
      schema_version: 1,
      command_id: `${name}-${action}`,
      tenant_id: tenant,
      aggregate: { doctype: controller.doctype, name },
      action,
      expected_version: existing?.version ?? null,
      payload_hash: "0".repeat(64),
      actor,
      document,
    },
    existing,
    now,
    nextVersion: (existing?.version ?? 0) + 1,
    reader: store,
  });
}

async function apply(controller, store, action, name, document) {
  const mutation = await plan(controller, store, action, name, document);
  await store.execute(mutation);
  return store.getDocument(tenant, controller.doctype, name);
}

function rfq() {
  return {
    company: "ACME",
    transaction_date: "2026-08-03",
    suppliers: [{ row_id: "S-1", supplier: "SUP-A" }],
    items: [{ row_id: "I-1", item_code: "ITEM-A", qty: 10, uom: "Kg" }],
  };
}

function po() {
  return {
    supplier: "SUP-A",
    supplier_group: "Aluminium",
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-03",
    taxes: [],
    items: [{ row_id: "PO-1", item_code: "ITEM-A", qty: 10, uom: "Kg", rate: 5 }],
  };
}

test("legacy supplier without procurement_status remains usable", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store, {});
  const rfqController = new ProcurementRequestForQuotationController();
  const draft = await apply(rfqController, store, "create", "RFQ-LEGACY", rfq());
  const submitted = await apply(rfqController, store, "submit", "RFQ-LEGACY", draft.data);
  assert.equal(submitted.docstatus, 1);
});

test("RFQ submit rejects supplier whose procurement approval is pending", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store, { procurement_status: "Pending" });
  const controller = new ProcurementRequestForQuotationController();
  const draft = await apply(controller, store, "create", "RFQ-PENDING", rfq());
  await assert.rejects(() => plan(controller, store, "submit", "RFQ-PENDING", draft.data), /not approved/);
});

test("PO submit rejects supplier outside approved category", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store, {
    procurement_status: "Approved",
    approved_from: "2026-01-01",
    approved_until: "2026-12-31",
    approved_categories: ["Glass"],
  });
  const controller = new ProcurementPurchaseOrderController();
  const draft = await apply(controller, store, "create", "PO-CATEGORY", po());
  await assert.rejects(() => plan(controller, store, "submit", "PO-CATEGORY", draft.data), /not approved for category Aluminium/);
});

test("PO submit accepts in-date supplier approved for the requested category", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store, {
    procurement_status: "Approved",
    approved_from: "2026-01-01",
    approved_until: "2026-12-31",
    approved_categories: ["Aluminium", "Glass"],
  });
  const controller = new ProcurementPurchaseOrderController();
  const draft = await apply(controller, store, "create", "PO-APPROVED", po());
  const submitted = await apply(controller, store, "submit", "PO-APPROVED", draft.data);
  assert.equal(submitted.docstatus, 1);
});
