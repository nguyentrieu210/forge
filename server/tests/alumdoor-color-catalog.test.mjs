import test from "node:test";
import assert from "node:assert/strict";
import {
  ALUMDOOR_COLOR_CATALOG,
  alumdoorColorPayload,
  canonicalAlumdoorColor,
} from "../scripts/lib/alumdoor-color-catalog.mjs";

test("Alumdoor color catalogue has exactly 24 canonical colors from the workshop table", () => {
  assert.equal(ALUMDOOR_COLOR_CATALOG.length, 24);
  assert.equal(new Set(ALUMDOOR_COLOR_CATALOG.map((color) => color.code)).size, 24);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "Thô").length, 1);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "Sơn tĩnh điện").length, 18);
  assert.equal(ALUMDOOR_COLOR_CATALOG.filter((color) => color.finish === "Mạ").length, 5);
});

test("legacy lot color codes normalize to the names confirmed in the V2 spec", () => {
  assert.deepEqual(
    ["GS", "VK", "CF", "XF", "4004", "9512 ( TRẮNG )"].map(canonicalAlumdoorColor),
    ["GHI SẦN", "VÀNG KEM", "CAFÉ", "XÁM XINGFA", "ĐỎ ĐÔ", "TRẮNG"],
  );
  assert.equal(canonicalAlumdoorColor("THÔ"), "THÔ");
});

test("canonical colors preserve supplier codes and group scopes", () => {
  const white = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "TRẮNG"));
  const burgundy = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "ĐỎ ĐÔ"));
  const plated = alumdoorColorPayload(ALUMDOOR_COLOR_CATALOG.find((color) => color.code === "XANH NGỌC - VÀNG KEM"));
  assert.equal(white.supplier_color_code, "9512");
  assert.equal(burgundy.supplier_color_code, "4004");
  assert.deepEqual(white.applies_to_groups.map((row) => row.item_group), ["Cửa CN Đức", "Cửa siêu trường"]);
  assert.deepEqual(plated.applies_to_groups.map((row) => row.item_group), ["Cửa tấm liền Úc", "Cửa Đài Loan"]);
});
