import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixtureUrl = new URL("../../docs/agents/ui-factory/fixtures/alumdoor-item-price-matrix-reference.json", import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

function scenarioMap(fixture) {
  return new Map(fixture.scenarios.map((scenario) => [scenario.id, scenario]));
}

test("UI04 reference fixture covers the Alumdoor matrix acceptance specimen", async () => {
  const fixture = await loadFixture();
  const { catalog } = fixture;

  assert.equal(fixture.fixtureVersion, "1.0.0");
  assert.ok(catalog.priceLists.length >= 4, "need multiple effective-dated columns");
  assert.ok(catalog.priceLists.some((column) => column.disabled), "need a disabled column");
  assert.ok(catalog.priceLists.every((column) => /^\d{4}-\d{2}-\d{2}$/.test(column.effectiveDate)), "every column needs an effective date");

  const groupKeys = new Set(catalog.groups.map((group) => group.key));
  assert.ok(catalog.groups.some((group) => group.parentKey && groupKeys.has(group.parentKey)), "need a multi-level navigator");
  assert.ok(catalog.groups.some((group) => group.label === "Nhôm"), "need a Vietnamese accent-search specimen");
  assert.ok(catalog.groups.some((group) => group.label === "Dịch vụ"), "need service ordering specimen");

  assert.ok(new Set(catalog.items.map((item) => item.stockUom)).size >= 3, "need different primary-row patterns");
  assert.ok(catalog.items.some((item) => item.conversions.length >= 2), "need an item with multiple conversion rows");

  const selected = catalog.items.find((item) => item.key === fixture.initialSelection.itemKey);
  assert.ok(selected, "selected reference item must exist");
  assert.equal(selected.stockUom, fixture.initialSelection.stockRowKey);
  assert.deepEqual(
    new Set([selected.stockUom, selected.defaultPurchaseUom, selected.defaultSalesUom, ...selected.conversions.map((row) => row.uom)]),
    new Set(fixture.initialSelection.expectedRows),
    "selected row-axis membership must be deterministic",
  );

  const selectedCellCount = catalog.cells.filter((cell) => cell.itemKey === selected.key).length;
  const selectedCartesian = fixture.initialSelection.expectedRows.length * catalog.priceLists.length;
  assert.ok(selectedCellCount > 0 && selectedCellCount < selectedCartesian, "selected matrix must contain sparse cells");
});

test("UI04 fixture locks create, update, row mutation, conflict and large-catalog cases", async () => {
  const fixture = await loadFixture();
  const scenarios = scenarioMap(fixture);
  const required = [
    "accent-insensitive-search",
    "selected-column-first",
    "update-existing-cell",
    "create-missing-cell",
    "remove-non-primary-row",
    "reject-primary-row-removal",
    "add-row-and-cell",
    "disabled-column-readonly",
    "large-catalog-last-page",
    "mobile-step-flow",
    "conflict-feedback",
  ];
  for (const id of required) assert.ok(scenarios.has(id), `missing scenario ${id}`);

  const update = scenarios.get("update-existing-cell");
  const existingCell = fixture.catalog.cells.find((cell) => cell.key === update.input.cellKey);
  assert.ok(existingCell, "update scenario must target an existing sparse cell");
  assert.equal(update.expected.operation, "update");
  assert.equal(update.expected.versionRequired, existingCell.version);

  const create = scenarios.get("create-missing-cell");
  assert.equal(
    fixture.catalog.cells.some((cell) => cell.itemKey === create.input.itemKey && cell.rowKey === create.input.rowKey && cell.columnKey === create.input.columnKey),
    false,
    "create scenario must target a missing intersection",
  );

  const remove = scenarios.get("remove-non-primary-row");
  assert.notEqual(remove.input.rowKey, fixture.initialSelection.stockRowKey, "remove scenario must not target the primary row");
  for (const key of remove.expected.affectedCellKeys) assert.ok(fixture.catalog.cells.some((cell) => cell.key === key), `affected cell ${key} must exist`);

  const pagination = fixture.catalog.generatedCatalog;
  assert.ok(pagination.count >= 401, "fixture must cross the third 200-row page boundary");
  assert.deepEqual(pagination.pageStarts, [0, 200, 400]);
  assert.ok(pagination.anchors.some((anchor) => anchor.ordinal === 401));
  assert.ok(pagination.anchors.some((anchor) => anchor.ordinal === pagination.count));
  assert.equal(scenarios.get("large-catalog-last-page").expected.pageStart, 400);
});

test("UI04 semantic Matrix mapping stays business-neutral and declares convergence capabilities", async () => {
  const fixture = await loadFixture();
  const mapping = fixture.genericMatrixMapping;
  const serialized = JSON.stringify(mapping).toLowerCase();

  for (const forbidden of ["item price", "price list", "uom", "alumdoor"]) {
    assert.equal(serialized.includes(forbidden), false, `generic mapping leaked business literal: ${forbidden}`);
  }

  assert.equal(mapping.kind, "matrix");
  assert.equal(typeof mapping.readSourceRef, "string");
  assert.equal(typeof mapping.permissionBoundaryRef, "string");
  assert.equal(mapping.cell.sourceRef, "cells.sparse");
  assert.equal(mapping.cell.versionPath, "version");
  assert.equal(mapping.rowAxis.memberActions.primaryMemberRemovable, false);
  assert.equal(mapping.columnAxis.selectedFirst, true);
  assert.equal(mapping.interactionPolicy.stickyHeader, true);
  assert.equal(mapping.interactionPolicy.stickyRowAxis, true);
  assert.equal(mapping.interactionPolicy.dirtyIndicator, true);
  assert.equal(mapping.interactionPolicy.unsavedChangeGuard, true);
  assert.equal(mapping.dataPolicy.sparseCells, true);
  assert.equal(mapping.dataPolicy.noPerCellFetch, true);
  assert.deepEqual(mapping.responsivePolicy, {
    desktop: "split_navigator_matrix",
    tablet: "split_navigator_matrix",
    mobile: "navigator_then_matrix_steps",
  });

  for (const ref of [
    mapping.readSourceRef,
    mapping.permissionBoundaryRef,
    mapping.actionRefs.commit,
    mapping.actionRefs.createColumn,
    mapping.actionRefs.addRowMember,
    mapping.actionRefs.removeRowMember,
  ]) {
    assert.equal(typeof fixture.domainBindings[ref], "string", `missing app-side binding for ${ref}`);
  }
});

test("UI04 reference explicitly refuses to freeze current architectural debt as parity", async () => {
  const fixture = await loadFixture();
  const debtIds = new Set(fixture.currentDebtNotToFreezeAsParity.map((entry) => entry.id));
  for (const required of [
    "client-compound-write",
    "partial-save-risk",
    "no-dirty-guard",
    "no-keyboard-matrix-navigation",
    "fixed-three-page-item-fetch",
    "disabled-column-toggle-quirk",
  ]) {
    assert.ok(debtIds.has(required), `missing explicit debt classification ${required}`);
  }
});
