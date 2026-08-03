import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(here, "../apps-src/social-commerce");

test("social commerce profile provides server-owned order defaults without owning ERP masters", async () => {
  const app = parseAppManifest(await readAppSource(sourceDir));
  assert.equal(app.id, "social-commerce");
  assert.equal(app.version, "0.2.0");
  const profile = app.doctypes.find((doctype) => doctype.name === "Social Commerce Profile");
  assert.ok(profile);
  assert.equal(profile.kind, "master");
  assert.equal(profile.autoname, "field:page_id");
  for (const field of ["page_id", "company", "default_customer", "currency", "selling_price_list"]) {
    assert.ok(profile.fields.some((candidate) => candidate.fieldname === field && candidate.required), `${field} must be required`);
  }
  const external = new Set(app.externalDocTypes.map((entry) => entry.name));
  for (const name of ["Company", "Customer", "Currency", "Price List"]) assert.ok(external.has(name), `${name} must remain ERP-owned`);
});
