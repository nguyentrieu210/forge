import { describe, expect, it } from "vitest";
import { cmd, env, post, readDoc, seedMaster } from "./r6-golden-flow-helpers.js";

const Q = 1_000_000;
const RAW_RATE = 85_000;
const FG_RATE = 180_000;
const OP_COST = 10_000;

type DayPlan = {
  day: number;
  date: string;
  purchaseRaw: number;
  manufactureFg: number;
  deliverFg: number;
  saleRate: number;
  receive: number;
};

type Expected = {
  rawQty: number;
  fgQty: number;
  stockValue: number;
  ar: number;
  ap: number;
  bank: number;
  revenue: number;
  cogs: number;
  manufactured: number;
  consumed: number;
  submittedDocuments: number;
};

const plans: DayPlan[] = [
  { day: 1, date: "2026-08-01", purchaseRaw: 8, manufactureFg: 3, deliverFg: 2, saleRate: 500_000, receive: 600_000 },
  { day: 2, date: "2026-08-02", purchaseRaw: 6, manufactureFg: 2, deliverFg: 2, saleRate: 520_000, receive: 1_040_000 },
  { day: 3, date: "2026-08-03", purchaseRaw: 4, manufactureFg: 1, deliverFg: 2, saleRate: 550_000, receive: 900_000 },
];

async function command(
  id: string,
  doctype: string,
  name: string,
  action: "create" | "submit",
  version: number | null,
  document: Record<string, unknown>,
) {
  const response = await post(await cmd({ id, doctype, name, action, version, document }));
  expect(response.status, `${doctype} ${name} ${action}`).toBe(200);
  return response;
}

async function createAndSubmit(doctype: string, name: string, document: Record<string, unknown>) {
  await command(`p03-${name}-create`, doctype, name, "create", null, document);
  await command(`p03-${name}-submit`, doctype, name, "submit", 1, document);
}

async function scalar(sql: string, bindings: unknown[] = []) {
  let statement = env.DB.prepare(sql);
  if (bindings.length) statement = statement.bind(...bindings);
  const row = await statement.first<{ value: number }>();
  return Number(row?.value ?? 0);
}

async function seed() {
  for (const [type, name, data] of [
    ["Company", "Demo", { default_currency: "VND" }],
    ["Customer", "CUST-P03", {}],
    ["Supplier", "SUP-P03", {}],
    ["Currency", "VND", { currency_scale: 0 }],
    ["Item", "RAW-P03", { valuation_method: "FIFO", standard_rate: String(RAW_RATE) }],
    ["Item", "FG-P03", { valuation_method: "FIFO", standard_rate: String(FG_RATE) }],
    ["Warehouse", "Stores-P03", {}],
    ["Warehouse", "WIP-P03", {}],
    ["Warehouse", "Finished-P03", {}],
    ["Account", "Debtors-P03", { account_type: "Receivable" }],
    ["Account", "Creditors-P03", { account_type: "Payable" }],
    ["Account", "Sales-P03", { account_type: "Income" }],
    ["Account", "Expense-P03", { account_type: "Expense" }],
    ["Account", "Bank-P03", { account_type: "Bank" }],
    ["Account", "Stock-P03", { account_type: "Stock" }],
    ["Account", "SRBNB-P03", {}],
  ] as const) {
    await seedMaster(type, name, data);
  }

  await createAndSubmit("Bill of Materials", "P03-BOM", {
    company: "Demo",
    item: "FG-P03",
    quantity: "1",
    operating_cost: String(OP_COST),
    items: [{ row_id: "P03-BOM-RAW", item_code: "RAW-P03", qty: "2", source_warehouse: "Stores-P03" }],
  });
}

