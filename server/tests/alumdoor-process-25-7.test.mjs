import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  WARRANTY_CAUSES,
  addCalendarMonths,
  confirmSupplierOffset,
  deliveryBatchKey,
  demandMinutes,
  evaluateWarranty,
  groupPaintBatches,
  nextWorkingDate,
  planCapacity,
  previewDailyDeliveries,
  validateWarrantyClaim,
} from "../dist/apps-src/alumdoor-worker/src/operations-core.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
const doctype = (name) => brief.doctypes.find((entry) => entry.name === name);
const fieldNames = (name) => new Set((doctype(name)?.fields ?? []).map((field) => typeof field === "string" ? field.split(":", 1)[0] : field.fieldname));

test("bảo hành motor/pin dùng ngày giao thực tế cộng đúng 12 tháng", () => {
  assert.equal(addCalendarMonths("2024-02-29", 12), "2025-02-28");
  assert.deepEqual(evaluateWarranty({ delivery_date: "2026-01-31", received_fault_on: "2027-01-31" }), {
    eligible: true, expires_on: "2027-01-31", received_fault_on: "2027-01-31",
  });
  assert.equal(evaluateWarranty({ delivery_date: "2026-01-31", received_fault_on: "2027-02-01" }).eligible, false);
  assert.throws(() => evaluateWarranty({ received_fault_on: "2026-02-01" }), /Phiếu giao/);
});

test("hồ sơ lỗi bắt buộc truy vết và chỉ nhận bốn nguyên nhân chuẩn", () => {
  assert.equal(WARRANTY_CAUSES.length, 4);
  const claim = validateWarrantyClaim({
    sales_order: "DH-1", delivery_note: "PXK-1", delivery_date: "2026-01-01", item_code: "MOTOR-1",
    received_fault_on: "2026-05-01", issue_cause: "Sản xuất", responsible_person: "Tổ motor",
  });
  assert.equal(claim.warranty_eligible, 1);
  assert.equal(claim.warranty_status, "Đang xử lý");
  assert.throws(() => validateWarrantyClaim({
    sales_order: "DH-1", delivery_note: "PXK-1", delivery_date: "2026-01-01", item_code: "MOTOR-1",
    received_fault_on: "2026-05-01", issue_cause: "Khác",
  }), /bốn nhóm/);
});

test("lỗi khách tính chi phí từ dòng công việc; lỗi NCC chờ đổi và cần kế toán xác nhận", () => {
  const customer = validateWarrantyClaim({
    sales_order: "DH-2", delivery_note: "PXK-2", delivery_date: "2026-01-01", item_code: "CUA-1",
    received_fault_on: "2026-03-01", issue_cause: "Khách hàng sử dụng",
    customer_costs: [{ operation: "Thay nan", quantity: 2, rate: 150_000 }, { operation: "Đi lại", quantity: 1, rate: 100_000 }],
  });
  assert.equal(customer.customer_cost_total, 400_000);
  const supplier = validateWarrantyClaim({
    sales_order: "DH-3", delivery_note: "PXK-3", delivery_date: "2026-01-01", item_code: "MOTOR-2",
    received_fault_on: "2026-03-01", issue_cause: "Nhà cung cấp", supplier: "NCC-A", purchase_document: "HDM-1", supplier_offset_amount: 500_000,
  });
  assert.equal(supplier.warranty_status, "Chờ NCC đổi");
  assert.throws(() => confirmSupplierOffset(supplier, { user_id: "sales", roles: ["Kinh doanh"] }), /Kế toán/);
  assert.equal(confirmSupplierOffset(supplier, { user_id: "accountant", roles: ["General Accountant"] }).accounting_confirmed_by, "accountant");
});

