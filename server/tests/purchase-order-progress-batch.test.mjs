import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { D1MutationStore } from "../dist/packages/document-kernel/src/d1-store.js";

/**
 * Phần trăm đã nhận / đã xuất hoá đơn của đơn mua, tính cho CẢ TRANG bằng một truy vấn.
 *
 * Trước 23/08/2026, hai con số này chỉ được tính khi mở MỘT chứng từ và không bao giờ ghi lại,
 * nên giá trị trong `documents` vẫn là "0.00" từ lúc tạo đơn. Mở DMH-2026-0009 ra thấy 100,00%
 * còn danh sách và báo cáo "Đơn mua chưa nhận đủ" đều thấy 0,00% — thủ kho đi giục nhà cung cấp
 * những đơn đã về đủ.
 */

/** Bọc `node:sqlite` thành đúng hình dạng D1 mà store cần. */
function d1(db) {
  return {
    prepare(sql) {
      const args = [];
      return {
        bind(...values) { args.push(...values); return this; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async run() { return db.prepare(sql).run(...args); },
      };
    },
  };
}

function dungKho() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE documents (tenant_id TEXT, doctype TEXT, name TEXT, payload_json TEXT);
           CREATE TABLE purchase_order_progress_entries (tenant_id TEXT, purchase_order TEXT, kind TEXT, item_code TEXT, qty_micros INTEGER);`);
  const dat = (name, items) => db.prepare("INSERT INTO documents VALUES(?,?,?,?)")
    .run("demo", "Purchase Order", name, JSON.stringify({ items }));
  const tienDo = (don, kind, ma, micros) => db.prepare("INSERT INTO purchase_order_progress_entries VALUES(?,?,?,?,?)")
    .run("demo", don, kind, ma, micros);

  // Đơn đủ: đặt 200 cây, nhận 200 → 100%.
  dat("PO-DU", [{ item_code: "A", qty_micros: 200_000_000 }]);
  tienDo("PO-DU", "Receipt", "A", 200_000_000);
  // Đơn nửa: đặt 200, nhận 50 → 25%, chưa xuất hoá đơn.
  dat("PO-NUA", [{ item_code: "A", qty_micros: 200_000_000 }]);
  tienDo("PO-NUA", "Receipt", "A", 50_000_000);
  // Đơn chưa nhận gì.
  dat("PO-CHUA", [{ item_code: "A", qty_micros: 200_000_000 }]);
  // Đơn KHÔNG có `qty_micros`, chỉ có `qty` — phải quy ra micro y hệt đường mở chứng từ.
  dat("PO-QTY", [{ item_code: "A", qty: 10 }]);
  tienDo("PO-QTY", "Receipt", "A", 5_000_000);
  tienDo("PO-QTY", "Billing", "A", 10_000_000);
  return new D1MutationStore(d1(db));
}

test("tính đúng phần trăm cho nhiều đơn trong một lượt", async () => {
  const kho = dungKho();
  const ket = await kho.getPurchaseOrderProgress("demo", ["PO-DU", "PO-NUA", "PO-CHUA", "PO-QTY"]);
  assert.equal(ket.get("PO-DU").received, 100);
  assert.equal(ket.get("PO-NUA").received, 25);
  assert.equal(ket.get("PO-CHUA").received, 0);
  assert.equal(ket.get("PO-DU").billed, 0);
});

test("đơn khai qty thay vì qty_micros vẫn ra đúng số", async () => {
  const kho = dungKho();
  const ket = await kho.getPurchaseOrderProgress("demo", ["PO-QTY"]);
  assert.equal(ket.get("PO-QTY").received, 50, "5 trên 10 là 50%");
  assert.equal(ket.get("PO-QTY").billed, 100);
});

test("danh sách rỗng thì không chạm cơ sở dữ liệu", async () => {
  const kho = dungKho();
  assert.equal((await kho.getPurchaseOrderProgress("demo", [])).size, 0);
  assert.equal((await kho.getPurchaseOrderProgress("demo", ["", ""])).size, 0);
});

test("đơn không có dòng nào thì BỎ QUA, không chia cho 0", async () => {
  const kho = dungKho();
  const ket = await kho.getPurchaseOrderProgress("demo", ["PO-KHONG-CO"]);
  assert.equal(ket.has("PO-KHONG-CO"), false);
});