function advanceExpected(current: Expected, plan: DayPlan): Expected {
  const sales = plan.deliverFg * plan.saleRate;
  return {
    rawQty: current.rawQty + plan.purchaseRaw - plan.manufactureFg * 2,
    fgQty: current.fgQty + plan.manufactureFg - plan.deliverFg,
    stockValue:
      (current.rawQty + plan.purchaseRaw - plan.manufactureFg * 2) * RAW_RATE
      + (current.fgQty + plan.manufactureFg - plan.deliverFg) * FG_RATE,
    ar: current.ar + sales - plan.receive,
    ap: current.ap + plan.purchaseRaw * RAW_RATE,
    bank: current.bank + plan.receive,
    revenue: current.revenue + sales,
    cogs: current.cogs + plan.deliverFg * FG_RATE,
    manufactured: current.manufactured + plan.manufactureFg,
    consumed: current.consumed + plan.manufactureFg * 2,
    submittedDocuments: current.submittedDocuments + 9,
  };
}

async function runDay(plan: DayPlan) {
  const suffix = String(plan.day).padStart(2, "0");
  const posting = `${plan.date}T09:00:00.000Z`;
  const po = `P03-PO-${suffix}`;
  const pr = `P03-PR-${suffix}`;
  const pi = `P03-PI-${suffix}`;
  const so = `P03-SO-${suffix}`;
  const wo = `P03-WO-${suffix}`;
  const mfg = `P03-MFG-${suffix}`;
  const dn = `P03-DN-${suffix}`;
  const si = `P03-SI-${suffix}`;
  const pe = `P03-PE-${suffix}`;

  await createAndSubmit("Purchase Order", po, {
    supplier: "SUP-P03",
    company: "Demo",
    currency: "VND",
    currency_scale: 0,
    transaction_date: plan.date,
    items: [{ row_id: `${po}-ROW`, item_code: "RAW-P03", qty: String(plan.purchaseRaw), rate: String(RAW_RATE) }],
    taxes: [],
  });

  await createAndSubmit("Purchase Receipt", pr, {
    supplier: "SUP-P03",
    company: "Demo",
    currency: "VND",
    currency_scale: 0,
    posting_at: `${plan.date}T08:00:00.000Z`,
    against_purchase_order: po,
    stock_account: "Stock-P03",
    stock_received_but_not_billed: "SRBNB-P03",
    items: [{
      row_id: `${pr}-ROW`, item_code: "RAW-P03", qty: String(plan.purchaseRaw), rate: String(RAW_RATE),
      valuation_rate: String(RAW_RATE), warehouse: "Stores-P03",
    }],
  });

  await createAndSubmit("Purchase Invoice", pi, {
    supplier: "SUP-P03",
    company: "Demo",
    currency: "VND",
    currency_scale: 0,
    posting_at: `${plan.date}T08:15:00.000Z`,
    against_purchase_order: po,
    credit_to: "Creditors-P03",
    default_expense_account: "Expense-P03",
    items: [{
      row_id: `${pi}-ROW`, purchase_order: po, item_code: "RAW-P03", qty: String(plan.purchaseRaw),
      rate: String(RAW_RATE), expense_account: "Expense-P03",
    }],
    taxes: [],
  });

  await createAndSubmit("Sales Order", so, {
    customer: "CUST-P03",
    company: "Demo",
    currency: "VND",
    currency_scale: 0,
    transaction_date: plan.date,
    items: [{ row_id: `${so}-ROW`, item_code: "FG-P03", qty: String(plan.deliverFg), rate: String(plan.saleRate) }],
    taxes: [],
  });

  await createAndSubmit("Work Order", wo, {
    company: "Demo",
    production_item: "FG-P03",
    bom_no: "P03-BOM",
    qty: String(plan.manufactureFg),
    source_warehouse: "Stores-P03",
    wip_warehouse: "WIP-P03",
    target_warehouse: "Finished-P03",
    against_sales_order: so,
    sales_order_row_id: `${so}-ROW`,
  });

  await createAndSubmit("Stock Entry", mfg, {
    company: "Demo",
    posting_at: posting,
    purpose: "Manufacture",
    work_order: wo,
    source_warehouse: "Stores-P03",
    finished_good_item: "FG-P03",
    finished_good_qty: String(plan.manufactureFg),
    target_warehouse: "Finished-P03",
    items: [{
      row_id: `${mfg}-RAW`, item_code: "RAW-P03", qty: String(plan.manufactureFg * 2), source_warehouse: "Stores-P03",
    }],
  });

  await createAndSubmit("Delivery Note", dn, {
    customer: "CUST-P03",
    company: "Demo",
    currency: "VND",
    currency_scale: 0,
    posting_at: `${plan.date}T10:00:00.000Z`,
    against_sales_order: so,
    items: [{
      row_id: `${dn}-ROW`, item_code: "FG-P03", qty: String(plan.deliverFg), rate: String(plan.saleRate),
      warehouse: "Finished-P03", valuation_rate: String(FG_RATE), sales_order: so, sales_order_row_id: `${so}-ROW`,
    }],
  });

  await createAndSubmit("Sales Invoice", si, {
    customer: "CUST-P03",
    company: "Demo",
    currency: "VND",
    currency_scale: 0,
    posting_at: `${plan.date}T10:30:00.000Z`,
    against_sales_order: so,
    debit_to: "Debtors-P03",
    default_income_account: "Sales-P03",
    items: [{
      row_id: `${si}-ROW`, item_code: "FG-P03", qty: String(plan.deliverFg), rate: String(plan.saleRate),
      income_account: "Sales-P03", sales_order: so,
    }],
    taxes: [],
  });

  const payment = {
    company: "Demo",
    posting_at: `${plan.date}T11:00:00.000Z`,
    payment_type: "Receive",
    party_type: "Customer",
    party: "CUST-P03",
    paid_from: "Debtors-P03",
    paid_to: "Bank-P03",
    paid_amount: String(plan.receive),
    received_amount: String(plan.receive),
    currency: "VND",
    currency_scale: 0,
    references: [{
      row_id: `${pe}-REF`, reference_doctype: "Sales Invoice", reference_name: si, allocated_amount: String(plan.receive),
    }],
  };
  await command(`p03-${pe}-create`, "Payment Entry", pe, "create", null, payment);
  const submit = await cmd({ id: `p03-${pe}-submit`, doctype: "Payment Entry", name: pe, action: "submit", version: 1, document: payment });
  expect((await post(submit)).status).toBe(200);
  const before = await scalar(
    "SELECT COUNT(*) value FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Payment Entry' AND voucher_no=?1",
    [pe],
  );
  expect((await post(submit)).status).toBe(200);
  const after = await scalar(
    "SELECT COUNT(*) value FROM gl_entries WHERE tenant_id='demo' AND voucher_type='Payment Entry' AND voucher_no=?1",
    [pe],
  );
  expect(after, `day ${plan.day} payment retry must be idempotent`).toBe(before);
}

