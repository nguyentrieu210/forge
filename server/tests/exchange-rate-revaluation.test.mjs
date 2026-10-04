import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { ExchangeRateRevaluationController } from "../dist/packages/clouderp-erpnext/src/exchange-rate-revaluation.js";

const NOW = "2026-10-02T12:00:00.000Z";

function canonical(doctype, name, data, docstatus = 1, version = 1) {
  return {
    tenant_id: "demo", doctype, name, owner: "maker@example.test",
    docstatus, status: docstatus === 1 ? "Submitted" : "Draft", version,
    created_at: NOW, modified_at: NOW, data, children: [],
  };
}

function context({ action = "submit", existing = canonical("Exchange Rate Revaluation", "FX-001", {}, 0), balances = [], glBalances = [], documents = [], masters = {} } = {}) {
  let requestedThroughDate = null;
  let glQuery = null;
  const ctx = {
    command: {
      tenant_id: "demo",
      command_id: `fx-${action}`,
      aggregate: { doctype: "Exchange Rate Revaluation", name: "FX-001" },
      action,
      document: { company: "Kairo", posting_at: "2026-09-30T23:59:59.000Z", gain_loss_account: "CLIENT-SPOOF" },
      actor: { user_id: "approver@example.test", roles: ["Accounts Manager"] },
    },
    existing,
    nextVersion: (existing?.version ?? 0) + 1,
    now: NOW,
    reader: {
      async getMasterRecordData(_tenant, type, name) { return masters[`${type}:${name}`] ?? null; },
      async getDocument(_tenant, type, name) { return documents.find((doc) => doc.doctype === type && doc.name === name) ?? null; },
      async listDocumentsByDoctype(_tenant, doctype) { return documents.filter((doc) => doc.doctype === doctype); },
      async listOpenPaymentBalances(query) { requestedThroughDate = query.throughDate; return balances; },
      async getGlAccountBalances(query) { glQuery = query; return glBalances; },
      async getVoucherGlEntries() { return []; },
    },
  };
  return { ctx, getThroughDate: () => requestedThroughDate, getGlQuery: () => glQuery };
}

function masters() {
  return {
    "Company:Kairo": { default_currency: "VND", exchange_gain_loss_account: "FX-GL" },
    "Currency:VND": { currency_scale: 0 },
    "Account:FX-GL": { company: "Kairo", is_group: 0 },
    "Exchange Rate:EUR:VND:2026-09-30": { rate: "30000" },
    "Exchange Rate:USD:VND:2026-09-30": { rate: "25000" },
  };
}

test("FX revaluation uses as-of Payment Ledger, server rate and next-day reversal", async () => {
  const controller = new ExchangeRateRevaluationController();
  const { ctx, getThroughDate } = context({
    masters: masters(),
    balances: [
      {
        account_type: "Receivable", party_type: "Customer", party: "CUST-1", account: "Debtors",
        against_voucher_type: "Sales Invoice", against_voucher_no: "SI-1",
        currency: "EUR", currency_scale: 2, amount_minor: 10000, base_amount_minor: 2900000, row_count: 2,
      },
      {
        account_type: "Payable", party_type: "Supplier", party: "SUP-1", account: "Creditors",
        against_voucher_type: "Purchase Invoice", against_voucher_no: "PI-1",
        currency: "USD", currency_scale: 2, amount_minor: 10000, base_amount_minor: 2400000, row_count: 1,
      },
    ],
  });
  const plan = await controller.buildPlan(ctx);
  assert.equal(getThroughDate(), "2026-09-30");
  assert.equal(plan.document.data.gain_loss_account, "FX-GL");
  assert.equal(plan.document.data.company_currency, "VND");
  assert.equal(plan.document.data.reversal_at, "2026-10-01T23:59:59.000Z");
  assert.equal(plan.document.data.total_gain_minor, 100000);
  assert.equal(plan.document.data.total_loss_minor, 100000);
  assert.equal(plan.document.data.total_adjustment_minor, 200000);
  assert.equal(plan.gl_entries.length, 8);
  assert.equal(plan.gl_entries.filter((line) => line.posting_at.startsWith("2026-09-30")).reduce((n,line)=>n+line.debit_minor-line.credit_minor,0), 0);
  assert.equal(plan.gl_entries.filter((line) => line.posting_at.startsWith("2026-10-01")).reduce((n,line)=>n+line.debit_minor-line.credit_minor,0), 0);
  const ar = plan.gl_entries.find((line) => line.line_key === "FX-1-PARTY");
  assert.equal(ar.debit_minor, 100000);
  const ap = plan.gl_entries.find((line) => line.line_key === "FX-2-PARTY");
  assert.equal(ap.credit_minor, 100000);
});

