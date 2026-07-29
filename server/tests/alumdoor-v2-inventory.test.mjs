import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-07-30T08:00:00.000Z";
const now = () => NOW;

function setup(clock = now) {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "VND",
    items: ["AL548"],
    warehouses: ["KHO-CHINH", "KHO-DAU-THUA"],
    accounts: [],
  });
  store.seedMaster("Item", "AL548", "demo", {
    stock_uom: "Cây",
    has_batch_no: 1,
    has_catch_weight: 1,
    weight_uom: "Kg",
    measurement_profile: "NHOM-CAY",
    item_group: "Nhôm",
  });
  store.seedMaster("Measurement Profile", "NHOM-CAY", "demo", {
    inventory_mode: "Nhôm cây/lá",
    kerf_mm: 3,
    scrap_threshold_m: "0.200000",
  });
  store.seedMaster("Cutting Policy", "CAT-CUA-DUC", "demo", { disabled: 0 });
  store.seedMaster("Warehouse", "KHO-CHINH", "demo", {
    company: "Demo", stock_role: "Kho chính", is_group: 0,
  });
  store.seedMaster("Warehouse", "KHO-DAU-THUA", "demo", {
    company: "Demo", stock_role: "Kho đầu thừa", is_group: 0,
  });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, registry, kernel: new DocumentKernel(registry, store, { assert() {} }, clock) };
}

function stockLine(batch, qty, weight, value, postingAt = "2026-07-01T00:00:00.000Z") {
  return {
    line_key: `OPEN-${batch}`,
    item_code: "AL548",
    warehouse: "KHO-CHINH",
    actual_qty_micros: qty * 1_000_000,
    actual_weight_micros: weight * 1_000_000,
    valuation_rate_minor: Math.round(value / qty),
    stock_value_difference_minor: value,
    qty_scale: 6,
    currency_scale: 2,
    currency: "VND",
    posting_at: postingAt,
    batch_no: batch,
  };
}

async function bundle(kernel, name, warehouse, type, entries) {
  await createAndSubmit(kernel, {
    doctype: "Serial and Batch Bundle",
    name,
    document: {
      item_code: "AL548",
      warehouse,
      type,
      posting_at: NOW,
      entries: entries.map((entry, index) => ({ row_id: `ROW-${index + 1}`, ...entry })),
    },
  });
  return name;
}

test("Cut Order ghi cây + kg đúng batch, nhập đầu thừa theo giá tỷ lệ và hoàn bằng đúng bút toán gốc", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Batch", "LO-46", "demo", {
    item_code: "AL548", length_m: "4.600000", color: "Ghi", condition: "Đã sơn",
    received_warehouse: "KHO-CHINH",
  });
  store.seedMaster("Batch", "DAU-THUA-0594", "demo", {
    item_code: "AL548", length_m: "0.594000", color: "Ghi", condition: "Đã sơn",
    is_offcut: 1, parent_batch: "LO-46", received_warehouse: "KHO-DAU-THUA",
  });
  store.stockEntries.push(stockLine("LO-46", 10, 100, 9_000_000));
  await bundle(kernel, "BUNDLE-CAT", "KHO-CHINH", "Outward", [{ batch_no: "LO-46", qty: "2" }]);
  await bundle(kernel, "BUNDLE-DAU-THUA", "KHO-DAU-THUA", "Inward", [{ batch_no: "DAU-THUA-0594", qty: "2" }]);
  const document = {
    cut_on: NOW,
    cutting_policy: "CAT-CUA-DUC",
    items: [{
      row_id: "ROW-1",
      item_code: "AL548",
      serial_and_batch_bundle: "BUNDLE-CAT",
      offcut_bundle: "BUNDLE-DAU-THUA",
      source_length_m: "4.6",
      cut_width_m: "4",
      sheets_cut: "2",
    }],
  };
  await createAndSubmit(kernel, { doctype: "Cut Order", name: "CN-2026-00001", document });

  let lines = store.snapshot().stock_entries.filter((row) => /^(CUT|OFFCUT)-/.test(row.line_key));
  assert.equal(lines.length, 2);
  const source = lines.find((row) => row.batch_no === "LO-46");
  const offcut = lines.find((row) => row.batch_no === "DAU-THUA-0594");
  assert.equal(source.actual_qty_micros, -2_000_000);
  assert.equal(source.actual_weight_micros, -20_000_000);
  assert.equal(source.stock_value_difference_minor, -1_800_000);
  assert.equal(offcut.actual_qty_micros, 2_000_000);
  assert.equal(offcut.actual_weight_micros, 2_582_609);
  assert.equal(offcut.stock_value_difference_minor, 232_435);

  await mutate(kernel, {
    commandId: "CN-2026-00001-cancel",
    doctype: "Cut Order",
    name: "CN-2026-00001",
    action: "cancel",
    expectedVersion: 2,
    document: { cancel_reason: "Ghi nhầm" },
  });
  lines = store.snapshot().stock_entries.filter((row) => /(CUT|OFFCUT)-/.test(row.line_key));
  for (const batch of ["LO-46", "DAU-THUA-0594"]) {
    const batchLines = lines.filter((row) => row.batch_no === batch);
    assert.equal(batchLines.reduce((sum, row) => sum + row.actual_qty_micros, 0), 0, batch);
    assert.equal(batchLines.reduce((sum, row) => sum + (row.actual_weight_micros ?? 0), 0), 0, batch);
    assert.equal(batchLines.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 0, batch);
  }
  assert.equal(await store.isStockBundleUsed("demo", "BUNDLE-CAT"), false);
  assert.equal(await store.isStockBundleUsed("demo", "BUNDLE-DAU-THUA"), false);
});

