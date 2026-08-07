import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registry = fs.readFileSync("client/apps/runtime/src/experience-registry.tsx", "utf8");
const sharedWorkspace = fs.readFileSync("client/packages/views/src/app/DoctypeWorkspace.tsx", "utf8");
const priceMatrix = fs.readFileSync("client/packages/views/src/bulk/ItemPriceMatrixPanel.tsx", "utf8");
const viewsPackage = fs.readFileSync("client/packages/views/package.json", "utf8");

test("runtime no longer owns an Alumdoor Item detail override", () => {
  assert.doesNotMatch(registry, /AlumdoorItemDetailWorkspace/);
  assert.doesNotMatch(registry, /doctype === "Item"/);
  assert.doesNotMatch(registry, /runtimeDoctypeExperienceFactories/);
  assert.doesNotMatch(sharedWorkspace, /doctype === "Item"/);
  assert.doesNotMatch(sharedWorkspace, /AlumdoorItemDetailWorkspace/);
});

test("generic price matrix remains reusable without a bespoke Item workspace", () => {
  assert.match(priceMatrix, /initialItemCode\?: string/);
  assert.match(priceMatrix, /itemLocked\?: boolean/);
  assert.match(priceMatrix, /useState\(initialItemCode\)/);
  assert.match(priceMatrix, /itemLocked \? matrixPanel/);
  assert.match(viewsPackage, /"\.\/item-price-matrix"/);
});
