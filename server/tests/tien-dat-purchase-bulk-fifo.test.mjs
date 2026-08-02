import assert from "node:assert/strict";
import test from "node:test";

import { handleBulkPurchaseFifoRequest } from "../dist/apps-src/alumdoor-worker/src/bulk-purchase-fifo-receipt.js";

function response(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

const POSTING_AT = "2026-08-02T14:30:00.000Z";

function aluminiumLine(itemCode, lengthM, bars, color = "GS") {
  return {
    item_code: itemCode,
    item_name: `Nhôm ${itemCode}`,
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    stock_uom: "Kg",
    theoretical_kg_per_m: 0.389,
    theoretical_kg: round(lengthM * 0.389 * bars),
    length_m: lengthM,
    qty_bar: bars,
    color,
    is_stamped: "Không",
  };
}

function callbackResourcePath(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/\/+$/, "");
  const resourceIndex = decoded.lastIndexOf("/resource/");
  return resourceIndex >= 0 ? decoded.slice(resourceIndex) : decoded;
}

function createPlatform({ secondCompany = "ALUMDOOR" } = {}) {
  const order1 = {
    name: "PO-DAY-1", supplier: "Tiến Đạt", company: "ALUMDOOR", currency: "VND",
    transaction_date: "2026-08-01", docstatus: 1, items: [aluminiumLine("AL71", 7.2, 200)],
  };
  const order2 = {
    name: "PO-DAY-2", supplier: "Tiến Đạt", company: secondCompany, currency: "VND",
    transaction_date: "2026-08-02", docstatus: 1, items: [aluminiumLine("AL71", 7.2, 100)],
  };
  const drafts = new Map(); const submitted = new Map(); let creates = 0;
  const platform = {
    async fetch(outbound) {
      const url = new URL(outbound.url); const path = callbackResourcePath(url.pathname);
      if (path === "/resource/Supplier/Tiến Đạt") return response({ supplier_name: "Tiến Đạt" });
      if (path === "/resource/Purchase Order") return response([{ name: order1.name }, { name: order2.name }]);
      if (path === `/resource/Purchase Order/${order1.name}`) return response(order1);
      if (path === `/resource/Purchase Order/${order2.name}`) return response(order2);
      if (path === "/resource/Purchase Receipt" && outbound.method === "POST") {
        const body = await outbound.json(); creates += 1; const doc = { name: `PR-BULK-${creates}`, docstatus: 0, ...body }; drafts.set(doc.name, doc); return response(doc);
      }
      if (path === "/resource/Purchase Receipt") {
        const filters = JSON.parse(url.searchParams.get("filters") ?? "[]");
        const status = Number(filters.find((row) => row?.[0] === "docstatus")?.[2]);
        const invoice = filters.find((row) => row?.[0] === "supplier_invoice_no")?.[2];
        const source = status === 0 ? drafts : submitted;
        const docs = [...source.values()].filter((doc) => !invoice || doc.supplier_invoice_no === invoice);
        return response(docs.map((doc) => ({ name: doc.name })));
      }
      if (path.startsWith("/resource/Purchase Receipt/")) {
        const name = path.slice("/resource/Purchase Receipt/".length); const doc = drafts.get(name) ?? submitted.get(name); return doc ? response(doc) : response({}, 404);
      }
      throw new Error(`unexpected ${outbound.method} ${path} ${url.search}`);
    },
  };
  return { platform, drafts, submitted, get creates() { return creates; } };
}

function request(lines, overrides = {}, callback = "https://gateway.local/api") {
  return new Request("https://app.local/api/method/alumdoor.purchase.bulk_fifo_receipt", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cloudforge-tenant": "alu", "x-cloudforge-callback": callback, authorization: "Bearer qa", "x-cloudforge-app": "alumdoor", "x-cloudforge-identity": "qa-user", "x-cloudforge-identity-signature": "signed" },
    body: JSON.stringify({ args: { supplier: "Tiến Đạt", warehouse: "KHO-1", supplier_invoice_no: "TD-GIAO-001", driver: "QA", posting_at: POSTING_AT, lines, ...overrides } }),
  });
}

const line = (bars, actualKg) => ({ item_code: "AL71", length_m: 7.2, qty_bar: bars, actual_weight_kg: actualKg, rate: 100000, color: "GS", is_stamped: "Không" });

test("bulk preview cộng dồn các dòng cùng quy cách nên không ăn lại đơn cũ", async () => {
  const state = createPlatform();
  const result = await handleBulkPurchaseFifoRequest(request([line(200, 560.16), line(30, 84.024)]), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 200, body.message); assert.equal(body.line_count, 2); assert.equal(body.total_qty_bar, 230); assert.equal(body.posting_at, POSTING_AT);
  assert.deepEqual(body.allocations.map((row) => [row.input_row, row.purchase_order, row.allocated_bars]), [[1, "PO-DAY-1", 200], [2, "PO-DAY-2", 30]]);
  assert.equal(body.line_summaries[1].nominal_remaining_bars, 70); assert.equal(body.item_count, 2); assert.equal(state.creates, 0);
});

