import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-10-02T09:00:00.000Z";

function setup(customer = {}) {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["ITEM-1"],
    accounts: ["Income"],
  });
  store.seedMaster("Customer", "CUST-1", "demo", customer);
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, undefined, () => NOW);
  return { store, kernel };
}

function order(name, amount = "60") {
  return {
    doctype: "Sales Order",
    name,
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-10-02",
      items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty: "1", rate: amount }],
      taxes: [],
    },
  };
}

test("sales order freezes Customer credit limit in company-currency minor units", async () => {
  const { store, kernel } = setup({ credit_limit: "100" });
  await createAndSubmit(kernel, order("SO-CREDIT"));

  const saved = await store.getDocument("demo", "Sales Order", "SO-CREDIT");
  assert.equal(saved.data.credit_limit_minor, 10_000);
  assert.equal(saved.data.credit_limit, "100.00");
  assert.equal(saved.data.credit_limit_source, "Customer");
  assert.equal(saved.data.credit_limit_enforced, true);
  assert.equal(saved.data.credit_limit_bypass_sales_order, false);
});

test("sales-order bypass disables order reservation but preserves the policy snapshot", async () => {
  const { store, kernel } = setup({
    credit_limit: "100",
    bypass_credit_limit_check: true,
  });
  await createAndSubmit(kernel, order("SO-BYPASS"));

  const saved = await store.getDocument("demo", "Sales Order", "SO-BYPASS");
  assert.equal(saved.data.credit_limit_minor, 10_000);
  assert.equal(saved.data.credit_limit_bypass_sales_order, true);
  assert.equal(saved.data.credit_limit_enforced, false);
});

test("customer hold blocks submit until the release date has passed", async () => {
  const { kernel } = setup({
    credit_limit: "100",
    on_hold: true,
    release_date: "2026-10-03",
  });

  await assert.rejects(
    createAndSubmit(kernel, order("SO-HOLD")),
    /on credit hold/i,
  );
});


function setupRefund() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["ITEM-1"],
    warehouses: ["Stores"],
    accounts: ["Debtors", "Sales", "Bank"],
  });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  const kernel = new DocumentKernel(registry, store, undefined, () => NOW);
  return { store, kernel };
}

test("fully-paid return becomes customer credit and Payment Entry refund clears it exactly", async () => {
  const { store, kernel } = setupRefund();

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "SI-PAID",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "SI-1", item_code: "ITEM-1", qty: "1", rate: "40", income_account: "Sales" }],
      taxes: [],
    },
  });

  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-FULL",
    document: {
      company: "Demo",
      posting_at: NOW,
      payment_type: "Receive",
      party_type: "Customer",
      party: "CUST-1",
      paid_from: "Debtors",
      paid_to: "Bank",
      paid_amount: "40",
      received_amount: "40",
      currency: "USD",
      references: [{
        row_id: "PAY-1",
        reference_doctype: "Sales Invoice",
        reference_name: "SI-PAID",
        allocated_amount: "40",
      }],
    },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-PAID"), 0);

  await createAndSubmit(kernel, {
    doctype: "Credit Note",
    name: "CN-PAID",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      return_against: "SI-PAID",
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "CN-1", item_code: "ITEM-1", qty: "1", rate: "40" }],
      taxes: [],
    },
  });

  const credit = await store.getDocument("demo", "Credit Note", "CN-PAID");
  assert.equal(credit.data.applied_to_invoice_minor, 0);
  assert.equal(credit.data.customer_credit_minor, 4_000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-PAID"), 0);
  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-PAID"), -4_000);

  await assert.rejects(
    createAndSubmit(kernel, {
      doctype: "Payment Entry",
      name: "REFUND-OVER",
      document: {
        company: "Demo",
        posting_at: NOW,
        payment_type: "Pay",
        party_type: "Customer",
        party: "CUST-1",
        paid_from: "Bank",
        paid_to: "Debtors",
        paid_amount: "41",
        received_amount: "41",
        currency: "USD",
        references: [{
          row_id: "REF-OVER",
          reference_doctype: "Credit Note",
          reference_name: "CN-PAID",
          allocated_amount: "41",
        }],
      },
    }),
    /exceeds outstanding/i,
  );

  await assert.rejects(
    createAndSubmit(kernel, {
      doctype: "Payment Entry",
      name: "REFUND-UNALLOCATED",
      document: {
        company: "Demo",
        posting_at: NOW,
        payment_type: "Pay",
        party_type: "Customer",
        party: "CUST-1",
        paid_from: "Bank",
        paid_to: "Debtors",
        paid_amount: "1",
        received_amount: "1",
        currency: "USD",
        references: [],
      },
    }),
    /fully allocated/i,
  );

  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "REFUND-1",
    document: {
      company: "Demo",
      posting_at: NOW,
      payment_type: "Pay",
      party_type: "Customer",
      party: "CUST-1",
      paid_from: "Bank",
      paid_to: "Debtors",
      paid_amount: "40",
      received_amount: "40",
      currency: "USD",
      references: [{
        row_id: "REF-1",
        reference_doctype: "Credit Note",
        reference_name: "CN-PAID",
        allocated_amount: "40",
      }],
    },
  });

  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-PAID"), 0);
  const refundGl = await store.getVoucherGlEntries("demo", "Payment Entry", "REFUND-1", 2);
  assert.equal(
    refundGl.filter((line) => line.account === "Debtors").reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    4_000,
  );
  assert.equal(
    refundGl.filter((line) => line.account === "Bank").reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    -4_000,
  );

  await mutate(kernel, {
    commandId: "REFUND-1-cancel",
    doctype: "Payment Entry",
    name: "REFUND-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-PAID"), -4_000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-PAID"), 0);
});


