import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");
const bridge = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesAutofillBridge.ts", "utf8");
const workspace = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesModeWorkspace.tsx", "utf8");
const compactCss = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetCompact.css", "utf8");
const itemContext = fs.readFileSync("server/apps-src/alumdoor-worker/src/sales-item-context.ts", "utf8");

test("AREA display reacts immediately to entered height and width without replacing billable authority", () => {
  assert.match(sheet, /const authoritative = line\.formula\?\.area_per_set_sqm/);
  assert.match(sheet, /height \* width/);
  assert.match(sheet, /if \(line\.mode === "AREA"\) return Number\(line\.formula\?\.billable_area_sqm \?\? 0\)/);
  assert.doesNotMatch(sheet, /if \(line\.mode === "AREA"\) return areaPerSet\(line\)/);
});

test("selling price-list autofill uses active master rows and never synthesizes a numeric price", () => {
  assert.match(bridge, /fields: \["name", "price_list_name", "disabled"\]/);
  assert.match(bridge, /preferred -> customer-group list -> standard -> sole list/);
  assert.match(bridge, /default_price_list: selected/);
  assert.match(bridge, /method !== "alumdoor\.sales\.item_context"/);
  assert.match(bridge, /itemContextQueues/);
  assert.doesNotMatch(bridge, /rate\s*:/);
  assert.doesNotMatch(bridge, /standard_rate/);
});

test("stacked adapter bridges install before sheet effects and restore in LIFO order", () => {
  assert.match(workspace, /installAlumdoorSalesCompanyContextBridge/);
  assert.match(workspace, /installAlumdoorSalesAutofillBridge/);
  assert.match(workspace, /restoreAutofill\(\);\s*restoreCompany\(\);/s);
});

test("sales UOM is an operator-selectable pricing input, not a read-only label", () => {
  assert.match(sheet, /allowed_uoms\?: string\[\]/);
  assert.match(sheet, /allowedUoms: string\[\]/);
  assert.match(sheet, /requestedUom \? \{ uom: requestedUom \} : \{\}/);
  assert.match(sheet, /const changeUom = async/);
  assert.match(sheet, /void changeUom\(lineIndex, event\.target\.value\)/);
  assert.match(sheet, /void changeUom\(index, event\.target\.value\)/);
  assert.match(sheet, /rate: null, stockQty: null/);
});

test("legacy Item Price without UOM is compatible only with the Item default sales UOM", () => {
  assert.match(itemContext, /const legacyUom = normalizedText\(legacy\?\.uom\)/);
  assert.match(itemContext, /!legacyUom && sameText\(selectedUom, defaultSalesUom\)/);
  assert.match(itemContext, /resolveItemPriceRecord\(call, priceList, itemCode, selectedUom, defaultSalesUom\)/);
  assert.match(itemContext, /Item Price đúng ĐVT đó/);
});

test("compact operational grid keeps units visible and required inputs persistently distinguishable", () => {
  assert.match(sheet, /label: "DÀY"[\s\S]*unit: "mm"/);
  assert.match(sheet, /label: "CAO"[\s\S]*unit: "m"/);
  assert.match(sheet, /label: "RỘNG"[\s\S]*unit: "m"/);
  assert.match(sheet, /label: "DT"[\s\S]*unit: "m²"/);
  assert.match(sheet, /required \? "border-amber-400 bg-amber-50\/80"/);
  assert.match(sheet, /missing \? "border-red-500 bg-red-50/);
});

test("discount is visibly editable and no unsupported German-door 15 percent default remains", () => {
  assert.match(sheet, /border-emerald-300 bg-emerald-50/);
  assert.match(sheet, /xanh = được nhập tùy chọn/);
  assert.doesNotMatch(sheet, /shouldDefaultDiscount/);
  assert.doesNotMatch(sheet, /discountPct:\s*[^\n]*"15"/);
});

test("shared grid persists column order and width, supports drag, manual resize and auto-fit", () => {
  assert.match(sheet, /ORDER_KEY/);
  assert.match(sheet, /WIDTH_KEY/);
  assert.match(sheet, /draggable/);
  assert.match(sheet, /moveColumn\(draggingColumn, column\.key\)/);
  assert.match(sheet, /beginResize\(event, column\)/);
  assert.match(sheet, /onDoubleClick/);
  assert.match(sheet, /autoFitAll/);
  assert.match(sheet, /Tự khít cột/);
  assert.match(sheet, /renderGrid\(true\)/);
  assert.doesNotMatch(compactCss, /nth-child\(/);
});
