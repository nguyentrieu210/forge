import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { commandPayloadHash } from "../../../packages/core/src/index.js";

type Action = "create" | "save" | "submit" | "cancel";

function order(customer = "CUST-1", qty = "1") {
  return {
    customer,
    company: "Demo",
    currency: "USD",
    currency_scale: 2,
    transaction_date: "2026-07-23",
    items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty, rate: "10" }],
    taxes: [],
  };
}

async function command(input: {
  commandId: string;
  doctype?: string;
  name?: string;
  action: Action;
  expectedVersion: number | null;
  document?: Record<string, unknown>;
}) {
  const value = {
    schema_version: 1 as const,
    command_id: input.commandId,
    tenant_id: "demo",
    aggregate: { doctype: input.doctype ?? "Sales Order", name: input.name ?? "SO-WORKERD" },
    action: input.action,
    expected_version: input.expectedVersion,
    payload_hash: "",
    document: input.document ?? order(),
  };
  value.payload_hash = await commandPayloadHash(value as unknown as Record<string, unknown>);
  return value;
}

async function post(body: unknown) {
  return exports.default.fetch(new Request("https://tenant.test/api/v1/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function seedO2C(): Promise<void> {
  const now = "2026-07-23T00:00:00.000Z";
  for (const [recordType, name, data] of [
    ["Company", "Demo", { default_currency: "USD" }], ["Customer", "CUST-1", {}], ["Currency", "USD", { currency_scale: 2 }],
    ["Item", "ITEM-1", {}], ["Warehouse", "Stores", {}],
  ] as const) {
    await env.DB.prepare(
      `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
       VALUES('demo',?1,?2,?3,?4) ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json, disabled=0`,
    ).bind(recordType, name, JSON.stringify(data), now).run();
  }
  await env.DB.prepare(
    `INSERT INTO stock_ledger_entries
     (tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,actual_qty_micros,valuation_rate_minor,stock_value_difference_minor,qty_scale,currency_scale,currency,posting_at)
     VALUES('demo','Stock Reconciliation','OPENING',1,'ITEM-1','ITEM-1','Stores',100000000,1000,0,6,2,'USD',?1)
     ON CONFLICT DO NOTHING`,
  ).bind(now).run();
}

describe("tenant worker with real workerd D1 and Durable Object bindings", () => {
  it("exposes health", async () => {
    const response = await exports.default.fetch(new Request("https://tenant.test/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "tenant-worker" });
  });

  it("whoami returns the authenticated identity without leaking any signature or secret", async () => {
    const response = await exports.default.fetch(new Request("https://tenant.test/api/v1/whoami"));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ tenant_id: "demo", actor_id: "Administrator", roles: ["System Manager"] });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("signature");
    expect(serialized).not.toContain("secret");
  });

  it("allows exactly one of 100 optimistic updates through the aggregate Durable Object", async () => {
    const created = await post(await command({ commandId: "workerd-create", action: "create", expectedVersion: null }));
    expect(created.status).toBe(200);
    const requests = await Promise.all(Array.from({ length: 100 }, async (_, index) => post(await command({
      commandId: `workerd-save-${index}`,
      action: "save",
      expectedVersion: 1,
      document: order(`CUST-${index}`),
    }))));
    expect(requests.filter((response) => response.status === 200)).toHaveLength(1);
    expect(requests.filter((response) => response.status === 409)).toHaveLength(99);
    const row = await env.DB.prepare("SELECT version FROM documents WHERE tenant_id='demo' AND doc_key='Sales Order:SO-WORKERD'").first<{ version: number }>();
    expect(row?.version).toBe(2);
    const guards = await env.DB.prepare("SELECT COUNT(*) AS count FROM mutation_guard").first<{ count: number }>();
    expect(guards?.count).toBe(0);
  });

  it("enforces Sales Order fulfillment across different aggregate Durable Objects", async () => {
    await seedO2C();
    const salesOrder = order("CUST-1", "10");
    expect((await post(await command({ commandId: "so-race-create", name: "SO-DO-RACE", action: "create", expectedVersion: null, document: salesOrder }))).status).toBe(200);
    expect((await post(await command({ commandId: "so-race-submit", name: "SO-DO-RACE", action: "submit", expectedVersion: 1, document: salesOrder }))).status).toBe(200);

    const delivery = (rowId: string) => ({
      customer: "CUST-1", company: "Demo", currency: "USD", currency_scale: 2,
      posting_at: "2026-07-23T00:00:00.000Z", against_sales_order: "SO-DO-RACE",
      items: [{ row_id: rowId, item_code: "ITEM-1", qty: "6", rate: "10", warehouse: "Stores", valuation_rate: "10" }],
    });
    expect((await post(await command({ commandId: "dn-a-create", doctype: "Delivery Note", name: "DN-DO-A", action: "create", expectedVersion: null, document: delivery("A") }))).status).toBe(200);
    expect((await post(await command({ commandId: "dn-b-create", doctype: "Delivery Note", name: "DN-DO-B", action: "create", expectedVersion: null, document: delivery("B") }))).status).toBe(200);

    const results = await Promise.all([
      post(await command({ commandId: "dn-a-submit", doctype: "Delivery Note", name: "DN-DO-A", action: "submit", expectedVersion: 1, document: delivery("A") })),
      post(await command({ commandId: "dn-b-submit", doctype: "Delivery Note", name: "DN-DO-B", action: "submit", expectedVersion: 1, document: delivery("B") })),
    ]);
    expect(results.filter((response) => response.status === 200)).toHaveLength(1);
    expect(results.filter((response) => response.status === 422)).toHaveLength(1);
    const total = await env.DB.prepare(
      "SELECT SUM(qty_micros) AS total FROM sales_order_fulfillment_entries WHERE tenant_id='demo' AND sales_order='SO-DO-RACE' AND kind='Delivery'",
    ).first<{ total: number }>();
    expect(total?.total).toBe(6_000_000);
  });

  it("posts advanced tax and foreign-currency exchange differences through real D1", async () => {
    await seedO2C();
    const now = "2026-07-23T00:00:00.000Z";
    await env.DB.prepare("UPDATE master_records SET data_json=?1 WHERE tenant_id='demo' AND record_type='Company' AND name='Demo'")
      .bind(JSON.stringify({ default_currency: "USD", currency_scale: 2 })).run();
    for (const [recordType, name, data] of [
      ["Account", "Debtors", {}], ["Account", "Sales", {}], ["Account", "Output Tax", {}],
      ["Account", "Round Off", {}], ["Account", "Bank", {}], ["Account", "Exchange Gain Loss", {}],
      ["Currency", "EUR", { currency_scale: 2 }], ["Exchange Rate", "EUR:USD:2026-07-22", { rate: "1.10" }],
      ["Exchange Rate", "EUR:USD:2026-07-23", { rate: "1.20" }],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
         VALUES('demo',?1,?2,?3,?4)
         ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json, disabled=0`,
      ).bind(recordType, name, JSON.stringify(data), now).run();
    }

    const inclusive = {
      customer: "CUST-1", company: "Demo", currency: "USD", currency_scale: 2,
      posting_at: now, debit_to: "Debtors", default_income_account: "Sales", round_off_account: "Round Off",
      items: [{ row_id: "1", item_code: "ITEM-1", qty: "1", rate: "500" }],
      taxes: [{ row_id: "T1", account: "Output Tax", rate: "10", included_in_print_rate: true }],
    };
    expect((await post(await command({ commandId: "si-inc-create", doctype: "Sales Invoice", name: "SI-W-INC", action: "create", expectedVersion: null, document: inclusive }))).status).toBe(200);
    expect((await post(await command({ commandId: "si-inc-submit", doctype: "Sales Invoice", name: "SI-W-INC", action: "submit", expectedVersion: 1, document: inclusive }))).status).toBe(200);
    const incLines = await env.DB.prepare(
      "SELECT line_key,debit_minor,credit_minor FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Sales Invoice' AND voucher_no='SI-W-INC' ORDER BY rowid",
    ).all<{ line_key: string; debit_minor: number; credit_minor: number }>();
    expect(incLines.results).toEqual([
      { line_key: "RECEIVABLE", debit_minor: 50000, credit_minor: 0 },
      { line_key: "INCOME", debit_minor: 0, credit_minor: 45455 },
      { line_key: "TAX-T1", debit_minor: 0, credit_minor: 4546 },
      { line_key: "ROUND-OFF", debit_minor: 1, credit_minor: 0 },
    ]);

    const foreignInvoice = {
      customer: "CUST-1", company: "Demo", currency: "EUR", currency_scale: 2,
      posting_at: "2026-07-22T08:00:00.000Z", debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-1", qty: "1", rate: "500" }], taxes: [],
    };
    expect((await post(await command({ commandId: "si-eur-create", doctype: "Sales Invoice", name: "SI-W-EUR", action: "create", expectedVersion: null, document: foreignInvoice }))).status).toBe(200);
    expect((await post(await command({ commandId: "si-eur-submit", doctype: "Sales Invoice", name: "SI-W-EUR", action: "submit", expectedVersion: 1, document: foreignInvoice }))).status).toBe(200);
    const payment = {
      company: "Demo", posting_at: "2026-07-23T08:00:00.000Z", payment_type: "Receive", party_type: "Customer", party: "CUST-1",
      paid_from: "Debtors", paid_to: "Bank", exchange_gain_loss_account: "Exchange Gain Loss",
      paid_amount: "500", received_amount: "600", currency: "EUR", currency_scale: 2,
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-W-EUR", allocated_amount: "500" }],
    };
    expect((await post(await command({ commandId: "pe-eur-create", doctype: "Payment Entry", name: "PE-W-EUR", action: "create", expectedVersion: null, document: payment }))).status).toBe(200);
    expect((await post(await command({ commandId: "pe-eur-submit", doctype: "Payment Entry", name: "PE-W-EUR", action: "submit", expectedVersion: 1, document: payment }))).status).toBe(200);
    const fx = await env.DB.prepare(
      "SELECT debit_minor,credit_minor,currency FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Payment Entry' AND voucher_no='PE-W-EUR' AND line_key='EXCHANGE-DIFFERENCE'",
    ).first<{ debit_minor: number; credit_minor: number; currency: string }>();
    expect(fx).toEqual({ debit_minor: 0, credit_minor: 5000, currency: "USD" });
    const outstanding = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount_minor),0) AS total FROM payment_ledger_entries WHERE tenant_id='demo' AND against_voucher_type='Sales Invoice' AND against_voucher_no='SI-W-EUR'",
    ).first<{ total: number }>();
    expect(outstanding?.total).toBe(0);
    const baseOutstanding = await env.DB.prepare(
      "SELECT COALESCE(SUM(base_amount_minor),0) AS total FROM payment_ledger_entries WHERE tenant_id='demo' AND against_voucher_type='Sales Invoice' AND against_voucher_no='SI-W-EUR'",
    ).first<{ total: number }>();
    expect(baseOutstanding?.total).toBe(0);
    const postingDates = await env.DB.prepare(
      "SELECT DISTINCT posting_at FROM gl_entries WHERE tenant_id='demo' AND voucher_no IN ('SI-W-EUR','PE-W-EUR') ORDER BY posting_at",
    ).all<{ posting_at: string }>();
    expect(postingDates.results).toEqual([
      { posting_at: "2026-07-22T08:00:00.000Z" },
      { posting_at: "2026-07-23T08:00:00.000Z" },
    ]);
    const receivable = await env.DB.prepare(
      "SELECT COALESCE(SUM(debit_minor-credit_minor),0) AS total FROM gl_entries WHERE tenant_id='demo' AND account='Debtors' AND party='CUST-1' AND voucher_no IN ('SI-W-EUR','PE-W-EUR')",
    ).first<{ total: number }>();
    expect(receivable?.total).toBe(0);
  });

  it("posts server-valued FIFO stock through real D1 and exposes the stock-ledger report", async () => {
    await seedO2C();
    const now = "2026-07-23T06:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO master_records(tenant_id,record_type,name,data_json,modified_at)
       VALUES('demo','Item','FIFO-WORKERD',?1,?2)
       ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json,disabled=0`,
    ).bind(JSON.stringify({ valuation_method: "FIFO" }), now).run();

    const entry = (purpose: "Material Receipt" | "Material Issue", qty: string, rate?: string) => ({
      company: "Demo", posting_at: now, purpose,
      items: [{
        row_id: "1", item_code: "FIFO-WORKERD", qty,
        ...(purpose === "Material Receipt"
          ? { target_warehouse: "Stores", valuation_rate: rate }
          : { source_warehouse: "Stores", valuation_rate: "999" }),
      }],
    });
    for (const [name, document] of [
      ["STE-W-FIFO-R1", entry("Material Receipt", "10", "10")],
      ["STE-W-FIFO-R2", entry("Material Receipt", "10", "20")],
      ["STE-W-FIFO-I1", entry("Material Issue", "15")],
    ] as const) {
      expect((await post(await command({ commandId: `${name}-create`, doctype: "Stock Entry", name, action: "create", expectedVersion: null, document }))).status).toBe(200);
      expect((await post(await command({ commandId: `${name}-submit`, doctype: "Stock Entry", name, action: "submit", expectedVersion: 1, document }))).status).toBe(200);
    }

    const issue = await env.DB.prepare(
      `SELECT actual_qty_micros,stock_value_difference_minor
       FROM stock_ledger_entries
       WHERE tenant_id='demo' AND voucher_type='Stock Entry' AND voucher_no='STE-W-FIFO-I1' AND line_key='SRC-1'`,
    ).first<{ actual_qty_micros: number; stock_value_difference_minor: number }>();
    expect(issue).toEqual({ actual_qty_micros: -15_000_000, stock_value_difference_minor: -20_000 });
    const balance = await env.DB.prepare(
      `SELECT SUM(actual_qty_micros) AS qty,SUM(stock_value_difference_minor) AS value
       FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='FIFO-WORKERD' AND warehouse='Stores'`,
    ).first<{ qty: number; value: number }>();
    expect(balance).toEqual({ qty: 5_000_000, value: 10_000 });
    const report = await env.DB.prepare(
      `SELECT actual_qty,stock_value_difference FROM stock_ledger_report
       WHERE tenant_id='demo' AND voucher_no='STE-W-FIFO-I1' AND item_code='FIFO-WORKERD'`,
    ).first<{ actual_qty: number; stock_value_difference: number }>();
    expect(report).toEqual({ actual_qty: -15, stock_value_difference: -200 });
  });

  it("runs the internal commercial reconciliation probe with fail-closed service auth", async () => {
    const unauthorized = await exports.default.fetch(new Request("https://tenant.test/internal/reconciliation"));
    expect(unauthorized.status).toBe(401);
    const response = await exports.default.fetch(new Request("https://tenant.test/internal/reconciliation", {
      headers: { authorization: "Bearer test-internal-service-token" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, tenant_id: "demo", truncated: false });
  });

});
