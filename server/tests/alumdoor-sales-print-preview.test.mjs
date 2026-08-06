import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sheet = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorSalesSheetV2.tsx", "utf8");

test("sales sheet previews the canonical Sales Order print format before confirmation", () => {
  assert.match(sheet, /Xem trước bản in/);
  assert.match(sheet, /const printRoute = \(name: unknown\) => `\/print\/\$\{encodeURIComponent\("Sales Order"\)\}\/\$\{encodeURIComponent\(String\(name\)\)\}`/);
  assert.match(sheet, /const saved = await persistDraft\(\);[\s\S]*popup\.location\.href = printRoute\(saved\.name\);/);

  const previewButton = sheet.indexOf("Xem trước bản in");
  const confirmButton = sheet.indexOf("Xác nhận đơn");
  assert.ok(previewButton >= 0 && confirmButton >= 0 && previewButton < confirmButton, "print preview must be offered before confirmation");
});

test("print preview saves only a draft and delegates rendering to installed Print Formats", () => {
  const previewStart = sheet.indexOf("const previewPrint = async () =>");
  const previewEnd = sheet.indexOf("const addLines", previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const preview = sheet.slice(previewStart, previewEnd);

  assert.match(preview, /await persistDraft\(\)/);
  assert.doesNotMatch(preview, /adapter\.submit/);
  assert.doesNotMatch(preview, /alumdoor\.reserve\.create/);
  assert.doesNotMatch(sheet, /popup\.document\.write/);
  assert.doesNotMatch(sheet, /<!doctype html>/i);
});