test("bulk preview giữ FIFO tuần tự khi callback có internal path prefix", async () => {
  const state = createPlatform();
  const result = await handleBulkPurchaseFifoRequest(request([line(200, 560.16), line(30, 84.024)], {}, "https://gateway.local/internal/runtime/callback"), { PLATFORM: state.platform }, false);
  const body = await result.json(); assert.equal(result.status, 200, body.message);
  assert.deepEqual(body.allocations.map((row) => [row.input_row, row.purchase_order, row.allocated_bars]), [[1, "PO-DAY-1", 200], [2, "PO-DAY-2", 30]]); assert.equal(body.line_summaries[1].nominal_remaining_bars, 70); assert.equal(state.creates, 0);
});

test("bulk commit tạo đúng một Purchase Receipt nháp, giữ ngày nhận và retry idempotent", async () => {
  const state = createPlatform(); const payload = [line(200, 560.16), line(30, 84.024)];
  const first = await handleBulkPurchaseFifoRequest(request(payload), { PLATFORM: state.platform }, true); const firstBody = await first.json();
  assert.equal(first.status, 200, firstBody.message); assert.equal(firstBody.purchase_receipt, "PR-BULK-1"); assert.equal(firstBody.draft, true); assert.equal(firstBody.replayed, false); assert.equal(state.creates, 1);
  const stored = state.drafts.get("PR-BULK-1"); assert.equal(stored.posting_at, POSTING_AT); assert.equal(stored.items.length, 2); assert.deepEqual(stored.items.map((row) => [row.purchase_order, row.qty_bar]), [["PO-DAY-1", 200], ["PO-DAY-2", 30]]); assert.match(stored.note, /^\[bulk-fifo:[0-9a-f]{64}\]/);
  const retry = await handleBulkPurchaseFifoRequest(request(payload), { PLATFORM: state.platform }, true); const retryBody = await retry.json(); assert.equal(retry.status, 200); assert.equal(retryBody.purchase_receipt, "PR-BULK-1"); assert.equal(retryBody.replayed, true); assert.equal(state.creates, 1);
});

test("cùng số phiếu giao nhưng payload hoặc ngày nhận khác bị chặn", async () => {
  const state = createPlatform(); const first = await handleBulkPurchaseFifoRequest(request([line(10, 28.008)]), { PLATFORM: state.platform }, true); assert.equal(first.status, 200);
  const conflict = await handleBulkPurchaseFifoRequest(request([line(11, 30.8088)]), { PLATFORM: state.platform }, true); const body = await conflict.json(); assert.equal(conflict.status, 422); assert.match(body.message, /đã gắn với PR-BULK-1|không tạo trùng/i); assert.equal(state.creates, 1);
  const dateConflict = await handleBulkPurchaseFifoRequest(request([line(10, 28.008)], { posting_at: "2026-08-03T14:30:00.000Z" }), { PLATFORM: state.platform }, true); assert.equal(dateConflict.status, 422); assert.equal(state.creates, 1);
});

test("bulk fail closed khi các dòng phân bổ qua đơn mua khác công ty", async () => {
  const state = createPlatform({ secondCompany: "OTHER-CO" }); const result = await handleBulkPurchaseFifoRequest(request([line(200, 560.16), line(30, 84.024)]), { PLATFORM: state.platform }, false); const body = await result.json(); assert.equal(result.status, 422); assert.match(body.message, /nhiều Công ty/i); assert.equal(state.creates, 0);
});

test("bulk bắt tenant, phiếu giao, ngày nhận hợp lệ và giới hạn 100 dòng", async () => {
  const state = createPlatform();
  const missingInvoice = await handleBulkPurchaseFifoRequest(request([line(1, 2.8008)], { supplier_invoice_no: "" }), { PLATFORM: state.platform }, false); assert.equal(missingInvoice.status, 422); assert.match((await missingInvoice.json()).message, /Số phiếu giao NCC/);
  const badDate = await handleBulkPurchaseFifoRequest(request([line(1, 2.8008)], { posting_at: "không-phải-ngày" }), { PLATFORM: state.platform }, false); assert.equal(badDate.status, 422); assert.match((await badDate.json()).message, /Ngày\/giờ nhận hàng/);
  const tooMany = await handleBulkPurchaseFifoRequest(request(Array.from({ length: 101 }, () => line(1, 2.8008))), { PLATFORM: state.platform }, false); assert.equal(tooMany.status, 422); assert.match((await tooMany.json()).message, /tối đa 100 dòng/);
  const noTenant = new Request("https://app.local/api/method/alumdoor.purchase.preview_bulk_fifo_receipt", { method: "POST", headers: { "content-type": "application/json", "x-cloudforge-callback": "https://gateway.local/api" }, body: JSON.stringify({ args: { supplier: "Tiến Đạt", warehouse: "KHO-1", supplier_invoice_no: "X", lines: [line(1, 2.8008)] } }) }); const denied = await handleBulkPurchaseFifoRequest(noTenant, { PLATFORM: state.platform }, false); assert.equal(denied.status, 403);
});
