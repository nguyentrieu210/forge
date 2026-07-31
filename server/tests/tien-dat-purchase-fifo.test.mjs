import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildFifoDebtSummary,
  handlePurchaseFifoRequest,
  resolveSupplierReceiptTolerance,
} from "../dist/apps-src/alumdoor-worker/src/purchase-fifo-receipt.js";
import { allocateBarsFifo } from "../dist/apps-src/alumdoor-worker/src/index.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));

function doctype(name) {
  const value = brief.doctypes.find((entry) => entry.name === name);
  assert.ok(value, `missing doctype ${name}`);
  return value;
}

function fieldNames(meta) {
  return new Set(meta.fields.map((field) => typeof field === "string" ? field.split(":", 1)[0] : field.fieldname));
}

function response(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("form đặt nhôm có đủ cột nghiệp vụ và ngày đặt ở chứng từ cha", () => {
  const order = doctype("Purchase Order");
  const line = doctype("Purchase Order Item");
  assert.ok(fieldNames(order).has("transaction_date"));
  for (const required of [
    "item_code",
    "length_m",
    "theoretical_kg_per_m",
    "qty_bar",
    "theoretical_kg",
    "rate",
    "amount",
    "color",
    "is_stamped",
  ]) assert.ok(fieldNames(line).has(required), `Purchase Order Item missing ${required}`);
});

test("Tiến Đạt mặc định dung sai 5%, cấu hình trên Supplier vẫn được ưu tiên", () => {
  assert.deepEqual(resolveSupplierReceiptTolerance("Tiến Đạt", { supplier_name: "Tiến Đạt" }), {
    tolerance_pct: 5,
    source: "tien_dat_default",
  });
  assert.deepEqual(resolveSupplierReceiptTolerance("TIEN-DAT", { receipt_tolerance_pct: 3 }), {
    tolerance_pct: 3,
    source: "supplier",
  });
  assert.throws(
    () => resolveSupplierReceiptTolerance("Tiến Đạt", { receipt_tolerance_pct: 55 }),
    /0 đến 50%/,
  );
});

test("230 cây trừ FIFO 200 cây ngày 1 và 30 cây ngày 2", () => {
  const day1 = {
    purchase_order: "PO-DAY-1",
    transaction_date: "2026-08-01",
    ordered_bars: 200,
    received_bars: 0,
    source_line: { theoretical_kg_per_m: 0.389 },
  };
  const day2 = {
    purchase_order: "PO-DAY-2",
    transaction_date: "2026-08-02",
    ordered_bars: 100,
    received_bars: 0,
    source_line: { theoretical_kg_per_m: 0.389 },
  };
  const allocations = allocateBarsFifo([day2, day1], 230, 5);
  assert.deepEqual(allocations.map((row) => ({
    purchase_order: row.purchase_order,
    allocated_bars: row.allocated_bars,
    kind: row.kind,
  })), [
    { purchase_order: "PO-DAY-1", allocated_bars: 200, kind: "Theo đơn" },
    { purchase_order: "PO-DAY-2", allocated_bars: 30, kind: "Theo đơn" },
  ]);
});

test("sau khi nhận 230/300 cây, nợ danh nghĩa 70 và khoảng giao thêm hợp lệ 55–85", () => {
  const balances = [
    {
      purchase_order: "PO-DAY-1",
      transaction_date: "2026-08-01",
      ordered_bars: 200,
      received_bars: 0,
      source_line: {},
    },
    {
      purchase_order: "PO-DAY-2",
      transaction_date: "2026-08-02",
      ordered_bars: 100,
      received_bars: 0,
      source_line: {},
    },
  ];
  assert.deepEqual(buildFifoDebtSummary(balances, 230, 5, 7.2), {
    ordered_bars: 300,
    received_bars_before: 0,
    delivered_bars_now: 230,
    received_bars_after: 230,
    tolerance_pct: 5,
    tolerance_bars: 15,
    nominal_remaining_bars: 70,
    minimum_additional_bars_to_settle: 55,
    maximum_additional_bars_allowed: 85,
    nominal_remaining_meters: 504,
    minimum_additional_meters_to_settle: 396,
    maximum_additional_meters_allowed: 612,
  });
});

test("barem ví dụ AL71 được tính chính xác theo chiều dài × kg/m × số cây", () => {
  assert.equal(Number((7.2 * 0.389 * 200).toFixed(3)), 560.16);
  assert.equal(Number((7.2 * 0.389 * 100).toFixed(3)), 280.08);
  assert.equal(Number((7.2 * 0.389 * 230).toFixed(3)), 644.184);
});

test("không nhận vượt tổng đặt cộng dung sai", () => {
  const balances = [{
    purchase_order: "PO-1",
    transaction_date: "2026-08-01",
    ordered_bars: 200,
    received_bars: 0,
    source_line: {},
  }];
  assert.throws(() => allocateBarsFifo(balances, 211, 5), /vượt tổng số đặt và dung sai 5%/);
  assert.equal(allocateBarsFifo(balances, 210, 5).reduce((sum, row) => sum + row.allocated_bars, 0), 210);
});

test("preview FIFO trả đủ phân bổ, công nợ cây/mét và lịch sử", async () => {
  const orderLine = {
    item_code: "AL71",
    item_name: "Nhôm AL71",
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    theoretical_kg_per_m: 0.389,
    length_m: 7.2,
    qty_bar: 200,
    color: "GS",
    is_stamped: "Không",
  };
  const orderLine2 = { ...orderLine, qty_bar: 100 };
  const platform = {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = decodeURIComponent(url.pathname);
      if (path === "/resource/Supplier/Tiến Đạt") {
        return response({ supplier_name: "Tiến Đạt" });
      }
      if (path === "/resource/Purchase Order") {
        return response([{ name: "PO-DAY-1" }, { name: "PO-DAY-2" }]);
      }
      if (path === "/resource/Purchase Receipt") return response([]);
      if (path === "/resource/Purchase Order/PO-DAY-1") {
        return response({
          name: "PO-DAY-1",
          supplier: "Tiến Đạt",
          company: "ALUMDOOR",
          currency: "VND",
          transaction_date: "2026-08-01",
          docstatus: 1,
          items: [orderLine],
        });
      }
      if (path === "/resource/Purchase Order/PO-DAY-2") {
        return response({
          name: "PO-DAY-2",
          supplier: "Tiến Đạt",
          company: "ALUMDOOR",
          currency: "VND",
          transaction_date: "2026-08-02",
          docstatus: 1,
          items: [orderLine2],
        });
      }
      throw new Error(`unexpected path ${path}`);
    },
  };
  const request = new Request("https://app.local/api/method/alumdoor.purchase.preview_fifo_receipt", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "alu",
      "x-cloudforge-callback": "https://gateway.local/api",
    },
    body: JSON.stringify({
      args: {
        supplier: "Tiến Đạt",
        item_code: "AL71",
        length_m: 7.2,
        qty_bar: 230,
        actual_weight_kg: 644.184,
        rate: 100000,
        color: "GS",
        is_stamped: "Không",
        warehouse: "KHO-1",
      },
    }),
  });

  const preview = await handlePurchaseFifoRequest(request, { PLATFORM: platform }, false);
  assert.equal(preview.status, 200);
  const body = await preview.json();
  assert.equal(body.tolerance_pct, 5);
  assert.equal(body.delivered_barem_weight_kg, 644.184);
  assert.deepEqual(body.allocations.map((row) => [row.purchase_order, row.allocated_bars]), [
    ["PO-DAY-1", 200],
    ["PO-DAY-2", 30],
  ]);
  assert.equal(body.debt.nominal_remaining_bars, 70);
  assert.equal(body.debt.minimum_additional_bars_to_settle, 55);
  assert.equal(body.debt.maximum_additional_bars_allowed, 85);
  assert.deepEqual(body.receipt_history, []);
});
