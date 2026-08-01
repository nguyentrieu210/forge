import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(here, "../apps-src/plastic-erp");

async function manifest() {
  return parseAppManifest(await readAppSource(sourceDir));
}

test("plastic ERP source compiles to canonical Meta v1", async () => {
  const app = await manifest();
  assert.equal(app.id, "plastic-erp");
  assert.equal(app.metaContractVersion, 1);
  assert.ok(app.doctypes.length >= 10);
  assert.ok(app.roles.some((role) => role.role === "Plastic Production Manager"));
  assert.ok(app.roles.some((role) => role.role === "Plastic QC Manager"));
  assert.ok(app.externalDocTypes.some((entry) => entry.name === "Bill of Materials"));
  assert.ok(app.externalDocTypes.some((entry) => entry.name === "Work Order"));

  for (const doctype of app.doctypes) {
    assert.ok(doctype.kind, `${doctype.name} must have canonical kind`);
    assert.ok(doctype.viewPolicy?.form, `${doctype.name} must have form view policy`);
    for (const field of doctype.fields) {
      assert.ok(field.valueSource, `${doctype.name}.${field.fieldname} missing valueSource`);
      assert.ok(field.editMode, `${doctype.name}.${field.fieldname} missing editMode`);
      assert.ok(field.surface, `${doctype.name}.${field.fieldname} missing surface`);
    }
  }
});

test("plastic recipe extends canonical BOM instead of creating a competing BOM", async () => {
  const app = await manifest();
  const recipe = app.doctypes.find((doctype) => doctype.name === "Plastic Recipe Policy");
  assert.ok(recipe);
  const bomField = recipe.fields.find((field) => field.fieldname === "bom");
  assert.equal(bomField?.fieldtype, "Link");
  assert.equal(bomField?.options, "Bill of Materials");
  assert.equal(app.doctypes.some((doctype) => doctype.name === "Bill of Materials"), false);
  assert.equal(app.doctypes.some((doctype) => /stock ledger/i.test(doctype.name)), false);
});

test("plastic recipe and QC specs are approval-controlled immutable transactions", async () => {
  const app = await manifest();
  const recipe = app.doctypes.find((doctype) => doctype.name === "Plastic Recipe Policy");
  const quality = app.doctypes.find((doctype) => doctype.name === "Plastic Quality Specification");
  assert.equal(recipe?.kind, "transaction");
  assert.equal(quality?.kind, "transaction");
  assert.ok(app.workflows.some((workflow) => workflow.document_type === "Plastic Recipe Policy"));
  assert.ok(app.workflows.some((workflow) => workflow.document_type === "Plastic Quality Specification"));
  assert.ok(recipe?.fields.some((field) => field.fieldname === "material_rules" && field.fieldtype === "Table"));
  assert.ok(quality?.fields.some((field) => field.fieldname === "characteristics" && field.fieldtype === "Table"));
});

test("machine and tool masters expose compatibility and capacity inputs for later server guards", async () => {
  const app = await manifest();
  const machine = app.doctypes.find((doctype) => doctype.name === "Plastic Machine");
  const tool = app.doctypes.find((doctype) => doctype.name === "Plastic Tool");
  assert.ok(machine?.fields.some((field) => field.fieldname === "process_profile"));
  assert.ok(machine?.fields.some((field) => field.fieldname === "exclusive_resource"));
  assert.ok(tool?.fields.some((field) => field.fieldname === "compatible_machines" && field.options === "Plastic Tool Machine Rule"));
  assert.ok(tool?.fields.some((field) => field.fieldname === "maintenance_cycle_count"));
});
