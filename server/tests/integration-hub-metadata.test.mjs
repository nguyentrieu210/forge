import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

test("Integration Hub first-party app exposes only role-gated canonical subscription config", async () => {
  const app = await json("../apps-src/integration-hub/app.json");
  const roles = await json("../apps-src/integration-hub/roles.json");
  const meta = await json("../apps-src/integration-hub/doctypes/integration-subscription.json");

  assert.equal(app.id, "integration-hub");
  assert.equal(app.version, "0.1.0");
  assert.deepEqual(app.nav.map((item) => item.key), ["Integration Subscription"]);
  assert.deepEqual(app.nav[0].required_roles, ["Integration Admin", "System Manager"]);
  assert.deepEqual(roles, [{ role: "Integration Admin", desk_access: true }]);

  assert.equal(meta.name, "Integration Subscription");
  assert.equal(meta.is_submittable, false);
  assert.equal(meta.track_changes, true);
  const fields = new Map(meta.fields.map((field) => [field.fieldname, field]));
  assert.equal(fields.get("status").default, "draft");
  assert.equal(fields.get("allowed_hosts").fieldtype, "JSON");
  assert.equal(fields.get("mapping").fieldtype, "JSON");
  assert.equal(fields.get("secret_ref").fieldtype, "Data");
  assert.equal(fields.has("secret"), false);
  assert.equal(fields.has("access_token"), false);
  assert.equal(fields.has("client_secret"), false);
  assert.deepEqual(meta.permissions.map((item) => item.role).sort(), ["Integration Admin", "System Manager"]);
});
