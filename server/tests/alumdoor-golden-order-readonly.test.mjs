import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateGoldenOrderEvidence } from "../scripts/lib/alumdoor-golden-order-readonly.mjs";

function fixture(overrides = {}) {
  return {
    salesOrder: { name: "SO-GOLDEN", docstatus: 1, customer: "KH-GOLDEN" },
    productionRequests: [{
      name: "PRQ-1",
      sales_order: "SO-GOLDEN",
      docstatus: 0,
      request_state: "Đã tạo",
      items: [{ request_line_key: "ROW-A-SET-1", sales_order_row_id: "ROW-A" }],
    }],
    workOrders: [{
      name: "WO-1",
      production_request: "PRQ-1",
      production_request_line_key: "ROW-A-SET-1",
      sales_order_row_id: "ROW-A",
      against_sales_order: "SO-GOLDEN",
      docstatus: 1,
    }],
    deliveryNotes: [{
      name: "DN-1",
      against_sales_order: "SO-GOLDEN",
      docstatus: 1,
      items: [{ item_code: "CUA-DUC", sales_order: "SO-GOLDEN", sales_order_row_id: "ROW-A" }],
    }],
    stockLedgerRows: [{ voucher_no: "DN-1", actual_qty: -8 }],
    invoices: [{ name: "SI-1", against_sales_order: "SO-GOLDEN", docstatus: 1 }],
    paymentEntries: [{
      name: "PE-1", docstatus: 1,
      references: [{ reference_doctype: "Sales Invoice", reference_name: "SI-1", allocated_amount: 5_000_000 }],
    }],
    receivableRows: [{ voucher_no: "SI-1", outstanding_amount: 7_000_000 }],
    warrantyClaims: [{ name: "WC-1", sales_order: "SO-GOLDEN", delivery_note: "DN-1" }],
    requireWarranty: true,
    ...overrides,
  };
}

test("Golden Order evidence joins production row lineage, stock, AR/payment and warranty authorities", () => {
  const result = evaluateGoldenOrderEvidence(fixture());
  assert.equal(result.sales_order, "SO-GOLDEN");
  assert.deepEqual(result.production_requests, ["PRQ-1"]);
  assert.deepEqual(result.work_orders, ["WO-1"]);
  assert.deepEqual(result.production_row_ids, ["ROW-A"]);
  assert.deepEqual(result.delivered_production_row_ids, ["ROW-A"]);
  assert.deepEqual(result.delivery_notes, ["DN-1"]);
  assert.equal(result.stock_out_qty, 8);
  assert.deepEqual(result.sales_invoices, ["SI-1"]);
  assert.deepEqual(result.payment_entries, ["PE-1"]);
  assert.equal(result.paid_amount, 5_000_000);
  assert.equal(result.ar_outstanding, 7_000_000);
  assert.deepEqual(result.warranty_claims, ["WC-1"]);
  assert.equal(result.authority.fulfillment_lineage, "sales_order_row_id");
  assert.equal(result.authority.stock, "Stock Ledger");
  assert.equal(result.authority.receivable, "Accounts Receivable / Payment Ledger");
});

test("missing production row identity fails instead of proving lineage by document names only", () => {
  assert.throws(() => evaluateGoldenOrderEvidence(fixture({
    productionRequests: [{ name: "PRQ-1", sales_order: "SO-GOLDEN", docstatus: 0, request_state: "Đã tạo", items: [] }],
    workOrders: [{ name: "WO-1", production_request: "PRQ-1", against_sales_order: "SO-GOLDEN", docstatus: 1 }],
  })), /sales_order_row_id/);
});

test("missing delivered production row fails a partially joined Golden Order", () => {
  assert.throws(() => evaluateGoldenOrderEvidence(fixture({
    deliveryNotes: [{
      name: "DN-1",
      against_sales_order: "SO-GOLDEN",
      docstatus: 1,
      items: [{ item_code: "CUA-DUC", sales_order: "SO-GOLDEN", sales_order_row_id: "ROW-B" }],
    }],
  })), /chưa giao đủ lineage sản xuất/);
});

test("missing stock-ledger movement fails even when Delivery Note exists", () => {
  assert.throws(() => evaluateGoldenOrderEvidence(fixture({ stockLedgerRows: [] })), /Stock Ledger/);
});

test("invoice without allocated submitted payment does not prove finance closure", () => {
  assert.throws(() => evaluateGoldenOrderEvidence(fixture({ paymentEntries: [] })), /Payment Entry/);
});

test("warranty is optional unless the verifier explicitly requires it", () => {
  const result = evaluateGoldenOrderEvidence(fixture({ warrantyClaims: [], requireWarranty: false }));
  assert.deepEqual(result.warranty_claims, []);
  assert.throws(() => evaluateGoldenOrderEvidence(fixture({ warrantyClaims: [], requireWarranty: true })), /Warranty Claim/);
});

test("live verifier is read-only after login and uses canonical ledger reports", async () => {
  const source = await readFile(new URL("../scripts/verify-alumdoor-golden-order-readonly.mjs", import.meta.url), "utf8");
  assert.match(source, /frappe\.desk\.query_report\.run/);
  assert.match(source, /"Stock Ledger"/);
  assert.match(source, /"Accounts Receivable"/);
  assert.doesNotMatch(source, /frappe\.client\.submit/);
  assert.doesNotMatch(source, /raw\("(?:PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /raw\("POST", `\/api\/resource/);
  assert.doesNotMatch(source, /call\("POST", `\/api\/resource/);
});
