import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementP2PRolloutPurchaseOrderController,
  ProcurementSupplierContractController,
  SupplierQualificationController,
  SupplierRatingController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const manager = { user_id: "purchase.manager@example.com", roles: ["Purchase Manager"] };
const buyer = { user_id: "buyer@example.com", roles: ["Purchase User"] };
const now = "2026-08-04T06:00:00.000Z";

function seed(store) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, {
    procurement_status: "Approved",
    approved_from: "2026-01-01",
    approved_until: "2026-12-31",
  });
  store.seedMaster("Item", "ITEM-A", tenant, {
    stock_uom: "Kg",
    default_purchase_uom: "Kg",
    is_stock_item: 1,
  });
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

test("supplier lifecycle cancellation requires Purchase Manager", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);

  const qualification = new SupplierQualificationController();
  const qualificationDraft = await apply(qualification, store, buyer, "create", "QUAL-RC4", {
    supplier: "SUP-A",
    company: "ACME",
    valid_from: "2026-08-01",
    valid_until: "2026-12-31",
    approval_reason: "RC4 supplier governance regression",
  });
  const qualificationSubmitted = await apply(
    qualification,
    store,
    manager,
    "submit",
    "QUAL-RC4",
    qualificationDraft.data,
  );
  await assert.rejects(
    () => apply(qualification, store, buyer, "cancel", "QUAL-RC4", qualificationSubmitted.data, "qual-buyer-cancel"),
    /Purchase Manager role is required/,
  );

  const rating = new SupplierRatingController();
  const ratingDraft = await apply(rating, store, buyer, "create", "RATE-RC4", {
    supplier: "SUP-A",
    company: "ACME",
    assessment_date: "2026-08-04",
    quality_score: 90,
    quality_weight: 25,
    delivery_score: 90,
    delivery_weight: 25,
    commercial_score: 90,
    commercial_weight: 25,
    service_score: 90,
    service_weight: 25,
  });
  const ratingSubmitted = await apply(rating, store, manager, "submit", "RATE-RC4", ratingDraft.data);
  await assert.rejects(
    () => apply(rating, store, buyer, "cancel", "RATE-RC4", ratingSubmitted.data, "rating-buyer-cancel"),
    /Purchase Manager role is required/,
  );

  const ratingCancelled = await apply(rating, store, manager, "cancel", "RATE-RC4", ratingSubmitted.data, "rating-manager-cancel");
  assert.equal(ratingCancelled.docstatus, 2);
  assert.equal(ratingCancelled.status, "Cancelled");
});

test("submitted Purchase Order prevents Supplier Contract cancellation until the order is cancelled", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);

  const contract = new ProcurementSupplierContractController();
  const contractDraft = await apply(contract, store, buyer, "create", "CON-RC4", {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    contract_reference: "FRAME-2026-RC4",
    valid_from: "2026-08-01",
    valid_until: "2026-12-31",
    maximum_qty: "100",
    quantity_uom: "Kg",
    maximum_value: "10000",
  });
  const contractSubmitted = await apply(contract, store, manager, "submit", "CON-RC4", contractDraft.data);

  const purchaseOrder = new ProcurementP2PRolloutPurchaseOrderController();
  const poDraft = await apply(purchaseOrder, store, buyer, "create", "PO-RC4", {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    transaction_date: "2026-08-04",
    supplier_contract: "CON-RC4",
    receipt_match_required: false,
    items: [{ row_id: "ROW-1", item_code: "ITEM-A", qty: "10", uom: "Kg", rate: "5" }],
    taxes: [],
  });
  const poSubmitted = await apply(purchaseOrder, store, manager, "submit", "PO-RC4", poDraft.data);
  assert.equal(poSubmitted.docstatus, 1);

  await assert.rejects(
    () => apply(contract, store, manager, "cancel", "CON-RC4", contractSubmitted.data, "contract-cancel-with-live-po"),
    /cannot be cancelled while submitted Purchase Order PO-RC4 uses it/,
  );

  await apply(purchaseOrder, store, manager, "cancel", "PO-RC4", poSubmitted.data, "po-cancel");
  const contractCancelled = await apply(contract, store, manager, "cancel", "CON-RC4", contractSubmitted.data, "contract-cancel-after-po");
  assert.equal(contractCancelled.docstatus, 2);
  assert.equal(contractCancelled.status, "Cancelled");
});
