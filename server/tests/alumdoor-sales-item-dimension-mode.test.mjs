import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");

function calculationModeSource() {
  const match = sheet.match(/function calculationMode\(item: Json\): CalculationMode \{([\s\S]*?)\n\}/);
  assert.ok(match, "calculationMode helper must remain present");
  return match[1];
}

test("quantity, ray, shaft and area item modes remain distinct", () => {
  const source = calculationModeSource();
  assert.match(source, /inventory === "hàng thường"[\s\S]*return "QUANTITY"/);
  assert.match(source, /code\.startsWith\("RAY-"\)[\s\S]*return "HEIGHT"/);
  assert.match(source, /code\.startsWith\("TRUC-"\)[\s\S]*return "WIDTH"/);
  assert.match(source, /inventory === "thành phẩm theo m2"/);
  assert.doesNotMatch(source, /group\.startsWith\("cửa"\)/);
});

test("Sales Order payload suppresses irrelevant geometry", () => {
  assert.match(sheet, /\(line\.mode === "HEIGHT" \|\| line\.mode === "AREA"\) && positive\(line\.height\)/);
  assert.match(sheet, /\(line\.mode === "WIDTH" \|\| line\.mode === "AREA"\) && positive\(line\.width\)/);
  assert.match(sheet, /line\.mode === "AREA" && line\.widthBasis/);
  assert.match(sheet, /line\.mode === "AREA" && line\.formula\?\.policy_name/);
});

test("explicit production columns are read-only unless they are the active customer-input basis", () => {
  assert.match(sheet, /key === "heightClear"[\s\S]*sameBasis\(line\.heightBasis, "Cao lọt lòng"\)/);
  assert.match(sheet, /key === "heightCover"[\s\S]*sameBasis\(line\.heightBasis, "Cao phủ bì"\)/);
  assert.match(sheet, /key === "widthRay"[\s\S]*sameBasis\(line\.widthBasis, "Phủ bì ray"\)/);
  assert.match(sheet, /key === "widthPlastic"[\s\S]*sameBasis\(line\.widthBasis, "Phủ bì nhựa"\)/);
  assert.match(sheet, /key === "widthCut"[\s\S]*line\.formula\?\.cut_width_m/);
  assert.match(sheet, /key === "leafCount"[\s\S]*line\.formula\?\.total_leaf_count/);
});