test("Payment Allocation reuses Credit Note customer credit against a later Sales Invoice with exact reversal", async () => {
  const { store, kernel } = setupRefund();

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "SI-CREDIT-SOURCE",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "SRC-1", item_code: "ITEM-1", qty: "1", rate: "40", income_account: "Sales" }],
      taxes: [],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-CREDIT-SOURCE",
    document: {
      company: "Demo",
      posting_at: NOW,
      payment_type: "Receive",
      party_type: "Customer",
      party: "CUST-1",
      paid_from: "Debtors",
      paid_to: "Bank",
      paid_amount: "40",
      received_amount: "40",
      currency: "USD",
      references: [{
        row_id: "PAY-SRC",
        reference_doctype: "Sales Invoice",
        reference_name: "SI-CREDIT-SOURCE",
        allocated_amount: "40",
      }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Credit Note",
    name: "CN-REUSABLE",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      return_against: "SI-CREDIT-SOURCE",
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "CN-SRC", item_code: "ITEM-1", qty: "1", rate: "40" }],
      taxes: [],
    },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-REUSABLE"), -4_000);

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "SI-LATER",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "LATER-1", item_code: "ITEM-1", qty: "1", rate: "25", income_account: "Sales" }],
      taxes: [],
    },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-LATER"), 2_500);

  await assert.rejects(
    createAndSubmit(kernel, {
      doctype: "Payment Allocation",
      name: "PA-CREDIT-OVER-TARGET",
      document: {
        company: "Demo",
        party_type: "Customer",
        party: "CUST-1",
        party_account: "Debtors",
        currency: "USD",
        posting_at: NOW,
        source_credit_note: "CN-REUSABLE",
        references: [{
          row_id: "ALLOC-OVER",
          reference_doctype: "Sales Invoice",
          reference_name: "SI-LATER",
          allocated_amount: "26",
        }],
      },
    }),
    /exceeds outstanding/i,
  );

  await createAndSubmit(kernel, {
    doctype: "Payment Allocation",
    name: "PA-CREDIT-1",
    document: {
      company: "Demo",
      party_type: "Customer",
      party: "CUST-1",
      party_account: "Debtors",
      currency: "USD",
      posting_at: NOW,
      source_credit_note: "CN-REUSABLE",
      references: [{
        row_id: "ALLOC-1",
        reference_doctype: "Sales Invoice",
        reference_name: "SI-LATER",
        allocated_amount: "25",
      }],
    },
  });

  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-LATER"), 0);
  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-REUSABLE"), -1_500);
  assert.equal((await store.getVoucherGlEntries("demo", "Payment Allocation", "PA-CREDIT-1", 2)).length, 0);

  const allocation = await store.getDocument("demo", "Payment Allocation", "PA-CREDIT-1");
  assert.equal(allocation.data.source_voucher_type, "Credit Note");
  assert.equal(allocation.data.source_voucher_no, "CN-REUSABLE");
  assert.equal(allocation.data.total_allocated_amount_minor, 2_500);

  await assert.rejects(
    mutate(kernel, {
      commandId: "CN-REUSABLE-cancel-blocked",
      doctype: "Credit Note",
      name: "CN-REUSABLE",
      action: "cancel",
      expectedVersion: 2,
      document: {},
    }),
    /customer credit|remaining Credit Note/i,
  );

  await mutate(kernel, {
    commandId: "PA-CREDIT-1-cancel",
    doctype: "Payment Allocation",
    name: "PA-CREDIT-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-LATER"), 2_500);
  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-REUSABLE"), -4_000);
});


