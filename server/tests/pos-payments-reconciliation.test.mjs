import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const openedAt = "2026-08-03T09:00:00.000Z";
const cashier = { user_id: "cashier@example.com", roles: ["POS User"] };

function setup({ allowPartialPayment = false } = {}) {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["POS-ITEM"],
    warehouses: ["Stores"],
    accounts: ["Sales", "Cash", "Card Clearing", "Stock", "COGS"],
  });
  store.seedMaster("Item", "POS-ITEM", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Item Price", "Retail:POS-ITEM", "demo", { currency: "USD", rate: "12" });
  store.seedMaster("Mode of Payment", "Cash", "demo", {
    enabled: 1,
    type: "Cash",
    accounts: [{ company: "Demo", default_account: "Cash" }],
  });
  store.seedMaster("Mode of Payment", "Card", "demo", {
    enabled: 1,
    type: "Bank",
    accounts: [{ company: "Demo", default_account: "Card Clearing" }],
  });
  store.seedMaster("POS Profile", "MAIN", "demo", {
    company: "Demo",
    warehouse: "Stores",
    currency: "USD",
    selling_price_list: "Retail",
    income_account: "Sales",
    cash_account: "Cash",
    stock_account: "Stock",
    cogs_account: "COGS",
    account_for_change_amount: "Cash",
    allow_partial_payment: allowPartialPayment ? 1 : 0,
    payments: [{ mode_of_payment: "Cash" }, { mode_of_payment: "Card" }],
    applicable_for_users: [{ user: cashier.user_id }],
  });
  store.seedStock({ itemCode: "POS-ITEM", warehouse: "Stores", qty: "20.000000", valuationRate: "5.00" });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => openedAt) };
}

async function openSession(kernel) {
  await createAndSubmit(kernel, {
    actor: cashier,
    doctype: "POS Opening Entry",
    name: "OPEN-1",
    document: {
      pos_profile: "MAIN",
      posting_at: openedAt,
      opening_cash: "999",
      balance_details: [
        { row_id: "1", mode_of_payment: "Cash", opening_amount: "100" },
        { row_id: "2", mode_of_payment: "Card", opening_amount: "0" },
      ],
    },
  });
}

function invoiceDocument({ postingAt = "2026-08-03T10:00:00.000Z", qty = "2", payments }) {
  return {
    pos_profile: "MAIN",
    opening_entry: "OPEN-1",
    customer: "CUST-1",
    company: "FORGED",
    currency: "EUR",
    posting_at: postingAt,
    cash_account: "FORGED",
    default_income_account: "FORGED",
    stock_account: "FORGED",
    cogs_account: "FORGED",
    items: [{ row_id: "1", item_code: "POS-ITEM", qty, rate: "999", warehouse: "FORGED" }],
    taxes: [],
    payments,
  };
}

test("POS split payments resolve server accounts and replace the legacy single cash GL line", async () => {
  const { store, kernel } = setup();
  await openSession(kernel);
  const opening = await store.getDocument("demo", "POS Opening Entry", "OPEN-1");
  assert.equal(opening.data.user, cashier.user_id);
  assert.equal(opening.data.opening_cash, "100.00");
  assert.equal(opening.data.balance_details[0].account, "Cash");
  assert.equal(opening.data.balance_details[1].account, "Card Clearing");

  await createAndSubmit(kernel, {
    actor: cashier,
    doctype: "POS Invoice",
    name: "POS-SPLIT",
    document: invoiceDocument({
      payments: [
        { row_id: "1", mode_of_payment: "Cash", amount: "10", account: "FORGED" },
        { row_id: "2", mode_of_payment: "Card", amount: "14", account: "FORGED" },
      ],
    }),
  });

  const invoice = await store.getDocument("demo", "POS Invoice", "POS-SPLIT");
  assert.equal(invoice.data.grand_total, "24.00");
  assert.equal(invoice.data.paid_amount, "24.00");
  assert.equal(invoice.data.change_amount, "0.00");
  assert.equal(invoice.data.payments[0].account, "Cash");
  assert.equal(invoice.data.payments[1].account, "Card Clearing");

  const gl = store.snapshot().gl_entries;
  const paymentGl = gl.filter((line) => line.line_key.startsWith("PAY-"));
  assert.deepEqual(paymentGl.map((line) => [line.account, line.debit_minor]), [["Cash", 1000], ["Card Clearing", 1400]]);
  assert.equal(gl.some((line) => line.line_key === "CASH"), false);
  assert.equal(gl.reduce((sum, line) => sum + line.debit_minor, 0), gl.reduce((sum, line) => sum + line.credit_minor, 0));
});

