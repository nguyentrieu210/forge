import assert from "node:assert/strict";
import test from "node:test";

import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";

test("Alumdoor 2.2.2 compiles Bulk Transaction action through canonical manifest parser", async () => {
  const brief = await readBriefSource(new URL("../briefs/alumdoor-v2.json", import.meta.url));
  assert.equal(brief.version, "2.2.2");

  const schemaErrors = await validateBriefSchema(brief);
  assert.deepEqual(schemaErrors, []);

  const manifest = parseAppManifest(compileBrief(brief));
  const action = manifest.actions.find((entry) => entry.name === "nhap-nhom-hang-loat");
  assert.ok(action, "missing nhap-nhom-hang-loat action");
  assert.equal(action.permission_doctype, "Purchase Receipt");
  assert.equal(action.preview?.method, "alumdoor.purchase.preview_bulk_fifo_receipt");
  assert.equal(action.commit.method, "alumdoor.purchase.bulk_fifo_receipt");

  const postingAt = action.fields.find((entry) => entry.fieldname === "posting_at");
  assert.ok(postingAt, "missing posting_at field");
  assert.equal(postingAt.fieldtype, "Datetime");

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

test("bulk receipt source preserves user posting time in both idempotency and created receipt", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../apps-src/alumdoor-worker/src/bulk-purchase-fifo-receipt.ts", import.meta.url),
    "utf8",
  ));
  assert.match(source, /normalizePostingAt\(raw\.posting_at\)/);
  assert.match(source, /bulkFingerprint\(supplier, warehouse, supplierInvoiceNo, driver, postingAt, lines\)/);
  assert.match(source, /posting_at:\s*postingAt/);
});
