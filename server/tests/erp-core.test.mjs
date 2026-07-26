import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit } from "./helpers.mjs";

const now = () => "2026-07-25T08:00:00.000Z";
function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-1", currency: "USD", items: ["ITEM-1"], warehouses: ["Stores", "Transit"], accounts: ["Creditors", "Expense", "Input Tax", "Bank", "Cash"] });
  store.seedMaster("Supplier", "SUP-1");
  const registry = registerErpCoreControllers(createO2CControllerRegistry());
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

test("Purchase-to-Pay posts stock, payable, payment and server-derived Purchase Order progress", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Purchase Order", name: "PO-1", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25",
    items: [{ row_id: "POI-1", item_code: "ITEM-1", qty: "10", rate: "20" }],
    taxes: [{ row_id: "TAX-1", account: "Input Tax", rate: "10" }],
  }});
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-1", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-1",
    items: [{ row_id: "PRI-1", item_code: "ITEM-1", qty: "4", rate: "20", valuation_rate: "20", warehouse: "Stores" }],
  }});
  await createAndSubmit(kernel, { doctype: "Purchase Invoice", name: "PI-1", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-1", credit_to: "Creditors",
    items: [{ row_id: "PII-1", item_code: "ITEM-1", qty: "10", rate: "20", expense_account: "Expense" }],
    taxes: [{ row_id: "TAX-1", account: "Input Tax", rate: "10" }],
  }});
  let po = await store.getDocument("demo", "Purchase Order", "PO-1");
  assert.equal(po.data.received_percentage, "40.00");
  assert.equal(po.data.billed_percentage, "100.00");
  assert.equal(po.status, "To Receive");
  let invoice = await store.getDocument("demo", "Purchase Invoice", "PI-1");
  assert.equal(invoice.status, "Unpaid");
  assert.equal(invoice.data.outstanding_amount, "220.00");
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-1", "Stores"), 4_000_000);

  await createAndSubmit(kernel, { doctype: "Payment Entry", name: "PAY-SUP-1", document: {
    company: "Demo", posting_at: now(), payment_type: "Pay", party_type: "Supplier", party: "SUP-1",
    paid_from: "Bank", paid_to: "Creditors", paid_amount: "220", received_amount: "220", currency: "USD",
    references: [{ row_id: "REF-1", reference_doctype: "Purchase Invoice", reference_name: "PI-1", allocated_amount: "220" }],
  }});
  invoice = await store.getDocument("demo", "Purchase Invoice", "PI-1");
  assert.equal(invoice.status, "Paid");
  assert.equal(invoice.data.outstanding_amount, "0.00");
  const snapshot = store.snapshot();
  const debit = snapshot.gl_entries.reduce((sum, line) => sum + BigInt(line.debit_minor), 0n);
  const credit = snapshot.gl_entries.reduce((sum, line) => sum + BigInt(line.credit_minor), 0n);
  assert.equal(debit, credit);
  assert.equal(snapshot.payment_entries.filter((line) => line.against_voucher_no === "PI-1").reduce((sum, line) => sum + line.amount_minor, 0), 0);
});

test("Purchase Order over-receipt is rejected and active procurement blocks cancellation", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Purchase Order", name: "PO-GUARD", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25",
    items: [{ row_id: "1", item_code: "ITEM-1", qty: "5", rate: "10" }], taxes: [],
  }});
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-GUARD", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-GUARD",
    items: [{ row_id: "1", item_code: "ITEM-1", qty: "5", rate: "10", valuation_rate: "10", warehouse: "Stores" }],
  }});
  await assert.rejects(createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-OVER", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-GUARD",
    items: [{ row_id: "1", item_code: "ITEM-1", qty: "1", rate: "10", valuation_rate: "10", warehouse: "Stores" }],
  }}), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  const command = (await import("../dist/packages/test-harness/src/index.js")).makeCommand;
  await assert.rejects(kernel.execute(await command({ commandId: "po-cancel", doctype: "Purchase Order", name: "PO-GUARD", action: "cancel", expectedVersion: 2, document: {} })), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("Journal Entry and Stock Entry keep double-entry and stock-transfer invariants", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Journal Entry", name: "JV-1", document: {
    company: "Demo", posting_at: now(), user_remark: "Accrual",
    accounts: [
      { row_id: "D", account: "Expense", debit: "100", credit: "0" },
      { row_id: "C", account: "Bank", debit: "0", credit: "100" },
    ],
  }});
  store.seedStock({ itemCode: "ITEM-1", warehouse: "Stores", qty: "10", valuationRate: "20" });
  await createAndSubmit(kernel, { doctype: "Stock Entry", name: "STE-1", document: {
    company: "Demo", posting_at: now(), purpose: "Material Transfer", currency: "USD",
    items: [{ row_id: "1", item_code: "ITEM-1", qty: "3", valuation_rate: "20", source_warehouse: "Stores", target_warehouse: "Transit" }],
  }});
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-1", "Stores"), 7_000_000);
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-1", "Transit"), 3_000_000);
  const journalLines = store.snapshot().gl_entries.filter((line) => line.line_key === "D" || line.line_key === "C");
  assert.equal(journalLines.reduce((sum, line) => sum + line.debit_minor, 0), 10_000);
  assert.equal(journalLines.reduce((sum, line) => sum + line.credit_minor, 0), 10_000);
});