test("FX revaluation snapshots zero-delta foreign balances for commit-time source completeness", async () => {
  const controller = new ExchangeRateRevaluationController();
  const { ctx } = context({
    masters: masters(),
    balances: [
      {
        account_type: "Receivable", party_type: "Customer", party: "CUST-1", account: "Debtors",
        against_voucher_type: "Sales Invoice", against_voucher_no: "SI-ZERO",
        currency: "EUR", currency_scale: 2, amount_minor: 10000, base_amount_minor: 3000000, row_count: 1,
      },
      {
        account_type: "Receivable", party_type: "Customer", party: "CUST-2", account: "Debtors",
        against_voucher_type: "Sales Invoice", against_voucher_no: "SI-DIFF",
        currency: "EUR", currency_scale: 2, amount_minor: 10000, base_amount_minor: 2900000, row_count: 1,
      },
    ],
  });
  const plan = await controller.buildPlan(ctx);
  assert.equal(plan.document.data.revaluation_entries.length, 2);
  assert.equal(plan.document.data.revaluation_entries[0].difference_minor, 0);
  assert.equal(plan.gl_entries.length, 4);
});

test("FX revaluation rejects duplicate company/date and missing close rate", async () => {
  const controller = new ExchangeRateRevaluationController();
  const duplicate = canonical("Exchange Rate Revaluation", "FX-OLD", {
    company: "Kairo", posting_at: "2026-09-30T10:00:00.000Z",
  });
  const first = context({ masters: masters(), documents: [duplicate], balances: [] });
  await assert.rejects(controller.buildPlan(first.ctx), /already covers/);

  const noRateMasters = masters();
  delete noRateMasters["Exchange Rate:EUR:VND:2026-09-30"];
  const second = context({
    masters: noRateMasters,
    balances: [{
      account_type: "Receivable", party_type: "Customer", party: "CUST-1", account: "Debtors",
      against_voucher_type: "Sales Invoice", against_voucher_no: "SI-1",
      currency: "EUR", currency_scale: 2, amount_minor: 10000, base_amount_minor: 2900000, row_count: 1,
    }],
  });
  await assert.rejects(controller.buildPlan(second.ctx), /Exchange Rate EUR:VND/);
});

test("FX revaluation cancel reverses exactly the submitted GL", async () => {
  const controller = new ExchangeRateRevaluationController();
  const original = [
    { line_key: "FX-1-PARTY", account: "Debtors", debit_minor: 100, credit_minor: 0, currency: "VND", currency_scale: 0, posting_at: "2026-09-30T00:00:00.000Z" },
    { line_key: "FX-1-GAIN-LOSS", account: "FX-GL", debit_minor: 0, credit_minor: 100, currency: "VND", currency_scale: 0, posting_at: "2026-09-30T00:00:00.000Z" },
  ];
  const existing = canonical("Exchange Rate Revaluation", "FX-001", { company: "Kairo", posting_at: "2026-09-30T00:00:00.000Z" }, 1, 2);
  const { ctx } = context({ action: "cancel", existing, masters: masters() });
  ctx.reader.getVoucherGlEntries = async () => original;
  const plan = await controller.buildPlan(ctx);
  assert.equal(plan.document.docstatus, 2);
  assert.deepEqual(plan.gl_entries.map((line) => [line.line_key,line.debit_minor,line.credit_minor]), [
    ["REV-FX-1-PARTY",0,100],
    ["REV-FX-1-GAIN-LOSS",100,0],
  ]);
});

function arBalance() {
  return {
    account_type: "Receivable", party_type: "Customer", party: "CUST-1", account: "Debtors",
    against_voucher_type: "Sales Invoice", against_voucher_no: "SI-1",
    currency: "EUR", currency_scale: 2, amount_minor: 10000, base_amount_minor: 2900000, row_count: 1,
  };
}

function glBalance(account, balance = 100) {
  return { account, currency: "VND", currency_scale: 0, debit_minor: Math.max(balance, 0),
    credit_minor: Math.max(-balance, 0), balance_minor: balance, row_count: 1 };
}