test("năng lực hỗ trợ m2, bộ/công đoạn, mẻ sơn, ca 8h, workstation và tăng ca", () => {
  assert.equal(demandMinutes({ key: "paint", door_type: "Cửa Úc", operation: "Sơn", basis: "batch", quantity: 21, batch_capacity: 10, minutes_per_unit: 180, color: "Trắng" }), 540);
  const result = planCapacity([
    { key: "mesh", door_type: "Cửa Lưới", operation: "Lắp", basis: "m2", quantity: 20, minutes_per_unit: 15 },
    { key: "german", door_type: "Cửa Đức", operation: "Lắp", basis: "set", quantity: 5, minutes_per_unit: 60 },
  ], { persons: 2, shifts: 1, shift_hours: 8, efficiency: 1, workstation_minutes: 700, overtime_hours: 1 });
  assert.equal(result.regular_capacity_minutes, 700);
  assert.equal(result.overtime_capacity_minutes, 120);
  assert.equal(result.late_warning, false);
  assert.equal(planCapacity([{ key: "x", door_type: "Cửa Đức", operation: "Lắp", basis: "set", quantity: 20, minutes_per_unit: 60 }], { persons: 1 }).late_warning, true);
});

test("sơn gom theo màu và mặc định kế hoạch làm việc bỏ Chủ nhật/ngày nghỉ", () => {
  const groups = groupPaintBatches([
    { key: "a", door_type: "Cửa Úc", operation: "Sơn", basis: "batch", quantity: 6, batch_capacity: 10, minutes_per_unit: 180, color: "Trắng" },
    { key: "b", door_type: "Cửa Lưới", operation: "Sơn", basis: "batch", quantity: 7, batch_capacity: 10, minutes_per_unit: 180, color: "trắng" },
  ]);
  assert.deepEqual(groups, [{ color: "TRẮNG", quantity: 13, batches: 2, required_minutes: 360 }]);
  assert.equal(nextWorkingDate("2026-08-02", ["2026-08-03"]), "2026-08-04");
  const schedule = planCapacity([
    { key: "a", door_type: "Cửa Úc", operation: "Sơn", basis: "batch", quantity: 6, batch_capacity: 10, minutes_per_unit: 180, color: "Trắng" },
    { key: "b", door_type: "Cửa Lưới", operation: "Sơn", basis: "batch", quantity: 7, batch_capacity: 10, minutes_per_unit: 180, color: "trắng" },
  ], { persons: 1, shift_hours: 4, start_date: "2026-08-02", holidays: ["2026-08-03"] });
  assert.equal(schedule.required_minutes, 360, "cùng màu phải gom hai mẻ, không tính thành hai nhóm riêng");
  assert.equal(schedule.suggested_end_date, "2026-08-05");
});

test("xem trước giao hàng theo ngày có khóa idempotency ngày + đơn", () => {
  assert.equal(deliveryBatchKey("2026-08-01", "DH-1"), "2026-08-01:DH-1");
  const rows = previewDailyDeliveries("2026-08-01", [
    { name: "DH-1", customer: "A", delivery_date: "2026-08-01", docstatus: 1, delivered_percentage: 0 },
    { name: "DH-2", customer: "B", delivery_date: "2026-08-02", docstatus: 1, delivered_percentage: 0 },
    { name: "DH-3", customer: "C", delivery_date: "2026-07-31", docstatus: 1, delivered_percentage: 50 },
  ], [{ name: "PXK-3", against_sales_order: "DH-3", docstatus: 1 }]);
  assert.deepEqual(rows.map((row) => [row.sales_order, row.status]), [["DH-1", "Sẵn sàng"], ["DH-3", "Đã tạo"]]);
});

test("metadata 25.7 có đủ truy vết, năng lực, khóa giao ngày và màn điều hành", () => {
  for (const field of [
    "sales_order", "delivery_note", "delivery_date", "item_code", "purchase_document", "issue_cause", "responsible_person",
    "warranty_expires_on", "warranty_eligible", "customer_costs", "supplier_offset_amount", "debit_note", "accounting_confirmed_by",
  ]) assert.ok(fieldNames("Warranty Claim").has(field), `Warranty Claim missing ${field}`);
  for (const field of ["capacity_basis", "minutes_per_unit", "batch_capacity", "persons", "shift_hours", "efficiency", "workstation", "default_overtime_hours"]) {
    assert.ok(fieldNames("Production Standard").has(field), `Production Standard missing ${field}`);
  }
  assert.ok(fieldNames("Delivery Note").has("delivery_batch_key"));
  assert.ok(fieldNames("Sales Order").has("manual_note"));
  assert.ok(brief.validators.some((entry) => entry.doctype === "Warranty Claim"));
  assert.ok(brief.experiences.some((entry) => entry.key === "alumdoor-operations:workbench"));
});

