import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementPurchaseOrderController,
  ProcurementRequestForQuotationController,
  ProcurementSupplierQuotationController,
  SupplierSelectionController,
  validatePurchaseOrderSupplierSelection,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const manager = { user_id: "manager@example.com", roles: ["Purchase Manager", "System Manager"] };
const buyer = { user_id: "buyer@example.com", roles: ["Purchase User"] };
const now = "2026-08-03T08:00:00.000Z";

function seed(store) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, {});
  store.seedMaster("Supplier", "SUP-B", tenant, {});
  store.seedMaster("Item", "ITEM-A", tenant, { stock_uom: "Kg", default_purchase_uom: "Kg" });
  store.seedMaster("Item", "ITEM-B", tenant, { stock_uom: "Cái", default_purchase_uom: "Cái" });
}

async function apply(controller, store, actor, action, name, document, commandId = `${name}-${action}`) {
  const existing = await store.getDocument(tenant, controller.doctype, name);
  const plan = await controller.buildPlan({
    command: {
      schema_version: 1,
      command_id: commandId,
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
  await store.execute(plan);
  return store.getDocument(tenant, controller.doctype, name);
}

async function submitRfq(store) {
  const controller = new ProcurementRequestForQuotationController();
  const draft = await apply(controller, store, buyer, "create", "RFQ-1", {
    company: "ACME",
    transaction_date: "2026-08-01",
    suppliers: [
      { row_id: "SUP-1", supplier: "SUP-A" },
      { row_id: "SUP-2", supplier: "SUP-B" },
    ],
    items: [
      { row_id: "RFQ-ROW-1", item_code: "ITEM-A", qty: 10, uom: "Kg" },
      { row_id: "RFQ-ROW-2", item_code: "ITEM-B", qty: 5, uom: "Cái" },
    ],
  });
  return apply(controller, store, manager, "submit", "RFQ-1", draft.data);
}

async function submitQuote(store, name = "SQ-A", supplier = "SUP-A", partial = false) {
  const controller = new ProcurementSupplierQuotationController();
  const draft = await apply(controller, store, buyer, "create", name, {
    supplier,
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-02",
    valid_till: "2026-08-31",
    request_for_quotation: "RFQ-1",
    taxes: [],
    items: [
      {
        row_id: `${name}-ROW-1`,
        request_for_quotation_item: "RFQ-ROW-1",
        item_code: "ITEM-A",
        qty: 10,
        uom: "Kg",
        rate: supplier === "SUP-A" ? 5 : 4.8,
      },
      ...(partial ? [] : [{
        row_id: `${name}-ROW-2`,
        request_for_quotation_item: "RFQ-ROW-2",
        item_code: "ITEM-B",
        qty: 5,
        uom: "Cái",
        rate: supplier === "SUP-A" ? 20 : 22,
      }]),
    ],
  });
  return apply(controller, store, manager, "submit", name, draft.data);
}

test("approved supplier selection drives PO and cannot be cancelled while submitted PO uses it", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  await submitRfq(store);
  await submitQuote(store, "SQ-A", "SUP-A");

  const selectionController = new SupplierSelectionController();
  const selectionDraft = await apply(selectionController, store, buyer, "create", "SEL-1", {
    request_for_quotation: "RFQ-1",
    supplier_quotation: "SQ-A",
    company: "ACME",
    decision_date: "2026-08-03",
    selection_reason: "Đạt yêu cầu kỹ thuật và tổng giá trị được duyệt",
  });
  const selection = await apply(selectionController, store, manager, "submit", "SEL-1", selectionDraft.data);
  assert.equal(selection.status, "Approved");
  assert.equal(selection.data.supplier, "SUP-A");
  assert.equal(selection.data.approved_by, manager.user_id);

  const poController = new ProcurementPurchaseOrderController();
  const poDraft = await apply(poController, store, buyer, "create", "PO-1", {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-03",
    supplier_quotation: "SQ-A",
    supplier_selection: "SEL-1",
    taxes: [],
    items: [
      {
        row_id: "PO-ROW-1",
        supplier_quotation_item: "SQ-A-ROW-1",
        item_code: "ITEM-A",
        qty: 8,
        uom: "Kg",
        rate: 5,
      },
      {
        row_id: "PO-ROW-2",
        supplier_quotation_item: "SQ-A-ROW-2",
        item_code: "ITEM-B",
        qty: 5,
        uom: "Cái",
        rate: 20,
      },
    ],
  });
  const po = await apply(poController, store, manager, "submit", "PO-1", poDraft.data);
  assert.equal(po.docstatus, 1);

  await assert.rejects(
    () => selectionController.buildPlan({
      command: {
        schema_version: 1,
        command_id: "selection-cancel",
        tenant_id: tenant,
        aggregate: { doctype: selectionController.doctype, name: "SEL-1" },
        action: "cancel",
        expected_version: selection.version,
        payload_hash: "0".repeat(64),
        actor: manager,
        document: selection.data,
      },
      existing: selection,
      now,
      nextVersion: selection.version + 1,
      reader: store,
    }),
    /cannot be cancelled while submitted Purchase Order PO-1 uses it/,
  );
});

test("supplier selection refuses an incomplete quotation", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  await submitRfq(store);
  await submitQuote(store, "SQ-PART", "SUP-A", true);
  const controller = new SupplierSelectionController();
  const draft = await apply(controller, store, buyer, "create", "SEL-PART", {
    request_for_quotation: "RFQ-1",
    supplier_quotation: "SQ-PART",
    company: "ACME",
    decision_date: "2026-08-03",
    selection_reason: "Attempt partial award",
  });
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        schema_version: 1,
        command_id: "selection-submit-partial",
        tenant_id: tenant,
        aggregate: { doctype: controller.doctype, name: "SEL-PART" },
        action: "submit",
        expected_version: draft.version,
        payload_hash: "0".repeat(64),
        actor: manager,
        document: draft.data,
      },
      existing: draft,
      now,
      nextVersion: draft.version + 1,
      reader: store,
    }),
    /does not cover the complete RFQ/,
  );
});

test("PO supplier selection must match selected supplier and quotation", () => {
  assert.throws(
    () => validatePurchaseOrderSupplierSelection({
      supplier: "SUP-B",
      company: "ACME",
      currency: "USD",
      transaction_date: "2026-08-03",
      supplier_quotation: "SQ-B",
      items: [],
    }, "SEL-1", {
      request_for_quotation: "RFQ-1",
      supplier_quotation: "SQ-A",
      company: "ACME",
      supplier: "SUP-A",
      decision_date: "2026-08-03",
      selection_reason: "Approved",
    }),
    /supplier does not match/,
  );
});
