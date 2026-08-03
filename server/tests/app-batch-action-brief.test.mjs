import assert from "node:assert/strict";
import test from "node:test";

import {
  BriefError,
  compileBrief,
} from "../scripts/lib/compile-brief-app-factory.mjs";
import { validateBriefSchema } from "../scripts/lib/validate-brief-schema.mjs";
import { parseAppManifestWithInputTables } from "../dist/packages/app-registry/src/index.js";

function batchBrief() {
  return {
    id: "batch-demo",
    name: "Batch Demo",
    worker: "batch-demo-worker",
    roles: ["Operations User"],
    doctypes: [{
      name: "Batch Document",
      fields: ["title:Data! Tiêu đề"],
      permissions: { "Operations User": "rwc" },
    }],
    actions: [{
      name: "apply-lines",
      label: "Apply lines",
      permission: "Batch Document",
      fields: ["note:Data Note"],
      inputTables: [{
        fieldname: "lines",
        label: "Lines",
        columns: [
          { fieldname: "row_id", label: "Row id", fieldtype: "Data", required: true },
          { fieldname: "amount", label: "Amount", fieldtype: "Float", required: true },
        ],
        minRows: 1,
        maxRows: 50,
        allowPaste: true,
      }],
      batch: {
        contractVersion: 1,
        inputTable: "lines",
        itemIdField: "row_id",
        atomicity: "independent",
        maxItems: 50,
      },
      preview: "batch_demo.preview | Preview",
      commit: "batch_demo.commit | Commit",
    }],
  };
}

test("brief validation accepts only the owned batch extension and keeps other unknown keys closed", async () => {
  assert.deepEqual(await validateBriefSchema(batchBrief()), []);

  const invalid = batchBrief();
  invalid.actions[0].batch.mystery = true;
  const errors = await validateBriefSchema(invalid);
  assert.ok(errors.some((error) => error.includes("batch.mystery")), errors.join("\n"));

  const unrelated = batchBrief();
  unrelated.actions[0].otherMystery = true;
  const unrelatedErrors = await validateBriefSchema(unrelated);
  assert.ok(unrelatedErrors.some((error) => error.includes("additional properties")), unrelatedErrors.join("\n"));
});

test("App Factory compiler emits canonical batch metadata and canonical parser round-trips it", () => {
  const pkg = compileBrief(batchBrief());
  assert.deepEqual(pkg.actions[0].batch, {
    contract_version: 1,
    input_table: "lines",
    item_id_field: "row_id",
    atomicity: "independent",
    max_items: 50,
  });

  const parsed = parseAppManifestWithInputTables(pkg);
  assert.deepEqual(parsed.actions[0].batch, pkg.actions[0].batch);
  assert.equal(parsed.actions[0].input_tables[0].fieldname, "lines");
});

test("brief compiler fails closed when batch binding or preview contract is invalid", () => {
  const missingIdColumn = batchBrief();
  missingIdColumn.actions[0].batch.itemIdField = "missing";
  assert.throws(
    () => compileBrief(missingIdColumn),
    (error) => error instanceof BriefError && /itemIdField/.test(error.message),
  );

  const missingPreview = batchBrief();
  delete missingPreview.actions[0].preview;
  assert.throws(
    () => compileBrief(missingPreview),
    (error) => error instanceof BriefError && /yêu cầu action khai preview/.test(error.message),
  );
});
