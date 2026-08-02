import test from "node:test";
import assert from "node:assert/strict";
import {
  ProcurementRequestForQuotationController,
  SupplierQualificationController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const manager = { user_id: "manager@example.com", roles: ["Purchase Manager"] };
const buyer = { user_id: "buyer@example.com", roles: ["Purchase User"] };
const now = "2026-08-03T08:00:00.000Z";

function seed(store) {
  store.seedMaster("Company", "ACME", tenant, { default_currency: "USD" });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Supplier", "SUP-A", tenant, {});
  store.seedMaster("Item", "ITEM-A", tenant, { stock_uom: "Kg", default_purchase_uom: "Kg" });
}

async function apply(controller, store, actor, action, name, document, commandId) {
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

test("cancelled qualification does not silently re-enable legacy Supplier master", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seed(store);
  const qualification = new SupplierQualificationController();
  const draft = await apply(qualification, store, buyer, "create", "QUAL-1", {
    supplier: "SUP-A",
    company: "ACME",
    valid_from: "2026-08-01",
    valid_until: "2026-12-31",
    approval_reason: "Approved source",
  }, "qual-create");
  const submitted = await apply(qualification, store, manager, "submit", "QUAL-1", draft.data, "qual-submit");
  await apply(qualification, store, manager, "cancel", "QUAL-1", submitted.data, "qual-cancel");

  const rfq = new ProcurementRequestForQuotationController();
  const request = {
    company: "ACME",
    transaction_date: "2026-08-03",
    suppliers: [{ row_id: "SUP-1", supplier: "SUP-A" }],
    items: [{ row_id: "ROW-1", item_code: "ITEM-A", qty: 10, uom: "Kg" }],
  };
  const rfqDraft = await apply(rfq, store, buyer, "create", "RFQ-1", request, "rfq-create");
  await assert.rejects(
    () => rfq.buildPlan({
      command: {
        schema_version: 1,
        command_id: "rfq-submit",
        tenant_id: tenant,
        aggregate: { doctype: rfq.doctype, name: "RFQ-1" },
        action: "submit",
        expected_version: rfqDraft.version,
        payload_hash: "0".repeat(64),
        actor: manager,
        document: rfqDraft.data,
      },
      existing: rfqDraft,
      now,
      nextVersion: rfqDraft.version + 1,
      reader: store,
    }),
    /no active approved qualification/,
  );
});
