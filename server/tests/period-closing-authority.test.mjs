import test from "node:test";
import assert from "node:assert/strict";

import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-12-31T23:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedMaster("Company", "Demo", "demo", { default_currency: "USD" });
  store.seedMaster("Currency", "USD", "demo", { currency_scale: 2 });
  store.seedMaster("Fiscal Year", "2026", "demo", {
    year_start_date: "2026-01-01",
    year_end_date: "2026-12-31",
  });
  store.seedMaster("Account", "Cash", "demo", {
    company: "Demo", root_type: "Asset", is_group: 0,
  });
  store.seedMaster("Account", "Sales", "demo", {
    company: "Demo", root_type: "Income", is_group: 0,
  });
  store.seedMaster("Account", "Rent", "demo", {
    company: "Demo", root_type: "Expense", is_group: 0,
  });
  store.seedMaster("Account", "Retained Earnings", "demo", {
    company: "Demo", root_type: "Equity", is_group: 0,
  });
  const registry = registerErpCoreControllers(createO2CControllerRegistry());
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => NOW) };
}

async function journal(kernel, name, postingAt, accounts) {
  return createAndSubmit(kernel, {
    doctype: "Journal Entry",
    name,
    document: {
      company: "Demo",
      posting_at: postingAt,
      accounts,
    },
  });
}

async function seedProfit(store, kernel) {
  await journal(kernel, "JE-SALES", "2026-06-30T09:00:00.000Z", [
    { row_id: "CASH", account: "Cash", debit: "100", credit: "0" },
    { row_id: "SALES", account: "Sales", debit: "0", credit: "100" },
  ]);
  await journal(kernel, "JE-RENT", "2026-07-31T09:00:00.000Z", [
    { row_id: "RENT", account: "Rent", debit: "60", credit: "0" },
    { row_id: "CASH", account: "Cash", debit: "0", credit: "60" },
  ]);
  store.setPeriodLock("Demo", "2026-12-31");
}

function closeVoucher(name = "PCV-2026") {
  return {
    doctype: "Period Closing Voucher",
    name,
    document: {
      company: "Demo",
      fiscal_year: "2026",
      posting_at: "2026-12-31T23:59:59.000Z",
      closing_account: "Retained Earnings",
      remarks: "Close FY2026",
    },
  };
}

test("Period Closing Voucher closes P&L into retained earnings and cancels by exact reversal", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);

  const before = await store.getGlAccountBalances({
    tenantId: "demo",
    company: "Demo",
    fromDate: "2026-01-01",
    throughDate: "2026-12-31",
  });
  assert.equal(before.find((row) => row.account === "Sales")?.balance_minor, -10_000);
  assert.equal(before.find((row) => row.account === "Rent")?.balance_minor, 6_000);

  await createAndSubmit(kernel, closeVoucher());
  const saved = await store.getDocument("demo", "Period Closing Voucher", "PCV-2026");
  assert.equal(saved.docstatus, 1);
  assert.equal(saved.data.net_profit_loss_minor, 4_000);
  assert.equal(saved.data.net_profit_loss, "40.00");
  assert.equal(saved.data.source_gl_row_count, 2);
  assert.equal(saved.data.source_debit_minor, 6_000);
  assert.equal(saved.data.source_credit_minor, 10_000);
  assert.equal(saved.data.closing_entries.length, 2);

  const after = await store.getGlAccountBalances({
    tenantId: "demo",
    company: "Demo",
    fromDate: "2026-01-01",
    throughDate: "2026-12-31",
  });
  assert.equal(after.find((row) => row.account === "Sales")?.balance_minor, 0);
  assert.equal(after.find((row) => row.account === "Rent")?.balance_minor, 0);
  assert.equal(after.find((row) => row.account === "Retained Earnings")?.balance_minor, -4_000);

  await mutate(kernel, {
    commandId: "PCV-2026-cancel",
    doctype: "Period Closing Voucher",
    name: "PCV-2026",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });

  const reversed = await store.getGlAccountBalances({
    tenantId: "demo",
    company: "Demo",
    fromDate: "2026-01-01",
    throughDate: "2026-12-31",
  });
  assert.equal(reversed.find((row) => row.account === "Sales")?.balance_minor, -10_000);
  assert.equal(reversed.find((row) => row.account === "Rent")?.balance_minor, 6_000);
  assert.equal(reversed.find((row) => row.account === "Retained Earnings")?.balance_minor, 0);
});

test("Period Closing Voucher requires a period lock through the closing date", async () => {
  const { store, kernel } = setup();
  await journal(kernel, "JE-SALES", "2026-06-30T09:00:00.000Z", [
    { row_id: "CASH", account: "Cash", debit: "100", credit: "0" },
    { row_id: "SALES", account: "Sales", debit: "0", credit: "100" },
  ]);

  await assert.rejects(
    createAndSubmit(kernel, closeVoucher("PCV-NO-LOCK")),
    /Lock the accounting period through the closing date/i,
  );
  assert.equal((await store.getDocument("demo", "Period Closing Voucher", "PCV-NO-LOCK")).docstatus, 0);
});

test("Period Closing Voucher rejects a P&L closing account", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);
  const voucher = closeVoucher("PCV-BAD-CLOSING");
  voucher.document.closing_account = "Sales";
  await assert.rejects(
    createAndSubmit(kernel, voucher),
    /leaf Equity or Liability account/i,
  );
});
