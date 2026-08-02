import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementPurchaseOrderController,
  ProcurementRequestForQuotationController,
  ProcurementSupplierContractController,
  ProcurementSupplierQuotationController,
  SupplierQualificationController,
  SupplierRatingController,
  SupplierSelectionController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const manager = { user_id: "manager@example.com", roles: ["Purchase Manager", "System Manager"] };
const buyer = { user_id: "buyer@example.com", roles: ["Purchase User"] };
const now = "2026-08-03T08:00:00.000Z";

function seed(store) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, { procurement_status: "Pending" });
  store.seedMaster("Supplier", "SUP-B", tenant, {});
  store.seedMaster("Item", "ITEM-A", tenant, { stock_uom: "Kg", default_purchase_uom: "Kg" });
  store.seedMaster("Item", "ITEM-B", tenant, { stock_uom: "Cái", default_purchase_uom: "Cái" });
  store.seedMaster("UOM", "Kg", tenant, {});
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

test("supplier governance flows from qualification through selection and contract-bound PO", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);

  const qualification = new SupplierQualificationController();
  const qDraft = await apply(qualification, store, buyer, "create", "QUAL-1", {
    supplier: "SUP-A",
    company: "ACME",
    valid_from: "2026-08-01",
    valid_until: "2026-12-31",
    approved_categories: "Aluminium",
    approval_reason: "Đạt hồ sơ, mẫu và năng lực giao hàng",
  });
  const q = await apply(qualification, store, manager, "submit", "QUAL-1", qDraft.data);
  assert.equal(q.status, "Approved");
  assert.equal(q.data.approved_by, manager.user_id);

  const rating = new SupplierRatingController();
  const ratingDraft = await apply(rating, store, buyer, "create", "RATE-1", {
    supplier: "SUP-A", company: "ACME", assessment_date: "2026-08-03",
    quality_score: 95, quality_weight: 40,
    delivery_score: 80, delivery_weight: 30,
    commercial_score: 85, commercial_weight: 20,
    service_score: 90, service_weight: 10,
  });
  assert.equal(ratingDraft.data.overall_score, "88.00");
  assert.equal(ratingDraft.data.grade, "B");
  await apply(rating, store, manager, "submit", "RATE-1", ratingDraft.data);

  const contract = new ProcurementSupplierContractController();
  const contractDraft = await apply(contract, store, buyer, "create", "CON-1", {
    supplier: "SUP-A", company: "ACME", currency: "USD", contract_reference: "C-2026-01",
    valid_from: "2026-08-01", valid_until: "2026-12-31",
    maximum_qty: "100", quantity_uom: "Kg", maximum_value: "1000.00",
  });
  const activeContract = await apply(contract, store, manager, "submit", "CON-1", contractDraft.data);
  assert.equal(activeContract.status, "Active");

  const rfq = new ProcurementRequestForQuotationController();
  const rfqDraft = await apply(rfq, store, buyer, "create", "RFQ-1", {
    company: "ACME", transaction_date: "2026-08-03",
    suppliers: [{ row_id: "S1", supplier: "SUP-A" }],
    items: [
      { row_id: "R1", item_code: "ITEM-A", qty: 10, uom: "Kg" },
      { row_id: "R2", item_code: "ITEM-B", qty: 5, uom: "Cái" },
    ],
  });
  await apply(rfq, store, manager, "submit", "RFQ-1", rfqDraft.data);

  const sq = new ProcurementSupplierQuotationController();
  const sqDraft = await apply(sq, store, buyer, "create", "SQ-1", {
    supplier: "SUP-A", company: "ACME", currency: "USD", transaction_date: "2026-08-03", valid_till: "2026-08-31",
    request_for_quotation: "RFQ-1", taxes: [],
    items: [
      { row_id: "SQ-R1", request_for_quotation_item: "R1", item_code: "ITEM-A", qty: 10, uom: "Kg", rate: 5 },
      { row_id: "SQ-R2", request_for_quotation_item: "R2", item_code: "ITEM-B", qty: 5, uom: "Cái", rate: 20 },
    ],
  });
  await apply(sq, store, manager, "submit", "SQ-1", sqDraft.data);

  const selection = new SupplierSelectionController();
  const selectionDraft = await apply(selection, store, buyer, "create", "SEL-1", {
    request_for_quotation: "RFQ-1", supplier_quotation: "SQ-1", company: "ACME",
    decision_date: "2026-08-03", selection_reason: "Đạt yêu cầu và tổng giá trị được duyệt",
  });
  const approvedSelection = await apply(selection, store, manager, "submit", "SEL-1", selectionDraft.data);
  assert.equal(approvedSelection.status, "Approved");
  assert.equal(approvedSelection.data.supplier, "SUP-A");

  const po = new ProcurementPurchaseOrderController();
  const poDraft = await apply(po, store, buyer, "create", "PO-1", {
    supplier: "SUP-A", supplier_group: "Aluminium", company: "ACME", currency: "USD", transaction_date: "2026-08-03",
    schedule_date: "2026-08-10", supplier_quotation: "SQ-1", supplier_selection: "SEL-1", supplier_contract: "CON-1", taxes: [],
    items: [
      { row_id: "PO-R1", supplier_quotation_item: "SQ-R1", item_code: "ITEM-A", qty: 8, uom: "Kg", rate: 5 },
    ],
  });
  const submittedPo = await apply(po, store, manager, "submit", "PO-1", poDraft.data);
  assert.equal(submittedPo.docstatus, 1);

  await assert.rejects(() => selection.buildPlan({
    command: {
      schema_version: 1, command_id: "selection-cancel", tenant_id: tenant,
      aggregate: { doctype: selection.doctype, name: "SEL-1" }, action: "cancel",
      expected_version: approvedSelection.version, payload_hash: "0".repeat(64), actor: manager, document: approvedSelection.data,
    },
    existing: approvedSelection, now, nextVersion: approvedSelection.version + 1, reader: store,
  }), /cannot be cancelled while submitted Purchase Order PO-1 uses it/);
});

test("qualification adoption fails closed after approval is cancelled", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const qualification = new SupplierQualificationController();
  const draft = await apply(qualification, store, buyer, "create", "QUAL-C", {
    supplier: "SUP-A", company: "ACME", valid_from: "2026-08-01", valid_until: "2026-12-31", approval_reason: "Approved",
  });
  const submitted = await apply(qualification, store, manager, "submit", "QUAL-C", draft.data);
  await apply(qualification, store, manager, "cancel", "QUAL-C", submitted.data);

  const rfq = new ProcurementRequestForQuotationController();
  const request = await apply(rfq, store, buyer, "create", "RFQ-C", {
    company: "ACME", transaction_date: "2026-08-03",
    suppliers: [{ row_id: "S1", supplier: "SUP-A" }],
    items: [{ row_id: "R1", item_code: "ITEM-A", qty: 1, uom: "Kg" }],
  });
  await assert.rejects(() => rfq.buildPlan({
    command: {
      schema_version: 1, command_id: "rfq-c-submit", tenant_id: tenant,
      aggregate: { doctype: rfq.doctype, name: "RFQ-C" }, action: "submit",
      expected_version: request.version, payload_hash: "0".repeat(64), actor: manager, document: request.data,
    },
    existing: request, now, nextVersion: request.version + 1, reader: store,
  }), /no active approved qualification/);
});
