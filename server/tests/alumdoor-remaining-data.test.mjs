import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const app = compileBrief(brief);
const doctype = (name) => app.doctypes.find((entry) => entry.name === name);
const field = (doctypeName, fieldname) =>
  doctype(doctypeName)?.fields.find((entry) => entry.fieldname === fieldname);

test("Alumdoor 1.20 keeps imported history outside operational ledgers", () => {
  assert.equal(brief.version, "1.20.0");
  assert.equal(doctype("Legacy Sales Order Item")?.is_child, true);
  assert.equal(field("Legacy Sales Order", "items")?.options, "Legacy Sales Order Item");
  assert.equal(doctype("Legacy Sales Order")?.is_submittable, false);
  assert.equal(doctype("Legacy Goods Intake")?.is_submittable, false);
  assert.equal(doctype("Warranty Claim")?.is_submittable, false);
  assert.equal(field("Warranty Claim", "warranty_status")?.default, "Mới");
  assert.ok(doctype("Production Standard"));
});

test("party masters preserve source classification and internal ownership", () => {
  assert.equal(field("Customer", "customer_type")?.default, "Đại lý");
  assert.equal(field("Customer", "account_manager")?.fieldtype, "Data");
  assert.equal(field("Customer", "note")?.fieldtype, "Small Text");
  assert.equal(field("Supplier", "account_manager")?.fieldtype, "Data");
});

test("aluminium lots separate usable stock from scrap and retain migration trace", () => {
  assert.equal(field("Aluminium Lot", "quality_status")?.default, "Khả dụng");
  assert.equal(field("Aluminium Lot", "legacy_source_key")?.hidden, true);
  assert.equal(field("Aluminium Lot", "source_sheet")?.hidden, true);
  assert.equal(field("Aluminium Lot", "source_row")?.hidden, true);
  assert.ok(doctype("Aluminium Lot")?.fields.some((entry) => entry.fieldname === "warehouse"));
});

test("Alumdoor sidebar prioritises daily work and consolidates reports", () => {
  assert.deepEqual(
    [...new Set(app.nav.map((entry) => entry.group))],
    ["Bán hàng", "Kho", "Mua hàng", "Sản xuất", "Công nợ", "Bảo hành", "Báo cáo", "Danh mục"],
  );
  assert.equal(app.nav.find((entry) => entry.key === "Supplier")?.group, "Danh mục");
  assert.equal(app.nav.filter((entry) => entry.key.startsWith("report:")).length, 16);
  assert.ok(app.nav.filter((entry) => entry.key.startsWith("report:")).every((entry) => entry.group === "Báo cáo"));
  assert.deepEqual(
    app.nav.filter((entry) => entry.group === "Danh mục").slice(0, 5).map((entry) => entry.key),
    ["Item", "Item Group", "UOM", "Warehouse", "Customer"],
  );
});
