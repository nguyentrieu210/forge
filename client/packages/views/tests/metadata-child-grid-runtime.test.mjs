import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const grid = await readFile(new URL("../src/form/MetadataChildGrid.tsx", import.meta.url), "utf8");
const smart = await readFile(new URL("../src/form/metadata-child-grid-smart.ts", import.meta.url), "utf8");
const tableControls = await readFile(new URL("../src/form/table-controls.tsx", import.meta.url), "utf8");

test("Table control routes only metadata-owned doctypes through the smart renderer", () => {
  assert.match(tableControls, /MetadataChildGrid as ChildGrid/);
  assert.match(grid, /hasMetadataChildGridPresentation\(props\.childMeta\)/);
  assert.match(grid, /<SmartMetadataChildGrid \{\.\.\.props\} \/>/);
  assert.match(grid, /<LegacyChildGrid \{\.\.\.props\} \/>/);
});

test("metadata routing does not put hooks after the legacy fallback", () => {
  const wrapperStart = grid.indexOf("export function MetadataChildGrid");
  const smartStart = grid.indexOf("function SmartMetadataChildGrid");
  const wrapper = grid.slice(wrapperStart, smartStart);
  assert.equal(/\buse(State|Effect|Memo|Ref)\s*\(/.test(wrapper), false);
  assert.equal(/if\s*\([^)]*\)\s*return[\s\S]*\buse(State|Effect|Memo|Ref)\s*\(/.test(grid.slice(smartStart)), false);
});

test("metadata child grid contains no domain or doctype branches", () => {
  for (const forbidden of ["Sales Order", "Purchase Order", "Delivery Note", "Alumdoor", "Cửa Đức", "Cửa Úc", "Ray", "Trục", "Pricing Rule", "Item Price"]) {
    assert.equal(grid.includes(forbidden), false, `generic metadata grid must not know ${forbidden}`);
    assert.equal(smart.includes(forbidden), false, `generic smart-grid primitive must not know ${forbidden}`);
  }
});

test("metadata child grid preserves permission-safe control registry rendering", () => {
  assert.match(grid, /resolveSmartGridCell/);
  assert.match(grid, /registry\.resolve\(resolved\.field\.fieldtype\)/);
  assert.match(grid, /readOnly=\{Boolean\(readOnly \|\| resolved\.readOnly \|\| resolved\.masked\)\}/);
  assert.match(grid, /masked=\{resolved\.masked\}/);
  assert.match(grid, /dynamicLinkTarget\(resolved\.field, row\)/);
});

test("metadata child grid delegates every edit path to the same server preview seam", () => {
  assert.match(grid, /const commitEdits =/);
  assert.match(grid, /const setCell = .*commitEdits/s);
  assert.match(grid, /pasteIntoGrid/);
  assert.match(grid, /commitEdits\(edits\)/);
  assert.match(grid, /const fillDown =/);
  assert.match(grid, /previewTargets\.forEach/);
  assert.match(grid, /services\.callPost<ChildRowPreviewResult>\(previewMethod/);
  assert.match(grid, /changed_field: changedField/);
  assert.match(grid, /child_fields: childFields/);
  assert.match(grid, /previewParentFields/);
});

test("server preview cannot write unknown fields and stale responses are discarded", () => {
  assert.match(grid, /previewVersion\.current\.get\(key\) !== version/);
  assert.match(grid, /if \(childFields\.includes\(fieldname\)\) nextRow\[fieldname\] = undefined/);
  assert.match(grid, /if \(childFields\.includes\(fieldname\)\) nextRow\[fieldname\] = value/);
  assert.match(grid, /field_overrides/);
});

test("metadata-owned grid keeps mature operator tools", () => {
  for (const feature of [
    "selectedRows",
    "duplicateSelection",
    "moveSelection",
    "undoDelete",
    "columnSettingsOpen",
    "resizeColumn",
    "fillDown",
    "pasteIntoGrid",
    "handleCellKey",
    "detailRow",
    "fullscreen",
    "addManyCount",
  ]) assert.match(grid, new RegExp(feature));
});

test("smart-grid primitive provides adaptive columns and schema-versioned persisted layout", () => {
  assert.match(smart, /applicableSmartGridColumns/);
  assert.match(smart, /resolveSmartGridCell/);
  assert.match(smart, /surface === "internal"/);
  assert.match(smart, /smartGridLayoutKey/);
  assert.match(smart, /policyVersion/);
  assert.match(smart, /localStorage/);
  assert.match(smart, /orderedSmartGridColumns/);
});

test("spreadsheet path handles quoted TSV, header mapping and locale numerics", () => {
  assert.match(smart, /parseSmartGridTsv/);
  assert.match(smart, /quoted/);
  assert.match(smart, /planSmartGridPaste/);
  assert.match(smart, /headerAware/);
  assert.match(smart, /normalizeNumericClipboard/);
  assert.match(smart, /parseSmartGridPastedValue/);
});

test("paste and fill cannot bypass hidden, read-only or masked field resolution", () => {
  assert.match(grid, /if \(!resolved\.visible \|\| resolved\.readOnly \|\| resolved\.masked\) continue/);
  assert.match(smart, /Boolean\(resolved\.readOnly\)/);
  assert.match(smart, /Boolean\(resolved\.masked\)/);
});

test("mobile cards remain first-class while desktop gains smart-grid controls", () => {
  assert.match(grid, /md:hidden/);
  assert.match(grid, /md:block/);
  assert.match(grid, /data-smart-child-grid="true"/);
  assert.match(grid, /Chi tiết/);
  assert.match(grid, /Mở toàn màn hình/);
});
