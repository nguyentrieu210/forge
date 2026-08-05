import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

test("CRM external customer identity metadata is privacy-safe and avoids reserved fields", async () => {
  const identity = await json("../apps-src/crm/doctypes/crm-customer-external-identity.json");
  const fields = new Map(identity.fields.map((field) => [field.fieldname, field]));
  assert.equal(identity.name, "CRM Customer External Identity");
  assert.equal(identity.autoname, "prompt");
  assert.equal(fields.has("status"), false);
  assert.equal(fields.get("identity_status")?.fieldtype, "Select");
  assert.equal(fields.get("identity_status")?.default, "Active");
  assert.equal(fields.get("linked_customer")?.options, "Customer");
  assert.equal(fields.get("crm_contact")?.options, "CRM Contact");
  assert.equal(fields.get("identity_key")?.hidden, true);
  assert.equal(fields.get("scope_key")?.hidden, true);
  assert.equal(fields.has("external_identity"), false);
  assert.equal(fields.has("external_scope_id"), false);
  assert.equal(fields.has("email"), false);
  assert.equal(fields.has("phone"), false);
  assert.deepEqual(
    identity.permissions.map((entry) => [entry.role, Boolean(entry.create), Boolean(entry.write)]),
    [
      ["Sales User", false, false],
      ["Sales Manager", true, true],
      ["System Manager", true, true],
    ],
  );
});

test("Customer 360 metadata exposes active channel identity references without raw buyer data", async () => {
  const customer360 = await json("../apps-src/crm/doctypes/crm-customer-360.json");
  const child = await json("../apps-src/crm/doctypes/crm-customer-360-external-identity.json");
  const fields = new Map(customer360.fields.map((field) => [field.fieldname, field]));
  const childFields = new Map(child.fields.map((field) => [field.fieldname, field]));
  assert.equal(fields.get("external_identity_count")?.fieldtype, "Int");
  assert.equal(fields.get("external_identities")?.fieldtype, "Table");
  assert.equal(fields.get("external_identities")?.options, "CRM Customer 360 External Identity");
  assert.equal(child.istable, true);
  assert.equal(childFields.get("identity")?.options, "CRM Customer External Identity");
  assert.equal(childFields.has("status"), false);
  assert.equal(childFields.get("identity_status")?.fieldtype, "Data");
  assert.equal(childFields.has("external_identity"), false);
});