test("Cut Order không được ăn vào phần đã giữ cho lệnh khác", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Batch", "LO-GIU-CHO", "demo", {
    item_code: "AL548", length_m: "4.5", color: "Ghi", condition: "Thô",
    received_warehouse: "KHO-CHINH",
  });
  store.stockEntries.push(stockLine("LO-GIU-CHO", 18, 180, 18_000_000));
  await bundle(kernel, "BUNDLE-CAT-13", "KHO-CHINH", "Outward", [{ batch_no: "LO-GIU-CHO", qty: "13" }]);
  await bundle(kernel, "BUNDLE-LENH-KHAC", "KHO-CHINH", "Outward", [{ batch_no: "LO-GIU-CHO", qty: "1" }]);
  const cutDocument = (bundleName, sheets) => ({
    cut_on: NOW,
    cutting_policy: "CAT-CUA-DUC",
    items: [{
      row_id: "ROW-1", item_code: "AL548", serial_and_batch_bundle: bundleName,
      source_length_m: "4.5", cut_width_m: "4.4", sheets_cut: String(sheets),
    }],
  });
  await mutate(kernel, {
    commandId: "CUT-MAIN-create", doctype: "Cut Order", name: "CUT-MAIN",
    action: "create", expectedVersion: null, document: cutDocument("BUNDLE-CAT-13", 13),
  });
  await mutate(kernel, {
    commandId: "CUT-OTHER-create", doctype: "Cut Order", name: "CUT-OTHER",
    action: "create", expectedVersion: null, document: cutDocument("BUNDLE-LENH-KHAC", 1),
  });
  await mutate(kernel, {
    ...reservation("GC-OTHER", 4.5, 6),
    commandId: "GC-OTHER-create", action: "create", expectedVersion: null,
    document: {
      ...reservation("GC-OTHER", 4.5, 6).document,
      color: "Ghi", condition: "Thô", source_name: "CUT-OTHER",
    },
  });
  await assert.rejects(
    mutate(kernel, {
      commandId: "CUT-MAIN-submit", doctype: "Cut Order", name: "CUT-MAIN",
      action: "submit", expectedVersion: 1, document: cutDocument("BUNDLE-CAT-13", 13),
    }),
    (error) => {
      assert.equal(error.details.total_qty_micros, 18_000_000);
      assert.equal(error.details.cut_qty_micros, 13_000_000);
      assert.equal(error.details.reserved_for_other_sources_micros, 6_000_000);
      return true;
    },
  );
});

