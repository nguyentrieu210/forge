import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");

function calculationModeSource() {
  const match = sheet.match(/function calculationMode\(item: Json\): CalculationMode \{([\s\S]*?)\n\}/);
  assert.ok(match, "Sales Sheet calculationMode helper must remain present");
  return match[1];
}

test("non-dimensional catalogue items do not inherit door dimensions from a parent group name", () => {
  const source = calculationModeSource();

  // PIN/MOTO/PK may live under a catalogue group whose label begins with "Cửa". That parent label
  // is not measurement authority. Only explicit ray/trục/cửa semantics or an m² sales contract may
  // activate dimensions; everything else remains quantity-only.
  assert.doesNotMatch(source, /group\.startsWith\("cửa"\)/);
  assert.match(source, /code\.startsWith\("RAY-"\)[\s\S]*return "HEIGHT"/);
  assert.match(source, /code\.startsWith\("TRUC-"\)[\s\S]*return "WIDTH"/);
  assert.match(source, /code\.startsWith\("CUA-"\)/);
  assert.match(source, /inventory === "thành phẩm theo m2"/);
  assert.match(source, /\["m2", "m²", "m\^2", "métvuông", "metvuong"\]\.includes\(salesUom\)/);
  assert.match(source, /return "QUANTITY";/);
});

test("irrelevant measurements stay out of Sales Order payloads", () => {
  assert.match(sheet, /\(line\.mode === "HEIGHT" \|\| line\.mode === "AREA"\) && positive\(line\.height\)/);
  assert.match(sheet, /\(line\.mode === "WIDTH" \|\| line\.mode === "AREA"\) && positive\(line\.width\)/);
  assert.match(sheet, /line\.mode === "AREA" && line\.widthBasis/);
});

test("item detail only renders measurement controls that apply to the selected item", () => {
  assert.match(sheet, /line\.mode === "HEIGHT" \|\| line\.mode === "AREA" \? <div className="grid gap-1\.5"><Label>\{heightBasisTitle/);
  assert.match(sheet, /line\.mode === "WIDTH" \|\| line\.mode === "AREA" \? <div className="grid gap-1\.5"><Label>\{widthBasisTitle/);
  assert.match(sheet, /line\.mode === "AREA" \? <div className="grid gap-1\.5"><Label>DT \(m²\)<\/Label>/);
  assert.match(sheet, /line\.mode === "WIDTH" \|\| line\.thickness \? <div className="grid gap-1\.5"><Label>Độ dày<\/Label>/);
});

test("print and export suppress stale dimensions on quantity-only lines", () => {
  assert.match(sheet, /const printHeight = line\.mode === "HEIGHT" \|\| line\.mode === "AREA" \? line\.height : ""/);
  assert.match(sheet, /const printWidth = line\.mode === "WIDTH" \|\| line\.mode === "AREA" \? line\.width : ""/);
  assert.match(sheet, /line\.mode === "HEIGHT" \|\| line\.mode === "AREA" \? line\.height : ""/);
  assert.match(sheet, /line\.mode === "WIDTH" \|\| line\.mode === "AREA" \? line\.width : ""/);
});
