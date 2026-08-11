import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brief = JSON.parse(readFileSync(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
const salesOrder = brief.doctypes.find((row) => row?.name === "Sales Order");

function field(name) {
  return salesOrder?.fields?.find((row) => typeof row === "object" && row?.fieldname === name);
}

test("Sales Order materializes metadata-driven commercial summary", () => {
  assert.ok(salesOrder, "Sales Order metadata is required");

  const summary = field("sales_summary_section");
  assert.equal(summary?.fieldtype, "Section Break");
  assert.equal(summary?.label, "Tổng kết");
  assert.equal(summary?.form_section_style, "summary");

  const expected = [
    ["total_amount", "Tổng cộng tiền hàng", "Currency", true],
    ["discount_amount", "Tiền chiết khấu", "Currency", true],
    ["surcharge_amount", "Phụ thu", "Currency", true],
    ["vat_rate", "% VAT", "Percent", false],
    ["vat_amount", "Số tiền VAT", "Currency", true],
    ["grand_total", "Tiền phải thu", "Currency", true],
  ];

  for (const [name, label, fieldtype, readOnly] of expected) {
    const current = field(name);
    assert.ok(current, `missing Sales Order summary field ${name}`);
    assert.equal(current.label, label, `${name} label`);
    assert.equal(current.fieldtype, fieldtype, `${name} fieldtype`);
    assert.equal(Boolean(current.read_only), readOnly, `${name} read_only`);
    assert.equal(current.form_width, "full", `${name} form_width`);
  }

  const names = salesOrder.fields.map((row) => typeof row === "object" ? row.fieldname : String(row).split(":")[0].trim());
  const start = names.indexOf("sales_summary_section");
  assert.ok(start > names.indexOf("items"), "summary must render below line items");
  assert.deepEqual(names.slice(start + 1, start + 7), expected.map(([name]) => name));

  assert.equal(salesOrder.form?.previewMethod, "alumdoor.ui.preview_document");
  for (const dependency of ["items", "vat_rate"]) {
    assert.ok(salesOrder.form?.previewParentFields?.includes(dependency), `preview must react to ${dependency}`);
  }
});
