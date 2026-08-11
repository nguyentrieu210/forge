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

test("generic metadata grid contains no vertical or business-rule branches", () => {
  for (const forbidden of ["Sales Order", "Purchase Order", "Delivery Note", "Alumdoor", "Cửa Đức", "Cửa Úc", "Pricing Rule", "Item Price", "deriveSalesQuantity"]) {
    assert.equal(grid.includes(forbidden), false, `generic metadata grid must not know ${forbidden}`);
    assert.equal(smart.includes(forbidden), false, `generic smart-grid primitive must not know ${forbidden}`);
  }
});

test("permission-safe controls and spreadsheet paths use resolveField authority", () => {
  assert.match(grid, /registry\.resolve\(resolved\.field\.fieldtype\)/);
  assert.match(grid, /readOnly=\{Boolean\(readOnly \|\| resolved\.readOnly \|\| resolved\.masked\)\}/);
  assert.match(grid, /masked=\{resolved\.masked\}/);
  assert.match(grid, /dynamicLinkTarget\(resolved\.field, row\)/);
  assert.match(grid, /if \(!resolved\.visible \|\| resolved\.readOnly \|\| resolved\.masked\) continue/);
});

test("manual, paste and fill converge on one server preview seam", () => {
  assert.match(grid, /const commitEdits =/);
  assert.match(grid, /const setCell = .*commitEdits/);
  assert.match(grid, /pasteIntoGrid/);
  assert.match(grid, /const fillDown =/);
  assert.match(grid, /commitEdits\(edits\)/);
  assert.match(grid, /previewTargets\.forEach/);
  assert.match(grid, /services\.callPost<ChildRowPreviewResult>\(previewMethod/);
  assert.match(grid, /changed_field: changedField/);
  assert.match(grid, /child_fields: childFields/);
});

test("server preview is stale-safe, allowlisted and hydration does not dirty persisted rows", () => {
  assert.match(grid, /previewVersion\.current\.get\(key\) !== version/);
  assert.match(grid, /childFields\.includes\(fieldname\)/);
  assert.match(grid, /firstHydration \? "__hydrate__" : "__parent__"/);
  assert.match(grid, /!firstHydration\)/);
  assert.match(grid, /if \(applyValues\)/);
  assert.match(grid, /field_overrides/);
});

test("duplicate clones editable values only and re-enters server preview", () => {
  assert.match(grid, /const cloneEditableRow =/);
  assert.match(grid, /resolved\.readOnly \|\| resolved\.masked/);
  assert.match(grid, /field\.surface === "internal"/);
  assert.match(grid, /copies\.forEach/);
  assert.match(grid, /void runPreview\(firstCopyIndex \+ offset, copy, changedField\)/);
});

test("fill-down only fills blank selected targets", () => {
  assert.match(grid, /selectedSet\.has\(smartGridRowKey\(row, rowIndex\)\)/);
  assert.match(grid, /if \(!isBlank\(row\[field\.fieldname\]\)\) return/);
});

test("smart spreadsheet parser covers quoted TSV, headers, locale numbers and cell errors", () => {
  assert.match(smart, /parseSmartGridTsv/);
  assert.match(smart, /quoted/);
  assert.match(smart, /planSmartGridPaste/);
  assert.match(smart, /headerAware/);
  assert.match(smart, /normalizeNumericClipboard/);
  assert.match(grid, /Giá trị dán không hợp lệ/);
  assert.match(grid, /cellErrors/);
});

test("adaptive columns, internal suppression and schema-versioned layout are generic", () => {
  assert.match(smart, /applicableSmartGridColumns/);
  assert.match(smart, /surface === "internal"/);
  assert.match(smart, /smartGridLayoutKey/);
  assert.match(smart, /policyVersion/);
  assert.match(smart, /localStorage/);
  assert.match(smart, /orderedSmartGridColumns/);
});

test("metadata-owned grid keeps mature operator tools", () => {
  for (const feature of ["selectedRows", "duplicateSelection", "moveSelection", "undoDelete", "columnSettingsOpen", "resizeColumn", "fillDown", "pasteIntoGrid", "handleCellKey", "detailRow", "fullscreen", "addManyCount"]) {
    assert.match(grid, new RegExp(feature));
  }
});

test("keyboard navigation can append a writable row at the grid edge", () => {
  assert.match(grid, /const appendAndFocus =/);
  assert.match(grid, /rowIndex === rows\.length - 1/);
  assert.match(grid, /newRow\(childMeta, rowDefaults\)/);
});

test("column settings never offer internal or masked candidates", () => {
  assert.match(grid, /field\.surface === "internal" \|\| field\.editMode === "hidden"/);
  assert.match(grid, /resolved\.visible && !resolved\.masked/);
});

test("mobile cards, detail and fullscreen remain first-class", () => {
  assert.match(grid, /md:hidden/);
  assert.match(grid, /md:block/);
  assert.match(grid, /data-smart-child-grid="true"/);
  assert.match(grid, /Chi tiết/);
  assert.match(grid, /Mở toàn màn hình/);
});
