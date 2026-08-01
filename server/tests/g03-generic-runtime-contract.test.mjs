import test from "node:test";
import assert from "node:assert/strict";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

test("G03 package uses only generic runtime routes", async () => {
  const manifest = await readAppSource("apps-src/erp-organization-security");
  const routes = [manifest.client?.home?.route, ...manifest.nav.map((item) => item.route)].filter(Boolean);

  assert.equal(manifest.metaContractVersion, 1);
  assert.ok(routes.includes("/app/Department"));
  assert.ok(routes.includes("/permissions?tab=roles"));
  assert.ok(routes.includes("/permissions?tab=approvals"));

  const legacyFeatureRoutes = ["/organization", "/security/roles", "/security/approvals-audit"];
  for (const legacy of legacyFeatureRoutes) {
    assert.ok(!routes.includes(legacy), `G03 source still depends on feature-specific runtime route ${legacy}`);
  }
});
