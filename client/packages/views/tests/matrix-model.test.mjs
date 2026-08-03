import test from "node:test";
import assert from "node:assert/strict";
import {
  clampColumnWindow,
  filterMatrixMembers,
  filterNavigatorNodes,
  matrixCellKey,
  nextMatrixCoordinate,
} from "../dist/matrix/model.js";

test("matrix cell keys do not collide on punctuation", () => {
  assert.notEqual(matrixCellKey("a:b", "c"), matrixCellKey("a", "b:c"));
});

test("member search is accent-insensitive and token based", () => {
  const result = filterMatrixMembers([
    { id: "r1", label: "Đơn vị tính mét", subtitle: "Kho chính" },
    { id: "r2", label: "Kilogram" },
  ], "don vi kho");
  assert.deepEqual(result.map((row) => row.id), ["r1"]);
});

test("navigator search preserves matching ancestor path", () => {
  const result = filterNavigatorNodes([{
    id: "root", label: "Root", children: [{ id: "leaf", label: "Needle", selectable: true }],
  }], "needle");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "root");
  assert.equal(result[0]?.children?.[0]?.id, "leaf");
});

test("keyboard movement clamps and supports edge jumps", () => {
  const rows = ["r1", "r2", "r3"];
  const columns = ["c1", "c2", "c3"];
  assert.deepEqual(nextMatrixCoordinate({ rowId: "r2", columnId: "c2" }, rows, columns, "ArrowRight", false), { rowId: "r2", columnId: "c3" });
  assert.deepEqual(nextMatrixCoordinate({ rowId: "r2", columnId: "c2" }, rows, columns, "ArrowDown", true), { rowId: "r3", columnId: "c2" });
  assert.deepEqual(nextMatrixCoordinate({ rowId: "r1", columnId: "c1" }, rows, columns, "ArrowLeft", false), { rowId: "r1", columnId: "c1" });
});

test("column window is bounded and never inverted", () => {
  assert.deepEqual(clampColumnWindow(10, -4, 40), { start: 0, end: 10 });
  assert.deepEqual(clampColumnWindow(10, 8, 2), { start: 8, end: 8 });
});