async function reservationSetup() {
  const state = setup();
  state.store.seedMaster("Measurement Profile", "NHOM-CAY", "demo", {
    inventory_mode: "Nhôm cây/lá", kerf_mm: 0, scrap_threshold_m: "0.2",
  });
  state.store.seedMaster("Batch", "LO-45", "demo", {
    item_code: "AL548", length_m: "4.5", received_warehouse: "KHO-CHINH",
  });
  state.store.seedMaster("Batch", "LO-38", "demo", {
    item_code: "AL548", length_m: "3.8", received_warehouse: "KHO-CHINH",
  });
  state.store.seedMaster("Batch", "LO-30", "demo", {
    item_code: "AL548", length_m: "3.0", received_warehouse: "KHO-CHINH",
  });
  state.store.stockEntries.push(
    stockLine("LO-45", 18, 180, 18_000_000),
    stockLine("LO-38", 52, 520, 52_000_000),
    stockLine("LO-30", 110, 1_100, 110_000_000),
  );
  await bundle(state.kernel, "BUNDLE-SOURCE", "KHO-CHINH", "Outward", [{ batch_no: "LO-45", qty: "1" }]);
  await mutate(state.kernel, {
    commandId: "CUT-SOURCE-create",
    doctype: "Cut Order",
    name: "CUT-SOURCE",
    action: "create",
    expectedVersion: null,
    document: {
      cut_on: NOW,
      cutting_policy: "CAT-CUA-DUC",
      items: [{
        row_id: "1", item_code: "AL548", serial_and_batch_bundle: "BUNDLE-SOURCE",
        source_length_m: "4.5", cut_width_m: "4.5", sheets_cut: "1",
      }],
    },
  });
  return state;
}

function reservation(name, minLength, qty) {
  return {
    doctype: "Stock Reservation",
    name,
    document: {
      item_code: "AL548",
      min_length_m: String(minLength),
      warehouse: "KHO-CHINH",
      qty_reserved: String(qty),
      source_doctype: "Cut Order",
      source_name: "CUT-SOURCE",
      reserved_at: NOW,
      expires_at: "2026-08-30T08:00:00.000Z",
      state: "Đang giữ",
    },
  };
}

test("giữ khổ cao trừ dồn xuống khổ thấp, không ghi sổ và chặn vượt đủ ba con số", async () => {
  const { store, kernel } = await reservationSetup();
  const before = store.snapshot().stock_entries.length;
  await mutate(kernel, {
    ...reservation("GC-HIGH", 4.5, 6),
    commandId: "GC-HIGH-create", action: "create", expectedVersion: null,
  });
  await mutate(kernel, {
    ...reservation("GC-LOWER", 3.8, 64),
    commandId: "GC-LOWER-create", action: "create", expectedVersion: null,
  });
  assert.equal(store.snapshot().stock_entries.length, before, "giữ chỗ không được chạm sổ kho");

  await assert.rejects(
    mutate(kernel, {
      ...reservation("GC-OVER", 4.5, 20),
      commandId: "GC-OVER-create", action: "create", expectedVersion: null,
    }),
    (error) => {
      assert.equal(error.status, 422);
      assert.deepEqual(error.details, {
        total_qty_micros: 18_000_000,
        reserved_qty_micros: 6_000_000,
        available_qty_micros: 12_000_000,
        requested_qty_micros: 20_000_000,
      });
      return true;
    },
  );
});

test("giữ khổ thấp không làm giảm khả dụng khổ cao; nhả một phần giữ nguyên trạng thái", async () => {
  const { store, kernel } = await reservationSetup();
  await mutate(kernel, {
    ...reservation("GC-LOW", 3.0, 12),
    commandId: "GC-LOW-create", action: "create", expectedVersion: null,
  });
  await mutate(kernel, {
    ...reservation("GC-HIGH-ALL", 4.5, 18),
    commandId: "GC-HIGH-ALL-create", action: "create", expectedVersion: null,
  });

  const partial = reservation("GC-PARTIAL", 3.8, 51);
  await mutate(kernel, {
    ...partial, commandId: "GC-PARTIAL-create", action: "create", expectedVersion: null,
  });
  await mutate(kernel, {
    ...partial,
    commandId: "GC-PARTIAL-save",
    action: "save",
    expectedVersion: 1,
    document: { ...partial.document, qty_reserved: "21", state: "Đang giữ" },
  });
  const saved = await store.getDocument("demo", "Stock Reservation", "GC-PARTIAL");
  assert.equal(saved.data.qty_reserved, "21.000000");
  assert.equal(saved.data.state, "Đang giữ");
});

