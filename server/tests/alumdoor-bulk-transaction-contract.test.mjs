import assert from "node:assert/strict";
import test from "node:test";

import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";

async function alumdoorManifest() {
  const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
  assert.equal(brief.version, "2.2.1");
  const schemaErrors = await validateBriefSchema(brief);
  assert.deepEqual(schemaErrors, []);
  return parseAppManifest(compileBrief(brief));
}

test("Alumdoor 2.2.1 compiles Purchase Receipt Bulk Transaction through canonical manifest parser", async () => {
  const manifest = await alumdoorManifest();
  const action = manifest.actions.find((entry) => entry.name === "nhap-nhom-hang-loat");
  assert.ok(action, "missing nhap-nhom-hang-loat action");
  assert.equal(action.permission_doctype, "Purchase Receipt");
  assert.equal(action.preview?.method, "alumdoor.purchase.preview_bulk_fifo_receipt");
  assert.equal(action.commit.method, "alumdoor.purchase.bulk_fifo_receipt");

  const field = action.fields.find((entry) => entry.fieldname === "lines");
  assert.ok(field, "missing lines field");
  assert.equal(field.fieldtype, "Text");
  assert.ok(field.options?.startsWith("BulkTransaction:"));
  const spec = JSON.parse(field.options.slice("BulkTransaction:".length));
  assert.equal(spec.minRows, 1);
  assert.equal(spec.maxRows, 100);
  assert.equal(spec.allowPaste, true);
  assert.deepEqual(spec.columns.map((column) => column.fieldname), [
    "item_code",
    "length_m",
    "qty_bar",
    "actual_weight_kg",
    "rate",
    "color",
    "is_stamped",
  ]);
  assert.ok(spec.columns.every((column) => column.required));
});

test("Alumdoor 2.2.1 compiles Stock Reconciliation Bulk Transaction as draft-only controller-backed flow", async () => {
  const manifest = await alumdoorManifest();
  const action = manifest.actions.find((entry) => entry.name === "kiem-ke-hang-loat");
  assert.ok(action, "missing kiem-ke-hang-loat action");
  assert.equal(action.permission_doctype, "Stock Reconciliation");
  assert.equal(action.preview?.method, "alumdoor.inventory.preview_bulk_reconciliation");
  assert.equal(action.commit.method, "alumdoor.inventory.bulk_reconciliation");
  assert.match(action.description ?? "", /nháp/i);
  assert.match(action.description ?? "", /snapshot/i);

  const reconciliation = action.fields.find((entry) => entry.fieldname === "reconciliation");
  assert.ok(reconciliation, "missing reconciliation field");
  assert.equal(reconciliation.fieldtype, "Link");
  assert.equal(reconciliation.options, "Stock Reconciliation");
  assert.equal(reconciliation.reqd, true);

  const field = action.fields.find((entry) => entry.fieldname === "lines");
  assert.ok(field, "missing lines field");
  assert.equal(field.fieldtype, "Text");
  assert.ok(field.options?.startsWith("BulkTransaction:"));
  const spec = JSON.parse(field.options.slice("BulkTransaction:".length));
  assert.equal(spec.minRows, 1);
  assert.equal(spec.maxRows, 500);
  assert.equal(spec.allowPaste, true);
  assert.deepEqual(spec.columns.map((column) => column.fieldname), [
    "item_code",
    "batch_no",
    "counted_qty",
    "counted_weight_kg",
    "variance_reason",
    "variance_note",
    "serial_and_batch_bundle",
    "valuation_rate",
  ]);
  assert.equal(spec.columns.find((column) => column.fieldname === "counted_qty")?.required, true);
  assert.equal(spec.columns.find((column) => column.fieldname === "batch_no")?.options, "Batch");
  assert.equal(spec.columns.find((column) => column.fieldname === "variance_reason")?.options, "Nguyên nhân chênh lệch");
});
