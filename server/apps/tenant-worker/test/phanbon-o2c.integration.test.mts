/**
 * The fertiliser app's money and stock, end to end, on the real kernel.
 *
 * The brief declares Sales Order, Delivery Note, Sales Invoice and Payment Entry under
 * exactly those names, and that is not decoration: the selling and stock controllers
 * attach BY DOCTYPE NAME. Rename one and the write still succeeds, through the generic
 * controller, with no ledger entries at all — stock does not move, debt does not appear,
 * and nothing reports an error. That failure is invisible in every test that only checks
 * whether the document saved, so this one checks the ledgers instead.
 *
 * Order of proof:
 *   1. an order for 30 bags does not touch stock — an order is a promise
 *   2. delivering 30 bags removes 30 bags
 *   3. invoicing creates debt of exactly the invoice total
 *   4. paying reduces that debt to zero
 *   5. delivering more than the warehouse holds is REFUSED, inside the transaction
 */
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { commandPayloadHash } from "../../../packages/core/src/index.js";
import { compileBrief } from "../../../scripts/lib/compile-brief.mjs";
import brief from "../../../briefs/phanbon.json" with { type: "json" };
import { AppInstaller, parseAppManifest } from "../../../packages/app-registry/src/index.js";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";
import { D1UserStore } from "../../../packages/auth/src/index.js";

const NOW = "2026-07-27T02:00:00.000Z";
const ITEM = "NPK-16-16-8";
const WAREHOUSE = "Kho Long An";
const CUSTOMER = "Đại lý Ba Tri";
/** 100 bags, in the ledger's micro units. */
const OPENING_QTY_MICROS = 100_000_000;
const RATE = "620000";
const QTY = "30";
const LINE_TOTAL = 620000 * 30;

async function command(input: {
  commandId: string;
  doctype: string;
  name: string;
  action: "create" | "submit";
  expectedVersion: number | null;
  document: Record<string, unknown>;
}) {
  const value = {
    schema_version: 1 as const,
    command_id: input.commandId,
    tenant_id: "demo",
    aggregate: { doctype: input.doctype, name: input.name },
    action: input.action,
    expected_version: input.expectedVersion,
    payload_hash: "",
    document: input.document,
  };
  value.payload_hash = await commandPayloadHash(value as unknown as Record<string, unknown>);
  return value;
}

async function post(body: unknown): Promise<Response> {
  return exports.default.fetch(new Request("https://tenant.test/api/v1/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function createAndSubmit(doctype: string, name: string, document: Record<string, unknown>): Promise<Response> {
  const created = await post(await command({ commandId: `${name}-create`, doctype, name, action: "create", expectedVersion: null, document }));
  expect(created.status).toBe(200);
  return post(await command({ commandId: `${name}-submit`, doctype, name, action: "submit", expectedVersion: 1, document }));
}

/** Bags on hand, summed straight from the stock ledger. */
async function onHand(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(actual_qty_micros),0) AS qty FROM stock_ledger_entries
     WHERE tenant_id='demo' AND item_code=?1 AND warehouse=?2`,
  ).bind(ITEM, WAREHOUSE).first<{ qty: number }>();
  return (row?.qty ?? 0) / 1_000_000;
}

/** What the customer owes, summed straight from the payment ledger. */
async function owed(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_minor),0) AS total FROM payment_ledger_entries
     WHERE tenant_id='demo' AND party=?1`,
  ).bind(CUSTOMER).first<{ total: number }>();
  return row?.total ?? 0;
}

beforeAll(async () => {
  const manifest = parseAppManifest(compileBrief(brief));
  const installer = new AppInstaller(env.DB, new D1MetadataStore(env.DB), new D1UserStore(env.DB));
  // A clean tenant, as a real fertiliser customer would have — see the storefront suite.
  await env.DB.batch(manifest.doctypes.map((doctype) =>
    env.DB.prepare(`DELETE FROM doctype_definitions WHERE tenant_id='demo' AND doctype=?1`).bind(doctype.name)));
  await installer.install("demo", manifest, "Administrator", NOW);

  for (const [recordType, name, data] of [
    ["Company", "PHANBON", { default_currency: "VND" }],
    ["Currency", "VND", { currency_scale: 0 }],
    ["Customer", CUSTOMER, {}],
    ["Item", ITEM, {}],
    ["Warehouse", WAREHOUSE, {}],
    ["Account", "Phải thu khách hàng", { account_type: "Receivable" }],
    ["Account", "Doanh thu bán hàng", { account_type: "Income" }],
    ["Account", "Giá vốn hàng bán", { account_type: "Expense" }],
    ["Account", "Hàng tồn kho", { account_type: "Asset" }],
    ["Account", "Tiền gửi ngân hàng", { account_type: "Asset" }],
    ["Account", "Chênh lệch làm tròn", { account_type: "Expense" }],
  ] as const) {
    await env.DB.prepare(
      `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
       VALUES('demo',?1,?2,?3,?4) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json, disabled=0`,
    ).bind(recordType, name, JSON.stringify(data), NOW).run();
  }

  // Opening stock: 100 bags at 410.000đ.
  await env.DB.prepare(
    `INSERT INTO stock_ledger_entries
     (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at)
     VALUES('demo','Stock Reconciliation','TON-DAU',1,?1,?1,?2,?3,410000,0,6,0,'VND',?4)
     ON CONFLICT DO NOTHING`,
  ).bind(ITEM, WAREHOUSE, OPENING_QTY_MICROS, NOW).run();
});

