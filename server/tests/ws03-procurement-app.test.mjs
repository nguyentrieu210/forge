import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(here, "../apps-src/procurement");

test("procurement app obeys canonical metadata ownership and overlays", async () => {
  const source = await readAppSource(sourceDir);
  const manifest = parseAppManifest(source);
  assert.equal(manifest.id, "procurement");
  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.metaContractVersion, 1);
  assert.deepEqual(manifest.doctypes.map((d) => d.name).sort(), [
    "Supplier Contract",
    "Supplier Qualification",
    "Supplier Rating",
    "Supplier Selection",
  ]);
  assert.deepEqual(manifest.roles.map((r) => r.role).sort(), ["Purchase Manager", "Purchase User"]);
  assert.deepEqual(manifest.nav.map((entry) => entry.key).sort(), [
    "Supplier Contract",
    "Supplier Qualification",
    "Supplier Rating",
    "Supplier Selection",
  ]);
  assert.equal(manifest.client?.brand, "zinc");
  assert.deepEqual(manifest.client?.dimensions, ["company"]);
  assert.deepEqual(manifest.client?.home, { doctype: "Supplier Qualification" });
  assert.ok(manifest.externalDocTypes.some((entry) => entry.name === "Supplier"));
  assert.ok(manifest.externalDocTypes.some((entry) => entry.name === "Purchase Order"));
  assert.deepEqual(manifest.custom_fields.map((field) => [field.dt, field.fieldname]).sort(), [
    ["Purchase Order", "supplier_contract"],
    ["Purchase Order", "supplier_selection"],
  ]);
});
