import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-26T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "USD", items: ["ITEM-1", "SUB-ITEM"], warehouses: ["Stores"],
    accounts: ["Debtors", "Sales", "Bank", "Salary Expense", "Payroll Tax Payable", "Payroll Payable"],
  });
  for (const [type, name, data = {}] of [
    ["Employee", "EMP-1"],
    ["Bank Account", "MAIN-BANK", { company: "Demo", currency: "USD", account: "Bank" }],
    ["Salary Component", "Basic", { type: "Earning", account: "Salary Expense" }],
    ["Salary Component", "Tax", { type: "Deduction", account: "Payroll Tax Payable" }],
    ["Subscription Plan", "MONTHLY", { item_code: "SUB-ITEM", rate: "49.99", currency: "USD", interval_months: 1 }],
    ["Regional Profile", "VN-DEMO", { company: "Demo", provider: "sandbox-vn", country_code: "VN" }],
  ]) store.seedMaster(type, name, "demo", data);
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function seedJournal(kernel) {
  await createAndSubmit(kernel, {
    doctype: "Journal Entry", name: "JE-BANK", document: {
      company: "Demo", posting_at: now(), accounts: [
        { row_id: "1", account: "Bank", debit: "100", credit: "0" },
        { row_id: "2", account: "Sales", debit: "0", credit: "100" },
      ],
    },
  });
}

async function seedInvoice(kernel) {
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-EINV", document: {
      customer: "CUST-1", company: "Demo", currency: "USD", posting_at: now(),
      debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-1", qty: "1", rate: "10", income_account: "Sales" }], taxes: [],
    },
  });
}

