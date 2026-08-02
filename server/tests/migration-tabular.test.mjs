import test from "node:test";
import assert from "node:assert/strict";
import { adaptTabularGrid } from "../dist/packages/migration/src/public.js";

test("tabular adapter preserves headers and skips blank rows", () => {
  const source = adaptTabularGrid({
    source_id: "items.xlsx",
    source_kind: "excel",
    grid: [
      ["Mã hàng", "Tên hàng", "Ngày"],
      ["AL71", "Nhôm 71", new Date("2026-08-03T00:00:00.000Z")],
      ["", "", ""],
      ["AL72", "Nhôm 72", null],
    ],
    key_column: "Mã hàng",
  });
  assert.deepEqual(source.headers, ["Mã hàng", "Tên hàng", "Ngày"]);
  assert.equal(source.rows.length, 2);
  assert.equal(source.rows[0]["Ngày"], "2026-08-03T00:00:00.000Z");
  assert.equal(source.rows[1]["Mã hàng"], "AL72");
  assert.equal(source.key_field, "Mã hàng");
});

test("tabular adapter rejects duplicate or blank headers instead of guessing", () => {
  assert.throws(() => adaptTabularGrid({
    source_id: "bad.csv", source_kind: "csv", grid: [["name", "name"], ["A", "B"]],
  }), /Duplicate source header/);
  assert.throws(() => adaptTabularGrid({
    source_id: "bad.xlsx", source_kind: "excel", grid: [["name", ""], ["A", "B"]],
  }), /blank/);
});

test("tabular adapter refuses parser-specific object cells", () => {
  assert.throws(() => adaptTabularGrid({
    source_id: "formula.xlsx", source_kind: "excel", grid: [["name", "value"], ["A", { formula: "1+1" }]],
  }), /Unsupported cell value/);
});
