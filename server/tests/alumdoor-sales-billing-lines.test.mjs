/**
 * Dòng chứng từ sinh ra từ chứng từ nguồn — hai chỗ đã từng sai và đều sai IM LẶNG.
 *
 * 1. `orderLines` dựng đơn từ báo giá mà quên `quotation_item`, nên nhân từ chối cả chứng từ
 *    ("must preserve quotation_item"). Lỗi nằm im vì thao tác "Báo giá → Đơn hàng" bị ẩn khỏi
 *    thanh bên, không ai chạy tới.
 * 2. `outstandingBillingLines` phải trừ dồn theo KHÓA DÒNG. Cộng theo mã hàng thì hai dòng
 *    cùng mã khác quy cách sẽ ăn phần đã xuất hoá đơn của nhau, và hoá đơn sau thiếu tiền mà
 *    không có gì báo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { orderLines, outstandingBillingLines } from "../dist/apps-src/alumdoor-worker/src/index.js";

test("dòng đơn mang theo khóa dòng báo giá", () => {
  const lines = orderLines({
    name: "BG-2026-0001",
    items: [
      { row_id: "ROW-1", item_code: "TRỤC 114", qty: 3, uom: "Mét", width_m: 3, conversion_factor: 4.4 },
      { row_id: "ROW-2", item_code: "AL548N", qty: 2, uom: "m2", width_m: 4, height_m: 2.8 },
    ],
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].quotation_item, "ROW-1");
  assert.equal(lines[1].quotation_item, "ROW-2");
  assert.equal(lines[0].row_id, "R1", "đơn đánh lại khóa dòng của chính nó");
  assert.equal(lines[0].conversion_factor, 4.4, "hệ số quy đổi phải qua nguyên vẹn — nhân đối chiếu lại");
});

test("báo giá cũ chưa có khóa dòng thì bỏ trống chứ không bịa", () => {
  const [line] = orderLines({ name: "BG-2026-0000", items: [{ item_code: "TRỤC 114", qty: 1, uom: "Mét" }] });
  assert.equal("quotation_item" in line, false, "bịa khóa sẽ bị từ chối là 'row không thuộc báo giá này'");
});

test("chỉ lấy phần chưa xuất hoá đơn, trừ theo đúng khóa dòng", () => {
  const lines = [
    { row_id: "ROW-1", item_code: "AL548N", qty: 10, uom: "m2", stock_qty: 100, width_m: 4, rate: 500, amount: 5000 },
    { row_id: "ROW-2", item_code: "AL548N", qty: 4, uom: "m2", stock_qty: 40, width_m: 3, rate: 500, amount: 2000 },
  ];
  const items = outstandingBillingLines(lines, new Map([["row:ROW-1", 6]]));

  assert.equal(items.length, 2);
  assert.equal(items[0].sales_order_row_id, "ROW-1");
  assert.equal(items[0].qty, 4, "10 đặt − 6 đã xuất = 4");
  assert.equal(items[0].stock_qty, 40, "tồn quy đổi đi theo tỉ lệ, không giữ nguyên 100");
  assert.equal(items[1].sales_order_row_id, "ROW-2");
  assert.equal(items[1].qty, 4, "dòng cùng mã KHÔNG bị trừ lây");
});

test("dòng đã xuất hoá đơn đủ thì biến khỏi danh sách", () => {
  const lines = [{ row_id: "ROW-1", item_code: "AL548N", qty: 5, uom: "m2", width_m: 4 }];
  assert.deepEqual(outstandingBillingLines(lines, new Map([["row:ROW-1", 5]])), []);
});

test("chứng từ cũ không có khóa dòng vẫn trừ được theo mã hàng", () => {
  const lines = [{ item_code: "TRỤC 114", qty: 3, uom: "Mét", width_m: 3 }];
  const items = outstandingBillingLines(lines, new Map([["item:TRỤC 114", 1]]));
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 2);
  assert.equal("sales_order_row_id" in items[0], false, "không có khóa thì để nhân tự suy theo mã hàng");
});

test("tiền không được chép sang hoá đơn", () => {
  const lines = [{ row_id: "ROW-1", item_code: "AL548N", qty: 2, uom: "m2", width_m: 4, rate: 500, amount: 1000 }];
  const [item] = outstandingBillingLines(lines, new Map());
  assert.equal("rate" in item, false, "đơn giá do nhân đóng băng lại từ dòng đơn");
  assert.equal("amount" in item, false);
  assert.equal(item.width_m, 4, "quy cách vật lý thì phải đi theo");
});
