/**
 * Nhôm ĐẾM bằng cây, BÁO GIÁ bằng đ/kg.
 *
 * Bảng giá thật của NCC ghi 98.000–107.000 đ/kg. Thủ kho gõ đúng thứ đọc trên giấy: `rate`
 * = 100.000. Còn `qty` là số cây, vì đó là thứ đếm được lúc xe về.
 *
 *     Nhận 200 cây · cân 1.200 kg · 100.000 đ/kg
 *     Đúng:  1.200 × 100.000 = 120.000.000
 *     Nhân cũ: 200 × 100.000 =  20.000.000     ← sai SÁU LẦN, và sổ vẫn cân
 *
 * Sổ vẫn cân vì cả sổ kho lẫn sổ cái đều dùng chung con số sai đó. Không có dòng nào lệch,
 * không có cảnh báo nào nổ. Chỉ có giá trị tồn kho bằng một phần sáu số tiền đã trả.
 *
 * Trớ trêu: doc-comment ngay trên dòng sai đã cảnh báo một biến thể khác của chính lỗi này
 * ("117 mét × giá-một-cây, tồn kho phình lên gần sáu lần"). Đọc được cảnh báo mà vẫn không
 * nối `rate` với đơn vị của nó.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-30T08:00:00.000Z";

function setup({ tracked = false } = {}) {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "VND",
    items: ["NHOM-4.6D"], warehouses: ["K36"],
    accounts: ["Creditors", "Expense", "Ton kho", "Hang nhan chua hoa don"],
  });
  store.seedMaster("Supplier", "SUP-1");
  store.seedMaster("UOM", "Cây");
  store.seedMaster("UOM", "Kg");
  // Đơn vị tồn là CÂY (QĐ-2), khối lượng là đơn vị thứ hai ngang hàng — không phải quy đổi.
  store.seedMaster("Item", "NHOM-4.6D", "demo", {
    stock_uom: "Cây", has_catch_weight: 1, weight_uom: "Kg",
    ...(tracked ? { has_batch_no: 1 } : {}),
  });
  if (tracked) store.seedMaster("Batch", "LO-NHOM-001", "demo", { item: "NHOM-4.6D" });
  const registry = registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry()));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

/** Nhận hàng phải có đơn mua — nền tảng ép, và V2 không đổi luật đó cho nhánh NHẬP. */
async function receive(kernel, name, item) {
  await createAndSubmit(kernel, { doctype: "Purchase Order", name: `PO-${name}`, document: {
    supplier: "SUP-1", company: "Demo", currency: "VND", transaction_date: "2026-07-30",
    items: [{ row_id: "1", item_code: item.item_code, qty: item.qty, rate: item.rate, ...(item.uom ? { uom: item.uom } : {}) }],
  }});
  return createAndSubmit(kernel, { doctype: "Purchase Receipt", name, document: {
    supplier: "SUP-1", company: "Demo", currency: "VND", posting_at: now(),
    against_purchase_order: `PO-${name}`, stock_account: "Ton kho",
    stock_received_but_not_billed: "Hang nhan chua hoa don",
    items: [{ row_id: "1", warehouse: "K36", ...item }],
  }});
}

test("giá đ/kg nhân với SỐ KG đã cân, không nhân với số cây", async () => {
  const { store, kernel } = setup();
  await receive(kernel, "PNM-KG", {
    item_code: "NHOM-4.6D",
    qty: "200", uom: "Cây",          // đếm được: 200 cây
    actual_weight_kg: "1200",         // cân được: 1.200 kg
    rate: "100000", rate_uom: "Kg",   // giấy của NCC: 100.000 đ/kg
  });

  const snapshot = store.snapshot();
  const lines = snapshot.stock_entries.filter((line) => line.item_code === "NHOM-4.6D");
  assert.equal(lines.length, 1);

  const value = lines.reduce((sum, line) => sum + line.stock_value_difference_minor, 0);
  assert.equal(value, 120_000_000_00, "giá trị nhập phải là 1.200 kg × 100.000, không phải 200 × 100.000");

  // Số lượng vào sổ vẫn là số CÂY — đó là thứ đếm được, và là thứ tồn kho trả lời.
  assert.equal(lines[0].actual_qty_micros, 200_000_000);
  // Cân thật đi theo dòng sổ, cùng dấu với số lượng.
  assert.equal(lines[0].actual_weight_micros, 1_200_000_000);
  // Giá vốn MỘT CÂY = tổng giá trị ÷ số cây = 600.000 đ/cây.
  assert.equal(lines[0].valuation_rate_minor, 600_000_00);
});