const orderDocument = {
  customer: CUSTOMER, company: "PHANBON", currency: "VND", currency_scale: 0,
  transaction_date: "2026-07-27", sales_channel: "Đại lý",
  items: [{ row_id: "L1", item_code: ITEM, qty: QTY, rate: RATE, warehouse: WAREHOUSE }],
  taxes: [],
};

describe("phân bón: đơn hàng → xuất kho → hoá đơn → thu tiền", () => {
  it("an order does not move stock — it is a promise, not a movement", async () => {
    const before = await onHand();
    const response = await createAndSubmit("Sales Order", "DH-2026-00001", orderDocument);
    expect(response.status).toBe(200);
    expect(await onHand()).toBe(before);
  });

  it("delivering 30 bags removes exactly 30 bags", async () => {
    const before = await onHand();
    const response = await createAndSubmit("Delivery Note", "PXK-2026-00001", {
      customer: CUSTOMER, company: "PHANBON", currency: "VND", currency_scale: 0,
      against_sales_order: "DH-2026-00001", posting_at: NOW, ship_address: "Ba Tri, Bến Tre",
      items: [{ row_id: "L1", item_code: ITEM, qty: QTY, warehouse: WAREHOUSE, rate: RATE }],
    });
    expect(response.status).toBe(200);
    expect(await onHand()).toBe(before - 30);
  });

  it("invoicing creates debt equal to the invoice", async () => {
    const before = await owed();
    const response = await createAndSubmit("Sales Invoice", "HD-2026-00001", {
      customer: CUSTOMER, company: "PHANBON", currency: "VND", currency_scale: 0,
      against_sales_order: "DH-2026-00001", posting_at: NOW, due_date: "2026-08-26",
      debit_to: "Phải thu khách hàng", default_income_account: "Doanh thu bán hàng",
      round_off_account: "Chênh lệch làm tròn",
      items: [{ row_id: "L1", item_code: ITEM, qty: QTY, rate: RATE }],
      taxes: [],
    });
    expect(response.status).toBe(200);
    expect(await owed()).toBe(before + LINE_TOTAL);
  });

  it("the general ledger balances — debits equal credits", async () => {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(debit_minor),0) AS debit, COALESCE(SUM(credit_minor),0) AS credit
       FROM gl_entries WHERE tenant_id='demo'`,
    ).first<{ debit: number; credit: number }>();
    // A ledger that does not balance is not a rounding problem to look into later; it
    // means every report built on it is wrong in a way nobody can reconcile.
    expect(row!.debit).toBe(row!.credit);
    expect(row!.debit).toBeGreaterThan(0);
  });

  it("paying the invoice clears the debt", async () => {
    const response = await createAndSubmit("Payment Entry", "PT-2026-00001", {
      payment_type: "Receive", party_type: "Customer", party: CUSTOMER,
      company: "PHANBON", currency: "VND", currency_scale: 0,
      posting_at: NOW, paid_amount: String(LINE_TOTAL), received_amount: String(LINE_TOTAL),
      mode_of_payment: "Chuyển khoản",
      // Receive: money leaves the receivable account and lands in the bank.
      paid_from: "Phải thu khách hàng", paid_to: "Tiền gửi ngân hàng",
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "HD-2026-00001", allocated_amount: String(LINE_TOTAL) }],
    });
    expect(response.status).toBe(200);
    expect(await owed()).toBe(0);
  });

  it("REFUSES to deliver more than the warehouse holds", async () => {
    const before = await onHand();
    const response = await createAndSubmit("Delivery Note", "PXK-2026-09999", {
      customer: CUSTOMER, company: "PHANBON", currency: "VND", currency_scale: 0,
      against_sales_order: "DH-2026-00001", posting_at: NOW, ship_address: "Ba Tri, Bến Tre",
      // 100 opening less 30 delivered leaves 70; asking for 500 must fail inside the
      // transaction rather than leave the warehouse negative on paper.
      items: [{ row_id: "L1", item_code: ITEM, qty: "500", warehouse: WAREHOUSE, rate: RATE }],
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await onHand()).toBe(before);
  });
});
