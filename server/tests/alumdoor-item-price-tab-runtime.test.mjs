import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registry = fs.readFileSync("client/apps/runtime/src/experience-registry.tsx", "utf8");
const itemDetail = fs.readFileSync("client/apps/runtime/src/experiences/AlumdoorItemDetailWorkspace.tsx", "utf8");
const sharedWorkspace = fs.readFileSync("client/packages/views/src/app/DoctypeWorkspace.tsx", "utf8");
const priceMatrix = fs.readFileSync("client/packages/views/src/bulk/ItemPriceMatrixPanel.tsx", "utf8");
const viewsPackage = fs.readFileSync("client/packages/views/package.json", "utf8");

test("Alumdoor Item pricing tab is app-owned and does not hardcode shared DoctypeWorkspace", () => {
  assert.match(registry, /runtimeDoctypeExperienceFactories/);
  assert.match(registry, /doctype === "Item" && name && name !== "new"/);
  assert.match(registry, /AlumdoorItemDetailWorkspace/);
  assert.doesNotMatch(sharedWorkspace, /doctype === "Item"/);
  assert.doesNotMatch(sharedWorkspace, /AlumdoorItemDetailWorkspace/);
});

test("Item Giá tab reuses the existing price matrix and canonical purchase history", () => {
  assert.match(itemDetail, /<Info \/> Thông tin/);
  assert.match(itemDetail, /<Tags \/> Giá/);
  assert.match(itemDetail, /ItemPriceMatrixPanel/);
  assert.match(itemDetail, /initialItemCode=\{itemCode\}/);
  assert.match(itemDetail, /itemLocked/);
  assert.match(itemDetail, /alumdoor\.purchase\.item_price_history/);
  assert.match(itemDetail, /Lịch sử giá mua/);
  assert.doesNotMatch(itemDetail, /createDoc\("Item Price"/);
  assert.doesNotMatch(itemDetail, /updateDoc\("Item Price"/);
});

test("existing price matrix supports a locked current Item without duplicating the manager", () => {
  assert.match(priceMatrix, /initialItemCode\?: string/);
  assert.match(priceMatrix, /itemLocked\?: boolean/);
  assert.match(priceMatrix, /useState\(initialItemCode\)/);
  assert.match(priceMatrix, /itemLocked \? matrixPanel/);
  assert.match(viewsPackage, /"\.\/item-price-matrix"/);
});
