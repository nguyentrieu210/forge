/**
 * Phân hệ mua hàng: quy đổi đơn vị, và chuỗi yêu cầu → hỏi giá → báo giá → đơn mua.
 *
 * Mọi phép kiểm ở đây đọc SỔ (sổ kho, sổ cái, sổ tiến độ), không đọc lại chính chứng từ
 * vừa ghi. Chứng từ chỉ chứng minh cái form nhận được dữ liệu; sổ mới chứng minh nghiệp vụ
 * đã xảy ra — và kiểu hỏng đặc trưng của nền tảng này là ghi THÀNH CÔNG mà không sổ nào
 * động đậy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit } from "./helpers.mjs";

const now = () => "2026-07-28T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "USD",
    items: [], warehouses: ["Stores"], accounts: ["Creditors", "Expense", "Stock", "SRBNB"],
  });
  store.seedMaster("Supplier", "SUP-1");
  store.seedMaster("Supplier", "SUP-2");
  store.seedMaster("Supplier", "SUP-3");
  // Ray: MUA theo cây, TỒN theo mét. Một cây 5,85 m — chiều dài cây tiêu chuẩn của nhà máy.
  store.seedMaster("Item", "RAY", "demo", { stock_uom: "Mét", uom_conversions: [{ uom: "Cây", conversion_factor: "5.85" }] });
  // Mặt hàng thường: không khai đơn vị tồn, nên mọi thứ giữ nguyên như trước khi có quy đổi.
  store.seedMaster("Item", "PHU-KIEN", "demo", {});
  const registry = registerErpCoreControllers(createO2CControllerRegistry());
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

const order = (name, items, extra = {}) => ({
  doctype: "Purchase Order", name,
  document: { supplier: "SUP-1", company: "Demo", currency: "USD", transaction_date: "2026-07-28", items, ...extra },
});

test("mua theo CÂY, sổ kho ghi theo MÉT — và số tiền không đổi", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, order("PO-UOM", [
    { row_id: "R1", item_code: "RAY", qty: "20", uom: "Cây", rate: "300000" },
  ]));
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-UOM", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-UOM",
    stock_account: "Stock", stock_received_but_not_billed: "SRBNB",
    items: [{ row_id: "R1", item_code: "RAY", qty: "20", uom: "Cây", rate: "300000", warehouse: "Stores" }],
  }});

  // 20 cây × 5,85 m = 117 mét vào kho, KHÔNG phải 20.
  assert.equal(await store.getStockBalanceMicros("demo", "RAY", "Stores"), 117_000_000);

  const snapshot = store.snapshot();
  const stockValue = snapshot.stock_entries
    .filter((line) => line.item_code === "RAY")
    .reduce((sum, line) => sum + line.stock_value_difference_minor, 0);
  // Tiền KHÔNG bị nhân theo: vẫn đúng 20 × 300.000, không phải 117 × 300.000.
  assert.equal(stockValue, 600_000_000);

  // Giá vốn một MÉT = giá một cây ÷ 5,85 — nếu không thì tồn kho phình gần sáu lần.
  const inward = snapshot.stock_entries.find((line) => line.item_code === "RAY");
  assert.equal(inward.valuation_rate_minor, 5_128_205);

  const debit = snapshot.gl_entries.reduce((sum, line) => sum + BigInt(line.debit_minor), 0n);
  const credit = snapshot.gl_entries.reduce((sum, line) => sum + BigInt(line.credit_minor), 0n);
  assert.equal(debit, credit);
  assert.equal(debit, 600_000_000n);
});

test("đặt 20 CÂY rồi nhận 117 MÉT là nhận ĐÚNG ĐỦ, không phải nhận vượt", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, order("PO-MIX", [
    { row_id: "R1", item_code: "RAY", qty: "20", uom: "Cây", rate: "300000" },
  ]));
  // Phiếu nhập khai bằng MÉT — đơn vị tồn, hệ số 1.
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-MIX", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-MIX",
    items: [{ row_id: "R1", item_code: "RAY", qty: "117", uom: "Mét", rate: "51282.05", warehouse: "Stores" }],
  }});
  assert.equal(await store.getStockBalanceMicros("demo", "RAY", "Stores"), 117_000_000);

  // Và thêm một mét nữa thì VƯỢT.
  await assert.rejects(
    createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-MIX-2", document: {
      supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-MIX",
      items: [{ row_id: "R1", item_code: "RAY", qty: "1", uom: "Mét", rate: "51282.05", warehouse: "Stores" }],
    }}),
    /exceeds Purchase Order quantity/,
  );
});

test("đơn vị lạ mà mặt hàng chưa khai quy đổi thì TỪ CHỐI, không lặng lẽ lấy hệ số 1", async () => {
  const { kernel } = setup();
  await assert.rejects(
    createAndSubmit(kernel, order("PO-BAD", [
      { row_id: "R1", item_code: "RAY", qty: "5", uom: "Kg", rate: "1000" },
    ])),
    /không cho phép giao dịch theo ĐVT "Kg"/,
  );
});

test("hệ số khai trên DÒNG thắng bảng quy đổi của mặt hàng", async () => {
  const { store, kernel } = setup();
  // Chuyến này cây dài 6 m chứ không phải 5,85 — người nhập sửa ngay trên dòng.
  await createAndSubmit(kernel, order("PO-OVERRIDE", [
    { row_id: "R1", item_code: "RAY", qty: "10", uom: "Cây", conversion_factor: "6", rate: "300000" },
  ]));
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-OVERRIDE", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-OVERRIDE",
    items: [{ row_id: "R1", item_code: "RAY", qty: "10", uom: "Cây", conversion_factor: "6", rate: "300000", warehouse: "Stores" }],
  }});
  assert.equal(await store.getStockBalanceMicros("demo", "RAY", "Stores"), 60_000_000);
});

test("mặt hàng không khai đơn vị tồn thì hành vi y như trước khi có quy đổi", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, order("PO-PLAIN", [
    { row_id: "R1", item_code: "PHU-KIEN", qty: "12", rate: "5000" },
  ]));
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-PLAIN", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-PLAIN",
    items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "12", rate: "5000", warehouse: "Stores" }],
  }});
  assert.equal(await store.getStockBalanceMicros("demo", "PHU-KIEN", "Stores"), 12_000_000);
});

test("yêu cầu vật tư: đặt mua quá số đã yêu cầu bị TỪ CHỐI, cộng dồn qua NHIỀU đơn", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Material Request", name: "MR-1", document: {
    company: "Demo", material_request_type: "Purchase", transaction_date: "2026-07-28", requested_by: "Tổ lắp",
    items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "100" }],
  }});
  await createAndSubmit(kernel, order("PO-MR-1", [
    { row_id: "R1", item_code: "PHU-KIEN", qty: "60", rate: "5000" },
  ], { material_request: "MR-1" }));
  // Đơn thứ hai vẫn còn 40 — chấp nhận.
  await createAndSubmit(kernel, order("PO-MR-2", [
    { row_id: "R1", item_code: "PHU-KIEN", qty: "40", rate: "5000" },
  ], { material_request: "MR-1" }));
  // Đơn thứ ba vượt.
  await assert.rejects(
    createAndSubmit(kernel, order("PO-MR-3", [
      { row_id: "R1", item_code: "PHU-KIEN", qty: "1", rate: "5000" },
    ], { material_request: "MR-1" })),
    /exceeds Material Request MR-1/,
  );
});

test("yêu cầu vật tư khai bằng MÉT, đơn mua đặt bằng CÂY — hạn mức vẫn so được", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Material Request", name: "MR-UOM", document: {
    company: "Demo", material_request_type: "Purchase", transaction_date: "2026-07-28",
    items: [{ row_id: "R1", item_code: "RAY", qty: "117", uom: "Mét" }],
  }});
  // 20 cây = 117 m: vừa đủ.
  await createAndSubmit(kernel, order("PO-UOM-MR", [
    { row_id: "R1", item_code: "RAY", qty: "20", uom: "Cây", rate: "300000" },
  ], { material_request: "MR-UOM" }));
  // Một cây nữa là vượt.
  await assert.rejects(
    createAndSubmit(kernel, order("PO-UOM-MR-2", [
      { row_id: "R1", item_code: "RAY", qty: "1", uom: "Cây", rate: "300000" },
    ], { material_request: "MR-UOM" })),
    /exceeds Material Request MR-UOM/,
  );
});

test("mặt hàng không nằm trong yêu cầu vật tư thì không đặt kèm được", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Material Request", name: "MR-2", document: {
    company: "Demo", material_request_type: "Purchase", transaction_date: "2026-07-28",
    items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "10" }],
  }});
  await assert.rejects(
    createAndSubmit(kernel, order("PO-SNEAK", [
      { row_id: "R1", item_code: "RAY", qty: "1", uom: "Cây", rate: "300000" },
    ], { material_request: "MR-2" })),
    /is not in Material Request MR-2/,
  );
});

test("báo giá của NCC KHÔNG được mời bị từ chối", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Request for Quotation", name: "RFQ-1", document: {
    company: "Demo", transaction_date: "2026-07-28",
    suppliers: [{ row_id: "S1", supplier: "SUP-1" }, { row_id: "S2", supplier: "SUP-2" }],
    items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "50" }],
  }});
  await createAndSubmit(kernel, { doctype: "Supplier Quotation", name: "SQ-1", document: {
    supplier: "SUP-2", company: "Demo", currency: "USD", transaction_date: "2026-07-28", request_for_quotation: "RFQ-1",
    items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "50", rate: "4800" }],
  }});
  await assert.rejects(
    createAndSubmit(kernel, { doctype: "Supplier Quotation", name: "SQ-BAD", document: {
      supplier: "SUP-3", company: "Demo", currency: "USD", transaction_date: "2026-07-28", request_for_quotation: "RFQ-1",
      items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "50", rate: "4000" }],
    }}),
    /was not invited to RFQ-1/,
  );
});

test("mời cùng một NCC hai lần trong một yêu cầu báo giá bị từ chối", async () => {
  const { kernel } = setup();
  await assert.rejects(
    createAndSubmit(kernel, { doctype: "Request for Quotation", name: "RFQ-DUP", document: {
      company: "Demo", transaction_date: "2026-07-28",
      suppliers: [{ row_id: "S1", supplier: "SUP-1" }, { row_id: "S2", supplier: "SUP-1" }],
      items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "5" }],
    }}),
    /appears twice/,
  );
});

test("báo giá NCC tính tổng bằng đúng bộ máy của đơn mua, và đơn mua phải khớp NCC", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Supplier Quotation", name: "SQ-TOT", document: {
    supplier: "SUP-2", company: "Demo", currency: "USD", transaction_date: "2026-07-28",
    items: [{ row_id: "R1", item_code: "PHU-KIEN", qty: "50", rate: "4800" }],
  }});
  const quotation = await store.getDocument("demo", "Supplier Quotation", "SQ-TOT");
  assert.equal(quotation.data.grand_total, "240000.00");
  assert.equal(quotation.status, "Submitted");

  // Đơn mua trỏ về báo giá nhưng đặt cho NHÀ CUNG CẤP KHÁC — bị từ chối.
  await assert.rejects(
    createAndSubmit(kernel, order("PO-WRONG-SUP", [
      { row_id: "R1", item_code: "PHU-KIEN", qty: "50", rate: "4800" },
    ], { supplier_quotation: "SQ-TOT" })),
    /does not match Supplier Quotation/,
  );
});
