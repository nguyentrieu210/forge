import test from "node:test";
import assert from "node:assert/strict";
import { AccountingJournalEntryController } from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const now = "2026-08-03T08:00:00.000Z";
const actor = { user_id: "chief@example.test", roles: ["Accounts Manager"] };

function seededStore({ withRate = true } = {}) {
  const store = new InMemoryMutationStore();
  store.seedMaster("Company", "ALU", tenant, { default_currency: "VND" });
  store.seedMaster("Currency", "VND", tenant, { currency_scale: 0 });
  store.seedMaster("Currency", "USD", tenant, { currency_scale: 2 });
  store.seedMaster("Account", "1122-USD", tenant, { company: "ALU", account_currency: "USD" });
  store.seedMaster("Account", "1111-VND", tenant, { company: "ALU", account_currency: "VND" });
  if (withRate) store.seedMaster("Exchange Rate", "USD:VND:2026-08-03", tenant, { rate: "25000" });
  return store;
}

async function plan(document, store = seededStore()) {
  const controller = new AccountingJournalEntryController();
  return controller.buildPlan({
    command: {
      command_id: "fx-je",
      tenant_id: tenant,
      aggregate: { doctype: "Journal Entry", name: "JV-FX-1" },
      action: "submit",
      expected_version: 1,
      payload_hash: "0".repeat(64),
      actor,
      document,
    },
    existing: null,
    now,
    nextVersion: 2,
    reader: store,
  });
}

test("Journal Entry converts account currency to company currency with server rate", async () => {
  const result = await plan({
    company: "ALU",
    posting_at: now,
    accounts: [
      {
        row_id: "USD",
        account: "1122-USD",
        debit: 0,
        credit: 0,
        debit_in_account_currency: "100.00",
        credit_in_account_currency: 0,
        exchange_rate: "1", // hostile/stale client value; server must ignore it
      },
      { row_id: "VND", account: "1111-VND", debit: 0, credit: 2_500_000 },
    ],
  });

  assert.equal(result.document.data.company_currency, "VND");
  assert.equal(result.document.data.company_currency_scale, 0);
  assert.equal(result.document.data.total_debit, "2500000");
  assert.equal(result.document.data.total_credit, "2500000");

  const usd = result.document.data.accounts[0];
  assert.equal(usd.account_currency, "USD");
  assert.equal(usd.account_currency_scale, 2);
  assert.equal(usd.exchange_rate, "25000.000000");
  assert.equal(usd.debit_in_account_currency, "100.00");
  assert.equal(usd.debit, "2500000");
  assert.equal(usd.debit_minor, 2_500_000);

  assert.deepEqual(result.gl_entries.map((line) => ({
    account: line.account,
    debit_minor: line.debit_minor,
    credit_minor: line.credit_minor,
    currency: line.currency,
    currency_scale: line.currency_scale,
  })), [
    { account: "1122-USD", debit_minor: 2_500_000, credit_minor: 0, currency: "VND", currency_scale: 0 },
    { account: "1111-VND", debit_minor: 0, credit_minor: 2_500_000, currency: "VND", currency_scale: 0 },
  ]);
});

test("foreign-currency Journal Entry fails closed without server exchange rate", async () => {
  await assert.rejects(() => plan({
    company: "ALU",
    posting_at: now,
    accounts: [
      { row_id: "USD", account: "1122-USD", debit: 0, credit: 0, debit_in_account_currency: "100.00" },
      { row_id: "VND", account: "1111-VND", debit: 0, credit: 2_500_000 },
    ],
  }, seededStore({ withRate: false })), (error) => error.code === "REFERENCE_ERROR");
});

test("foreign account cannot fall back to an ambiguous base-only amount", async () => {
  await assert.rejects(() => plan({
    company: "ALU",
    posting_at: now,
    accounts: [
      { row_id: "USD", account: "1122-USD", debit: 2_500_000, credit: 0 },
      { row_id: "VND", account: "1111-VND", debit: 0, credit: 2_500_000 },
    ],
  }), (error) => error.code === "VALIDATION_ERROR");
});
