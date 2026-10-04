import test from "node:test";
import assert from "node:assert/strict";

import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-12-31T23:00:00.000Z";

function setup({ salesDocument = false } = {}) {
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
  if (salesDocument) store.seedDocument("Account", "Sales", "demo", {
    company: "Demo", root_type: "Income", is_group: 0,
  });
  else store.seedMaster("Account", "Sales", "demo", {
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

function fiscal2025(store) {
  store.seedMaster("Fiscal Year", "2025", "demo", {
    year_start_date: "2025-01-01", year_end_date: "2025-12-31",
  });
}

function oldVoucher() {
  const voucher = closeVoucher("PCV-2025");
  voucher.document.fiscal_year = "2025";
  voucher.document.posting_at = "2025-12-31T23:59:59.000Z";
  return voucher;
}

async function cancelClose(kernel, name, commandId = `${name}-cancel`) {
  return mutate(kernel, { commandId, doctype: "Period Closing Voucher", name,
    action: "cancel", expectedVersion: 2, document: {} });
}

test("sequential fiscal closes cancel in reverse chronological order and restore exact P&L", async () => {
  const { store, kernel } = setup();
  fiscal2025(store);
  await journal(kernel, "JE-2025", "2025-06-30T09:00:00.000Z", [
    { row_id: "CASH", account: "Cash", debit: "50", credit: "0" },
    { row_id: "SALES", account: "Sales", debit: "0", credit: "50" },
  ]);
  store.setPeriodLock("Demo", "2025-12-31");
  await createAndSubmit(kernel, oldVoucher());
  await seedProfit(store, kernel);
  await createAndSubmit(kernel, closeVoucher());
  await assert.rejects(cancelClose(kernel, "PCV-2025"), /PERIOD_CLOSE_FUTURE_CLOSE_EXISTS/);
  assert.equal((await store.getDocument("demo", "Period Closing Voucher", "PCV-2025")).docstatus, 1);
  await cancelClose(kernel, "PCV-2026");
  await cancelClose(kernel, "PCV-2025", "PCV-2025-cancel-after-later");
  const balances = await store.getGlAccountBalances({ tenantId: "demo", company: "Demo",
    fromDate: "2025-01-01", throughDate: "2026-12-31" });
  assert.equal(balances.find((row) => row.account === "Sales").balance_minor, -15_000);
  assert.equal(balances.find((row) => row.account === "Retained Earnings").balance_minor, 0);
});

test("current close fails closed when earlier P&L remains unclosed", async () => {
  const { store, kernel } = setup();
  await journal(kernel, "JE-UNclosed-2025", "2025-06-30T09:00:00.000Z", [
    { row_id: "CASH", account: "Cash", debit: "50", credit: "0" },
    { row_id: "SALES", account: "Sales", debit: "0", credit: "50" },
  ]);
  await seedProfit(store, kernel);
  await assert.rejects(createAndSubmit(kernel, closeVoucher()), /PERIOD_CLOSE_PRIOR_PNL_BALANCE/);
  assert.equal((await store.getDocument("demo", "Period Closing Voucher", "PCV-2026")).docstatus, 0);
});

test("future-close cancellation guard is tenant, company and branch scoped", async () => {
  for (const [tenant, company, branch, blocked] of [
    ["demo", "Demo", "", true], ["demo", "Demo", "A", true],
    ["other", "Demo", "", false], ["demo", "Other", "", false],
  ]) {
    const { store, kernel } = setup();
    await seedProfit(store, kernel);
    await createAndSubmit(kernel, closeVoucher());
    store.seedDocument("Period Closing Voucher", "PCV-2027", tenant, {
      company, branch, period_start_date: "2027-01-01", period_end_date: "2027-12-31",
    }, 1);
    if (blocked) await assert.rejects(cancelClose(kernel, "PCV-2026"), /PERIOD_CLOSE_FUTURE_CLOSE_EXISTS/);
    else await cancelClose(kernel, "PCV-2026");
  }
});

test("commit-time chronology rejects a later close appearing after cancellation planning", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);
  await createAndSubmit(kernel, closeVoucher());
  const execute = store.execute.bind(store);
  store.execute = async (plan) => {
    if (plan.document.doctype === "Period Closing Voucher" && plan.document.docstatus === 2) {
      store.seedDocument("Period Closing Voucher", "PCV-RACE-2027", "demo", {
        company: "Demo", period_end_date: "2027-12-31",
      }, 1);
    }
    return execute(plan);
  };
  await assert.rejects(cancelClose(kernel, "PCV-2026"), /PERIOD_CLOSE_FUTURE_CLOSE_EXISTS/);
  assert.equal((await store.getDocument("demo", "Period Closing Voucher", "PCV-2026")).docstatus, 1);
});

test("commit-time prior P&L check rejects historical rows appearing after close planning", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);
  const execute = store.execute.bind(store);
  store.execute = async (plan) => {
    if (plan.document.doctype === "Period Closing Voucher" && plan.document.docstatus === 1) {
      // Simulate an authorized earlier-period correction committing after the planner read.
      store.setPeriodLock("Demo", "");
      await journal(kernel, "JE-PRIOR-RACE", "2025-06-30T09:00:00.000Z", [
        { row_id: "CASH", account: "Cash", debit: "50", credit: "0" },
        { row_id: "SALES", account: "Sales", debit: "0", credit: "50" },
      ]);
      store.setPeriodLock("Demo", "2026-12-31");
    }
    return execute(plan);
  };
  await assert.rejects(createAndSubmit(kernel, closeVoucher()), /PERIOD_CLOSE_PRIOR_PNL_BALANCE/);
  assert.equal((await store.getDocument("demo", "Period Closing Voucher", "PCV-2026")).docstatus, 0);
});

