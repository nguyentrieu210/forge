import assert from "node:assert/strict";
import test from "node:test";

import { handleBulkPurchaseDirectReceipt } from "../dist/apps-src/alumdoor-worker/src/bulk-purchase-direct-receipt.js";

function response(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function callbackResourcePath(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/\/+$/, "");
  const resourceIndex = decoded.lastIndexOf("/resource/");
  return resourceIndex >= 0 ? decoded.slice(resourceIndex) : decoded;
}

const POSTING_AT = "2026-08-05T13:30:00.000Z";

function createPlatform() {
  const drafts = new Map();
  let creates = 0;
  const items = new Map([
    ["AL71", {
      item_code: "AL71", item_name: "Nhôm AL71", inventory_mode: "Nhôm cây/lá", measurement_profile: "Nhôm cây/lá",
      material_specification: "MS-AL71", stock_uom: "Kg", default_purchase_uom: "Kg", is_purchase_item: 1, disabled: 0,
      allowed_colors: [{ color: "GS" }], uom_conversions: [],
    }],
    ["PK-01", {
      item_code: "PK-01", item_name: "Phụ kiện", inventory_mode: "Hàng thường", stock_uom: "Cái", default_purchase_uom: "Cái",
      is_purchase_item: 1, disabled: 0, uom_conversions: [],
    }],
  ]);
  const platform = {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = callbackResourcePath(url.pathname);
      if (path === "/resource/Company/ALUMDOOR") return response({ name: "ALUMDOOR", default_currency: "VND" });
      if (path === "/resource/Company/CÔNG TY B") return response({ name: "CÔNG TY B", default_currency: "USD" });
      if (path === "/resource/Item/AL71") return response(items.get("AL71"));
      if (path === "/resource/Item/PK-01") return response(items.get("PK-01"));
      if (path === "/resource/Material Specification/MS-AL71") return response({ name: "MS-AL71", theoretical_kg_per_m: 0.389 });
      if (path === "/resource/Purchase Receipt" && outbound.method === "POST") {
        creates += 1;
        const body = await outbound.json();
        const doc = { name: `PR-DIRECT-${creates}`, docstatus: 0, ...body };
        drafts.set(doc.name, doc);
        return response(doc);
      }
      if (path === "/resource/Purchase Receipt") {
        const filters = JSON.parse(url.searchParams.get("filters") ?? "[]");
        const invoice = filters.find((row) => row?.[0] === "supplier_invoice_no")?.[2];
        const status = Number(filters.find((row) => row?.[0] === "docstatus")?.[2]);
        const rows = status === 0 ? [...drafts.values()] : [];
        return response(rows.filter((doc) => !invoice || doc.supplier_invoice_no === invoice).map((doc) => ({ name: doc.name })));
      }
      if (path.startsWith("/resource/Purchase Receipt/")) {
        const name = path.slice("/resource/Purchase Receipt/".length);
        const doc = drafts.get(name);
        return doc ? response(doc) : response({}, 404);
      }
      throw new Error(`unexpected ${outbound.method} ${path} ${url.search}`);
    },
  };
  return { platform, drafts, get creates() { return creates; } };
}

function request(lines, overrides = {}) {
  return new Request("https://app.local/api/method/alumdoor.purchase.bulk_direct_receipt", {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-cloudforge-tenant": "alu", "x-cloudforge-callback": "https://gateway.local/api",
      authorization: "Bearer qa", "x-cloudforge-app": "alumdoor", "x-cloudforge-identity": "qa-user", "x-cloudforge-identity-signature": "signed",
    },
    body: JSON.stringify({ args: {
      company: "ALUMDOOR", supplier: "Tiến Đạt", warehouse: "KHO-1", supplier_invoice_no: "GIAO-001", driver: "Anh A", posting_at: POSTING_AT,
      lines, ...overrides,
    } }),
  });
}

const aluminium = (bars = 10, actualWeight = 27.5) => ({
  item_code: "AL71", length_m: 7.2, qty_bar: bars, actual_weight_kg: actualWeight, rate: 100000, color: "GS", is_stamped: "Không",
});

