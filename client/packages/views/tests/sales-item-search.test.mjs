import assert from "node:assert/strict";
import test from "node:test";
import { salesItemSearchTerms } from "../dist/app/vertical/alumdoor/sales-item-search.js";

test("opening the sales item dropdown loads its first page", () => {
  assert.deepEqual(salesItemSearchTerms(""), [""]);
  assert.deepEqual(salesItemSearchTerms("   "), [""]);
});

test("typed sales item searches keep raw, accent-free, and word variants", () => {
  assert.deepEqual(
    salesItemSearchTerms("Cửa cuốn Đức"),
    ["Cửa cuốn Đức", "cua cuon duc", "Cửa", "cuốn", "Đức", "cua", "cuon", "duc"],
  );
});