test("FX company revaluation refuses foreign non-party balances without canonical dual amounts", async () => {
  for (const account of [
    { account_type: "Bank", account_currency: "USD" },
    { account_type: "Cash", currency: "USD", root_type: "Asset" },
    { root_type: "Liability", account_currency: "EUR" },
  ]) {
    const { ctx, getGlQuery } = context({
      masters: { ...masters(), "Account:FOREIGN": account },
      balances: [arBalance()], glBalances: [glBalance("FOREIGN", -100)],
    });
    await assert.rejects(new ExchangeRateRevaluationController().buildPlan(ctx), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
    assert.deepEqual(getGlQuery(), { tenantId: "demo", company: "Kairo", fromDate: "0001-01-01", throughDate: "2026-09-30" });
  }
});

test("FX controller refuses zero base net with nonzero foreign account activity", async () => {
  const { ctx } = context({
    masters: { ...masters(), "Account:ZERO": { account_type: "Bank", account_currency: "USD" } },
    balances: [arBalance()],
    glBalances: [{ ...glBalance("ZERO", 0), debit_minor: 100, credit_minor: 100, row_count: 2 }],
  });
  await assert.rejects(new ExchangeRateRevaluationController().buildPlan(ctx), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
});

test("FX non-party boundary permits domestic, all-zero and AR/AP account balances", async () => {
  const { ctx } = context({
    masters: { ...masters(),
      "Account:DOMESTIC": { account_type: "Bank", account_currency: "VND" },
      "Account:ZERO": { account_type: "Bank", account_currency: "USD" },
      "Account:Debtors": { account_type: "Receivable", account_currency: "EUR", root_type: "Asset" },
      "Account:Creditors": { account_type: "Payable", account_currency: "USD", root_type: "Liability" },
      "Account:EXPENSE": { account_currency: "USD", root_type: "Expense" },
    }, balances: [arBalance()],
    glBalances: [glBalance("DOMESTIC"), glBalance("ZERO", 0), glBalance("Debtors"), glBalance("Creditors"), glBalance("EXPENSE")],
  });
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  assert.equal(plan.document.data.total_adjustment_minor, 100000);
});

function sourcePlan(name, { tenant = "demo", company = "Kairo", account = "USD-BANK", amount = 100,
  postingAt = "2026-09-29T00:00:00.000Z", invoice = false } = {}) {
  const doctype = invoice ? "Sales Invoice" : "Journal Entry";
  const data = { company };
  const document = { ...canonical(doctype, name, data), tenant_id: tenant };
  const line = { line_key: "SOURCE", account, debit_minor: Math.max(amount, 0), credit_minor: Math.max(-amount, 0),
    currency: "VND", currency_scale: 0, posting_at: postingAt };
  return {
    command: { schema_version: 1, tenant_id: tenant, command_id: `source-${tenant}-${name}`, aggregate: { doctype, name },
      action: "create", expected_version: null, payload_hash: "a".repeat(64), document: data,
      actor: { user_id: "qa@example.test", roles: ["Accounts Manager"] } },
    document, gl_entries: [line], stock_entries: [], fulfillment_entries: [], procurement_entries: [], events: [], result: {},
    payment_entries: invoice ? [{ ...arBalance(), line_key: "AR", posting_at: postingAt }] : [],
  };
}

async function memoryFx() {
  const store = new InMemoryMutationStore();
  for (const [key, data] of Object.entries(masters())) {
    const colon = key.indexOf(":");
    store.seedMaster(key.slice(0, colon), key.slice(colon + 1), "demo", data);
  }
  store.seedMaster("Account", "Debtors", "demo", { account_type: "Receivable", root_type: "Asset", account_currency: "EUR" });
  store.seedMaster("Account", "USD-BANK", "demo", { account_type: "Bank", root_type: "Asset", account_currency: "USD" });
  store.seedDocument("Exchange Rate Revaluation", "FX-001", "demo", {}, 0);
  await store.execute(sourcePlan("SI-1", { account: "Debtors", amount: 2900000, invoice: true }));
  const { ctx } = context();
  ctx.command.expected_version = 1;
  ctx.command.payload_hash = "b".repeat(64);
  ctx.reader = store;
  return { store, ctx };
}

test("FX memory commit refuses a backdated foreign bank balance after planning", async () => {
  const { store, ctx } = await memoryFx();
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  await store.execute(sourcePlan("BANK-RACE"));
  await assert.rejects(store.execute(plan), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
  assert.equal((await store.getDocument("demo", "Exchange Rate Revaluation", "FX-001")).docstatus, 0);
});

test("FX memory commit rechecks foreign account configuration after planning", async () => {
  const { store, ctx } = await memoryFx();
  store.seedMaster("Account", "USD-BANK", "demo", { account_type: "Bank", account_currency: "VND" });
  await store.execute(sourcePlan("BANK-CONFIG"));
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  store.seedMaster("Account", "USD-BANK", "demo", { account_type: "Bank", account_currency: "USD" });
  await assert.rejects(store.execute(plan), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
});

test("FX memory as-of boundary excludes future bank movement and other tenant/company", async () => {
  const { store, ctx } = await memoryFx();
  await store.execute(sourcePlan("BANK-FUTURE", { postingAt: "2026-10-01T00:00:00.000Z" }));
  await store.execute(sourcePlan("BANK-OTHER-COMPANY", { company: "Other" }));
  store.seedMaster("Account", "USD-BANK", "other", { account_type: "Bank", account_currency: "USD" });
  await store.execute(sourcePlan("BANK-OTHER-TENANT", { tenant: "other" }));
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  await store.execute(plan);
  assert.equal((await store.getDocument("demo", "Exchange Rate Revaluation", "FX-001")).docstatus, 1);
});

test("FX memory permits all-zero foreign account rows", async () => {
  const { store, ctx } = await memoryFx();
  await store.execute(sourcePlan("BANK-ZERO-AMOUNTS", { amount: 0 }));
  await store.execute(await new ExchangeRateRevaluationController().buildPlan(ctx));
  assert.equal((await store.getDocument("demo", "Exchange Rate Revaluation", "FX-001")).docstatus, 1);
});

test("FX zero base net still refuses ambiguous foreign bank units", async () => {
  const { store, ctx } = await memoryFx();
  await store.execute(sourcePlan("BANK-ORIGINAL"));
  await store.execute(sourcePlan("BANK-REVERSE", { amount: -100 }));
  // 100 base received at 10/base-per-unit and 100 base paid at 20 can leave
  // 5 foreign units. The one-currency ledger cannot establish the actual units.
  await assert.rejects(new ExchangeRateRevaluationController().buildPlan(ctx), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
});

test("FX memory commit rechecks zero base net foreign activity after planning", async () => {
  const { store, ctx } = await memoryFx();
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  await store.execute(sourcePlan("BANK-ZERO-RACE-DR"));
  await store.execute(sourcePlan("BANK-ZERO-RACE-CR", { amount: -100 }));
  await assert.rejects(store.execute(plan), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
  assert.equal((await store.getDocument("demo", "Exchange Rate Revaluation", "FX-001")).docstatus, 0);
});

test("FX boundary uses Account documents ahead of stale master aliases", async () => {
  const { store, ctx } = await memoryFx();
  store.seedDocument("Account", "USD-BANK", "demo", { account_type: "Bank", account_currency: "VND" }, 0);
  await store.execute(sourcePlan("BANK-DOCUMENT"));
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  await store.execute(plan);
  assert.equal((await store.getDocument("demo", "Exchange Rate Revaluation", "FX-001")).docstatus, 1);
});

test("FX boundary keeps disabled and cancelled foreign Account history in scope", async () => {
  for (const docstatus of [0, 2]) {
    const { store, ctx } = await memoryFx();
    store.seedDocument("Account", "USD-BANK", "demo", { account_type: "Bank", account_currency: "USD", disabled: 1 }, docstatus);
    await store.execute(sourcePlan(`BANK-DISABLED-${docstatus}`));
    await assert.rejects(new ExchangeRateRevaluationController().buildPlan(ctx), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
  }
  const { store, ctx } = await memoryFx();
  store.seedMaster("Account", "USD-BANK", "demo", { account_type: "Bank", account_currency: "VND" });
  await store.execute(sourcePlan("BANK-DISABLE-RACE"));
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  store.seedDocument("Account", "USD-BANK", "demo", { account_type: "Bank", account_currency: "USD", disabled: 1 }, 2);
  await assert.rejects(store.execute(plan), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
});

test("FX commit keeps nonzero foreign balance exact across large compensating rows", async () => {
  const { store, ctx } = await memoryFx();
  const plan = await new ExchangeRateRevaluationController().buildPlan(ctx);
  const amounts = [Number.MAX_SAFE_INTEGER, 2, -Number.MAX_SAFE_INTEGER, -1];
  for (const [index, amount] of amounts.entries()) {
    await store.execute(sourcePlan(`BANK-LARGE-${index}`, { amount }));
  }
  // Net is exactly one minor unit; Number accumulation can mistakenly yield zero.
  await assert.rejects(store.execute(plan), /FINANCE_FX_NON_PARTY_DUAL_CURRENCY_REQUIRED/);
});
