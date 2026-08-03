import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-08-04T02:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["ITEM-1", "ITEM-2"],
    warehouses: ["Stores"],
    accounts: ["Creditors", "Expense", "Stock", "SRBNB"],
  });
  store.seedMaster("Supplier", "SUP-1");
  const registry = registerErpCoreControllers(createO2CControllerRegistry());
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

function po(name, itemCode, qty, rate, extra = {}) {
  return {
    doctype: "Purchase Order",
    name,
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-08-04",
      items: [{ row_id: `${name}-ROW`, item_code: itemCode, qty: String(qty), rate: String(rate) }],
      taxes: [],
      ...extra,
    },
  };
}

function receipt(name, purchaseOrder, itemCode, qty, rate) {
  return {
    doctype: "Purchase Receipt",
    name,
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      against_purchase_order: purchaseOrder,
      items: [{ row_id: `${name}-ROW`, item_code: itemCode, qty: String(qty), rate: String(rate), valuation_rate: String(rate), warehouse: "Stores" }],
    },
  };
}

function invoice(name, purchaseOrder, itemCode, qty, rate, extra = {}) {
  return {
    doctype: "Purchase Invoice",
    name,
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      ...(purchaseOrder ? { against_purchase_order: purchaseOrder } : {}),
      credit_to: "Creditors",
      items: [{ row_id: `${name}-ROW`, item_code: itemCode, qty: String(qty), rate: String(rate), expense_account: "Expense" }],
      taxes: [],
      ...extra,
    },
  };
}

test("P2P snapshots PO match policy and holds invoice before required receipt", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, po("PO-MATCH", "ITEM-1", 10, 20, {
    receipt_match_required: true,
    invoice_quantity_tolerance_pct: "2.5",
    invoice_price_tolerance_pct: "3",
  }));

  const order = await store.getDocument("demo", "Purchase Order", "PO-MATCH");
  assert.equal(order.data.purchase_match_policy_version, 1);
  assert.equal(order.data.receipt_match_required, true);
  assert.equal(order.data.invoice_quantity_tolerance_bps, 250);
  assert.equal(order.data.invoice_price_tolerance_bps, 300);

  await assert.rejects(
    createAndSubmit(kernel, invoice("PI-NO-RECEIPT", "PO-MATCH", "ITEM-1", 1, 20)),
    /procurement hold.*received quantity tolerance/i,
  );
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-MATCH", "Billing", "ITEM-1"), 0);
});

test("P2P supports cumulative partial receipt/invoice and exact billing reversal", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, po("PO-PARTIAL", "ITEM-1", 10, 20, { receipt_match_required: true }));
  await createAndSubmit(kernel, receipt("PR-PARTIAL", "PO-PARTIAL", "ITEM-1", 6, 20));
  await createAndSubmit(kernel, invoice("PI-PARTIAL-1", "PO-PARTIAL", "ITEM-1", 4, 20));
  await createAndSubmit(kernel, invoice("PI-PARTIAL-2", "PO-PARTIAL", "ITEM-1", 2, 20));

  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-PARTIAL", "Billing", "ITEM-1"), 6_000_000);
  const saved = await store.getDocument("demo", "Purchase Invoice", "PI-PARTIAL-2");
  assert.equal(saved.data.purchase_match_status, "Match");
  assert.equal(saved.data.purchase_match_evidence[0].received_qty_micros, 6_000_000);
  assert.equal(saved.data.purchase_match_evidence[0].invoiced_qty_micros, 6_000_000);

  await assert.rejects(
    createAndSubmit(kernel, invoice("PI-PARTIAL-OVER", "PO-PARTIAL", "ITEM-1", "0.000001", 20)),
    /procurement hold.*received quantity tolerance/i,
  );

  await mutate(kernel, {
    commandId: "PI-PARTIAL-2-cancel",
    doctype: "Purchase Invoice",
    name: "PI-PARTIAL-2",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-PARTIAL", "Billing", "ITEM-1"), 4_000_000);

  await createAndSubmit(kernel, invoice("PI-PARTIAL-3", "PO-PARTIAL", "ITEM-1", 2, 20));
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-PARTIAL", "Billing", "ITEM-1"), 6_000_000);
});

test("P2P enforces net price variance tolerance without writing a shadow payable", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, po("PO-PRICE", "ITEM-1", 10, 20, {
    receipt_match_required: true,
    invoice_price_tolerance_pct: "5",
  }));
  await createAndSubmit(kernel, receipt("PR-PRICE", "PO-PRICE", "ITEM-1", 10, 20));

  await createAndSubmit(kernel, invoice("PI-PRICE-OK", "PO-PRICE", "ITEM-1", 4, "20.8"));
  await assert.rejects(
    createAndSubmit(kernel, invoice("PI-PRICE-HOLD", "PO-PRICE", "ITEM-1", 1, "21.2")),
    /procurement hold.*price/i,
  );

  const snapshot = store.snapshot();
  assert.equal(snapshot.payment_entries.filter((line) => line.against_voucher_no === "PI-PRICE-HOLD").length, 0);
  assert.equal(snapshot.gl_entries.filter((line) => line.voucher_no === "PI-PRICE-HOLD").length, 0);
});

test("P2P Purchase Invoice supports line-level references to multiple Purchase Orders", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, po("PO-A", "ITEM-1", 5, 10, { receipt_match_required: true }));
  await createAndSubmit(kernel, po("PO-B", "ITEM-2", 7, 12, { receipt_match_required: true }));
  await createAndSubmit(kernel, receipt("PR-A", "PO-A", "ITEM-1", 5, 10));
  await createAndSubmit(kernel, receipt("PR-B", "PO-B", "ITEM-2", 7, 12));

  await createAndSubmit(kernel, {
    doctype: "Purchase Invoice",
    name: "PI-MULTI-PO",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      credit_to: "Creditors",
      items: [
        { row_id: "A", purchase_order: "PO-A", item_code: "ITEM-1", qty: "5", rate: "10", expense_account: "Expense" },
        { row_id: "B", purchase_order: "PO-B", item_code: "ITEM-2", qty: "7", rate: "12", expense_account: "Expense" },
      ],
      taxes: [],
    },
  });

  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-A", "Billing", "ITEM-1"), 5_000_000);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-B", "Billing", "ITEM-2"), 7_000_000);
  const saved = await store.getDocument("demo", "Purchase Invoice", "PI-MULTI-PO");
  assert.equal(saved.data.purchase_match_evidence.length, 2);
});

test("P2P rollout keeps legacy API behavior when receipt_match_required is omitted", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, po("PO-COMPAT", "ITEM-1", 10, 20));
  await createAndSubmit(kernel, receipt("PR-COMPAT", "PO-COMPAT", "ITEM-1", 4, 20));
  await createAndSubmit(kernel, invoice("PI-COMPAT", "PO-COMPAT", "ITEM-1", 10, 20));

  const order = await store.getDocument("demo", "Purchase Order", "PO-COMPAT");
  assert.equal(order.data.purchase_match_policy_version, 1);
  assert.equal(order.data.receipt_match_required, false);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-COMPAT", "Billing", "ITEM-1"), 10_000_000);
});

test("P2P keeps approved PO quantity as a hard billing ceiling even when match tolerance is nonzero", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, po("PO-HARD-CAP", "ITEM-1", 10, 20, {
    receipt_match_required: false,
    invoice_quantity_tolerance_pct: "10",
  }));
  await assert.rejects(
    createAndSubmit(kernel, invoice("PI-HARD-CAP", "PO-HARD-CAP", "ITEM-1", "10.1", 20)),
    /exceeds approved Purchase Order/i,
  );
});
