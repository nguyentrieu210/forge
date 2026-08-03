import assert from "node:assert/strict";
import test from "node:test";

import { parseAppManifestWithInputTables } from "../dist/packages/app-registry/src/index.js";
import { compileBrief } from "../scripts/lib/compile-brief-app-factory.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";

test("Alumdoor Item Price Matrix sidecar survives canonical App Factory transport", async () => {
  const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
  const itemPriceSource = brief.doctypes.find((entry) => entry.name === "Item Price");
  assert.ok(itemPriceSource?.matrix, "Item Price Matrix metadata must be attached by the view sidecar");

  const schemaErrors = await validateBriefSchema(brief);
  assert.deepEqual(schemaErrors, []);

  const manifest = parseAppManifestWithInputTables(compileBrief(brief));
  const itemPrice = manifest.doctypes.find((entry) => entry.name === "Item Price");
  assert.ok(itemPrice, "compiled Alumdoor manifest is missing Item Price");
  const matrix = itemPrice.viewPolicy?.matrix;
  assert.equal(matrix?.enabled, true);
  assert.equal(matrix.navigator.source.name, "pricing.item_price_matrix.read");
  assert.equal(matrix.rowAxis.source.name, "pricing.item_price_matrix.read");
  assert.equal(matrix.columnAxis.source.name, "pricing.item_price_matrix.read");
  assert.equal(matrix.cell.source.name, "pricing.item_price_matrix.read");
  assert.equal(matrix.write.strategy, "action");
  assert.equal(matrix.write.action, "pricing.item_price_matrix.commit");
  assert.equal(matrix.rowAxis.primaryField, "is_primary");
  assert.equal(matrix.rowAxis.auxiliaryFields[0].field, "conversion_factor");
  assert.equal(matrix.cell.validation, "non_negative");
  assert.equal(matrix.presentation.mobileMode, "step");

  // Compatibility remains on the established legacy mobile.bulk bridge until the
  // Matrix parity/removal gate is green. Do not invent a second canonical Bulk claim here.
  assert.equal(itemPrice.viewPolicy?.mobile?.bulk?.enabled, true);
});