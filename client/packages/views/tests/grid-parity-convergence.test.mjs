import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../../../../server/scripts/lib/compile-brief.mjs";
import { attachBriefUiViewPolicies } from "../../../../server/scripts/lib/brief-ui-view-policy.mjs";
import { applyAlumdoorChildPresentation } from "../../../../server/scripts/lib/alumdoor-child-presentation.mjs";

const runtime = await readFile(new URL("../src/form/MetadataChildGrid.tsx", import.meta.url), "utf8");
const smart = await readFile(new URL("../src/form/metadata-child-grid-smart.ts", import.meta.url), "utf8");

function compiledAlumdoor() {
  const brief = JSON.parse(fs.readFileSync(new URL("../../../../server/briefs/alumdoor-v2.json", import.meta.url), "utf8"));
  applyAlumdoorChildPresentation(brief);
  return attachBriefUiViewPolicies(brief, compileBrief(brief));
}

function doctype(pkg, name) {
  const value = pkg.doctypes.find((entry) => entry.name === name);
  assert.ok(value, `missing ${name}`);
  return value;
}

function viewNames(view) {
  return view?.columns ?? view?.fields ?? [];
}

test("generic smart-grid runtime exposes the locked operator interaction shell", () => {
  for (const evidence of [
    "data-smart-child-grid",
    "Tùy chỉnh cột",
    "Thêm nhiều",
    "Nhân bản dòng đã chọn",
    "Điền xuống dòng đã chọn",
    "Hoàn tác xóa dòng",
    "Mở toàn màn hình",
    "onPaste",
    "handleCellKey",
    "detailRow",
    "__hydrate__",
  ]) {
    assert.equal(runtime.includes(evidence), true, `missing smart-grid evidence: ${evidence}`);
  }
  for (const evidence of [
    "applicableSmartGridColumns",
    "smartGridLayoutKey",
    "parseSmartGridTsv",
    "planSmartGridPaste",
    "parseSmartGridPastedValue",
    "moveSmartGridRows",
    "restoreSmartGridRows",
  ]) {
    assert.equal(smart.includes(evidence), true, `missing generic helper evidence: ${evidence}`);
  }
});

test("generic smart-grid source contains no vertical or business-authority literals", () => {
  const joined = `${runtime}\n${smart}`;
  for (const forbidden of [
    "Alumdoor",
    "AlumDoor",
    "Cửa Đức",
    "Cửa Úc",
    "Sales Order Item",
    "Purchase Order Item",
    "Purchase Receipt Item",
    "Item Price",
    "Pricing Rule",
    "qty_bar",
    "billable_area_sqm",
  ]) {
    assert.equal(joined.includes(forbidden), false, `generic smart grid leaked business literal: ${forbidden}`);
  }
});

test("converged AlumDoor Sales metadata exposes operator choice/server money and hides policy snapshots", () => {
  const pkg = compiledAlumdoor();
  for (const name of ["Quotation Item", "Sales Order Item"]) {
    const sales = doctype(pkg, name);
    const fields = new Map(sales.fields.map((field) => [field.fieldname, field]));
    const quick = new Set(viewNames(sales.viewPolicy?.quickEntry));
    const full = new Set(viewNames(sales.viewPolicy?.form));
    for (const fieldname of ["sales_option", "discount_amount", "adjustment_amount", "net_amount"]) {
      assert.equal(quick.has(fieldname), true, `${name}.${fieldname} missing from compact operator surface`);
    }
    for (const fieldname of ["discount_amount", "adjustment_amount", "net_amount"]) {
      assert.equal(Boolean(fields.get(fieldname)?.read_only), true, `${name}.${fieldname} must remain server-owned`);
    }
    for (const fieldname of [
      "sales_mode",
      "discount_percentage",
      "price_variant",
      "discount_basis_variant",
      "sales_package",
      "sales_package_snapshot",
      "sales_order_row_id",
    ]) {
      if (!fields.has(fieldname)) continue;
      assert.equal(quick.has(fieldname), false, `${name}.${fieldname} leaked to compact`);
      assert.equal(full.has(fieldname), false, `${name}.${fieldname} leaked to full`);
      assert.equal(fields.get(fieldname)?.surface, "internal", `${name}.${fieldname} must be internal`);
    }
  }
});

test("converged procurement metadata stays compact while conditional detail remains reachable", () => {
  const pkg = compiledAlumdoor();
  for (const name of ["Purchase Order Item", "Purchase Receipt Item"]) {
    const purchase = doctype(pkg, name);
    const quick = new Set(viewNames(purchase.viewPolicy?.quickEntry));
    const full = new Set(viewNames(purchase.viewPolicy?.form));
    for (const fieldname of ["item_code", "qty", "uom", "rate", "amount"]) {
      assert.equal(quick.has(fieldname), true, `${name}.${fieldname} missing from compact`);
    }
    if (purchase.fields.some((field) => field.fieldname === "is_stamped")) {
      assert.equal(quick.has("is_stamped"), false, `${name}.is_stamped must not be permanently compact`);
      assert.equal(full.has("is_stamped"), true, `${name}.is_stamped must remain reachable in detail`);
    }
  }

  const receipt = doctype(pkg, "Purchase Receipt Item");
  const receiptFields = new Set(receipt.fields.map((field) => field.fieldname));
  const receiptFull = new Set(viewNames(receipt.viewPolicy?.form));
  for (const fieldname of ["length_m", "qty_bar", "actual_weight_kg", "condition"]) {
    if (receiptFields.has(fieldname)) assert.equal(receiptFull.has(fieldname), true, `Purchase Receipt Item.${fieldname} not reachable`);
  }
});