test("Golden Order 25.7 đi qua đơn hỗn hợp, tải xưởng, giao một phần, lỗi và sổ ngày", async () => {
  const capacity = planCapacity([
    { key: "AU-M2", door_type: "Cửa Úc", operation: "Gia công", basis: "m2", quantity: 24, minutes_per_unit: 12 },
    { key: "DUC-SET", door_type: "Cửa Đức", operation: "Lắp", basis: "set", quantity: 4, minutes_per_unit: 50 },
    { key: "PAINT-WHITE", door_type: "Cửa Úc", operation: "Sơn", basis: "batch", quantity: 12, batch_capacity: 10, minutes_per_unit: 180, color: "Trắng" },
  ], { persons: 3, shifts: 1, shift_hours: 8, efficiency: 0.9, overtime_hours: 1, workstation_minutes: 1_200 });
  assert.ok(capacity.required_minutes > 0);
  assert.equal(groupPaintBatches([
    { key: "P1", door_type: "Cửa Úc", operation: "Sơn", basis: "batch", quantity: 12, batch_capacity: 10, minutes_per_unit: 180, color: "Trắng" },
  ])[0].batches, 2);

  const delivery = previewDailyDeliveries("2026-08-01", [
    { name: "DH-GOLDEN", delivery_date: "2026-08-01", docstatus: 1, delivered_percentage: 50, customer: "Đại lý Golden" },
  ], []);
  assert.equal(delivery[0].status, "Sẵn sàng");
  assert.equal(previewDailyDeliveries("2026-08-01", [
    { name: "DH-GOLDEN", delivery_date: "2026-08-01", docstatus: 1, delivered_percentage: 50 },
  ], [{ name: "PXK-GOLDEN-2", delivery_batch_key: delivery[0].delivery_batch_key, docstatus: 0 }])[0].status, "Đã tạo");

  const productionDefect = validateWarrantyClaim({
    sales_order: "DH-GOLDEN", delivery_note: "PXK-GOLDEN-1", delivery_date: "2026-07-01", item_code: "CUA-DUC",
    received_fault_on: "2026-07-20", issue_cause: "Sản xuất", responsible_person: "Tổ Đức",
  });
  const supplierDefect = validateWarrantyClaim({
    sales_order: "DH-GOLDEN", delivery_note: "PXK-GOLDEN-1", delivery_date: "2026-07-01", item_code: "MOTOR-GOLDEN",
    received_fault_on: "2026-07-20", issue_cause: "Nhà cung cấp", supplier: "NCC-GOLDEN", purchase_document: "HDM-GOLDEN", supplier_offset_amount: 750_000,
  });
  assert.equal(productionDefect.warranty_eligible, 1);
  assert.equal(confirmSupplierOffset(supplierDefect, { user_id: "ktth", roles: ["Kế toán tổng hợp"] }).warranty_status, "Đã xác nhận bù trừ");

  const worker = await readFile(new URL("../apps-src/alumdoor-worker/src/index.ts", import.meta.url), "utf8");
  const ledger = await readFile(new URL("../packages/document-kernel/src/daily-detailed-ledger.ts", import.meta.url), "utf8");
  assert.match(worker, /alumdoor\.delivery_batch\.create/);
  assert.match(worker, /createV2Doc\(call, "Debit Note"/);
  assert.match(ledger, /'Sales:Sales Order:'/);
  assert.match(ledger, /'Warranty'/);
  assert.match(ledger, /'Finance'/);
});
