import assert from "node:assert/strict";
import test from "node:test";

import { handlePurchaseSupplierDashboard } from "../dist/apps-src/alumdoor-worker/src/purchase-supplier-dashboard.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

const line = (qtyBar, rate) => ({
  row_id: "ROW-1",
  item_code: "AL71",
  item_name: "Nhôm AL71",
  measurement_profile: "Nhôm cây/lá",
  stock_uom: "Kg",
  theoretical_kg_per_m: 0.389,
  length_m: 7.2,
  qty_bar: qtyBar,
  theoretical_kg: 7.2 * 0.389 * qtyBar,
  rate,
  amount: 7.2 * 0.389 * qtyBar * rate,
  color: "GS",
  is_stamped: "Không",
});

const orders = {
  "PO-1": {
    name: "PO-1", supplier: "Tiến Đạt", company: "ALUMDOOR", currency: "VND",
    transaction_date: "2026-08-01", schedule_date: "2026-12-01", docstatus: 1,
    received_percentage: 100, billed_percentage: 100, items: [line(200, 100_000)],
  },
  "PO-2": {
    name: "PO-2", supplier: "Tiến Đạt", company: "ALUMDOOR", currency: "VND",
    transaction_date: "2026-08-02", schedule_date: "2026-12-01", docstatus: 1,
    received_percentage: 30, billed_percentage: 0, items: [line(100, 110_000)],
  },
};

const receipt = {
  name: "PR-1", supplier: "Tiến Đạt", company: "ALUMDOOR", currency: "VND",
  posting_at: "2026-08-03T08:00:00.000Z", supplier_invoice_no: "PG-001", driver: "Anh A", docstatus: 1,
  items: [
    { ...line(200, 100_000), purchase_order: "PO-1", actual_weight_kg: 550, qty: 550 },
    { ...line(30, 110_000), purchase_order: "PO-2", actual_weight_kg: 80, qty: 80 },
  ],
};

const debtRow = {
  queue_key: "Q-AL71-GS-72",
  window_id: "WIN-1",
  window_sequence: 1,
  window_status: "Open",
  supplier: "Tiến Đạt",
  company: "ALUMDOOR",
  item_code: "AL71",
  material: "AL71 · 7.2 m · 0.389 kg/m · GS · Không dập",
  measurement_profile: "Nhôm cây/lá",
  allocation_uom: "Cây",
  length_m: "7.2",
  theoretical_kg_per_m: "0.389",
  ordered_qty: "300",
  received_qty: "230",
  allocated_qty: "230",
  nominal_remaining_qty: "70",
  unapplied_receipt_qty: "0",
  ordered_meters: "2160",
  received_meters: "1656",
  nominal_remaining_meters: "504",
  ordered_barem_weight_kg: "840.24",
  received_barem_weight_kg: "644.184",
  nominal_remaining_barem_weight_kg: "196.056",
  tolerance: "5%",
  oldest_open_po_date: "2026-08-02",
  oldest_open_po_age_days: 1,
  barem_weight_kg: "644.184",
  actual_weight_kg: "630",
};

function platform() {
  return {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = decodeURIComponent(url.pathname).replace(/^\/api/, "");
      if (path === "/resource/Purchase Order") return json({ data: [{ name: "PO-1" }, { name: "PO-2" }] });
      if (path === "/resource/Purchase Receipt") return json({ data: [{ name: "PR-1" }] });
      if (path === "/resource/Purchase Invoice") return json({ data: [] });
      if (path === "/resource/Purchase Order/PO-1") return json({ data: orders["PO-1"] });
      if (path === "/resource/Purchase Order/PO-2") return json({ data: orders["PO-2"] });
      if (path === "/resource/Purchase Receipt/PR-1") return json({ data: receipt });
      if (path === "/method/frappe.desk.query_report.run") {
        assert.equal(url.searchParams.get("report_name"), "Debt Summary");
        const filters = JSON.parse(url.searchParams.get("filters") ?? "{}");
        assert.equal(filters.party, "Tiến Đạt");
        assert.equal(filters.account_type, "Payable");
        return json({ message: {
          result: [{
            party: "Tiến Đạt",
            account_type: "Payable",
            company: "ALUMDOOR",
            account: "331 - Phải trả NCC",
            currency: "VND",
            total_outstanding: 30_000_000,
            due_amount: 20_000_000,
            overdue_amount: 10_000_000,
            oldest_due_date: "2026-07-15",
            advance_balance: 5_000_000,
            net_exposure: 25_000_000,
          }],
        } });
      }
      if (path === "/method/metaforge.api.get_purchase_allocation_timeline") {
        const name = url.searchParams.get("name");
        const qty = name === "PO-1" ? 200 : 30;
        return json({ message: {
          name,
          rows: [{
            purchase_receipt: "PR-1",
            purchase_order: name,
            purchase_order_row: "ROW-1",
            qty: String(qty),
          }],
          windows: [{ window_id: "WIN-1", status: "Open" }],
          supplier_debt_reports: [{ rows: [debtRow] }],
        } });
      }
      throw new Error(`unexpected callback ${path}`);
    },
  };
}

