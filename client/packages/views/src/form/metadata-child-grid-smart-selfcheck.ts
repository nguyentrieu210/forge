import assert from "node:assert/strict";
import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import {
  applicableSmartGridColumns,
  moveSmartGridRows,
  orderedSmartGridColumns,
  parseSmartGridPastedValue,
  parseSmartGridTsv,
  planSmartGridPaste,
  restoreSmartGridRows,
  smartGridLayoutKey,
  type SmartGridLayout,
} from "./metadata-child-grid-smart.js";

const fields: DocField[] = [
  { fieldname: "item", label: "Mặt hàng", fieldtype: "Data", surface: "quick" },
  { fieldname: "qty", label: "Số lượng", fieldtype: "Float", surface: "quick" },
  { fieldname: "note", label: "Ghi chú", fieldtype: "Data", surface: "expanded" },
  { fieldname: "snapshot", label: "Snapshot", fieldtype: "Data", surface: "internal" },
  { fieldname: "locked", label: "Khóa", fieldtype: "Data", surface: "quick", read_only: 1 },
];
const meta: DocTypeMeta = {
  name: "Demo Child",
  kind: "child_table",
  istable: 1,
  fields,
  permissions: [],
  viewPolicy: {
    list: { enabled: false },
    form: { enabled: true, columns: ["item", "qty", "note", "snapshot", "locked"] },
    quickEntry: { enabled: true, columns: ["item", "qty", "locked"] },
  },
};
const rows: Doc[] = [
  { name: "R1", doctype: meta.name, item: "A", qty: 1 },
  { name: "R2", doctype: meta.name, item: "B", qty: 2 },
  { name: "R3", doctype: meta.name, item: "C", qty: 3 },
] as Doc[];

assert.deepEqual(parseSmartGridTsv('A\t"B\tC"\n"D\nE"\tF'), [["A", "B\tC"], ["D\nE", "F"]]);

const headerPlan = planSmartGridPaste("Mặt hàng\tSố lượng\nX\t1.234,5", fields.slice(0, 2), 0);
assert.equal(headerPlan.headerAware, true);
assert.deepEqual(headerPlan.columnIndexes, [0, 1]);
assert.deepEqual(headerPlan.matrix, [["X", "1.234,5"]]);

const positionalPlan = planSmartGridPaste("X\t2", fields.slice(0, 2), 0);
assert.equal(positionalPlan.headerAware, false);
assert.deepEqual(positionalPlan.columnIndexes, [0, 1]);
assert.equal(parseSmartGridPastedValue(fields[1], "1.234,5"), 1234.5);
assert.equal(parseSmartGridPastedValue(fields[1], "1,234.5"), 1234.5);

const layout: SmartGridLayout = {
  widths: {},
  order: ["qty", "item", "locked"],
  hidden: ["qty", "item"],
  pinned: [],
  labels: {},
};
assert.deepEqual(orderedSmartGridColumns(fields.slice(0, 3), layout, "item").map((field) => field.fieldname), ["item", "note"]);

const applicable = applicableSmartGridColumns(fields, meta, rows, undefined, undefined, {});
assert.deepEqual(applicable.map((field) => field.fieldname), ["item", "qty", "note", "locked"]);

const moved = moveSmartGridRows(rows, new Set(["R2", "R3"]), -1);
assert.deepEqual(moved.map((row) => row.name), ["R2", "R3", "R1"]);
const restored = restoreSmartGridRows([rows[0], rows[2]], [{ row: rows[1], index: 1 }]);
assert.deepEqual(restored.map((row) => row.name), ["R1", "R2", "R3"]);

const key1 = smartGridLayoutKey(meta, "compact", fields.slice(0, 2));
const key2 = smartGridLayoutKey(meta, "compact", [...fields.slice(0, 2), fields[2]]);
assert.notEqual(key1, key2);

console.log("metadata child-grid smart selfcheck: ok");
