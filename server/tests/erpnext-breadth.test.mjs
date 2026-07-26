import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-25T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "USD", items: [], warehouses: ["Stores", "Finished"],
    accounts: ["Debtors", "Sales", "Cash", "Stock", "COGS", "Expense", "Employee Payable", "Fixed Asset", "Accumulated Depreciation", "Depreciation Expense", "Asset Gain", "Asset Loss"],
  });
  for (const [type, name, data = {}] of [
    ["Employee", "EMP-1"], ["Operation", "Cutting"], ["Workstation", "WS-1"], ["Location", "Factory"],
    ["Asset Category", "Equipment"], ["Item", "RAW", { valuation_method: "FIFO" }], ["Item", "FG", { valuation_method: "FIFO" }],
    ["Item", "POS-ITEM", { valuation_method: "FIFO" }], ["Project", "PROJ-1", {}], ["Task", "TASK-1", { project: "PROJ-1" }],
    ["Activity Type", "Consulting", { costing_rate: "50", billing_rate: "100" }],
    ["Service Level Agreement", "GOLD", { urgent_response_minutes: 15, urgent_resolution_minutes: 120 }],
    ["Item Price", "Retail:POS-ITEM", { currency: "USD", rate: "12" }],
    ["POS Profile", "MAIN", { company: "Demo", warehouse: "Stores", currency: "USD", selling_price_list: "Retail", income_account: "Sales", cash_account: "Cash", stock_account: "Stock", cogs_account: "COGS" }],
  ]) store.seedMaster(type, name, "demo", data);
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function stockReceipt(kernel, name, item, qty, rate, warehouse = "Stores") {
  return createAndSubmit(kernel, { doctype: "Stock Entry", name, document: { company: "Demo", posting_at: now(), purpose: "Material Receipt", items: [{ row_id: "1", item_code: item, qty, valuation_rate: rate, target_warehouse: warehouse }] } });
}

