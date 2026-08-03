import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(here, "../apps-src/logistics");

async function manifest() {
  return parseAppManifest(await readAppSource(sourceDir));
}

test("logistics app owns logistics masters/trip while ERP fulfillment stays external", async () => {
  const app = await manifest();
  assert.equal(app.id, "logistics");
  assert.equal(app.version, "0.2.0");
  assert.equal(app.metaContractVersion, 1);
  assert.ok(app.roles.some((role) => role.role === "Logistics User"));
  assert.ok(app.roles.some((role) => role.role === "Logistics Manager"));

  const owned = new Map(app.doctypes.map((doctype) => [doctype.name, doctype]));
  for (const name of ["Carrier", "Vehicle", "Driver", "Delivery Stop", "Delivery Trip", "Proof of Delivery"]) {
    assert.ok(owned.has(name), `${name} must be owned by logistics`);
  }
  assert.equal(owned.get("Delivery Stop").kind, "child_table");
  assert.equal(owned.get("Delivery Trip").kind, "transaction");
  assert.equal(owned.get("Delivery Trip").is_submittable, true);
  assert.ok(owned.get("Delivery Trip").fields.some((field) => field.fieldname === "delivery_stops" && field.fieldtype === "Table" && field.options === "Delivery Stop"));

  const external = new Map(app.externalDocTypes.map((entry) => [entry.name, entry]));
  for (const name of ["Company", "Customer", "Address", "Delivery Note"]) assert.ok(external.has(name), `${name} must remain external`);
  for (const name of owned.keys()) assert.equal(external.has(name), false, `${name} cannot be both owned and external`);
});

test("Proof of Delivery has deterministic naming and correction/evidence metadata", async () => {
  const app = await manifest();
  const pod = app.doctypes.find((doctype) => doctype.name === "Proof of Delivery");
  assert.ok(pod);
  assert.equal(pod.kind, "transaction");
  assert.equal(pod.is_submittable, true);
  assert.equal(pod.autoname, "format:POD-{delivery_trip}-{stop_row_id}");
  assert.ok(pod.fields.some((field) => field.fieldname === "delivery_trip" && field.options === "Delivery Trip"));
  assert.ok(pod.fields.some((field) => field.fieldname === "delivery_note" && field.options === "Delivery Note"));
  assert.ok(pod.fields.some((field) => field.fieldname === "outcome"));
  assert.ok(pod.fields.some((field) => field.fieldname === "proof_reference"));
  assert.ok(pod.fields.some((field) => field.fieldname === "exception_reason"));
  assert.ok(pod.fields.some((field) => field.fieldname === "failure_reason"));
  assert.ok(pod.permissions.some((permission) => permission.role === "Logistics Manager" && permission.cancel && permission.amend));

  for (const field of pod.fields) {
    assert.ok(field.valueSource, `${pod.name}.${field.fieldname} missing valueSource`);
    assert.ok(field.editMode, `${pod.name}.${field.fieldname} missing editMode`);
    assert.ok(field.surface, `${pod.name}.${field.fieldname} missing surface`);
  }
});
