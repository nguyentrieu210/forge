import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ControllerRegistry } from "../dist/packages/document-kernel/src/controller.js";
import { registerIntegrationHubControllers } from "../dist/packages/integration-hub/src/registry.js";

test("Integration Subscription controller is available through the Integration Hub registry", () => {
  const registry = registerIntegrationHubControllers(new ControllerRegistry());
  const controller = registry.get("Integration Subscription");
  assert.equal(controller.doctype, "Integration Subscription");
  assert.equal(controller.constructor.name, "IntegrationSubscriptionController");
});

test("tenant AggregateCoordinator composes Integration Hub before generic metadata fallback", () => {
  const source = readFileSync(new URL("../apps/tenant-worker/src/aggregate-do.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ registerIntegrationHubControllers \} from "\.\.\/\.\.\/\.\.\/packages\/integration-hub\/src\/registry\.js";/);
  assert.match(source, /const registry = registerIntegrationHubControllers\([\s\S]*registerErpNextCoreControllers\([\s\S]*\)\.setFallback\(new GenericMetadataController\(metadata\)\);/);
});