test("giữ hàng đọc vị trí hiện tại từ sổ, không dùng kho nhận ban đầu trên Batch", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "KHO-CHINH-2", "demo", {
    company: "Demo", stock_role: "Kho chính", is_group: 0,
  });
  store.seedMaster("Batch", "LO-CHUYEN-KHO", "demo", {
    item_code: "AL548", length_m: "4.5", received_warehouse: "KHO-CHINH",
  });
  store.stockEntries.push({
    ...stockLine("LO-CHUYEN-KHO", 8, 80, 8_000_000),
    warehouse: "KHO-CHINH-2",
  });
  await bundle(kernel, "BUNDLE-SOURCE-2", "KHO-CHINH-2", "Outward", [{ batch_no: "LO-CHUYEN-KHO", qty: "1" }]);
  await mutate(kernel, {
    commandId: "CUT-SOURCE-2-create", doctype: "Cut Order", name: "CUT-SOURCE-2",
    action: "create", expectedVersion: null,
    document: {
      cut_on: NOW, cutting_policy: "CAT-CUA-DUC",
      items: [{
        row_id: "1", item_code: "AL548", serial_and_batch_bundle: "BUNDLE-SOURCE-2",
        source_length_m: "4.5", cut_width_m: "4.4", sheets_cut: "1",
      }],
    },
  });
  await mutate(kernel, {
    commandId: "GC-CURRENT-WH-create", doctype: "Stock Reservation", name: "GC-CURRENT-WH",
    action: "create", expectedVersion: null,
    document: {
      ...reservation("IGNORED", 4.5, 8).document,
      warehouse: "KHO-CHINH-2",
      source_name: "CUT-SOURCE-2",
    },
  });
  await assert.rejects(
    mutate(kernel, {
      commandId: "GC-OLD-WH-create", doctype: "Stock Reservation", name: "GC-OLD-WH",
      action: "create", expectedVersion: null,
      document: {
        ...reservation("IGNORED", 4.5, 1).document,
        warehouse: "KHO-CHINH",
        source_name: "CUT-SOURCE-2",
      },
    }),
    (error) => error.details?.total_qty_micros === 0,
  );
});

test("tác vụ hệ thống chuyển giữ chỗ quá hạn sang Hết hạn qua command có audit", async () => {
  const { store, registry, kernel } = await reservationSetup();
  const pending = reservation("GC-EXPIRE", 4.5, 2);
  pending.document.expires_at = "2026-07-30T08:30:00.000Z";
  await mutate(kernel, {
    ...pending, commandId: "GC-EXPIRE-create", action: "create", expectedVersion: null,
  });
  const laterKernel = new DocumentKernel(
    registry,
    store,
    { assert() {} },
    () => "2026-07-30T09:00:00.000Z",
  );
  const existing = await store.getDocument("demo", "Stock Reservation", "GC-EXPIRE");
  await mutate(laterKernel, {
    commandId: "GC-EXPIRE-system-save", doctype: "Stock Reservation", name: "GC-EXPIRE",
    action: "save", expectedVersion: 1,
    document: { ...existing.data, state: "Hết hạn" },
    actor: { user_id: "Administrator", roles: ["System Manager"] },
  });
  assert.equal((await store.getDocument("demo", "Stock Reservation", "GC-EXPIRE")).data.state, "Hết hạn");
  assert.equal(store.snapshot().stock_entries.filter((line) => line.voucher_no === "GC-EXPIRE").length, 0);
});

test("kiểm kê chụp số tại mốc cũ, giao dịch sau mốc không biến thành chênh lệch giả", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Batch", "LO-KK", "demo", {
    item_code: "AL548", length_m: "4.5", received_warehouse: "KHO-CHINH",
  });
  store.stockEntries.push(stockLine("LO-KK", 10, 100, 10_000_000));
  const document = {
    warehouse: "KHO-CHINH",
    scope: "Theo mã hàng",
    item_code: "AL548",
    snapshot_at: NOW,
    counted_by: "THU-KHO",
    items: [{
      row_id: "ROW-1", item_code: "AL548", batch_no: "LO-KK",
      counted_qty: "10", counted_weight_kg: "100",
    }],
  };
  await mutate(kernel, {
    commandId: "KK-SNAPSHOT-create", doctype: "Stock Reconciliation", name: "KK-SNAPSHOT",
    action: "create", expectedVersion: null, document,
  });
  store.stockEntries.push(stockLine("LO-KK", 20, 200, 20_000_000, "2026-07-30T09:00:00.000Z"));
  const before = store.snapshot().stock_entries.length;
  await mutate(kernel, {
    commandId: "KK-SNAPSHOT-submit", doctype: "Stock Reconciliation", name: "KK-SNAPSHOT",
    action: "submit", expectedVersion: 1, document,
  });
  assert.equal(store.snapshot().stock_entries.length, before, "đếm bằng số đã chụp thì không sinh điều chỉnh");
});