test("bank statement reconciliation is partial, bounded and reversible", async () => {
  const { store, kernel } = setup();
  await seedJournal(kernel);
  await createAndSubmit(kernel, { doctype: "Bank Transaction", name: "BT-1", document: { bank_account: "MAIN-BANK", posting_at: now(), transaction_type: "Deposit", amount: "100", company: "FORGED", currency: "EUR" } });
  let transaction = await store.getDocument("demo", "Bank Transaction", "BT-1");
  assert.equal(transaction.data.company, "Demo");
  assert.equal(transaction.data.currency, "USD");
  assert.equal(transaction.status, "Unreconciled");

  await createAndSubmit(kernel, { doctype: "Bank Reconciliation", name: "BREC-1", document: { bank_account: "MAIN-BANK", posting_at: now(), entries: [{ row_id: "1", bank_transaction: "BT-1", voucher_type: "Journal Entry", voucher_no: "JE-BANK", amount: "60" }] } });
  transaction = await store.getDocument("demo", "Bank Transaction", "BT-1");
  assert.equal(transaction.status, "Partly Reconciled");
  assert.equal(transaction.data.reconciled_amount, "60.00");

  await mutate(kernel, { commandId: "BREC-OVER-create", doctype: "Bank Reconciliation", name: "BREC-OVER", action: "create", expectedVersion: null, document: { bank_account: "MAIN-BANK", posting_at: now(), entries: [{ row_id: "1", bank_transaction: "BT-1", voucher_type: "Journal Entry", voucher_no: "JE-BANK", amount: "50" }] } });
  await assert.rejects(mutate(kernel, { commandId: "BREC-OVER-submit", doctype: "Bank Reconciliation", name: "BREC-OVER", action: "submit", expectedVersion: 1, document: { bank_account: "MAIN-BANK", posting_at: now(), entries: [{ row_id: "1", bank_transaction: "BT-1", voucher_type: "Journal Entry", voucher_no: "JE-BANK", amount: "50" }] } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  await createAndSubmit(kernel, { doctype: "Bank Reconciliation", name: "BREC-2", document: { bank_account: "MAIN-BANK", posting_at: now(), entries: [{ row_id: "1", bank_transaction: "BT-1", voucher_type: "Journal Entry", voucher_no: "JE-BANK", amount: "40" }] } });
  transaction = await store.getDocument("demo", "Bank Transaction", "BT-1");
  assert.equal(transaction.status, "Reconciled");
  await mutate(kernel, { commandId: "BREC-1-cancel", doctype: "Bank Reconciliation", name: "BREC-1", action: "cancel", expectedVersion: 2, document: {} });
  transaction = await store.getDocument("demo", "Bank Transaction", "BT-1");
  assert.equal(transaction.status, "Partly Reconciled");
  assert.equal(transaction.data.reconciled_amount, "40.00");
});

test("salary slip uses server component accounts and payroll cannot double include a slip", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Salary Slip", name: "SAL-1", document: {
    employee: "EMP-1", company: "Demo", posting_at: now(), start_date: "2026-07-01", end_date: "2026-07-31", payroll_payable_account: "Payroll Payable",
    earnings: [{ row_id: "1", salary_component: "Basic", amount: "1000", account: "FORGED" }],
    deductions: [{ row_id: "2", salary_component: "Tax", amount: "100", account: "FORGED" }],
  } });
  const slip = await store.getDocument("demo", "Salary Slip", "SAL-1");
  assert.equal(slip.data.earnings[0].account, "Salary Expense");
  assert.equal(slip.data.deductions[0].account, "Payroll Tax Payable");
  assert.equal(slip.data.net_pay, "900.00");
  assert.equal(slip.data.outstanding_amount, "900.00");
  assert.equal(slip.status, "Unpaid");
  const salaryGl = store.snapshot().gl_entries.filter((line) => ["EARNING-1", "DEDUCTION-2", "PAYROLL-PAYABLE"].includes(line.line_key));
  assert.equal(salaryGl.reduce((sum, line) => sum + line.debit_minor, 0), salaryGl.reduce((sum, line) => sum + line.credit_minor, 0));

  await createAndSubmit(kernel, { doctype: "Payroll Entry", name: "PAYROLL-1", document: { company: "Demo", posting_at: now(), start_date: "2026-07-01", end_date: "2026-07-31", salary_slips: [{ row_id: "1", salary_slip: "SAL-1" }] } });
  const payroll = await store.getDocument("demo", "Payroll Entry", "PAYROLL-1");
  assert.equal(payroll.data.total_net_pay, "900.00");
  await mutate(kernel, { commandId: "PAYROLL-2-create", doctype: "Payroll Entry", name: "PAYROLL-2", action: "create", expectedVersion: null, document: { company: "Demo", posting_at: now(), start_date: "2026-07-01", end_date: "2026-07-31", salary_slips: [{ row_id: "1", salary_slip: "SAL-1" }] } });
  await assert.rejects(mutate(kernel, { commandId: "PAYROLL-2-submit", doctype: "Payroll Entry", name: "PAYROLL-2", action: "submit", expectedVersion: 1, document: { company: "Demo", posting_at: now(), start_date: "2026-07-01", end_date: "2026-07-31", salary_slips: [{ row_id: "1", salary_slip: "SAL-1" }] } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("subscription derives item, price and billing schedule from the server plan", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Subscription", name: "SUB-1", document: { customer: "CUST-1", company: "Demo", subscription_plan: "MONTHLY", start_date: "2026-01-31", qty: "2", rate: "0.01", currency: "EUR", next_invoice_date: "2099-01-01" } });
  const subscription = await store.getDocument("demo", "Subscription", "SUB-1");
  assert.equal(subscription.data.item_code, "SUB-ITEM");
  assert.equal(subscription.data.rate, "49.99");
  assert.equal(subscription.data.amount, "99.98");
  assert.equal(subscription.data.currency, "USD");
  assert.equal(subscription.data.next_invoice_date, "2026-02-28");
  assert.equal(subscription.status, "Active");
});

test("e-invoice submission is source-bound, provider-derived and unique", async () => {
  const { store, kernel } = setup();
  await seedInvoice(kernel);
  await createAndSubmit(kernel, { doctype: "E-Invoice Submission", name: "EINV-1", document: { source_doctype: "Sales Invoice", source_name: "SI-EINV", regional_profile: "VN-DEMO", posting_at: now(), provider: "FORGED", submission_status: "Queued" } });
  const submission = await store.getDocument("demo", "E-Invoice Submission", "EINV-1");
  assert.equal(submission.data.provider, "sandbox-vn");
  assert.equal(submission.data.company, "Demo");
  assert.equal(submission.data.source_version, 2);
  assert.equal(submission.status, "Queued");
  await mutate(kernel, { commandId: "EINV-2-create", doctype: "E-Invoice Submission", name: "EINV-2", action: "create", expectedVersion: null, document: { source_doctype: "Sales Invoice", source_name: "SI-EINV", regional_profile: "VN-DEMO", posting_at: now() } });
  await assert.rejects(mutate(kernel, { commandId: "EINV-2-submit", doctype: "E-Invoice Submission", name: "EINV-2", action: "submit", expectedVersion: 1, document: { source_doctype: "Sales Invoice", source_name: "SI-EINV", regional_profile: "VN-DEMO", posting_at: now() } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});
