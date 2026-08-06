import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");
const worker = fs.readFileSync("server/apps-src/alumdoor-worker/src/sales-wizard-context.ts", "utf8");

test("operator customer groups resolve strict price-list vocabulary", () => {
  assert.match(sheet, /type CustomerGroup = "Đại lý" \| "Bán lẻ" \| "Nhà thầu"/);
  assert.match(sheet, /function priceListMatchesGroup/);
  assert.match(sheet, /<option value="Bán lẻ">Bán lẻ<\/option>/);
  assert.match(sheet, /<option value="Đại lý">Đại lý<\/option>/);
  assert.match(sheet, /<option value="Nhà thầu">Nhà thầu<\/option>/);
  assert.match(sheet, /Chưa cấu hình Bảng giá/);
  assert.doesNotMatch(sheet, /STANDARD_PRICE_LIST/);
  assert.doesNotMatch(sheet, /Giá niêm yết/);
});

test("technical columns are explicit and auto-projected from order applicability", () => {
  for (const label of [
    "LOẠI RAY", "CAO LỌT LÒNG", "CAO PB", "CAO LƯỚI",
    "RỘNG LỌT LÒNG", "RỘNG PB RAY", "RỘNG PB NHỰA", "RỘNG CẮT LÁ",
    "DT", "SỐ LÁ",
  ]) assert.match(sheet, new RegExp(label));
  assert.match(sheet, /function columnApplies/);
  assert.match(sheet, /CORE_COLUMNS/);
  assert.match(sheet, /COLUMNS\.filter\(\(column\) => CORE_COLUMNS\.has\(column\.key\) \|\| lines\.some/);
});

test("normal catalogue items do not inherit color or geometry requirements", () => {
  assert.match(sheet, /inventory === "hàng thường"\) return "QUANTITY"/);
  assert.match(sheet, /requireColor = mode !== "QUANTITY" && checked\(profile\.require_color\)/);
  assert.match(sheet, /if \(key === "color"\) return line\.requireColor/);
});

test("door measurement authority stays in the worker", () => {
  assert.match(sheet, /alumdoor\.sales\.production_line_context/);
  assert.match(sheet, /basis_only: true/);
  assert.match(sheet, /width_input_basis: line\.widthBasis/);
  assert.match(sheet, /height_input_basis: line\.heightBasis/);
  assert.match(worker, /calculateDoorFormula/);
  assert.match(worker, /default_discount_pct: defaultDiscountPct/);
});

test("operator sheet retains save, submit, stock reservation, print and export workflows", () => {
  assert.match(sheet, /adapter\.createDoc\("Sales Order"/);
  assert.match(sheet, /adapter\.updateDoc\("Sales Order"/);
  assert.match(sheet, /adapter\.submit\("Sales Order"/);
  assert.match(sheet, /alumdoor\.cut\.reserve/);
  assert.match(sheet, /alumdoor\.cut\.release/);
  assert.match(sheet, /printRoute/);
  assert.match(sheet, /exportCsv/);
});
