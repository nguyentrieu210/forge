import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const workspace = await readFile(new URL("../src/app/DoctypeWorkspace.tsx", import.meta.url), "utf8");
const container = await readFile(new URL("../src/matrix/MatrixContainer.tsx", import.meta.url), "utf8");
const bulk = await readFile(new URL("../src/bulk/BulkGridContainer.tsx", import.meta.url), "utf8");

test("workspace selects Matrix from metadata rather than a business-name conditional", () => {
  assert.match(workspace, /viewPolicy\?\.matrix\?\.enabled/);
  assert.match(workspace, /<MatrixContainer\s+doctype=/);
  assert.doesNotMatch(workspace, /doctype\s*={2,3}\s*["'`]Item Price["'`]/);
  assert.doesNotMatch(workspace, /isPriceListManager/);
});

test("generic Matrix container owns only named source/action transport", () => {
  assert.match(container, /metaforge\.matrix\.read/);
  assert.match(container, /metaforge\.matrix\.action/);
  for (const forbidden of ["Item Price", "Price List", "Supplier Item", "Warehouse", "Alumdoor", "UOM"]) {
    assert.equal(container.includes(forbidden), false, `generic MatrixContainer leaked domain term ${forbidden}`);
  }
  assert.doesNotMatch(container, /adapter\.(?:createDoc|updateDoc|deleteDoc)\s*\(/);
});

test("legacy Item Price fallback remains isolated until the parity removal gate passes", () => {
  const hits = [...bulk.matchAll(/props\.doctype\s*={2,3}\s*["'`]Item Price["'`]/g)];
  assert.equal(hits.length, 1);
  assert.match(bulk, /ItemPriceMatrixPanel/);
});
