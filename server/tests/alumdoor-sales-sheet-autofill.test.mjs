import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");
const bridge = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesAutofillBridge.ts", "utf8");
const workspace = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesModeWorkspace.tsx", "utf8");
const compactCss = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetCompact.css", "utf8");

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

test("compact operational grid keeps units visible and required inputs persistently distinguishable", () => {
  assert.match(sheet, /label: "DÀY"[\s\S]*unit: "mm"/);
  assert.match(sheet, /label: "CAO"[\s\S]*unit: "m"/);
  assert.match(sheet, /label: "RỘNG"[\s\S]*unit: "m"/);
  assert.match(sheet, /label: "DT"[\s\S]*unit: "m²"/);
  assert.match(sheet, /required \? "border-amber-400 bg-amber-50\/80"/);
  assert.match(sheet, /missing \? "border-red-500 bg-red-50/);
});

test("column width has one component authority and the shared grid allows horizontal resize", () => {
  assert.match(compactCss, /thead th\[style\*="width"\]/);
  assert.match(compactCss, /resize:\s*horizontal/);
  assert.match(compactCss, /tbody td\[data-cell\][\s\S]*width:\s*auto\s*!important/);
  assert.doesNotMatch(compactCss, /nth-child\(/);
  assert.doesNotMatch(compactCss, /data-cell\$=/);
});
