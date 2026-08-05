import test from "node:test";
import assert from "node:assert/strict";
import {
  CrmCustomerExternalIdentityController,
  crmCustomerExternalIdentityDocumentName,
  crmCustomerExternalIdentityKey,
  crmCustomerExternalScopeKey,
} from "../dist/packages/clouderp-selling/src/index.js";
import {
  marketplaceCustomerIdentityKeyFromLineage,
  marketplaceCustomerIdentityLineage,
} from "../dist/packages/social-commerce/src/marketplace-order.js";

function reader() {
  return {
    async hasMasterRecord(_tenant, doctype, name) {
      return (doctype === "Company" && name === "ACME") || (doctype === "Customer" && name === "CUST-001");
    },
    async getDocument() { return null; },
  };
}

test("opaque marketplace lineage round-trips only the CRM fingerprint", async () => {
  const identityKey = await crmCustomerExternalIdentityKey("shopee", "shop-123", "buyer-private-456");
  const lineage = marketplaceCustomerIdentityLineage(identityKey);
  assert.equal(lineage, `crm-external-identity:${identityKey}`);
  assert.equal(marketplaceCustomerIdentityKeyFromLineage(lineage), identityKey);
  assert.equal(marketplaceCustomerIdentityKeyFromLineage("buyer-private-456"), null);
  assert.doesNotMatch(lineage, /buyer-private-456|shop-123/);
});

test("CRM identity controller creates canonical mapping from trusted precomputed fingerprints without raw buyer data", async () => {
  const controller = new CrmCustomerExternalIdentityController();
  const identityKey = await crmCustomerExternalIdentityKey("shopee", "shop-123", "buyer-private-456");
  const scopeKey = await crmCustomerExternalScopeKey("shopee", "shop-123");
  const name = crmCustomerExternalIdentityDocumentName(identityKey);
  const plan = await controller.buildPlan({
    command: {
      schema_version: 1,
      command_id: "cmd-opaque-link",
      tenant_id: "tenant-1",
      aggregate: { doctype: "CRM Customer External Identity", name },
      action: "create",
      expected_version: null,
      payload_hash: "0".repeat(64),
      document: {
        company: "ACME",
        provider: "shopee",
        scope_key: scopeKey,
        identity_key: identityKey,
        scope_label: "Shopee Mall",
        linked_customer: "CUST-001",
        identity_status: "Active",
        source: "marketplace:SHOP-1",
      },
      actor: { user_id: "manager@example.com", roles: ["Sales Manager"] },
    },
    existing: null,
    now: "2026-08-05T04:00:00.000Z",
    nextVersion: 1,
    reader: reader(),
  });

  assert.equal(plan.document.name, name);
  assert.equal(plan.document.data.identity_key, identityKey);
  assert.equal(plan.document.data.scope_key, scopeKey);
  assert.equal(plan.document.data.linked_customer, "CUST-001");
  assert.equal(plan.document.data.identity_status, "Active");
  const encoded = JSON.stringify(plan.document.data);
  assert.doesNotMatch(encoded, /buyer-private-456|shop-123/);
});

test("precomputed fingerprint create fails closed when either hash is malformed", async () => {
  const controller = new CrmCustomerExternalIdentityController();
  const identityKey = "a".repeat(64);
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        schema_version: 1,
        command_id: "cmd-bad-scope",
        tenant_id: "tenant-1",
        aggregate: { doctype: "CRM Customer External Identity", name: crmCustomerExternalIdentityDocumentName(identityKey) },
        action: "create",
        expected_version: null,
        payload_hash: "0".repeat(64),
        document: {
          company: "ACME",
          provider: "shopee",
          scope_key: "not-a-hash",
          identity_key: identityKey,
          linked_customer: "CUST-001",
          identity_status: "Active",
          source: "marketplace:SHOP-1",
        },
        actor: { user_id: "manager@example.com", roles: ["Sales Manager"] },
      },
      existing: null,
      now: "2026-08-05T04:00:00.000Z",
      nextVersion: 1,
      reader: reader(),
    }),
    /scope_key is invalid/,
  );
});
