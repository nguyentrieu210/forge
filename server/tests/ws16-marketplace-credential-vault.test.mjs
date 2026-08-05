import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
} from "../dist/packages/integration-hub/src/credential-envelope.js";

const key = Buffer.alloc(32, 7).toString("base64");

test("credential envelope is AES-GCM AAD-bound and never contains plaintext", async () => {
  const secret = JSON.stringify({ provider: "tiktok_shop", app_key: "key", app_secret: "super-secret", access_token: "access-secret" });
  const aad = "marketplace-credential/v1:tenant-1:INT-MKT-00001:tiktok_shop:secret:main";
  const envelope = await encryptCredentialEnvelope(secret, key, aad, "MARKETPLACE_CREDENTIAL_KEK");
  assert.doesNotMatch(envelope, /super-secret|access-secret/);
  assert.equal(await decryptCredentialEnvelope(envelope, key, aad, "MARKETPLACE_CREDENTIAL_KEK"), secret);
  await assert.rejects(
    decryptCredentialEnvelope(envelope, key, `${aad}:wrong`, "MARKETPLACE_CREDENTIAL_KEK"),
  );
});

test("marketplace vault schema contains encrypted envelope only", async () => {
  const migration = await readFile(new URL("../migrations/tenant/0120_marketplace_credential_vault.sql", import.meta.url), "utf8");
  assert.match(migration, /envelope_json TEXT NOT NULL/);
  assert.match(migration, /UNIQUE \(tenant_id, connection_id\)/);
  assert.doesNotMatch(migration, /access_token|refresh_token|app_secret|partner_key|private_key/i);
});

test("marketplace vault resolves by tenant, connection, secret_ref and provider scope", async () => {
  const source = await readFile(new URL("../packages/integration-hub/src/marketplace-credential-vault.ts", import.meta.url), "utf8");
  assert.match(source, /credentialAad\(tenantId, connectionId, secretRef, provider\)/);
  assert.match(source, /row\.connection_id !== connectionId \|\| row\.provider !== provider/);
  assert.match(source, /vault_status !== "active"/);
  assert.match(source, /decryptCredentialEnvelope\(/);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
});

test("Facebook credential wrapper delegates to the same envelope primitive", async () => {
  const source = await readFile(new URL("../packages/social-commerce/src/credentials.ts", import.meta.url), "utf8");
  assert.match(source, /encryptCredentialEnvelope/);
  assert.match(source, /decryptCredentialEnvelope/);
  assert.match(source, /SOCIAL_CREDENTIAL_KEK/);
});