test("kiểm kê catch-weight ghi đồng thời -2 cây/-20 kg, bắt buộc nguyên nhân và tách người đếm-người duyệt", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Batch", "LO-KK", "demo", {
    item_code: "AL548", length_m: "4.5", received_warehouse: "KHO-CHINH",
  });
  store.stockEntries.push(stockLine("LO-KK", 10, 100, 10_000_000));
  await bundle(kernel, "BUNDLE-KK-OUT", "KHO-CHINH", "Outward", [{ batch_no: "LO-KK", qty: "2" }]);
  const base = {
    warehouse: "KHO-CHINH",
    scope: "Theo mã hàng",
    item_code: "AL548",
    snapshot_at: NOW,
    counted_by: "THU-KHO",
    items: [{
      row_id: "ROW-1", item_code: "AL548", batch_no: "LO-KK",
      serial_and_batch_bundle: "BUNDLE-KK-OUT",
      counted_qty: "8", counted_weight_kg: "80",
      variance_reason: "Hỏng/mất",
    }],
  };
  await mutate(kernel, {
    commandId: "KK-WEIGHT-create", doctype: "Stock Reconciliation", name: "KK-WEIGHT",
    action: "create", expectedVersion: null, document: base,
  });
  await assert.rejects(
    mutate(kernel, {
      commandId: "KK-WEIGHT-self-submit", doctype: "Stock Reconciliation", name: "KK-WEIGHT",
      action: "submit", expectedVersion: 1, document: base,
      actor: { user_id: "THU-KHO", roles: ["Chủ xưởng"] },
    }),
    (error) => error.status === 403,
  );
  await mutate(kernel, {
    commandId: "KK-WEIGHT-submit", doctype: "Stock Reconciliation", name: "KK-WEIGHT",
    action: "submit", expectedVersion: 1, document: base,
    actor: { user_id: "CHU-XUONG", roles: ["Chủ xưởng"] },
  });
  const line = store.snapshot().stock_entries.find((row) => row.line_key.startsWith("RECON-"));
  assert.equal(line.actual_qty_micros, -2_000_000);
  assert.equal(line.actual_weight_micros, -20_000_000);
  assert.equal(line.batch_no, "LO-KK");

  const noReason = {
    ...base,
    items: [{
      ...base.items[0],
      serial_and_batch_bundle: undefined,
      variance_reason: undefined,
      counted_qty: "7",
      counted_weight_kg: "70",
    }],
  };
  await assert.rejects(
    mutate(kernel, {
      commandId: "KK-NO-REASON-create", doctype: "Stock Reconciliation", name: "KK-NO-REASON",
      action: "create", expectedVersion: null, document: noReason,
    }),
    /phải chọn nguyên nhân/,
  );
});

test("kiểm kê chỉ lệch kg vẫn ghi đúng lô với số cây bằng 0 và giá trị bằng 0", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Batch", "LO-KG-ONLY", "demo", {
    item_code: "AL548", length_m: "4.5", received_warehouse: "KHO-CHINH",
  });
  store.stockEntries.push(stockLine("LO-KG-ONLY", 10, 100, 10_000_000));
  const document = {
    warehouse: "KHO-CHINH",
    scope: "Theo mã hàng",
    item_code: "AL548",
    snapshot_at: NOW,
    counted_by: "THU-KHO",
    items: [{
      row_id: "ROW-1", item_code: "AL548", batch_no: "LO-KG-ONLY",
      counted_qty: "10", counted_weight_kg: "95", variance_reason: "Cân lại",
    }],
  };
  await mutate(kernel, {
    commandId: "KK-KG-ONLY-create", doctype: "Stock Reconciliation", name: "KK-KG-ONLY",
    action: "create", expectedVersion: null, document,
  });
  await mutate(kernel, {
    commandId: "KK-KG-ONLY-submit", doctype: "Stock Reconciliation", name: "KK-KG-ONLY",
    action: "submit", expectedVersion: 1, document,
    actor: { user_id: "CHU-XUONG", roles: ["Chủ xưởng"] },
  });
  const line = store.snapshot().stock_entries.find((row) => row.line_key.startsWith("RECON-WEIGHT-"));
  assert.equal(line.batch_no, "LO-KG-ONLY");
  assert.equal(line.actual_qty_micros, 0);
  assert.equal(line.actual_weight_micros, -5_000_000);
  assert.equal(line.stock_value_difference_minor, 0);
});