test("POS overpayment posts explicit change and closing reconciles each payment mode net of change", async () => {
  const { store, kernel } = setup();
  await openSession(kernel);

  await createAndSubmit(kernel, {
    actor: cashier,
    doctype: "POS Invoice",
    name: "POS-SPLIT",
    document: invoiceDocument({
      payments: [
        { row_id: "1", mode_of_payment: "Cash", amount: "10" },
        { row_id: "2", mode_of_payment: "Card", amount: "14" },
      ],
    }),
  });
  await createAndSubmit(kernel, {
    actor: cashier,
    doctype: "POS Invoice",
    name: "POS-CHANGE",
    document: invoiceDocument({
      postingAt: "2026-08-03T10:30:00.000Z",
      qty: "1",
      payments: [{ row_id: "1", mode_of_payment: "Cash", amount: "20" }],
    }),
  });

  const changed = await store.getDocument("demo", "POS Invoice", "POS-CHANGE");
  assert.equal(changed.data.paid_amount, "20.00");
  assert.equal(changed.data.change_amount, "8.00");
  assert.equal(changed.data.account_for_change_amount, "Cash");
  const changedGl = store.snapshot().gl_entries.filter((line) => ["PAY-cash-1", "CHANGE"].includes(line.line_key));
  assert.ok(changedGl.some((line) => line.line_key === "CHANGE" && line.account === "Cash" && line.credit_minor === 800));

  const closingDocument = {
    pos_profile: "MAIN",
    opening_entry: "OPEN-1",
    company: "Demo",
    posting_at: "2026-08-03T11:00:00.000Z",
    payment_reconciliation: [
      { row_id: "1", mode_of_payment: "Cash", closing_amount: "121" },
      { row_id: "2", mode_of_payment: "Card", closing_amount: "14" },
    ],
  };
  await mutate(kernel, {
    actor: cashier,
    commandId: "CLOSE-1-create",
    doctype: "POS Closing Entry",
    name: "CLOSE-1",
    action: "create",
    expectedVersion: null,
    document: closingDocument,
  });
  const draft = await store.getDocument("demo", "POS Closing Entry", "CLOSE-1");
  const cash = draft.data.payment_reconciliation.find((row) => row.mode_of_payment === "Cash");
  const card = draft.data.payment_reconciliation.find((row) => row.mode_of_payment === "Card");
  assert.equal(cash.opening_amount, "100.00");
  assert.equal(cash.expected_amount, "122.00");
  assert.equal(cash.difference, "-1.00");
  assert.equal(card.expected_amount, "14.00");
  assert.equal(card.difference, "0.00");
  assert.equal(draft.data.difference_minor, -100);

  await assert.rejects(mutate(kernel, {
    actor: cashier,
    commandId: "CLOSE-1-submit-no-reason",
    doctype: "POS Closing Entry",
    name: "CLOSE-1",
    action: "submit",
    expectedVersion: 1,
    document: closingDocument,
  }), (error) => error.code === "VALIDATION_ERROR");

  await mutate(kernel, {
    actor: cashier,
    commandId: "CLOSE-1-submit",
    doctype: "POS Closing Entry",
    name: "CLOSE-1",
    action: "submit",
    expectedVersion: 1,
    document: { ...closingDocument, discrepancy_reason: "  Cash shortage  " },
  });
  const closed = await store.getDocument("demo", "POS Closing Entry", "CLOSE-1");
  assert.equal(closed.docstatus, 1);
  assert.equal(closed.data.discrepancy_reason, "Cash shortage");
  assert.equal(closed.data.difference_minor, -100);
});

test("POS payment guards reject duplicates, unsupported partial payment and cashier impersonation", async () => {
  const { kernel } = setup({ allowPartialPayment: true });

  await assert.rejects(createAndSubmit(kernel, {
    actor: { user_id: "intruder@example.com", roles: ["POS User"] },
    doctype: "POS Opening Entry",
    name: "OPEN-BAD",
    document: { pos_profile: "MAIN", posting_at: openedAt, opening_cash: "0" },
  }), (error) => error.code === "PERMISSION_DENIED");

  await openSession(kernel);
  await assert.rejects(mutate(kernel, {
    actor: cashier,
    commandId: "POS-DUP-create",
    doctype: "POS Invoice",
    name: "POS-DUP",
    action: "create",
    expectedVersion: null,
    document: invoiceDocument({ payments: [
      { row_id: "1", mode_of_payment: "Cash", amount: "6" },
      { row_id: "2", mode_of_payment: "Cash", amount: "6" },
    ] }),
  }), (error) => error.code === "VALIDATION_ERROR");

  await mutate(kernel, {
    actor: cashier,
    commandId: "POS-PARTIAL-create",
    doctype: "POS Invoice",
    name: "POS-PARTIAL",
    action: "create",
    expectedVersion: null,
    document: invoiceDocument({ qty: "1", payments: [{ row_id: "1", mode_of_payment: "Cash", amount: "10" }] }),
  });
  await assert.rejects(mutate(kernel, {
    actor: cashier,
    commandId: "POS-PARTIAL-submit",
    doctype: "POS Invoice",
    name: "POS-PARTIAL",
    action: "submit",
    expectedVersion: 1,
    document: invoiceDocument({ qty: "1", payments: [{ row_id: "1", mode_of_payment: "Cash", amount: "10" }] }),
  }), (error) => error.code === "VALIDATION_ERROR" && /receivable\/payment-ledger/.test(error.message));

  await assert.rejects(mutate(kernel, {
    actor: { user_id: "intruder@example.com", roles: ["POS User"] },
    commandId: "POS-INTRUDER-create",
    doctype: "POS Invoice",
    name: "POS-INTRUDER",
    action: "create",
    expectedVersion: null,
    document: invoiceDocument({ qty: "1", payments: [{ row_id: "1", mode_of_payment: "Cash", amount: "12" }] }),
  }), (error) => error.code === "PERMISSION_DENIED");
});