function requestFor(platformEnv) {
  return handlePurchaseSupplierDashboard(new Request("https://app.local/api/method/alumdoor.purchase.supplier_delivery_dashboard", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://gateway.local/api",
    },
    body: JSON.stringify({ args: { supplier: "Tiến Đạt" } }),
  }), { PLATFORM: platformEnv });
}

test("supplier dashboard exposes bar, metre, barem and Payment Ledger debt together", async () => {
  const response = await requestFor(platform());
  const body = await response.json();
  assert.equal(response.status, 200, body.message);
  assert.equal(body.source, "purchase_allocation_ledger");
  assert.equal(body.materials.length, 1);
  assert.equal(body.summary.ordered_bars, 300);
  assert.equal(body.summary.received_bars, 230);
  assert.equal(body.summary.remaining_bars, 70);
  assert.equal(body.summary.ordered_meters, 2160);
  assert.equal(body.summary.received_meters, 1656);
  assert.equal(body.summary.remaining_meters, 504);
  assert.equal(body.summary.ordered_barem_weight_kg, 840.24);
  assert.equal(body.summary.received_barem_weight_kg, 644.184);
  assert.equal(body.summary.remaining_barem_weight_kg, 196.056);
  assert.equal(body.materials[0].status, "Còn phải giao");
  assert.equal(body.materials[0].tolerance, "5%");
  assert.equal(body.materials[0].weight_variance_kg, -14.184);
  assert.equal(body.purchase_orders.find((row) => row.purchase_order === "PO-1").status, "Đã giao đủ");
  assert.equal(body.purchase_orders.find((row) => row.purchase_order === "PO-2").remaining_bars, 70);
  assert.equal(body.purchase_order_lines.find((row) => row.purchase_order === "PO-2").remaining_meters, 504);
  assert.equal(body.receipts[0].qty_bar, 230);
  assert.equal(body.receipts[0].total_length_m, 1656);
  assert.equal(body.receipts[0].actual_weight_kg, 630);
  assert.equal(body.price_history[0].rate, 110_000);
  assert.equal(body.price_history[0].change_pct, 10);
  assert.equal(body.payable.authoritative, true);
  assert.equal(body.payable.source, "Payment Ledger / Debt Summary");
  assert.equal(body.payable.total_outstanding, 30_000_000);
  assert.equal(body.payable.overdue_amount, 10_000_000);
  assert.equal(body.payable.advance_balance, 5_000_000);
  assert.equal(body.payable.net_exposure, 25_000_000);
  assert.equal(body.summary.payable_outstanding, 30_000_000);
});

test("fallback chứng từ không giả vờ rằng nhận đủ đồng nghĩa đã đối soát", async () => {
  const fallbackPlatform = platform();
  const original = fallbackPlatform.fetch.bind(fallbackPlatform);
  fallbackPlatform.fetch = async (outbound) => {
    const url = new URL(outbound.url);
    const path = decodeURIComponent(url.pathname).replace(/^\/api/, "");
    if (path === "/method/metaforge.api.get_purchase_allocation_timeline") return json({ message: null });
    return original(outbound);
  };
  const response = await requestFor(fallbackPlatform);
  const body = await response.json();
  assert.equal(response.status, 200, body.message);
  assert.equal(body.source, "submitted_documents_fallback");
  assert.equal(body.materials.length, 1);
  assert.equal(body.materials[0].remaining_bars, 70);
  assert.equal(body.materials[0].remaining_meters, 504);
  assert.equal(body.materials[0].remaining_barem_weight_kg, 196.056);
  assert.notEqual(body.materials[0].status, "Đã đối soát");
});