test("Production Plan and Job Card validate BOM/work order and derive quantities and hours", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Bill of Materials", name: "BOM-FG", document: { company: "Demo", item: "FG", quantity: "1", operating_cost: "2", items: [{ row_id: "1", item_code: "RAW", qty: "2", source_warehouse: "Stores" }] } });
  await createAndSubmit(kernel, { doctype: "Work Order", name: "WO-1", document: { company: "Demo", production_item: "FG", bom_no: "BOM-FG", qty: "5", source_warehouse: "Stores", target_warehouse: "Finished" } });
  await createAndSubmit(kernel, { doctype: "Production Plan", name: "PP-1", document: { company: "Demo", posting_at: now(), items: [{ row_id: "1", item_code: "FG", bom_no: "BOM-FG", planned_qty: "5", warehouse: "Finished" }] } });
  await createAndSubmit(kernel, { doctype: "Job Card", name: "JC-1", document: { company: "Demo", work_order: "WO-1", operation: "Cutting", workstation: "WS-1", employee: "EMP-1", posting_at: now(), completed_qty: "2", time_logs: [{ row_id: "1", from_time: "2026-07-25T09:00:00.000Z", to_time: "2026-07-25T11:30:00.000Z" }] } });
  const plan = await store.getDocument("demo", "Production Plan", "PP-1");
  const card = await store.getDocument("demo", "Job Card", "JC-1");
  assert.equal(plan.status, "Planned");
  assert.equal(plan.data.total_planned_qty, "5.000000");
  assert.equal(card.status, "Completed");
  assert.equal(card.data.total_hours, "2.500000");
  assert.equal(card.data.completed_qty, "2.000000");
  await assert.rejects(createAndSubmit(kernel, { doctype: "Job Card", name: "JC-2", document: { company: "Demo", work_order: "WO-1", operation: "Cutting", workstation: "WS-1", employee: "EMP-1", posting_at: now(), completed_qty: "4", time_logs: [{ row_id: "1", from_time: "2026-07-25T12:00:00.000Z", to_time: "2026-07-25T13:00:00.000Z" }] } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("Asset movement, maintenance and disposal preserve lifecycle and balanced disposal GL", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Asset", name: "ASSET-1", document: { asset_name: "Machine", company: "Demo", asset_category: "Equipment", purchase_date: "2026-01-01", available_for_use_date: "2026-01-01", gross_purchase_amount: "1200", salvage_value: "0", depreciation_method: "Straight Line", total_number_of_depreciations: 12, frequency_of_depreciation_months: 1, accumulated_depreciation_account: "Accumulated Depreciation", depreciation_expense_account: "Depreciation Expense", fixed_asset_account: "Fixed Asset" } });
  await createAndSubmit(kernel, { doctype: "Asset Depreciation Entry", name: "DEP-1", document: { asset: "ASSET-1", company: "Demo", posting_at: now() } });
  await createAndSubmit(kernel, { doctype: "Asset Movement", name: "MOV-1", document: { asset: "ASSET-1", company: "Demo", posting_at: now(), target_location: "Factory", target_custodian: "EMP-1" } });
  await createAndSubmit(kernel, { doctype: "Asset Maintenance", name: "MNT-1", document: { asset: "ASSET-1", company: "Demo", posting_at: now(), maintenance_type: "Preventive", description: "Quarterly service" } });
  const beforeDisposalGl = store.snapshot().gl_entries.length;
  await createAndSubmit(kernel, { doctype: "Asset Disposal", name: "DSP-1", document: { asset: "ASSET-1", company: "Demo", posting_at: now(), proceeds: "1000", cash_or_receivable_account: "Cash", gain_account: "Asset Gain", loss_account: "Asset Loss" } });
  const asset = await store.getDocument("demo", "Asset", "ASSET-1");
  assert.equal(asset.status, "Disposed");
  const disposal = await store.getDocument("demo", "Asset Disposal", "DSP-1");
  assert.equal(disposal.data.net_book_value_minor, 110000);
  assert.equal(disposal.data.gain_or_loss_minor, -10000);
  const gl = store.snapshot().gl_entries.slice(beforeDisposalGl);
  assert.equal(gl.reduce((sum, line) => sum + line.debit_minor, 0), gl.reduce((sum, line) => sum + line.credit_minor, 0));
  await assert.rejects(createAndSubmit(kernel, { doctype: "Asset Disposal", name: "DSP-2", document: { asset: "ASSET-1", company: "Demo", posting_at: now(), proceeds: "1", cash_or_receivable_account: "Cash", gain_account: "Asset Gain", loss_account: "Asset Loss" } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await mutate(kernel, { commandId: "DSP-1-cancel", doctype: "Asset Disposal", name: "DSP-1", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal((await store.getDocument("demo", "Asset", "ASSET-1")).status, "Active");
});

test("Timesheet uses server activity rates and projects immutable cost/billing totals", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Timesheet", name: "TS-1", document: { company: "Demo", employee: "EMP-1", posting_at: now(), time_logs: [{ row_id: "1", project: "PROJ-1", task: "TASK-1", activity_type: "Consulting", from_time: "2026-07-25T08:00:00.000Z", to_time: "2026-07-25T10:00:00.000Z", cost_rate: "999", billing_rate: "999" }] } });
  const sheet = await store.getDocument("demo", "Timesheet", "TS-1");
  assert.equal(sheet.data.total_hours, "2.000000");
  assert.equal(sheet.data.total_cost_minor, 10000);
  assert.equal(sheet.data.total_billing_minor, 20000);
  assert.deepEqual(await store.getProjectTimeSummary("demo", "PROJ-1"), { hours_micros: 2000000, cost_minor: 10000, billing_minor: 20000 });
  await mutate(kernel, { commandId: "TS-1-cancel", doctype: "Timesheet", name: "TS-1", action: "cancel", expectedVersion: 2, document: {} });
  assert.deepEqual(await store.getProjectTimeSummary("demo", "PROJ-1"), { hours_micros: 0, cost_minor: 0, billing_minor: 0 });
});

test("Quality Inspection derives acceptance and Issue SLA dates are server-owned", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Quality Inspection", name: "QI-1", document: { inspection_type: "Incoming", item_code: "RAW", posting_at: now(), readings: [{ row_id: "1", specification: "Length", value: "10.5", minimum: "10", maximum: "10.4" }] } });
  const inspection = await store.getDocument("demo", "Quality Inspection", "QI-1");
  assert.equal(inspection.status, "Rejected");
  assert.equal(inspection.data.readings[0].accepted, false);
  await mutate(kernel, { commandId: "ISS-1-create", doctype: "Issue", name: "ISS-1", action: "create", expectedVersion: null, document: { subject: "Critical outage", customer: "CUST-1", service_level_agreement: "GOLD", priority: "Urgent", opened_at: "2026-07-25T09:00:00.000Z", first_response_due_at: "2099-01-01T00:00:00.000Z" } });
  const issue = await store.getDocument("demo", "Issue", "ISS-1");
  assert.equal(issue.data.first_response_due_at, "2026-07-25T09:15:00.000Z");
  assert.equal(issue.data.resolution_due_at, "2026-07-25T11:00:00.000Z");
});

test("Expense Claim posts employee payable and balanced GL from server-normalized rows", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Expense Claim", name: "EXP-1", document: { employee: "EMP-1", company: "Demo", posting_at: now(), payable_account: "Employee Payable", expenses: [{ row_id: "1", expense_type: "Travel", expense_account: "Expense", amount: "150", cost_center: "Main" }] } });
  const claim = await store.getDocument("demo", "Expense Claim", "EXP-1");
  assert.equal(claim.data.total_claimed_amount, "150.00");
  assert.equal(await store.getOutstandingMinor("demo", "Expense Claim", "EXP-1"), 15000);
  const lines = store.snapshot().gl_entries.filter((line) => ["EXPENSE-1", "PAYABLE"].includes(line.line_key));
  assert.equal(lines.reduce((sum, line) => sum + line.debit_minor, 0), lines.reduce((sum, line) => sum + line.credit_minor, 0));
});

test("POS opening, paid invoice, stock/COGS and closing are one server-authoritative session", async () => {
  const { store, kernel } = setup();
  await stockReceipt(kernel, "POS-STOCK", "POS-ITEM", "10", "5");
  await createAndSubmit(kernel, { doctype: "POS Opening Entry", name: "OPEN-1", document: { pos_profile: "MAIN", posting_at: now(), opening_cash: "100" } });
  await assert.rejects(createAndSubmit(kernel, { doctype: "POS Opening Entry", name: "OPEN-2", document: { pos_profile: "MAIN", posting_at: now(), opening_cash: "0" } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await createAndSubmit(kernel, { doctype: "POS Invoice", name: "POS-1", document: { pos_profile: "MAIN", opening_entry: "OPEN-1", customer: "CUST-1", company: "FORGED", currency: "EUR", posting_at: now(), cash_account: "FORGED", default_income_account: "FORGED", stock_account: "FORGED", cogs_account: "FORGED", items: [{ row_id: "1", item_code: "POS-ITEM", qty: "2", rate: "999", warehouse: "FORGED" }], taxes: [] } });
  const invoice = await store.getDocument("demo", "POS Invoice", "POS-1");
  assert.equal(invoice.data.company, "Demo");
  assert.equal(invoice.data.currency, "USD");
  assert.equal(invoice.data.items[0].rate, "12.00");
  assert.equal(invoice.data.grand_total, "24.00");
  assert.equal(await store.getStockBalanceMicros("demo", "POS-ITEM", "Stores"), 8000000);
  assert.deepEqual(await store.getPosSessionSales("demo", "OPEN-1"), { net_total_minor: 2400, tax_total_minor: 0, grand_total_minor: 2400 });
  await createAndSubmit(kernel, { doctype: "POS Closing Entry", name: "CLOSE-1", document: { pos_profile: "MAIN", opening_entry: "OPEN-1", company: "FORGED", posting_at: now(), closing_cash: "124" } });
  const closing = await store.getDocument("demo", "POS Closing Entry", "CLOSE-1");
  assert.equal(closing.data.expected_grand_total_minor, 2400);
  assert.equal(closing.data.difference_minor, 0);
  await assert.rejects(createAndSubmit(kernel, { doctype: "POS Invoice", name: "POS-2", document: { pos_profile: "MAIN", opening_entry: "OPEN-1", customer: "CUST-1", company: "Demo", currency: "USD", posting_at: now(), cash_account: "Cash", default_income_account: "Sales", stock_account: "Stock", cogs_account: "COGS", items: [{ row_id: "1", item_code: "POS-ITEM", qty: "1", rate: "12", warehouse: "Stores" }], taxes: [] } }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await assert.rejects(mutate(kernel, { commandId: "POS-1-cancel-closed", doctype: "POS Invoice", name: "POS-1", action: "cancel", expectedVersion: 2, document: {} }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await assert.rejects(mutate(kernel, { commandId: "OPEN-1-cancel-closed", doctype: "POS Opening Entry", name: "OPEN-1", action: "cancel", expectedVersion: 2, document: {} }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await mutate(kernel, { commandId: "CLOSE-1-cancel", doctype: "POS Closing Entry", name: "CLOSE-1", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, { commandId: "POS-1-cancel", doctype: "POS Invoice", name: "POS-1", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, { commandId: "OPEN-1-cancel", doctype: "POS Opening Entry", name: "OPEN-1", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal((await store.getDocument("demo", "POS Opening Entry", "OPEN-1")).docstatus, 2);
});
