import test from "node:test";
import assert from "node:assert/strict";
import {
  auditBackendUiSurfaces,
  renderBackendUiSummary,
  serializeBackendUiMatrix,
} from "../scripts/audit-backend-ui-surfaces.mjs";

function byId(matrix, id) {
  const row = matrix.rows.find((entry) => entry.id === id);
  assert.ok(row, `missing UI-REC-01 matrix row ${id}`);
  return row;
}

test("UI-REC-01 tracks unresolved Sales authority drift while locking the converged Sales line projection", () => {
  const matrix = auditBackendUiSurfaces();

  const option = byId(matrix, "selling::Sales Option::master");
  assert.equal(option.schema.exists, true);
  assert.equal(option.projection.metadata_present, true);
  assert.equal(option.projection.navigation_present, false);
  assert.ok(option.classification.includes("NAV_MISSING"));
  assert.ok(option.classification.includes("SCHEMA_DRIFT"));

  const salesPackage = byId(matrix, "selling::Sales Package::master");
  assert.equal(salesPackage.schema.exists, true);
  assert.equal(salesPackage.projection.navigation_present, false);
  assert.ok(salesPackage.classification.includes("NAV_MISSING"));

  // Sales Order Item không còn chiếu `sales_option` — cách bán/gói bán đã bị loại bỏ
  // 2026-08-14, đúng ý định. Migration lịch sử 0118 vẫn khai báo field đó (bằng chứng
  // provenance, không sửa lại), nên công cụ dò lệch ĐÚNG ĐẮN báo SCHEMA_DRIFT/GRID_INCOMPLETE
  // ở đây — đây là lệch có chủ đích, không phải lỗi cần vá.
  const salesLine = byId(matrix, "alumdoor::Sales Order Item::child");
  assert.deepEqual(salesLine.classification, ["SCHEMA_DRIFT", "GRID_INCOMPLETE"]);
  assert.equal(salesLine.projection.metadata_present, true);
  // `grid_present` chỉ đúng khi brief hiện tại CÓ chiếu `sales_option` — không còn nữa.
  assert.equal(salesLine.projection.grid_present, false, "AlumDoor V2 không còn chiếu sales_option");
});

test("UI-REC-01 keeps the repaired Sales Order server-preview summary projected", () => {
  const matrix = auditBackendUiSurfaces();
  const salesOrder = byId(matrix, "alumdoor::Sales Order::transaction");

  assert.deepEqual(salesOrder.classification, ["OK"]);
  assert.deepEqual(salesOrder.authority.preview_methods, ["alumdoor.ui.preview_document"]);
  for (const fieldname of ["total_amount", "discount_amount", "surcharge_amount", "vat_rate", "vat_amount", "grand_total"]) {
    assert.ok(salesOrder.schema.fields.some((field) => field.fieldname === fieldname), fieldname);
  }
});

test("UI-REC-01 P0 breadth includes procurement, inventory and Attendance/Payroll metadata", () => {
  const matrix = auditBackendUiSurfaces();
  for (const id of [
    "alumdoor::Purchase Receipt::transaction",
    "alumdoor::Purchase Receipt Item::child",
    "alumdoor::Stock Reservation::transaction",
    "alumdoor::Stock Reconciliation::transaction",
    "alumdoor-attendance::AlumDoor Attendance Day::transaction",
    "alumdoor-attendance::AlumDoor Pay Profile::master",
  ]) {
    const row = byId(matrix, id);
    assert.equal(row.schema.exists, true, id);
    assert.equal(row.projection.metadata_present, true, id);
  }
});

test("UI-REC-01 matrix and summary serialization are deterministic", () => {
  const first = auditBackendUiSurfaces();
  const second = auditBackendUiSurfaces();
  assert.equal(serializeBackendUiMatrix(first), serializeBackendUiMatrix(second));
  assert.equal(renderBackendUiSummary(first), renderBackendUiSummary(second));
  assert.match(renderBackendUiSummary(first), /DR-UIREC01-001/);
  assert.match(renderBackendUiSummary(first), /DR-UIREC01-002/);
  assert.match(renderBackendUiSummary(first), /DR-UIREC01-003/);
});