async function assertDay(plan: DayPlan, expected: Expected) {
  const rawQtyMicros = await scalar(
    "SELECT COALESCE(SUM(actual_qty_micros),0) value FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='RAW-P03' AND warehouse='Stores-P03'",
  );
  const fgQtyMicros = await scalar(
    "SELECT COALESCE(SUM(actual_qty_micros),0) value FROM stock_ledger_entries WHERE tenant_id='demo' AND item_code='FG-P03' AND warehouse='Finished-P03'",
  );
  const stockValue = await scalar(
    "SELECT COALESCE(SUM(stock_value_difference_minor),0) value FROM stock_ledger_entries WHERE tenant_id='demo' AND ((item_code='RAW-P03' AND warehouse='Stores-P03') OR (item_code='FG-P03' AND warehouse='Finished-P03'))",
  );
  const wipQtyMicros = await scalar(
    "SELECT COALESCE(SUM(actual_qty_micros),0) value FROM stock_ledger_entries WHERE tenant_id='demo' AND warehouse='WIP-P03'",
  );
  const ar = await scalar(
    "SELECT COALESCE(SUM(outstanding_minor),0) value FROM receivable_outstanding WHERE tenant_id='demo' AND party='CUST-P03'",
  );
  const ap = await scalar(
    "SELECT COALESCE(SUM(outstanding_minor),0) value FROM payable_outstanding WHERE tenant_id='demo' AND party='SUP-P03'",
  );
  const bank = await scalar(
    "SELECT COALESCE(SUM(debit_minor-credit_minor),0) value FROM gl_entries WHERE tenant_id='demo' AND account='Bank-P03'",
  );
  const revenue = await scalar(
    "SELECT COALESCE(SUM(credit_minor-debit_minor),0) value FROM gl_entries WHERE tenant_id='demo' AND account='Sales-P03'",
  );
  const cogs = await scalar(
    "SELECT COALESCE(-SUM(stock_value_difference_minor),0) value FROM stock_ledger_entries WHERE tenant_id='demo' AND voucher_type='Delivery Note' AND item_code='FG-P03'",
  );
  const manufacturedMicros = await scalar(
    "SELECT COALESCE(SUM(qty_micros),0) value FROM manufacturing_progress_entries WHERE tenant_id='demo' AND kind='Manufacture' AND item_code='FG-P03'",
  );
  const consumedMicros = await scalar(
    "SELECT COALESCE(SUM(qty_micros),0) value FROM manufacturing_progress_entries WHERE tenant_id='demo' AND kind='Consumption' AND item_code='RAW-P03'",
  );
  const debit = await scalar("SELECT COALESCE(SUM(debit_minor),0) value FROM gl_entries WHERE tenant_id='demo'");
  const credit = await scalar("SELECT COALESCE(SUM(credit_minor),0) value FROM gl_entries WHERE tenant_id='demo'");
  const docs = await scalar(
    "SELECT COUNT(*) value FROM documents WHERE tenant_id='demo' AND name LIKE 'P03-%'",
  );
  const submittedDocs = await scalar(
    "SELECT COUNT(*) value FROM documents WHERE tenant_id='demo' AND name LIKE 'P03-%' AND docstatus=1",
  );

  const variances = {
    rawQtyMicros: rawQtyMicros - expected.rawQty * Q,
    fgQtyMicros: fgQtyMicros - expected.fgQty * Q,
    stockValue: stockValue - expected.stockValue,
    ar: ar - expected.ar,
    ap: ap - expected.ap,
    bank: bank - expected.bank,
    revenue: revenue - expected.revenue,
    cogs: cogs - expected.cogs,
    manufacturedMicros: manufacturedMicros - expected.manufactured * Q,
    consumedMicros: consumedMicros - expected.consumed * Q,
    wipQtyMicros,
    glImbalance: debit - credit,
    documentCount: docs - expected.submittedDocuments,
    submittedDocumentCount: submittedDocs - expected.submittedDocuments,
  };

  for (const [axis, variance] of Object.entries(variances)) {
    expect(variance, `day ${plan.day} ${axis} variance`).toBe(0);
  }

  for (let day = 1; day <= plan.day; day += 1) {
    const suffix = String(day).padStart(2, "0");
    for (const [doctype, prefix] of [
      ["Purchase Order", "PO"], ["Purchase Receipt", "PR"], ["Purchase Invoice", "PI"], ["Sales Order", "SO"],
      ["Work Order", "WO"], ["Stock Entry", "MFG"], ["Delivery Note", "DN"], ["Sales Invoice", "SI"], ["Payment Entry", "PE"],
    ] as const) {
      expect((await readDoc(doctype, `P03-${prefix}-${suffix}`))?.docstatus, `${doctype} day ${day}`).toBe(1);
    }
  }
  expect((await readDoc("Bill of Materials", "P03-BOM"))?.docstatus).toBe(1);

  console.log(JSON.stringify({
    format: "forge-alumdoor-pilot-03-daily-reconciliation/v1",
    status: "RECONCILED",
    day: plan.day,
    date: plan.date,
    tolerance: 0,
    expected,
    variances,
  }));
}

describe("Pilot-03 synthetic parallel run on canonical authorities", () => {
  it("reconciles three cumulative business days with zero variance and retry-safe writes", async () => {
    await seed();
    let expected: Expected = {
      rawQty: 0, fgQty: 0, stockValue: 0, ar: 0, ap: 0, bank: 0, revenue: 0, cogs: 0,
      manufactured: 0, consumed: 0, submittedDocuments: 1,
    };

    for (const plan of plans) {
      await runDay(plan);
      expected = advanceExpected(expected, plan);
      await assertDay(plan, expected);
    }

    console.log("PILOT_03_SYNTHETIC_PASS days=3 tolerance=0 production_write_authorized=false");
  });
});