test("customer credit allocation posts realized FX when source and target historical bases differ", async () => {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "EUR",
    companyCurrency: "USD",
    items: ["ITEM-1"],
    accounts: ["Debtors", "Sales", "Bank", "FX Gain/Loss"],
  });
  store.seedMaster("Company", "Demo", "demo", {
    default_currency: "USD",
    exchange_gain_loss_account: "FX Gain/Loss",
  });
  store.seedMaster("Exchange Rate", "EUR:USD:2026-10-02", "demo", { rate: "1.000000" });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  const kernel = new DocumentKernel(registry, store, undefined, () => NOW);

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "SI-FX-SOURCE",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "EUR",
      posting_at: NOW,
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "FX-SRC", item_code: "ITEM-1", qty: "1", rate: "40", income_account: "Sales" }],
      taxes: [],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-FX-SOURCE",
    document: {
      company: "Demo",
      posting_at: NOW,
      payment_type: "Receive",
      party_type: "Customer",
      party: "CUST-1",
      paid_from: "Debtors",
      paid_to: "Bank",
      paid_amount: "40",
      received_amount: "40",
      currency: "EUR",
      references: [{
        row_id: "PAY-FX",
        reference_doctype: "Sales Invoice",
        reference_name: "SI-FX-SOURCE",
        allocated_amount: "40",
      }],
    },
  });

  store.seedMaster("Exchange Rate", "EUR:USD:2026-10-02", "demo", { rate: "1.200000" });
  await createAndSubmit(kernel, {
    doctype: "Credit Note",
    name: "CN-FX-CREDIT",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "EUR",
      posting_at: NOW,
      return_against: "SI-FX-SOURCE",
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "CN-FX", item_code: "ITEM-1", qty: "1", rate: "40" }],
      taxes: [],
    },
  });

  store.seedMaster("Exchange Rate", "EUR:USD:2026-10-02", "demo", { rate: "1.100000" });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "SI-FX-LATER",
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "EUR",
      posting_at: NOW,
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "FX-LATER", item_code: "ITEM-1", qty: "1", rate: "25", income_account: "Sales" }],
      taxes: [],
    },
  });

  await createAndSubmit(kernel, {
    doctype: "Payment Allocation",
    name: "PA-FX-REALIZED",
    document: {
      company: "Demo",
      party_type: "Customer",
      party: "CUST-1",
      party_account: "Debtors",
      currency: "EUR",
      posting_at: NOW,
      source_credit_note: "CN-FX-CREDIT",
      references: [{
        row_id: "FX-ALLOC",
        reference_doctype: "Sales Invoice",
        reference_name: "SI-FX-LATER",
        allocated_amount: "25",
      }],
    },
  });

  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-FX-CREDIT"), -1_500);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Credit Note", "CN-FX-CREDIT"), -1_800);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-FX-LATER"), 0);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Sales Invoice", "SI-FX-LATER"), 0);

  const allocation = await store.getDocument("demo", "Payment Allocation", "PA-FX-REALIZED");
  assert.equal(allocation.data.total_source_base_allocated_amount_minor, 3_000);
  assert.equal(allocation.data.total_base_allocated_amount_minor, 2_750);
  assert.equal(allocation.data.exchange_difference_minor, 250);
  assert.equal(allocation.data.exchange_gain_loss_account, "FX Gain/Loss");
  assert.equal(allocation.data.references[0].source_base_allocated_amount_minor, 3_000);
  assert.equal(allocation.data.references[0].base_allocated_amount_minor, 2_750);

  const gl = await store.getVoucherGlEntries("demo", "Payment Allocation", "PA-FX-REALIZED", 2);
  assert.equal(gl.length, 2);
  assert.equal(
    gl.filter((line) => line.account === "Debtors")
      .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    250,
  );
  assert.equal(
    gl.filter((line) => line.account === "FX Gain/Loss")
      .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    -250,
  );
  assert.equal(
    gl.reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    0,
  );

  await mutate(kernel, {
    commandId: "PA-FX-REALIZED-cancel",
    doctype: "Payment Allocation",
    name: "PA-FX-REALIZED",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Credit Note", "CN-FX-CREDIT"), -4_000);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Credit Note", "CN-FX-CREDIT"), -4_800);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-FX-LATER"), 2_500);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Sales Invoice", "SI-FX-LATER"), 2_750);
});


