import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { FinanceQueryCompiler } from "../dist/packages/query/src/finance-aging.js";
import { createAndSubmit, mutate, seedStandardMasters } from "./helpers.mjs";

const now = () => "2026-08-03T10:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, undefined, now) };
}

function invoice(amount) {
  return {
    customer: "CUST-0001",
    company: "Demo",
    currency: "USD",
    currency_scale: 2,
    posting_at: now(),
    due_date: "2026-08-31",
    debit_to: "Debtors",
    default_income_account: "Sales",
    items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: String(amount) }],
    taxes: [],
  };
}

function receivePayment(amount, references, extra = {}) {
  return {
    company: "Demo",
    posting_at: now(),
    payment_type: "Receive",
    party_type: "Customer",
    party: "CUST-0001",
    paid_from: "Debtors",
    paid_to: "Bank",
    paid_amount: String(amount),
    received_amount: String(amount),
    currency: "USD",
    currency_scale: 2,
    references,
    ...extra,
  };
}

test("RC-021 canonical AR flow covers partial, multi-invoice, advance, credit correction, retry and cancellation", async () => {
  const { store, kernel } = setup();

  await createAndSubmit(kernel, { doctype: "Sales Invoice", name: "SI-A", document: invoice(100) });
  await createAndSubmit(kernel, { doctype: "Sales Invoice", name: "SI-B", document: invoice(50) });

  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-PARTIAL-1",
    document: receivePayment(30, [
      { row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-A", allocated_amount: "30" },
    ]),
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 7000);

  // Active settlement prevents cancelling the invoice underneath Payment Ledger.
  await assert.rejects(
    mutate(kernel, {
      commandId: "SI-A-cancel-blocked",
      doctype: "Sales Invoice",
      name: "SI-A",
      action: "cancel",
      expectedVersion: 2,
      document: {},
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /active Payment Entries/.test(error.message),
  );

  // One receipt can allocate multiple invoices while each target remains bounded.
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-PARTIAL-2",
    document: receivePayment(30, [
      { row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-A", allocated_amount: "20" },
      { row_id: "2", reference_doctype: "Sales Invoice", reference_name: "SI-B", allocated_amount: "10" },
    ]),
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 5000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-B"), 4000);

  await assert.rejects(
    mutate(kernel, {
      commandId: "advance-without-confirmation",
      doctype: "Payment Entry",
      name: "ADV-BAD",
      action: "create",
      expectedVersion: null,
      document: receivePayment(30, []),
    }),
    (error) => error.code === "VALIDATION_ERROR" && /explicit advance confirmation/.test(error.message),
  );

  // Under-allocation is explicit customer advance, never a client-side paid flag.
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "ADV-1",
    document: receivePayment(30, [], { allow_unallocated: true }),
  });
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "ADV-1"), -3000);

  await createAndSubmit(kernel, {
    doctype: "Payment Allocation",
    name: "PA-1",
    document: {
      company: "Demo",
      party_type: "Customer",
      party: "CUST-0001",
      party_account: "Debtors",
      currency: "USD",
      posting_at: now(),
      source_payment_entry: "ADV-1",
      reason: "Allocate customer advance",
      references: [
        { row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-A", allocated_amount: "20" },
        { row_id: "2", reference_doctype: "Sales Invoice", reference_name: "SI-B", allocated_amount: "10" },
      ],
    },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "ADV-1"), 0);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 3000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-B"), 3000);

  await assert.rejects(
    createAndSubmit(kernel, {
      doctype: "Sales Invoice",
      name: "CN-TOO-MUCH",
      document: { ...invoice(31), is_return: true, return_against: "SI-A" },
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /exceeds outstanding receivable/.test(error.message),
  );

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "CN-1",
    document: { ...invoice(10), is_return: true, return_against: "SI-A" },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 2000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "CN-1"), 0);
  const creditGl = await store.getVoucherGlEntries("demo", "Sales Invoice", "CN-1", 2);
  assert.equal(
    creditGl.filter((line) => line.account === "Debtors").reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    -1000,
  );

  // Correction is append-only reversal. Cancelling the credit restores the source invoice.
  await mutate(kernel, {
    commandId: "CN-1-cancel",
    doctype: "Sales Invoice",
    name: "CN-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 3000);

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "CN-2",
    document: { ...invoice(10), is_return: true, return_against: "SI-A" },
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 2000);

  const finalDocument = receivePayment(50, [
    { row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-A", allocated_amount: "20" },
    { row_id: "2", reference_doctype: "Sales Invoice", reference_name: "SI-B", allocated_amount: "30" },
  ]);
  await mutate(kernel, {
    commandId: "PAY-FINAL-create",
    doctype: "Payment Entry",
    name: "PAY-FINAL",
    action: "create",
    expectedVersion: null,
    document: finalDocument,
  });
  const submitCommand = {
    commandId: "PAY-FINAL-submit",
    doctype: "Payment Entry",
    name: "PAY-FINAL",
    action: "submit",
    expectedVersion: 1,
    document: finalDocument,
  };
  const firstReceipt = await mutate(kernel, submitCommand);
  const ledgerCount = store.snapshot().payment_entries.length;
  const retryReceipt = await mutate(kernel, submitCommand);
  assert.deepEqual(retryReceipt, firstReceipt);
  assert.equal(store.snapshot().payment_entries.length, ledgerCount, "idempotent retry must not duplicate ledger rows");
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 0);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-B"), 0);

  await mutate(kernel, {
    commandId: "PAY-FINAL-cancel",
    doctype: "Payment Entry",
    name: "PAY-FINAL",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 2000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-B"), 3000);

  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-FINAL-2",
    document: finalDocument,
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-A"), 0);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-B"), 0);

  // Control-account reconciliation: Payment Ledger base balance must equal the
  // customer-dimension GL net debit. Payment Allocation contributes net zero.
  const snapshot = store.snapshot();
  const paymentBase = snapshot.payment_entries
    .filter((line) => line.account_type === "Receivable" && line.party_type === "Customer" && line.party === "CUST-0001" && line.account === "Debtors")
    .reduce((sum, line) => sum + line.base_amount_minor, 0);
  const glBase = snapshot.gl_entries
    .filter((line) => line.party_type === "Customer" && line.party === "CUST-0001" && line.account === "Debtors")
    .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0);
  assert.equal(paymentBase, 0);
  assert.equal(glBase, paymentBase);
});

