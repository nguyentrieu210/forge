import assert from "node:assert/strict";
import test from "node:test";
import { salesItemSearchTerms } from "../dist/app/vertical/alumdoor/sales-item-search.js";

test("opening the sales item dropdown loads its first page", () => {
  assert.deepEqual(salesItemSearchTerms(""), [""]);
  assert.deepEqual(salesItemSearchTerms("   "), [""]);
});

test("typed sales item searches keep raw, accent-free, and word variants", () => {
  const terms = salesItemSearchTerms("Cửa cuốn Đức");
  for (const expected of ["Cửa cuốn Đức", "cua cuon duc", "Cửa", "cuốn", "Đức", "cua", "cuon", "duc", "cửa", "cuốn", "đức", "cuacuonduc", "ccd"]) {
    assert.ok(terms.includes(expected), `missing smart-search term ${expected}`);
  }
});

test("sales item search understands Alumdoor shorthand and punctuation", () => {
  const terms = salesItemSearchTerms("DL-XN VK trọn_bộ");
  for (const expected of ["DL", "XN", "VK", "TRONBO", "đài loan", "xanh ngọc", "vân kẽm", "trọn bộ"]) {
    assert.ok(terms.includes(expected), `missing shorthand expansion ${expected}`);
  }
});