test("supplier advance allocation posts the opposite realized FX party sign", async () => {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "EUR",
    companyCurrency: "USD",
    items: ["ITEM-1"],
    accounts: ["Creditors", "Expense", "Bank", "FX Gain/Loss"],
  });
  store.seedMaster("Company", "Demo", "demo", {
    default_currency: "USD",
    exchange_gain_loss_account: "FX Gain/Loss",
  });
  store.seedMaster("Supplier", "SUP-1", "demo", {});
  store.seedMaster("Exchange Rate", "EUR:USD:2026-10-02", "demo", { rate: "1.200000" });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  const kernel = new DocumentKernel(registry, store, undefined, () => NOW);

  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PE-SUP-ADV-FX",
    document: {
      company: "Demo",
      posting_at: NOW,
      payment_type: "Pay",
      party_type: "Supplier",
      party: "SUP-1",
      paid_from: "Bank",
      paid_to: "Creditors",
      paid_amount: "40",
      received_amount: "48",
      currency: "EUR",
      allow_unallocated: true,
      references: [],
    },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-SUP-ADV-FX"), -4_000);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Payment Entry", "PE-SUP-ADV-FX"), -4_800);

  store.seedMaster("Exchange Rate", "EUR:USD:2026-10-02", "demo", { rate: "1.100000" });
  await createAndSubmit(kernel, {
    doctype: "Purchase Invoice",
    name: "PI-SUP-FX",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "EUR",
      posting_at: NOW,
      credit_to: "Creditors",
      items: [{
        row_id: "PI-FX-1",
        item_code: "ITEM-1",
        qty: "1",
        rate: "25",
        expense_account: "Expense",
      }],
      taxes: [],
    },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-SUP-FX"), 2_500);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Purchase Invoice", "PI-SUP-FX"), 2_750);

  await createAndSubmit(kernel, {
    doctype: "Payment Allocation",
    name: "PA-SUP-FX",
    document: {
      company: "Demo",
      party_type: "Supplier",
      party: "SUP-1",
      party_account: "Creditors",
      currency: "EUR",
      posting_at: NOW,
      source_payment_entry: "PE-SUP-ADV-FX",
      references: [{
        row_id: "SUP-FX-ALLOC",
        reference_doctype: "Purchase Invoice",
        reference_name: "PI-SUP-FX",
        allocated_amount: "25",
      }],
    },
  });

  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-SUP-ADV-FX"), -1_500);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Payment Entry", "PE-SUP-ADV-FX"), -1_800);
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-SUP-FX"), 0);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Purchase Invoice", "PI-SUP-FX"), 0);

  const gl = await store.getVoucherGlEntries("demo", "Payment Allocation", "PA-SUP-FX", 2);
  assert.equal(
    gl.filter((line) => line.account === "Creditors")
      .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    -250,
  );
  assert.equal(
    gl.filter((line) => line.account === "FX Gain/Loss")
      .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    250,
  );
  assert.equal(gl.reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0), 0);

  await mutate(kernel, {
    commandId: "PA-SUP-FX-cancel",
    doctype: "Payment Allocation",
    name: "PA-SUP-FX",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-SUP-ADV-FX"), -4_000);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Payment Entry", "PE-SUP-ADV-FX"), -4_800);
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-SUP-FX"), 2_500);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Purchase Invoice", "PI-SUP-FX"), 2_750);
});
