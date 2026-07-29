/**
 * Vật lý tiêu thụ lô này, kế toán trừ lô kia.
 *
 * Lúc cắt, xưởng CỐ Ý chọn lô khổ nhỏ nhất còn đủ dài, để phế ít nhất. Đó thường KHÔNG phải
 * lô cũ nhất, và thường mua ở giá khác. Nhân định giá lại bỏ qua `batch_no` và phát lại FIFO
 * trên toàn kho — nên nó trừ giá của lô CŨ NHẤT, trong khi nhôm rời kho là lô khác.
 *
 * Sổ vẫn cân. Tổng số lượng đúng, tổng giá trị đúng theo FIFO toàn kho. Chỉ có giá vốn từng
 * bộ cửa là sai, và nó sai theo chiều ngẫu nhiên nên không lộ ra ở bất kỳ báo cáo tổng nào.
 * ERPNext dính đúng lỗi này (PR #29804).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { registerStockControllers, normalizeValuationMethod, valueIssue } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-30T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "VND",
    items: ["NHOM-4.6D"], warehouses: ["K36"],
    accounts: ["Ton kho", "Gia von", "Doanh thu", "Cong no phai thu"],
  });
  store.seedMaster("Item", "NHOM-4.6D", "demo", { stock_uom: "Cây", has_batch_no: 1 });
  store.seedMaster("Batch", "LO-CU", "demo", { item: "NHOM-4.6D" });
  store.seedMaster("Batch", "LO-MOI", "demo", { item: "NHOM-4.6D" });

  // Hai lô, hai giá. Lô CŨ rẻ, lô MỚI đắt — và xưởng sẽ cắt lô MỚI vì nó vừa khổ.
  store.stockEntries.push(
    line("LO-CU", "2026-01-01T00:00:00.000Z", 10_000_000, 500_000_00),
    line("LO-MOI", "2026-06-01T00:00:00.000Z", 10_000_000, 900_000_00),
  );
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

const line = (batch, postingAt, qtyMicros, valueMinor) => ({
  line_key: `OPEN-${batch}`, item_code: "NHOM-4.6D", warehouse: "K36",
  actual_qty_micros: qtyMicros, valuation_rate_minor: valueMinor / (qtyMicros / 1_000_000),
  stock_value_difference_minor: valueMinor, qty_scale: 6, currency_scale: 2,
  currency: "VND", posting_at: postingAt, batch_no: batch,
});

async function bundle(kernel, name, batch, qty) {
  await createAndSubmit(kernel, { doctype: "Serial and Batch Bundle", name, document: {
    item_code: "NHOM-4.6D", warehouse: "K36", type: "Outward", posting_at: now(),
    entries: [{ row_id: "1", batch_no: batch, qty }],
  }});
  return name;
}

/**
 * Dùng PHIẾU KHO (Material Issue) thay vì Phiếu xuất bán vì đây là đúng đường của Cut Order:
 *
 * Cắt nhôm là một Stock Entry, không phải một Delivery Note.
 */
const issue = (kernel, name, bundleName) => createAndSubmit(kernel, {
  doctype: "Stock Entry", name, document: {
    company: "Demo", posting_at: now(), purpose: "Material Issue",
    items: [{ row_id: "1", item_code: "NHOM-4.6D", qty: "10",
      source_warehouse: "K36", serial_and_batch_bundle: bundleName }],
  },
});

test("xuất từ lô MỚI thì trừ giá lô mới, không trừ giá lô cũ nhất", async () => {
  const { store, kernel } = setup();
  await bundle(kernel, "SBB-1", "LO-MOI", "10");
  await issue(kernel, "PK-1", "SBB-1");

  const posted = store.snapshot().stock_entries
    .filter((entry) => entry.item_code === "NHOM-4.6D" && entry.actual_qty_micros < 0);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].batch_no, "LO-MOI");

  // 10 cây của LO-MOI = 900.000. FIFO toàn kho trả 500.000 của LO-CU — chênh 400.000 trên
  // đúng một dòng, và không có gì trong hệ thống báo là đã trừ nhầm lô.
  assert.equal(-posted[0].stock_value_difference_minor, 900_000_00,
    "trừ giá lô cũ nhất trong khi nhôm rời kho là lô mới — đúng lỗi ERPNext #29804");
  assert.equal(posted[0].valuation_rate_minor, 90_000_00);
});

test("lô CŨ vẫn định giá theo giá của chính nó", async () => {
  const { store, kernel } = setup();
  await bundle(kernel, "SBB-CU", "LO-CU", "10");
  await issue(kernel, "PK-CU", "SBB-CU");
  const posted = store.snapshot().stock_entries.find((entry) => entry.actual_qty_micros < 0);
  // Đây là chỗ dễ tự lừa: nếu chỉ test lô mới, một cài đặt "luôn lấy lô ĐẮT nhất" cũng xanh.
  assert.equal(-posted.stock_value_difference_minor, 500_000_00);
});