test("phiếu nhập lô ghi cây + kg + giá trị trên cùng dòng, retry không nhân đôi và huỷ đảo đủ", async () => {
  const { store, kernel } = setup({ tracked: true });
  await createAndSubmit(kernel, {
    doctype: "Serial and Batch Bundle", name: "SBB-NHOM-IN",
    document: {
      item_code: "NHOM-4.6D", warehouse: "K36", type: "Inward", posting_at: now(),
      entries: [{ row_id: "1", batch_no: "LO-NHOM-001", qty: "200" }],
    },
  });
  const item = {
    item_code: "NHOM-4.6D", qty: "200", uom: "Cây",
    actual_weight_kg: "1200", rate: "100000", rate_uom: "Kg",
    serial_and_batch_bundle: "SBB-NHOM-IN",
  };
  await receive(kernel, "PNM-LO", item);

  const receiptDocument = {
    supplier: "SUP-1", company: "Demo", currency: "VND", posting_at: now(),
    against_purchase_order: "PO-PNM-LO", stock_account: "Ton kho",
    stock_received_but_not_billed: "Hang nhan chua hoa don",
    items: [{ row_id: "1", warehouse: "K36", ...item }],
  };
  await mutate(kernel, {
    commandId: "PNM-LO-submit", doctype: "Purchase Receipt", name: "PNM-LO",
    action: "submit", expectedVersion: 1, document: receiptDocument,
  });

  let lines = store.snapshot().stock_entries.filter((line) => line.item_code === "NHOM-4.6D");
  assert.equal(lines.length, 1, "replay cùng command_id không được tạo bút toán thứ hai");
  assert.deepEqual(
    {
      batch: lines[0].batch_no,
      qty: lines[0].actual_qty_micros,
      weight: lines[0].actual_weight_micros,
      value: lines[0].stock_value_difference_minor,
    },
    {
      batch: "LO-NHOM-001",
      qty: 200_000_000,
      weight: 1_200_000_000,
      value: 120_000_000_00,
    },
  );
  assert.equal(await store.isStockBundleUsed("demo", "SBB-NHOM-IN"), true);

  await mutate(kernel, {
    commandId: "PNM-LO-cancel", doctype: "Purchase Receipt", name: "PNM-LO",
    action: "cancel", expectedVersion: 2, document: {},
  });
  lines = store.snapshot().stock_entries.filter((line) => line.item_code === "NHOM-4.6D");
  assert.equal(lines.reduce((sum, line) => sum + line.actual_qty_micros, 0), 0);
  assert.equal(lines.reduce((sum, line) => sum + (line.actual_weight_micros ?? 0), 0), 0);
  assert.equal(lines.reduce((sum, line) => sum + line.stock_value_difference_minor, 0), 0);
  assert.equal(await store.isStockBundleUsed("demo", "SBB-NHOM-IN"), false);
});

test("sổ cái và sổ kho phải ghi CÙNG một con số", async () => {
  const { store, kernel } = setup();
  await receive(kernel, "PNM-GL", {
    item_code: "NHOM-4.6D",
    qty: "200", uom: "Cây", actual_weight_kg: "1200",
    rate: "100000", rate_uom: "Kg",
  });

  const snapshot = store.snapshot();
  const stockValue = snapshot.stock_entries
    .filter((line) => line.item_code === "NHOM-4.6D")
    .reduce((sum, line) => sum + line.stock_value_difference_minor, 0);
  const glDebit = snapshot.gl_entries
    .filter((line) => line.account === "Ton kho")
    .reduce((sum, line) => sum + line.debit_minor, 0);

  // Hai khối tính `value` RỜI NHAU trong cùng một hàm. Sửa một khối mà quên khối kia thì
  // kho và sổ cái lệch nhau — và không có phép kiểm nào trong hệ thống đối chiếu hai cái đó.
  assert.equal(glDebit, stockValue, "sổ cái ghi khác sổ kho là hai quyển sổ, không phải một");
  assert.equal(glDebit, 120_000_000_00);
});

test("không khai rate_uom thì giữ nguyên hành vi cũ — rate theo đơn vị của dòng", async () => {
  const { store, kernel } = setup();
  await receive(kernel, "PNM-CU", {
    item_code: "NHOM-4.6D", qty: "10", rate: "50000",
  });
  const line = store.snapshot().stock_entries.find((entry) => entry.item_code === "NHOM-4.6D");
  assert.equal(line.stock_value_difference_minor, 500_000_00);
  assert.equal(line.actual_weight_micros, undefined, "không cân theo kiện thì KHÔNG ghi khối lượng, kể cả 0");
});

test("rate theo kg mà không cân thì TỪ CHỐI, không đoán", async () => {
  const { kernel } = setup();
  await assert.rejects(
    receive(kernel, "PNM-THIEU", {
      item_code: "NHOM-4.6D", qty: "200", uom: "Cây", rate: "100000", rate_uom: "Kg",
    }),
    /weight/i,
    "thiếu số cân thì phải dừng — suy ra từ số cây là bịa một phép cân chưa từng xảy ra",
  );
});

test("rate theo một đơn vị thứ ba, không phải đơn vị dòng cũng không phải đơn vị cân — TỪ CHỐI", async () => {
  const { kernel } = setup();
  await assert.rejects(
    receive(kernel, "PNM-LA", {
      item_code: "NHOM-4.6D", qty: "200", uom: "Cây", actual_weight_kg: "1200",
      rate: "100000", rate_uom: "Mét",
    }),
    /rate_uom/i,
    "im lặng quy đổi một đơn vị không ai khai là cách lỗi tiền quay lại lần nữa",
  );
});
