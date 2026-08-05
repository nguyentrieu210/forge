import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../packages/social-commerce/src/marketplace-sync-config.ts", import.meta.url), "utf8");

test("marketplace sync trigger resolves connection scope from canonical documents", () => {
  assert.match(source, /readDocument\(db, tenantId, "Commerce Channel Profile", profileName\)/);
  assert.match(source, /readDocument\(db, tenantId, "Marketplace Connection", connectionId\)/);
  assert.match(source, /const connectionId = textValue\(profile\.connection_id/);
  assert.match(source, /secret_ref: textValue\(connectionData\.secret_ref/);
  assert.match(source, /config: jsonObject\(connectionData\.config/);
  assert.match(source, /validateConnectorConnection\(connection, adapter\.manifest\)/);
  assert.match(source, /adapter\.validateConfig\(connection\.config\)/);
  assert.match(source, /const provider = marketplaceProvider\(adapter\.manifest\.provider\)/);
});

test("channel provider must match canonical connector provider and Shopee shop scope", () => {
  assert.match(source, /resolved\.provider !== provider/);
  assert.match(source, /provider === "shopee"/);
  assert.match(source, /scopedShop !== externalShopId/);
});

test("configured sync resolver accepts only channel profile as external selector", () => {
  const signature = source.slice(
    source.indexOf("export async function resolveConfiguredMarketplaceSync"),
    source.indexOf("): Promise<ConfiguredMarketplaceSync>") + "): Promise<ConfiguredMarketplaceSync>".length,
  );
  assert.match(signature, /channelProfile: string/);
  assert.doesNotMatch(signature, /secret_ref|connector_key|provider:|config:/);
});

test("credential administration resolves provider from Marketplace Connection rather than request input", () => {
  const signature = source.slice(
    source.indexOf("export async function resolveMarketplaceConnection"),
    source.indexOf("): Promise<ResolvedMarketplaceConnection>") + "): Promise<ResolvedMarketplaceConnection>".length,
  );
  assert.match(signature, /connectionIdInput: string/);
  assert.doesNotMatch(signature, /provider:|secret_ref|config:/);
  assert.match(source, /marketplaceProvider\(adapter\.manifest\.provider\)/);
});