test("Phiếu xuất catch-weight trừ cùng lúc số cây và kg, huỷ trả lại đủ cả hai", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "NHOM-4.6D", "demo", {
    stock_uom: "Cây", has_batch_no: 1, has_catch_weight: 1, weight_uom: "Kg",
  });
  for (const entry of store.stockEntries) entry.actual_weight_micros = 100_000_000;
  await bundle(kernel, "SBB-DN-WEIGHT", "LO-MOI", "10");
  const document = {
    issue_purpose: "Xuất nội bộ", company: "Demo", currency: "VND", posting_at: now(),
    items: [{
      row_id: "1", item_code: "NHOM-4.6D", qty: "10", rate: "0",
      warehouse: "K36", serial_and_batch_bundle: "SBB-DN-WEIGHT", weight_kg: "47",
    }],
  };
  await createAndSubmit(kernel, { doctype: "Delivery Note", name: "PXK-WEIGHT", document });

  let posted = store.snapshot().stock_entries
    .filter((entry) => entry.item_code === "NHOM-4.6D" && entry.line_key.startsWith("ITEM-"));
  assert.equal(posted.length, 1);
  assert.equal(posted[0].batch_no, "LO-MOI");
  assert.equal(posted[0].actual_qty_micros, -10_000_000);
  assert.equal(posted[0].actual_weight_micros, -47_000_000);

  await mutate(kernel, {
    commandId: "PXK-WEIGHT-cancel", doctype: "Delivery Note", name: "PXK-WEIGHT",
    action: "cancel", expectedVersion: 2, document: {},
  });
  posted = store.snapshot().stock_entries
    .filter((entry) => entry.item_code === "NHOM-4.6D" && /ITEM-/.test(entry.line_key));
  assert.equal(posted.reduce((sum, entry) => sum + entry.actual_qty_micros, 0), 0);
  assert.equal(posted.reduce((sum, entry) => sum + (entry.actual_weight_micros ?? 0), 0), 0);
  assert.equal(posted.reduce((sum, entry) => sum + entry.stock_value_difference_minor, 0), 0);
});

test("Phiếu xuất catch-weight thiếu kg bị từ chối trước khi ghi sổ", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "NHOM-4.6D", "demo", {
    stock_uom: "Cây", has_batch_no: 1, has_catch_weight: 1, weight_uom: "Kg",
  });
  await bundle(kernel, "SBB-DN-NO-WEIGHT", "LO-MOI", "10");
  await assert.rejects(
    createAndSubmit(kernel, {
      doctype: "Delivery Note", name: "PXK-NO-WEIGHT",
      document: {
        issue_purpose: "Xuất nội bộ", company: "Demo", currency: "VND", posting_at: now(),
        items: [{
          row_id: "1", item_code: "NHOM-4.6D", qty: "10", rate: "0",
          warehouse: "K36", serial_and_batch_bundle: "SBB-DN-NO-WEIGHT",
        }],
      },
    }),
    /Khối lượng xuất là bắt buộc/,
  );
  assert.equal(
    store.snapshot().stock_entries.filter((entry) => entry.line_key.startsWith("ITEM-")).length,
    0,
  );
});

test("Phiếu kho dùng cho cắt trừ cây + kg theo đúng lô và huỷ bằng bút toán gốc", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "NHOM-4.6D", "demo", {
    stock_uom: "Cây", has_batch_no: 1, has_catch_weight: 1, weight_uom: "Kg",
  });
  for (const entry of store.stockEntries) entry.actual_weight_micros = 100_000_000;
  await bundle(kernel, "SBB-CUT-WEIGHT", "LO-MOI", "10");
  await createAndSubmit(kernel, {
    doctype: "Stock Entry", name: "CUT-WEIGHT",
    document: {
      company: "Demo", posting_at: now(), purpose: "Material Issue",
      items: [{
        row_id: "1", item_code: "NHOM-4.6D", qty: "10", weight_kg: "47",
        source_warehouse: "K36", serial_and_batch_bundle: "SBB-CUT-WEIGHT",
      }],
    },
  });
  let posted = store.snapshot().stock_entries
    .filter((entry) => entry.item_code === "NHOM-4.6D" && entry.line_key.startsWith("SRC-"));
  assert.equal(posted.length, 1);
  assert.equal(posted[0].batch_no, "LO-MOI");
  assert.equal(posted[0].actual_qty_micros, -10_000_000);
  assert.equal(posted[0].actual_weight_micros, -47_000_000);
  assert.equal(posted[0].stock_value_difference_minor, -900_000_00);

  await mutate(kernel, {
    commandId: "CUT-WEIGHT-cancel", doctype: "Stock Entry", name: "CUT-WEIGHT",
    action: "cancel", expectedVersion: 2, document: {},
  });
  posted = store.snapshot().stock_entries
    .filter((entry) => entry.item_code === "NHOM-4.6D" && /SRC-/.test(entry.line_key));
  assert.equal(posted.reduce((sum, entry) => sum + entry.actual_qty_micros, 0), 0);
  assert.equal(posted.reduce((sum, entry) => sum + (entry.actual_weight_micros ?? 0), 0), 0);
  assert.equal(posted.reduce((sum, entry) => sum + entry.stock_value_difference_minor, 0), 0);
  assert.equal(await store.isStockBundleUsed("demo", "SBB-CUT-WEIGHT"), false);
});

