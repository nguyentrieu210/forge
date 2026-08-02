import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBulkBomDraftDocument,
  fingerprintBulkBomDraft,
  previewBulkBomDraft,
} from "../dist/packages/clouderp-erpnext/src/index.js";

function baseInput() {
  return {
    company: "ACME",
    item: "FG-100",
    quantity: "1",
    revision: 2,
    effective_from: "2026-08-03",
    output_uom: "Nos",
    output_conversion_factor: "1",
    rows: [
      {
        item_code: "RM-A",
        qty: "2.5",
        source_warehouse: "RAW",
        uom: "Kg",
        conversion_factor: "1",
        qty_basis: "Cố định",
      },
      {
        item_code: "RM-B",
        qty: "3",
        source_warehouse: "RAW",
        qty_basis: "Theo chiều rộng",
      },
    ],
  };
}

test("bulk BOM normalizes one parent and pasted child rows into Draft-only canonical shape", async () => {
  const input = baseInput();
  const document = buildBulkBomDraftDocument(input);

  assert.equal(document.company, "ACME");
  assert.equal(document.item, "FG-100");
  assert.equal(document.quantity, "1.000000");
  assert.equal(document.revision, 2);
  assert.equal(document.bom_status, "Draft");
  assert.equal(document.effective_from, "2026-08-03");
  assert.equal(document.output_conversion_factor, "1.000000");
  assert.equal(document.bulk_input_schema, 1);
  assert.equal(document.items.length, 2);
  assert.deepEqual(document.items.map((row) => row.row_id), ["ROW-1", "ROW-2"]);
  assert.equal(document.items[0].qty, "2.500000");
  assert.equal(document.items[0].conversion_factor, "1.000000");
  assert.equal(document.items[1].qty_basis, "Theo chiều rộng");

  const preview = await previewBulkBomDraft(input);
  assert.equal(preview.row_count, 2);
  assert.equal(preview.document.bom_status, "Draft");
  assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);
});

test("bulk BOM fingerprint is stable for semantically equal decimal inputs and changes with payload", async () => {
  const first = baseInput();
  const same = baseInput();
  same.quantity = 1;
  same.rows[0].qty = 2.5;
  same.rows[0].conversion_factor = 1;

  assert.equal(await fingerprintBulkBomDraft(first), await fingerprintBulkBomDraft(same));

  const changed = baseInput();
  changed.rows[0].qty = "2.6";
  assert.notEqual(await fingerprintBulkBomDraft(first), await fingerprintBulkBomDraft(changed));
});

test("bulk BOM accepts 500 pasted component rows and rejects row 501", () => {
  const accepted = baseInput();
  accepted.rows = Array.from({ length: 500 }, (_, index) => ({
    item_code: `RM-${index + 1}`,
    qty: "1",
  }));
  assert.equal(buildBulkBomDraftDocument(accepted).items.length, 500);

  const rejected = baseInput();
  rejected.rows = Array.from({ length: 501 }, (_, index) => ({
    item_code: `RM-${index + 1}`,
    qty: "1",
  }));
  assert.throws(
    () => buildBulkBomDraftDocument(rejected),
    /at most 500 component rows/,
  );
});

test("bulk BOM rejects direct self-consumption before any write", () => {
  const input = baseInput();
  input.rows = [{ item_code: "FG-100", qty: "1" }];
  assert.throws(
    () => buildBulkBomDraftDocument(input),
    /cannot consume its own output Item/,
  );
});

test("bulk BOM rejects invalid effective intervals, quantity bases and non-positive quantities", () => {
  const invalidInterval = baseInput();
  invalidInterval.effective_to = "2026-08-02";
  assert.throws(() => buildBulkBomDraftDocument(invalidInterval), /effective_to must be on or after/);

  const invalidBasis = baseInput();
  invalidBasis.rows[0].qty_basis = "Theo cảm hứng";
  assert.throws(() => buildBulkBomDraftDocument(invalidBasis), /Unsupported qty_basis/);

  const invalidQty = baseInput();
  invalidQty.rows[0].qty = "0";
  assert.throws(() => buildBulkBomDraftDocument(invalidQty), /must be positive/);
});
