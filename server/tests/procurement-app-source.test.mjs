import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(here, "../apps-src/procurement");

test("procurement first-party app is accepted by the canonical manifest parser", async () => {
  const source = await readAppSource(sourceDir);
  const manifest = parseAppManifest(source);
  assert.equal(manifest.id, "procurement");
  assert.equal(manifest.version, "0.2.0");
  assert.deepEqual(
    manifest.doctypes.map((doctype) => doctype.name).sort(),
    ["Supplier Contract", "Supplier Qualification", "Supplier Rating"],
  );
  assert.deepEqual(manifest.roles.map((role) => role.role).sort(), ["Purchase Manager", "Purchase User"]);
  assert.deepEqual(manifest.nav.map((entry) => entry.key).sort(), [
    "Supplier Contract",
    "Supplier Qualification",
    "Supplier Rating",
  ]);
  assert.equal(manifest.client?.brand, "zinc");
  assert.deepEqual(manifest.client?.dimensions, ["company"]);
  assert.deepEqual(manifest.client?.home, { doctype: "Supplier Qualification" });
  assert.ok(manifest.externalDocTypes.some((entry) => entry.name === "Supplier"));
  assert.ok(manifest.externalDocTypes.some((entry) => entry.name === "Purchase Order"));
  assert.deepEqual(manifest.custom_fields.map((field) => [field.dt, field.fieldname]), [
    ["Purchase Order", "supplier_contract"],
  ]);
});