test("huỷ phiếu cắt nhiều lô trả đúng giá và kg cho TỪNG lô, không chia lại theo bình quân", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "NHOM-4.6D", "demo", {
    stock_uom: "Cây", has_batch_no: 1, has_catch_weight: 1, weight_uom: "Kg",
  });
  for (const entry of store.stockEntries) entry.actual_weight_micros = 100_000_000;
  await createAndSubmit(kernel, {
    doctype: "Serial and Batch Bundle", name: "SBB-CUT-TWO-BATCHES",
    document: {
      item_code: "NHOM-4.6D", warehouse: "K36", type: "Outward", posting_at: now(),
      entries: [
        { row_id: "CU", batch_no: "LO-CU", qty: "5" },
        { row_id: "MOI", batch_no: "LO-MOI", qty: "5" },
      ],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Stock Entry", name: "CUT-TWO-BATCHES",
    document: {
      company: "Demo", posting_at: now(), purpose: "Material Issue",
      items: [{
        row_id: "1", item_code: "NHOM-4.6D", qty: "10", weight_kg: "47",
        source_warehouse: "K36", serial_and_batch_bundle: "SBB-CUT-TWO-BATCHES",
      }],
    },
  });
  await mutate(kernel, {
    commandId: "CUT-TWO-BATCHES-cancel", doctype: "Stock Entry", name: "CUT-TWO-BATCHES",
    action: "cancel", expectedVersion: 2, document: {},
  });

  const posted = store.snapshot().stock_entries
    .filter((entry) => entry.item_code === "NHOM-4.6D" && /SRC-/.test(entry.line_key));
  for (const batch of ["LO-CU", "LO-MOI"]) {
    const batchLines = posted.filter((entry) => entry.batch_no === batch);
    assert.equal(batchLines.reduce((sum, entry) => sum + entry.actual_qty_micros, 0), 0, batch);
    assert.equal(batchLines.reduce((sum, entry) => sum + (entry.actual_weight_micros ?? 0), 0), 0, batch);
    assert.equal(batchLines.reduce((sum, entry) => sum + entry.stock_value_difference_minor, 0), 0, batch);
  }
});

test("phương pháp giá vốn lạ bị TỪ CHỐI, không lặng lẽ thành FIFO", () => {
  assert.equal(normalizeValuationMethod(undefined), "FIFO", "chưa khai thì mặc định FIFO");
  assert.equal(normalizeValuationMethod("FIFO"), "FIFO");
  assert.equal(normalizeValuationMethod("Moving Average"), "Moving Average");
  // Chính chuỗi brief V2 khai. Bản cũ tìm chữ "moving" nên chuỗi này rơi về FIFO trong im lặng.
  assert.equal(normalizeValuationMethod("Bình quân di động"), "Moving Average");
  assert.throws(() => normalizeValuationMethod("Bình quân cuối kỳ"), /không nhận ra/);
  assert.throws(() => normalizeValuationMethod("LIFO"), /không nhận ra/);
});

test("giá vốn VND không tràn số ở phiếu trăm triệu", () => {
  // 200 cây trị giá 120 triệu — dưới ngưỡng cũ ~90 triệu là gãy.
  const history = [{
    line_key: "IN", item_code: "X", warehouse: "K36", actual_qty_micros: 200_000_000,
    valuation_rate_minor: 600_000_00, stock_value_difference_minor: 120_000_000_00,
    qty_scale: 6, currency_scale: 2, currency: "VND", posting_at: "2026-01-01T00:00:00.000Z",
  }];
  const result = valueIssue(history, 200_000_000, "FIFO", 2);
  assert.equal(-result.stock_value_difference_minor, 120_000_000_00);
  assert.equal(result.valuation_rate_minor, 600_000_00);
});
