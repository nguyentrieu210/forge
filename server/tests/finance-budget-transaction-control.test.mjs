import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";

const NOW = "2026-10-02T00:00:00.000Z";
const HASH = "a".repeat(64);

function glPlan(name, account, debitMinor, {
  creditMinor = 0,
  postingAt = "2026-06-30T12:00:00.000Z",
  currency = "VND",
  currencyScale = 0,
  costCenter,
  dimensions = {},
} = {}) {
  const data = { company: "Kairo", posting_at: postingAt };
  return {
    command: {
      schema_version: 1,
      tenant_id: "demo",
      command_id: `cmd-${name}`,
      aggregate: { doctype: "Journal Entry", name },
      action: "create",
      expected_version: null,
      payload_hash: HASH,
      document: data,
      actor: { user_id: "qa@example.test", roles: ["Accounts Manager"] },
    },
    document: {
      tenant_id: "demo",
      doctype: "Journal Entry",
      name,
      owner: "qa@example.test",
      docstatus: 1,
      status: "Submitted",
      version: 1,
      created_at: NOW,
      modified_at: NOW,
      data,
      children: [],
    },
    gl_entries: [{
      line_key: "L1",
      account,
      debit_minor: debitMinor,
      credit_minor: creditMinor,
      currency,
      currency_scale: currencyScale,
      ...(costCenter ? { cost_center: costCenter } : {}),
      accounting_dimensions: dimensions,
      posting_at: postingAt,
    }],
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    events: [],
    result: { ok: true },
  };
}

function seedBudget(store, name, account, amount, {
  action = "Stop",
  against = "Company",
  scope = {},
  rootType = "Expense",
} = {}) {
  store.seedMaster("Account", account, "demo", { company: "Kairo", root_type: rootType });
  store.seedDocument("Finance Budget", name, "demo", {
    company: "Kairo",
    account,
    budget_against: against,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    currency: "VND",
    currency_scale: 0,
    budget_amount_minor: amount,
    control_action: action,
    ...scope,
  }, 1);
}

test("in-memory store atomically enforces actual plus commitments for Stop budgets", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-STOP", "642", 1000);
  store.seedDocument("Finance Budget Commitment", "COM-1", "demo", {
    budget: "BUD-STOP",
    posting_date: "2026-04-01",
    commitment_type: "Reserve",
    amount_minor: 200,
  }, 1);

  await store.execute(glPlan("JE-BASE", "642", 700));
  await store.execute(glPlan("JE-EDGE", "642", 100));
  await assert.rejects(
    store.execute(glPlan("JE-OVER", "642", 1)),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});

test("Warn and Ignore budgets remain non-blocking while Stop respects scope", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-WARN", "643", 100, { action: "Warn" });
  seedBudget(store, "BUD-IGNORE", "644", 100, { action: "Ignore" });
  seedBudget(store, "BUD-CC", "645", 100, {
    against: "Cost Center",
    scope: { cost_center: "OPS", scope_key: "Cost Center:OPS" },
  });

  await store.execute(glPlan("JE-WARN", "643", 150));
  await store.execute(glPlan("JE-IGNORE", "644", 150));
  await store.execute(glPlan("JE-OTHER-CC", "645", 500, { costCenter: "SALES" }));
  await assert.rejects(
    store.execute(glPlan("JE-OPS", "645", 101, { costCenter: "OPS" })),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});

test("budget guard uses dated revisions, Income sign and fails closed on currency mismatch", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-REV", "646", 100);
  store.seedDocument("Finance Budget Revision", "REV-PAST", "demo", {
    budget: "BUD-REV", posting_date: "2026-05-01", delta_amount_minor: 50,
  }, 1);
  store.seedDocument("Finance Budget Revision", "REV-FUTURE", "demo", {
    budget: "BUD-REV", posting_date: "2026-12-01", delta_amount_minor: 1000,
  }, 1);
  await store.execute(glPlan("JE-REV", "646", 150));
  await assert.rejects(store.execute(glPlan("JE-REV-OVER", "646", 1)), /FINANCE_BUDGET_TRANSACTION_EXCEEDED/);

  seedBudget(store, "BUD-INCOME", "511", 100, { rootType: "Income" });
  await assert.rejects(
    store.execute(glPlan("JE-INCOME", "511", 0, { creditMinor: 101 })),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );

  seedBudget(store, "BUD-CURRENCY", "647", 100);
  await assert.rejects(
    store.execute(glPlan("JE-USD", "647", 1, { currency: "USD", currencyScale: 2 })),
    /FINANCE_BUDGET_GL_CURRENCY_SCALE_MISMATCH/,
  );
});
