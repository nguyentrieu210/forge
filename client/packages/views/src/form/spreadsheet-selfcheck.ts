import { strict as assert } from "node:assert";
import type { DocField } from "@metaforge/core";
import { parseSpreadsheetCell, parseSpreadsheetClipboard, planSpreadsheetColumns } from "./spreadsheet.js";

const columns: DocField[] = [
  { fieldname: "item_code", label: "Mã hàng", fieldtype: "Data" },
  { fieldname: "qty", label: "Số lượng", fieldtype: "Float", non_negative: 1 },
  { fieldname: "status", label: "Trạng thái", fieldtype: "Select", options: "Open\nClosed" },
];

assert.deepEqual(
  parseSpreadsheetClipboard('"A\tB"\t1\r\n"Hai ""dòng"""\t2'),
  [["A\tB", "1"], ['Hai "dòng"', "2"]],
  "quoted Excel cells keep tabs and escaped quotes",
);

const header = planSpreadsheetColumns(columns, ["Trạng thái", "Mã hàng", "Số lượng"], 0);
assert.equal(header.headerMapped, true);
assert.deepEqual(header.fields.map((field) => field?.fieldname), ["status", "item_code", "qty"]);
assert.equal(header.dataStart, 1);

const positional = planSpreadsheetColumns(columns, ["ITEM-1", "2", "Open"], 1);
assert.equal(positional.headerMapped, false);
assert.deepEqual(positional.fields.map((field) => field?.fieldname), ["qty", "status"]);

assert.equal(parseSpreadsheetCell(columns[1]!, "1.234,56", "#.###,##").value, 1234.56);
assert.equal(parseSpreadsheetCell(columns[1]!, "1,234.56", "#,###.##").value, 1234.56);
assert.equal(parseSpreadsheetCell(columns[1]!, "3.5", "#.###,##").value, 3.5, "single decimal separator is not mistaken for thousands grouping");
assert.equal(parseSpreadsheetCell(columns[1]!, "-2", "#.###,##").ok, false, "canonical non_negative rule runs during paste");
assert.equal(parseSpreadsheetCell(columns[2]!, "Other").ok, false, "Select paste is validated against canonical options");
assert.equal(parseSpreadsheetCell(columns[2]!, "Open").ok, true);

console.log("spreadsheet selfcheck OK — TSV/header/locale/validation");