test("credit-note submit/cancel stays behind the Sales Invoice server permission boundary", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Invoice", name: "SI-PERM", document: invoice(100) });
  const credit = { ...invoice(10), is_return: true, return_against: "SI-PERM" };
  const accountsUser = { user_id: "accounts-user", roles: ["Accounts User"] };
  const accountsManager = { user_id: "accounts-manager", roles: ["Accounts Manager"] };

  await mutate(kernel, {
    commandId: "CN-PERM-create",
    doctype: "Sales Invoice",
    name: "CN-PERM",
    action: "create",
    expectedVersion: null,
    document: credit,
    actor: accountsUser,
  });

  await assert.rejects(
    mutate(kernel, {
      commandId: "CN-PERM-submit-denied",
      doctype: "Sales Invoice",
      name: "CN-PERM",
      action: "submit",
      expectedVersion: 1,
      document: credit,
      actor: accountsUser,
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );

  await mutate(kernel, {
    commandId: "CN-PERM-submit-approved",
    doctype: "Sales Invoice",
    name: "CN-PERM",
    action: "submit",
    expectedVersion: 1,
    document: credit,
    actor: accountsManager,
  });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-PERM"), 9000);
});

test("AR aging compiler remains Payment-Ledger authoritative and tenant-bound", () => {
  const compiler = new FinanceQueryCompiler();
  const compiled = compiler.compile({
    report: "Accounts Receivable Aging",
    tenant_id: "tenant-a",
    filters: [{ field: "as_of_date", operator: "=", value: "2026-08-31" }],
  });
  assert.match(compiled.sql, /payment_ledger_entries/);
  assert.match(compiled.sql, /finance_invoice_terms/);
  assert.match(compiled.sql, /p\.tenant_id=\?1/);
  assert.equal(compiled.params[0], "tenant-a");
});