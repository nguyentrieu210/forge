import test from "node:test";
import assert from "node:assert/strict";
import {
  ALUMDOOR_UOM_ALIASES,
  ALUMDOOR_UOM_CATALOG,
  canonicalAlumdoorUom,
} from "../scripts/lib/alumdoor-uom-catalog.mjs";

test("Alumdoor UOM catalogue has exactly 19 canonical records", () => {
  assert.equal(ALUMDOOR_UOM_CATALOG.length, 19);
  assert.equal(new Set(ALUMDOOR_UOM_CATALOG.map(({ name }) => name)).size, 19);
  assert.deepEqual(
    ALUMDOOR_UOM_CATALOG.map(({ name }) => name),
    ["Cái", "Bộ", "Kg", "Mét", "m2", "Cây", "Lá", "Thân", "Thanh", "Sợi", "Cuộn", "Tấm", "Túi", "Hộp", "Thùng", "Bình", "Lít", "Cặp", "Con"],
  );
});

test("physical count UOMs are whole-number while measured/priced UOMs may be fractional", () => {
  const byName = new Map(ALUMDOOR_UOM_CATALOG.map((entry) => [entry.name, entry]));
  for (const name of ["Cây", "Lá", "Thân", "Tấm", "Cái", "Bộ"]) {
    assert.equal(byName.get(name)?.mustBeWholeNumber, true, name);
  }
  for (const name of ["Kg", "Mét", "m2", "Lít"]) {
    assert.equal(byName.get(name)?.mustBeWholeNumber, false, name);
  }
});

test("source aliases normalize into canonical UOMs instead of creating duplicate masters", () => {
  assert.equal(canonicalAlumdoorUom("M"), "Mét");
  assert.equal(canonicalAlumdoorUom("mét"), "Mét");
  assert.equal(canonicalAlumdoorUom("M²"), "m2");
  assert.equal(canonicalAlumdoorUom("M2"), "m2");
  assert.equal(canonicalAlumdoorUom("CUỐN"), "Cuộn");
  assert.equal(canonicalAlumdoorUom("TÂM"), "Tấm");
  assert.equal(ALUMDOOR_UOM_ALIASES.size, 6);
});

test("unknown packaging words are not silently promoted to canonical UOMs", () => {
  for (const value of ["BĂNG", "BẢNG", "VỈ"]) {
    assert.equal(canonicalAlumdoorUom(value), value);
    assert.equal(ALUMDOOR_UOM_CATALOG.some(({ name }) => name === value), false);
  }
});


test("known canonical packaging words normalize to catalog casing", () => {
  assert.equal(canonicalAlumdoorUom("THÙNG"), "Thùng");
});
