import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAlumdoorUiRec02Sidebar } from "../scripts/build-alumdoor-ui-rec-02-sidebar.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const read = (relative) => readFile(path.join(serverRoot, relative), "utf8");

const TARGET_GROUPS = ["Bán hàng", "Mua hàng", "Kho", "Sản xuất", "Nhân sự & Tiền lương", "Công nợ / Kế toán", "Bảo hành / Dịch vụ", "Báo cáo", "Danh mục"];
const P0_MASTERS = ["Item", "Item Group", "UOM", "Warehouse", "Customer", "Supplier", "Sales Option", "Sales Package", "Price List", "Item Price", "Pricing Rule", "Cutting Policy", "Measurement Profile", "Item Color", "Material Grade", "Material Specification", "Item Attribute", "Supplier Item", "Brand", "Manufacturer"];
const REQUIRED_OPERATIONAL_SURFACES = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Material Request", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Stock Entry", "Cut Order", "Stock Reservation", "Stock Reconciliation", "Production Request", "Work Order", "Bill of Materials", "Production Standard", "Paint Job", "Payment Entry", "Warranty Claim"];
const ATTENDANCE_SURFACES = ["alumdoor-attendance:kiosk", "alumdoor-attendance:today", "alumdoor-attendance:month", "alumdoor-attendance:exceptions", "alumdoor-attendance:employees-lite", "alumdoor-attendance:payroll-lite", "alumdoor-attendance:my-slips-lite", "alumdoor-attendance:hr-payroll-settings-lite"];

test("UI-REC-02 sidebar is deterministic, domain-oriented and free of superseded routes", async () => {
  const first = await buildAlumdoorUiRec02Sidebar();
  const second = await buildAlumdoorUiRec02Sidebar();
  assert.deepEqual(second, first, "navigation overlay must be reproducible");
  assert.equal(first.id, "alumdoor");
  assert.equal(first.version, "2.2.5");
  const groups = [...new Set(first.nav.map((item) => item.group))];
  assert.deepEqual(groups, TARGET_GROUPS);
  const keys = first.nav.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, "sidebar keys must be unique");
  for (const dead of ["Aluminium Lot", "Aluminium Cut", "Sales Package Item"]) assert.equal(keys.includes(dead), false, `${dead} must not be navigable`);
  for (const key of REQUIRED_OPERATIONAL_SURFACES) assert.ok(keys.includes(key), `${key} must be reachable`);
  for (const key of ATTENDANCE_SURFACES) assert.ok(keys.includes(key), `${key} must be reachable from the unified AlumDoor IA`);
});

test("UI-REC-02 exposes all P0 operator masters through the Danh mục contract", async () => {
  const sidebar = await buildAlumdoorUiRec02Sidebar();
  const masters = new Map(sidebar.nav.filter((item) => item.group === "Danh mục").map((item) => [item.key, item]));
  for (const key of P0_MASTERS) {
    const item = masters.get(key);
    assert.ok(item, `${key} must be present in /master-data via group=Danh mục`);
    assert.equal(item.kind ?? "doctype", "doctype", `${key} must resolve as a DocType master`);
    assert.equal(item.permission_doctype, key, `${key} must use its server DocPerm as the visibility gate`);
  }
  assert.equal(masters.get("Sales Option")?.label, "Phương án bán");
  assert.equal(masters.get("Sales Package")?.label, "Gói bán hàng");
});

test("Sales Option and Sales Package navigation is backed by current backend authority and roles", async () => {
  const [optionsSql, packageSql, operatorSql] = await Promise.all([
    read("migrations/tenant/0118_sales_price_variants_options.sql"),
    read("migrations/tenant/0119_sales_package_line_fulfillment.sql"),
    read("migrations/tenant/0120_sales_operator_metadata.sql"),
  ]);
  assert.match(optionsSql, /'Sales Option','Selling'/);
  assert.match(optionsSql, /"role":"Sales Manager","read":true,"write":true,"create":true/);
  assert.match(optionsSql, /"role":"Sales User","read":true,"write":false,"create":false/);
  assert.match(optionsSql, /"role":"System Manager","read":true,"write":true,"create":true/);
  assert.match(packageSql, /'Sales Package','Selling'/);
  assert.match(packageSql, /'Sales Package Item','Selling',0,0,1/);
  assert.match(packageSql, /"role":"Sales Manager","read":true,"write":true,"create":true/);
  assert.match(packageSql, /"role":"Sales User","read":true,"write":false,"create":false/);
  assert.match(operatorSql, /WHERE doctype='Sales Option'/);
  assert.match(operatorSql, /'Sales Package'/);
});

test("attendance/payroll IA is sourced from the installed AlumDoor attendance app, not duplicated business logic", async () => {
  const attendance = JSON.parse(await read("apps-src/alumdoor-attendance/app.json"));
  const byKey = new Map(attendance.nav.map((item) => [item.key, item]));
  for (const key of ATTENDANCE_SURFACES) assert.ok(byKey.has(key), `${key} must remain declared by alumdoor-attendance`);
  assert.deepEqual([...new Set(attendance.nav.map((item) => item.group))], ["Nhân sự & Tiền lương"]);
  assert.equal(byKey.has("AlumDoor QR Station"), false, "technical station CRUD must stay out of small-business navigation");
  assert.equal(byKey.has("AlumDoor Attendance Policy"), false, "technical policy CRUD must stay out of small-business navigation");
  assert.equal(byKey.get("alumdoor-attendance:kiosk")?.label, "Thiết lập trạm chấm công");
  assert.equal(byKey.has("AlumDoor Pay Profile"), false, "generic pay-profile CRUD must stay out of Lite navigation");
  assert.deepEqual(byKey.get("alumdoor-attendance:employees-lite")?.required_roles, ["AlumDoor Payroll Approver", "HR Manager", "System Manager"]);
});
