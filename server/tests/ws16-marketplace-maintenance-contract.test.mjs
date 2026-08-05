import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const maintenancePath = new URL("../packages/social-commerce/src/marketplace-maintenance.ts", import.meta.url);
const tenantWorkerPath = new URL("../apps/tenant-worker/src/index-core.ts", import.meta.url);
const profilePath = new URL("../apps-src/social-commerce/doctypes/commerce-channel-profile.json", import.meta.url);

test("marketplace maintenance is fair bounded and isolates one shop failure", async () => {
  const source = await readFile(maintenancePath, "utf8");
  assert.match(source, /ORDER BY COALESCE\(s\.updated_at,''\) ASC,p\.name ASC/);
  assert.match(source, /max_profiles \?\? 25/);
  assert.match(source, /max_pages_per_profile \?\? 3/);
  assert.match(source, /duplicate_connection_profile/);
  assert.match(source, /try \{[\s\S]*runMarketplaceOrderSync\([\s\S]*\} catch \(error\) \{/);
  assert.match(source, /failures\.push\(\{ channel_profile: row\.name, code: failureCode\(error\) \}\)/);
  assert.doesNotMatch(source, /failures\.push\([^\n]*message/);
});

test("one Marketplace Connection can belong to only one Channel Profile", async () => {
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const connection = profile.fields.find((field) => field.fieldname === "connection_id");
  assert.equal(connection?.fieldtype, "Link");
  assert.equal(connection?.options, "Marketplace Connection");
  assert.equal(connection?.unique, true);
  assert.equal(connection?.set_only_once, true);
});

test("credential admin route is internal-only and derives all credential scope server-side", async () => {
  const source = await readFile(tenantWorkerPath, "utf8");
  assert.match(source, /\/internal\\\/marketplace\\\/connections/);
  assert.match(source, /assertInternalService\(request, env\.INTERNAL_SERVICE_TOKEN\)/);
  assert.match(source, /resolveMarketplaceConnection\(env\.DB, tenantId, connectionId\)/);
  assert.match(source, /const secretRef = resolved\.connection\.secret_ref/);
  assert.match(source, /buildMarketplaceCredentialMaterial\(\s*resolved\.provider,\s*resolved\.connection\.config/);
  assert.match(source, /new D1MarketplaceCredentialVault\(env\.DB, env\.MARKETPLACE_CREDENTIAL_KEK\)/);
  assert.match(source, /credential_status: "active"/);
  assert.doesNotMatch(source, /access_token\s*:/);
  assert.doesNotMatch(source, /app_secret\s*:/);
  assert.doesNotMatch(source, /partner_key\s*:/);
});

test("tenant maintenance keeps marketplace disabled when its dedicated KEK is absent", async () => {
  const source = await readFile(tenantWorkerPath, "utf8");
  assert.match(source, /if \(!env\.MARKETPLACE_CREDENTIAL_KEK\) return marketplaceDisabled\(\)/);
  assert.match(source, /reason: "credential_key_unconfigured"/);
  assert.doesNotMatch(source, /MARKETPLACE_CREDENTIAL_KEK \?\? env\.SOCIAL_CREDENTIAL_KEK/);
  assert.doesNotMatch(source, /MARKETPLACE_CREDENTIAL_KEK \|\| env\.SOCIAL_CREDENTIAL_KEK/);
});
