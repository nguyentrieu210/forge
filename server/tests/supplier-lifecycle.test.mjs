import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementRequestForQuotationController,
  ProcurementSupplierContractController,
  SupplierQualificationController,
  SupplierRatingController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const manager = { user_id: "purchase.manager@example.com", roles: ["Purchase Manager"] };
const user = { user_id: "buyer@example.com", roles: ["Purchase User"] };
const now = "2026-08-03T08:00:00.000Z";

function seed(store) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, { procurement_status: "Pending" });
  store.seedMaster("Item", "ITEM-A", tenant, { stock_uom: "Kg", default_purchase_uom: "Kg" });
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

function qualification(overrides = {}) {
  return {
    supplier: "SUP-A",
    company: "ACME",
    valid_from: "2026-08-01",
    valid_until: "2026-12-31",
    approved_categories: "Aluminium, Glass",
    approval_reason: "Đã đánh giá hồ sơ, mẫu và năng lực giao hàng",
    ...overrides,
  };
}

test("supplier qualification is manager-submitted, audited and overlap-safe", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const controller = new SupplierQualificationController();
  const draft = await apply(controller, store, user, "create", "QUAL-1", qualification());
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        schema_version: 1,
        command_id: "qual-user-submit",
        tenant_id: tenant,
        aggregate: { doctype: controller.doctype, name: "QUAL-1" },
        action: "submit",
        expected_version: draft.version,
        payload_hash: "0".repeat(64),
        actor: user,
        document: draft.data,
      },
      existing: draft,
      now,
      nextVersion: draft.version + 1,
      reader: store,
    }),
    /Purchase Manager role is required/,
  );
  const approved = await apply(controller, store, manager, "submit", "QUAL-1", draft.data, "qual-manager-submit");
  assert.equal(approved.status, "Approved");
  assert.equal(approved.data.approved_by, manager.user_id);
  assert.equal(approved.data.approved_on, now);

  const overlapDraft = await apply(controller, store, user, "create", "QUAL-2", qualification({
    valid_from: "2026-10-01",
    valid_until: "2027-01-31",
  }));
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        schema_version: 1,
        command_id: "qual-overlap-submit",
        tenant_id: tenant,
        aggregate: { doctype: controller.doctype, name: "QUAL-2" },
        action: "submit",
        expected_version: overlapDraft.version,
        payload_hash: "0".repeat(64),
        actor: manager,
        document: overlapDraft.data,
      },
      existing: overlapDraft,
      now,
      nextVersion: overlapDraft.version + 1,
      reader: store,
    }),
    /overlapping approved qualification/,
  );
});

test("submitted qualification overrides legacy pending Supplier master for RFQ eligibility", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const qualificationController = new SupplierQualificationController();
  const draft = await apply(qualificationController, store, user, "create", "QUAL-A", qualification());
  await apply(qualificationController, store, manager, "submit", "QUAL-A", draft.data);

  const rfqController = new ProcurementRequestForQuotationController();
  const rfq = {
    company: "ACME",
    transaction_date: "2026-08-03",
    suppliers: [{ row_id: "SUP-1", supplier: "SUP-A" }],
    items: [{ row_id: "ROW-1", item_code: "ITEM-A", qty: 10, uom: "Kg" }],
  };
  const rfqDraft = await apply(rfqController, store, user, "create", "RFQ-QUAL", rfq);
  const submitted = await apply(rfqController, store, manager, "submit", "RFQ-QUAL", rfqDraft.data);
  assert.equal(submitted.docstatus, 1);
});

test("supplier rating computes score and grade server-side", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const controller = new SupplierRatingController();
  const draft = await apply(controller, store, user, "create", "RATE-1", {
    supplier: "SUP-A",
    company: "ACME",
    assessment_date: "2026-08-03",
    quality_score: 95,
    quality_weight: 40,
    delivery_score: 80,
    delivery_weight: 30,
    commercial_score: 85,
    commercial_weight: 20,
    service_score: 90,
    service_weight: 10,
  });
  assert.equal(draft.data.overall_score, "88.00");
  assert.equal(draft.data.grade, "B");
  const submitted = await apply(controller, store, manager, "submit", "RATE-1", draft.data);
  assert.equal(submitted.status, "Assessed");
});

test("supplier contract normalizes fixed-point ceilings and requires manager submit", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const controller = new ProcurementSupplierContractController();
  const draft = await apply(controller, store, user, "create", "CON-1", {
    supplier: "SUP-A",
    company: "ACME",
    currency: "USD",
    contract_reference: "CONTRACT-2026-01",
    valid_from: "2026-08-01",
    valid_until: "2026-12-31",
    maximum_qty: "100.5",
    quantity_uom: "Kg",
    maximum_value: "25000.75",
  });
  assert.equal(draft.data.maximum_qty_micros, 100_500_000);
  assert.equal(draft.data.maximum_value_minor, 2_500_075);
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        schema_version: 1,
        command_id: "contract-user-submit",
        tenant_id: tenant,
        aggregate: { doctype: controller.doctype, name: "CON-1" },
        action: "submit",
        expected_version: draft.version,
        payload_hash: "0".repeat(64),
        actor: user,
        document: draft.data,
      },
      existing: draft,
      now,
      nextVersion: draft.version + 1,
      reader: store,
    }),
    /Purchase Manager role is required/,
  );
  const submitted = await apply(controller, store, manager, "submit", "CON-1", draft.data);
  assert.equal(submitted.status, "Active");
  assert.equal(submitted.data.approved_by, manager.user_id);
});

test("supplier contract rejects a quantity ceiling without UOM", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const controller = new ProcurementSupplierContractController();
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        schema_version: 1,
        command_id: "contract-no-uom",
        tenant_id: tenant,
        aggregate: { doctype: controller.doctype, name: "CON-NO-UOM" },
        action: "create",
        expected_version: null,
        payload_hash: "0".repeat(64),
        actor: user,
        document: {
          supplier: "SUP-A",
          company: "ACME",
          currency: "USD",
          contract_reference: "CONTRACT-NO-UOM",
          valid_from: "2026-08-01",
          valid_until: "2026-12-31",
          maximum_qty: "100",
        },
      },
      existing: null,
      now,
      nextVersion: 1,
      reader: store,
    }),
    /quantity_uom is required/,
  );
});