test("commit-time close rechecks the accounting lock", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);
  const execute = store.execute.bind(store);
  store.execute = async (plan) => {
    if (plan.document.doctype === "Period Closing Voucher" && plan.document.docstatus === 1) {
      store.setPeriodLock("Demo", "");
    }
    return execute(plan);
  };
  await assert.rejects(createAndSubmit(kernel, closeVoucher()), /PERIOD_CLOSE_REQUIRES_LOCK/);
  assert.equal((await store.getDocument("demo", "Period Closing Voucher", "PCV-2026")).docstatus, 0);
});

test("commit-time close fingerprint rejects a same-period GL append after planning", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);
  const execute = store.execute.bind(store);
  store.execute = async (plan) => {
    if (plan.document.doctype === "Period Closing Voucher" && plan.document.docstatus === 1) {
      store.setPeriodLock("Demo", "");
      await journal(kernel, "JE-SOURCE-RACE", "2026-11-30T09:00:00.000Z", [
        { row_id: "CASH", account: "Cash", debit: "10", credit: "0" },
        { row_id: "SALES", account: "Sales", debit: "0", credit: "10" },
      ]);
      store.setPeriodLock("Demo", "2026-12-31");
    }
    return execute(plan);
  };
  await assert.rejects(createAndSubmit(kernel, closeVoucher()), /PERIOD_CLOSE_SOURCE_CHANGED/);
});

test("close fails closed when historical P&L contains an unreadable source date", async () => {
  const { store, kernel } = setup();
  const execute = store.execute.bind(store);
  store.execute = async (plan) => {
    if (plan.document.name === "JE-BAD-DATE" && plan.document.docstatus === 1) {
      for (const line of plan.gl_entries) line.posting_at = "2026-06-30BAD";
    }
    return execute(plan);
  };
  await journal(kernel, "JE-BAD-DATE", "2026-06-30T09:00:00.000Z", [
    { row_id: "CASH", account: "Cash", debit: "100", credit: "0" },
    { row_id: "SALES", account: "Sales", debit: "0", credit: "100" },
  ]);
  store.setPeriodLock("Demo", "2026-12-31");
  await assert.rejects(createAndSubmit(kernel, closeVoucher()), /PERIOD_CLOSE_INVALID_SOURCE_DATE/);
});


test("close excludes zero-net disabled account history from active source fingerprint", async () => {
  const { store, kernel } = setup({ salesDocument: true });
  await seedProfit(store, kernel);
  store.setPeriodLock("Demo", "");
  await journal(kernel, "JE-SALES-REVERSE", "2026-08-01T09:00:00.000Z", [
    { row_id: "SALES", account: "Sales", debit: "100", credit: "0" },
    { row_id: "CASH", account: "Cash", debit: "0", credit: "100" },
  ]);
  store.seedDocument("Account", "Sales", "demo", {
    company: "Demo", root_type: "Income", is_group: 0, disabled: true,
  });
  store.setPeriodLock("Demo", "2026-12-31");
  await createAndSubmit(kernel, closeVoucher());
  const closed = await store.getDocument("demo", "Period Closing Voucher", "PCV-2026");
  assert.equal(closed.data.source_gl_row_count, 1);
  assert.equal(closed.data.source_debit_minor, 6000);
  assert.equal(closed.data.source_credit_minor, 0);
});

test("close still rejects a disabled historical account with nonzero P&L", async () => {
  const { store, kernel } = setup({ salesDocument: true });
  await seedProfit(store, kernel);
  store.seedDocument("Account", "Sales", "demo", {
    company: "Demo", root_type: "Income", is_group: 0, disabled: true,
  });
  await assert.rejects(createAndSubmit(kernel, closeVoucher()), /PERIOD_CLOSE_INACTIVE_PNL_BALANCE/);
});

test("commit-time historical residual accumulation retains exact zero across large offsetting entries", async () => {
  const { store, kernel } = setup();
  await seedProfit(store, kernel);
  const execute = store.execute.bind(store);
  store.execute = async (plan) => {
    if (plan.document.doctype === "Period Closing Voucher" && plan.document.docstatus === 1) {
      store.setPeriodLock("Demo", "");
      for (const [index, amount, debit] of [
        [1, "90071992547409.91", true], [2, "0.02", true],
        [3, "90071992547409.91", false], [4, "0.02", false],
      ]) {
        await journal(kernel, `JE-PRIOR-EXACT-${index}`, "2025-06-30T09:00:00.000Z", [
          { row_id: "RENT", account: "Rent", debit: debit ? amount : "0", credit: debit ? "0" : amount },
          { row_id: "CASH", account: "Cash", debit: debit ? "0" : amount, credit: debit ? amount : "0" },
        ]);
      }
      store.setPeriodLock("Demo", "2026-12-31");
    }
    return execute(plan);
  };
  await createAndSubmit(kernel, closeVoucher());
});
