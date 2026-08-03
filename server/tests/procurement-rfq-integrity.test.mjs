import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementPurchaseOrderController,
  ProcurementSupplierQuotationController,
  RequestForQuotationController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const actor = { user_id: "Administrator", roles: ["System Manager", "Purchase Manager"] };
const now = "2026-08-03T00:00:00.000Z";

function seedMasters(store) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, {});
  store.seedMaster("Supplier", "SUP-B", tenant, {});
  store.seedMaster("Item", "ITEM-A", tenant, { stock_uom: "Kg", default_purchase_uom: "Kg" });
  store.seedMaster("Item", "ITEM-B", tenant, { stock_uom: "Cái", default_purchase_uom: "Cái" });
}

async function apply(controller, store, action, name, document, commandId) {
  const existing = await store.getDocument(tenant, controller.doctype, name);
  const command = {
    schema_version: 1,
    command_id: commandId,
    tenant_id: tenant,
    aggregate: { doctype: controller.doctype, name },
    action,
    expected_version: existing?.version ?? null,
    payload_hash: "0".repeat(64),
    actor,
    document,
  };
  const plan = await controller.buildPlan({
    command,
    existing,
    now,
    nextVersion: (existing?.version ?? 0) + 1,
    reader: store,
  });
  await store.execute(plan);
  return store.getDocument(tenant, controller.doctype, name);
}

function rfqData() {
  return {
    company: "ACME",
    transaction_date: "2026-08-01",
    suppliers: [
      { row_id: "SUP-1", supplier: "SUP-A" },
      { row_id: "SUP-2", supplier: "SUP-B" },
    ],
    items: [
      { row_id: "RFQ-1", item_code: "ITEM-A", qty: 10, uom: "Kg" },
      { row_id: "RFQ-2", item_code: "ITEM-B", qty: 5, uom: "Cái" },
    ],
  };
}

function quotationData(overrides = {}) {
  return {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-02",
    valid_till: "2026-08-31",
    request_for_quotation: "RFQ-001",
    taxes: [],
    items: [
      {
        row_id: "SQ-ROW-1",
        request_for_quotation_item: "RFQ-1",
        item_code: "ITEM-A",
        qty: 10,
        uom: "Kg",
        rate: 5,
      },
      {
        row_id: "SQ-ROW-2",
        request_for_quotation_item: "RFQ-2",
        item_code: "ITEM-B",
        qty: 5,
        uom: "Cái",
        rate: 20,
      },
    ],
    ...overrides,
  };
}

function purchaseOrderData(overrides = {}) {
  return {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-03",
    supplier_quotation: "SQ-001",
    taxes: [],
    items: [
      {
        row_id: "PO-ROW-1",
        supplier_quotation_item: "SQ-ROW-1",
        item_code: "ITEM-A",
        qty: 8,
        uom: "Kg",
        rate: 5,
      },
      {
        row_id: "PO-ROW-2",
        supplier_quotation_item: "SQ-ROW-2",
        item_code: "ITEM-B",
        qty: 5,
        uom: "Cái",
        rate: 20,
      },
    ],
    ...overrides,
  };
}

async function submittedRfq(store) {
  const controller = new RequestForQuotationController();
  const draft = await apply(controller, store, "create", "RFQ-001", rfqData(), "rfq-create");
  await apply(controller, store, "submit", "RFQ-001", draft.data, "rfq-submit");
}

async function submittedQuotation(store, data = quotationData()) {
  const controller = new ProcurementSupplierQuotationController();
  const draft = await apply(controller, store, "create", "SQ-001", data, "sq-create");
  return apply(controller, store, "submit", "SQ-001", draft.data, "sq-submit");
}

test("Supplier Quotation submit accepts exact RFQ rows and PO may consume a partial quoted quantity", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seedMasters(store);
  await submittedRfq(store);
  const quotation = await submittedQuotation(store);
  assert.equal(quotation.docstatus, 1);

  const po = new ProcurementPurchaseOrderController();
  const draft = await apply(po, store, "create", "PO-001", purchaseOrderData(), "po-create");
  const submitted = await apply(po, store, "submit", "PO-001", draft.data, "po-submit");
  assert.equal(submitted.docstatus, 1);
});

test("Supplier Quotation submit rejects an RFQ row that quotes a different item", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seedMasters(store);
  await submittedRfq(store);
  const controller = new ProcurementSupplierQuotationController();
  const bad = quotationData({
    items: [{
      row_id: "SQ-BAD",
      request_for_quotation_item: "RFQ-1",
      item_code: "ITEM-B",
      qty: 5,
      uom: "Cái",
      rate: 20,
    }],
  });
  const draft = await apply(controller, store, "create", "SQ-BAD", bad, "sq-bad-create");
  await assert.rejects(
    () => apply(controller, store, "submit", "SQ-BAD", draft.data, "sq-bad-submit"),
    /does not match RFQ row/,
  );
});

test("Purchase Order submit rejects expired Supplier Quotation", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seedMasters(store);
  await submittedRfq(store);
  await submittedQuotation(store, quotationData({ valid_till: "2026-08-02" }));
  const po = new ProcurementPurchaseOrderController();
  const draft = await apply(po, store, "create", "PO-EXP", purchaseOrderData(), "po-exp-create");
  await assert.rejects(
    () => apply(po, store, "submit", "PO-EXP", draft.data, "po-exp-submit"),
    /is expired/,
  );
});

test("Purchase Order submit rejects quantity above the selected quotation", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seedMasters(store);
  await submittedRfq(store);
  await submittedQuotation(store);
  const po = new ProcurementPurchaseOrderController();
  const data = purchaseOrderData({
    items: [{
      row_id: "PO-ROW-1",
      supplier_quotation_item: "SQ-ROW-1",
      item_code: "ITEM-A",
      qty: 11,
      uom: "Kg",
      rate: 5,
    }],
  });
  const draft = await apply(po, store, "create", "PO-OVER", data, "po-over-create");
  await assert.rejects(
    () => apply(po, store, "submit", "PO-OVER", draft.data, "po-over-submit"),
    /quantity exceeds Supplier Quotation/,
  );
});
