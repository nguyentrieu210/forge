
import test from "node:test";
import assert from "node:assert/strict";
import { compileAppReport, QueryCompiler } from "../dist/packages/query/src/index.js";

const appReport = {
  name: "Enrollment by class",
  doctype: "Enrollment",
  columns: [
    { field: "class_group", label: "Class", type: "Link" },
    { field: "name", label: "Enrollments", type: "Int", aggregate: "count" },
  ],
  group_by: "class_group",
  order_by: { column: "name", direction: "desc" },
  filters: ["class_group"],
  limit: 500,
};

test("query compiler injects tenant scope and parameterizes user values", () => {
  const compiled = new QueryCompiler().compile({
    report: "Accounts Receivable",
    tenant_id: "tenant-a",
    filters: [{ field: "party", operator: "=", value: "CUST-1' OR 1=1 --" }],
    order_by: [{ field: "outstanding_amount", direction: "desc" }],
    limit: 50,
  });
  assert.match(compiled.sql, /"tenant_id"=\?1/);
  assert.ok(!compiled.sql.includes("OR 1=1"));
  assert.equal(compiled.params[1], "CUST-1' OR 1=1 --");
  assert.equal(compiled.prepared, false);
});

test("app report compiler stays on one tenant and one manifest-owned doctype", () => {
  const compiled = compileAppReport(appReport, {
    report: appReport.name,
    tenant_id: "tenant-a",
    filters: [{ field: "class_group", operator: "=", value: "CLASS-1' OR 1=1 --" }],
  });
  assert.match(compiled.sql, /FROM documents WHERE tenant_id=\?1 AND doctype=\?2/);
  assert.ok(!compiled.sql.includes("OR 1=1"));
  assert.deepEqual(compiled.params.slice(0, 3), ["tenant-a", "Enrollment", "CLASS-1' OR 1=1 --"]);
});

test("app report compiler refuses a forged filter operator even if a caller bypasses request parsing", () => {
  assert.throws(() => compileAppReport(appReport, {
    report: appReport.name,
    tenant_id: "tenant-a",
    filters: [{ field: "class_group", operator: "= ?3 OR 1=1 --", value: "x" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("query compiler blocks unknown fields and moves large result requests to prepared mode", () => {
  const compiler = new QueryCompiler();
  assert.throws(() => compiler.compile({
    report: "Stock Balance", tenant_id: "demo", filters: [{ field: "payload_json", operator: "like", value: "%x%" }],
  }), (error) => error.code === "VALIDATION_ERROR");
  const prepared = compiler.compile({ report: "Stock Balance", tenant_id: "demo", limit: 5000 });
  assert.equal(prepared.prepared, true);
});


test("ERPNext core reports compile only whitelisted ledger and projection fields", () => {
  const compiler = new QueryCompiler();
  const stock = compiler.compile({ report: "Stock Ledger", tenant_id: "demo", filters: [{ field: "item_code", operator: "=", value: "ITEM-1" }] });
  assert.match(stock.sql, /stock_ledger_report/);
  assert.equal(stock.params[1], "ITEM-1");
  const workOrder = compiler.compile({ report: "Work Order Progress", tenant_id: "demo", filters: [{ field: "status", operator: "=", value: "In Process" }] });
  assert.match(workOrder.sql, /work_order_progress/);
  assert.throws(() => compiler.compile({ report: "Serial Number Status", tenant_id: "demo", filters: [{ field: "actual_qty_micros", operator: ">", value: 0 }] }), (error) => error.code === "VALIDATION_ERROR");
});

test("Alumdoor available-stock report exposes the cumulative length view without raw micros", () => {
  const compiled = new QueryCompiler().compile({
    report: "Tồn nhôm theo khổ",
    tenant_id: "demo",
    filters: [
      { field: "warehouse", operator: "=", value: "K36" },
      { field: "min_length_m", operator: ">=", value: 4.5 },
    ],
  });
  assert.match(compiled.sql, /alumdoor_available_stock_by_length/);
  assert.match(compiled.sql, /"tenant_id"=\?1/);
  assert.deepEqual(compiled.params.slice(1, 3), ["K36", 4.5]);
  assert.ok(compiled.columns.some((column) => column.field === "available_qty"));
  assert.throws(() => new QueryCompiler().compile({
    report: "Tồn nhôm theo khổ",
    tenant_id: "demo",
    filters: [{ field: "available_qty_micros", operator: ">", value: 0 }],
  }), (error) => error.code === "VALIDATION_ERROR");
});


test("ERPNext breadth reports remain tenant-scoped and field-whitelisted", () => {
  const compiler = new QueryCompiler();
  for (const [report, source, field] of [
    ["Asset Lifecycle", "asset_lifecycle_report", "asset"],
    ["Project Profitability", "project_profitability", "project"],
    ["POS Session Summary", "pos_session_summary", "opening_entry"],
    ["Profit and Loss", "profit_and_loss", "root_type"],
    ["Balance Sheet", "balance_sheet", "root_type"],
    ["Cash Flow", "cash_flow", "account"],
  ]) {
    const compiled = compiler.compile({ report, tenant_id: "demo", filters: [{ field, operator: "!=", value: "x" }] });
    assert.match(compiled.sql, new RegExp(source));
    assert.match(compiled.sql, /"tenant_id"=\?1/);
    assert.equal(compiled.params[1], "x");
  }
  assert.throws(() => compiler.compile({ report: "Profit and Loss", tenant_id: "demo", filters: [{ field: "debit_minor", operator: ">", value: 0 }] }), (error) => error.code === "VALIDATION_ERROR");
});


test("business-suite reports remain tenant-scoped and field-whitelisted", () => {
  const compiler = new QueryCompiler();
  for (const [report, source, field] of [
    ["Bank Reconciliation Summary", "bank_reconciliation_summary", "bank_transaction"],
    ["Payroll Register", "payroll_register", "employee"],
    ["Subscription Schedule", "subscription_schedule", "customer"],
    ["E-Invoice Submission Log", "e_invoice_submission_log", "source_name"],
  ]) {
    const compiled = compiler.compile({ report, tenant_id: "demo", filters: [{ field, operator: "=", value: "x" }] });
    assert.match(compiled.sql, new RegExp(source));
    assert.match(compiled.sql, /"tenant_id"=\?1/);
    assert.equal(compiled.params[1], "x");
  }
  assert.throws(() => compiler.compile({ report: "Payroll Register", tenant_id: "demo", filters: [{ field: "payload_json", operator: "like", value: "%x%" }] }), (error) => error.code === "VALIDATION_ERROR");
});
