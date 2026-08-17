import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBomQuantity,
  resolveBomTemplate,
} from "../dist/apps-src/alumdoor-worker/src/bom-template-core.js";
import { parseBomTemplateRecord } from "../dist/apps-src/alumdoor-worker/src/bom-template-materializer.js";
import {
  BOM_TEMPLATE_SOURCE_CATALOG,
  bomSourceFixtureRows,
} from "../scripts/lib/alumdoor-bom-template-source-catalog.mjs";

const source = BOM_TEMPLATE_SOURCE_CATALOG.find((entry) => entry.name === "SRC-UC-KT-4D-XN-VK");

function parsedTemplate() {
  assert.ok(source);
  return parseBomTemplateRecord({ name: source.name, ...source.data });
}

test("source catalog preserves exact ĐM row coverage for CỬA ÚC KT 4D XN-VK", () => {
  assert.ok(source);
  assert.deepEqual(source.source, {
    document: "MS LIÊN BS.xlsx",
    sheet: "ĐM",
    product_row: 686,
    component_rows: [687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 705, 706, 707, 708, 709, 710, 711],
  });
  assert.equal(source.data.item_code, "TP-UC KT 4D XN-VK");
  assert.equal(source.data.source_status, "DEFERRED");
  assert.equal(source.data.disabled, true);
});

test("all source rows are classified as implemented or deferred; none silently disappear", () => {
  assert.ok(source);
  const implemented = new Set(source.data.component_rules.map((rule) => Number(rule.source_row)));
  const deferred = JSON.parse(source.data.deferred_components_json);
  const deferredRows = new Set(deferred.flatMap((entry) => entry.source_rows ?? [entry.source_row]).map(Number));
  const classified = new Set([...implemented, ...deferredRows]);
  assert.deepEqual([...classified].sort((a, b) => a - b), source.source.component_rows);
  assert.deepEqual([...implemented].sort((a, b) => a - b), [687, 688, 689, 690, 692, 694, 705, 708, 709]);
  assert.deepEqual([...deferredRows].sort((a, b) => a - b), [691, 693, 695, 696, 697, 698, 699, 700, 701, 702, 703, 706, 707, 710, 711]);
});

test("implemented source formulas reproduce ĐM semantics for one configured set", () => {
  const template = parsedTemplate();
  const rules = new Map(template.component_rules.map((rule) => [rule.rule_code, rule]));
  const values = {
    PB_CAO: 3.85,
    PB_RONG: 3.65,
    billable_area_sqm: 14.0525,
  };
  const qty = (code) => evaluateBomQuantity(rules.get(code).quantity, values, code);

  assert.equal(qty("SRC-687-LEAF"), 46.431);
  assert.equal(qty("SRC-688-GIA-T"), 1);
  assert.equal(qty("SRC-689-PULY-GAI"), 1.770615);
  assert.equal(qty("SRC-690-V-DAY"), 2.01);
  assert.equal(qty("SRC-692-RAY-U70"), 13.35);
  assert.equal(qty("SRC-694-TRUC-34"), 6.885);
  assert.equal(qty("SRC-705-CUM-HAM"), 2);
  assert.equal(qty("SRC-708-GOI-SAT"), 2);
  assert.equal(qty("SRC-709-BAT-KHOA"), 0.77);
});

test("source pilot stays fail-closed until deferred rows are resolved", () => {
  const template = parsedTemplate();
  assert.throws(
    () => resolveBomTemplate({
      templates: [template],
      context: { item_code: "TP-UC KT 4D XN-VK" },
      values: { PB_CAO: 3.85, PB_RONG: 3.65, billable_area_sqm: 14.0525 },
    }),
    /Không có BOM Template phù hợp/i,
  );
});

test("fixture export is deterministic and keeps the template disabled", () => {
  const rows = bomSourceFixtureRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "BOM Template");
  assert.equal(rows[0].name, "SRC-UC-KT-4D-XN-VK");
  assert.equal(rows[0].data.disabled, true);
  assert.equal(rows[0].data.component_rules.length, 9);
  assert.equal(JSON.parse(rows[0].data.deferred_components_json).length, 7);
});