test("preview nhôm nhập trực tiếp dùng kg thực và không sinh purchase_order", async () => {
  const state = createPlatform();
  const result = await handleBulkPurchaseDirectReceipt(request([aluminium()]), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.equal(body.company, "ALUMDOOR");
  assert.equal(body.currency, "VND");
  assert.equal(body.line_count, 1);
  assert.equal(body.items[0].qty, 27.5);
  assert.equal(body.items[0].actual_weight_kg, 27.5);
  assert.ok(Math.abs(body.items[0].theoretical_kg - 28.008) < 1e-9);
  assert.equal(body.items[0].purchase_order, undefined);
  assert.equal(body.items[0].warehouse, "KHO-1");
  assert.equal(state.creates, 0);
});

test("mặt hàng thường nhập trực tiếp bằng số lượng người dùng điền", async () => {
  const state = createPlatform();
  const result = await handleBulkPurchaseDirectReceipt(request([{ item_code: "PK-01", qty: 5, uom: "Cái", rate: 120000 }]), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.equal(body.items[0].qty, 5);
  assert.equal(body.items[0].stock_qty, 5);
  assert.equal(body.items[0].amount, 600000);
  assert.equal(body.items[0].purchase_order, undefined);
});

test("direct receipt dùng Công ty explicit và suy ra tiền tệ từ Công ty", async () => {
  const state = createPlatform();
  const result = await handleBulkPurchaseDirectReceipt(request([{ item_code: "PK-01", qty: 1, uom: "Cái", rate: 10 }], { company: "CÔNG TY B" }), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.equal(body.company, "CÔNG TY B");
  assert.equal(body.currency, "USD");
});

test("direct receipt fail closed khi chưa có Công ty", async () => {
  const state = createPlatform();
  const result = await handleBulkPurchaseDirectReceipt(request([aluminium()], { company: "" }), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 422);
  assert.match(body.message, /chọn Công ty/i);
  assert.equal(state.creates, 0);
});

test("commit tạo đúng một Purchase Receipt nháp không theo đơn NCC và retry idempotent", async () => {
  const state = createPlatform();
  const first = await handleBulkPurchaseDirectReceipt(request([aluminium()]), { PLATFORM: state.platform }, true);
  const firstBody = await first.json();
  assert.equal(first.status, 200, firstBody.message);
  assert.equal(firstBody.purchase_receipt, "PR-DIRECT-1");
  assert.equal(firstBody.draft, true);
  assert.equal(firstBody.replayed, false);
  assert.equal(state.creates, 1);
  const stored = state.drafts.get("PR-DIRECT-1");
  assert.equal(stored.company, "ALUMDOOR");
  assert.equal(stored.currency, "VND");
  assert.equal(stored.against_purchase_order, undefined);
  assert.equal(stored.items[0].purchase_order, undefined);
  assert.match(stored.note, /^\[direct-receipt:[0-9a-f]{64}\]/);

  const retry = await handleBulkPurchaseDirectReceipt(request([aluminium()]), { PLATFORM: state.platform }, true);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200, retryBody.message);
  assert.equal(retryBody.purchase_receipt, "PR-DIRECT-1");
  assert.equal(retryBody.replayed, true);
  assert.equal(state.creates, 1);
});

test("cùng số phiếu giao nhưng payload khác bị chặn", async () => {
  const state = createPlatform();
  assert.equal((await handleBulkPurchaseDirectReceipt(request([aluminium()]), { PLATFORM: state.platform }, true)).status, 200);
  const conflict = await handleBulkPurchaseDirectReceipt(request([aluminium(11, 30)]), { PLATFORM: state.platform }, true);
  const body = await conflict.json();
  assert.equal(conflict.status, 422);
  assert.match(body.message, /đã gắn với PR-DIRECT-1|không tạo trùng/i);
  assert.equal(state.creates, 1);
});

test("direct receipt bắt tenant, NCC, kho, phiếu giao và tối đa 100 dòng", async () => {
  const state = createPlatform();
  const missingInvoice = await handleBulkPurchaseDirectReceipt(request([aluminium()], { supplier_invoice_no: "" }), { PLATFORM: state.platform }, false);
  assert.equal(missingInvoice.status, 422);
  assert.match((await missingInvoice.json()).message, /Số phiếu giao NCC/);
  const tooMany = await handleBulkPurchaseDirectReceipt(request(Array.from({ length: 101 }, () => aluminium(1, 2.8))), { PLATFORM: state.platform }, false);
  assert.equal(tooMany.status, 422);
  assert.match((await tooMany.json()).message, /tối đa 100 dòng/);
  const denied = await handleBulkPurchaseDirectReceipt(new Request("https://app.local/api/method/alumdoor.purchase.preview_bulk_direct_receipt", {
    method: "POST", headers: { "content-type": "application/json", "x-cloudforge-callback": "https://gateway.local/api" },
    body: JSON.stringify({ args: { company: "ALUMDOOR", supplier: "Tiến Đạt", warehouse: "KHO-1", supplier_invoice_no: "X", lines: [aluminium()] } }),
  }), { PLATFORM: state.platform }, false);
  assert.equal(denied.status, 403);
});
