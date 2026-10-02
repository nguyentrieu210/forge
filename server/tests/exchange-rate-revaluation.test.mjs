import assert from "node:assert/strict";
import test from "node:test";
import { ExchangeRateRevaluationController } from "../dist/packages/clouderp-erpnext/src/exchange-rate-revaluation.js";

const NOW = "2026-10-02T12:00:00.000Z";

function canonical(doctype, name, data, docstatus = 1, version = 1) {
  return {
    tenant_id: "demo", doctype, name, owner: "maker@example.test",
    docstatus, status: docstatus === 1 ? "Submitted" : "Draft", version,
    created_at: NOW, modified_at: NOW, data, children: [],
  };
}

function context({ action = "submit", existing = canonical("Exchange Rate Revaluation", "FX-001", {}, 0), balances = [], documents = [], masters = {} } = {}) {
  let requestedThroughDate = null;
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
      async listDocumentsByDoctype(_tenant, doctype) { return documents.filter((doc) => doc.doctype === doctype); },
      async listOpenPaymentBalances(query) { requestedThroughDate = query.throughDate; return balances; },
      async getVoucherGlEntries() { return []; },
    },
  };
  return { ctx, getThroughDate: () => requestedThroughDate };
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
