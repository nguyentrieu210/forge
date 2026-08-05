import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CrmCustomerExternalIdentityController,
  crmCustomerExternalIdentityDocumentName,
  crmCustomerExternalIdentityKey,
  crmCustomerExternalScopeKey,
} from "../dist/packages/clouderp-selling/src/index.js";

function actor(roles = ["Sales Manager"]) {
  return { user_id: "manager@example.com", roles };
}

function reader({ customer = "CUST-001", contact = null } = {}) {
  return {
    async hasMasterRecord(_tenant, doctype, name) {
      if (doctype === "Company" && name === "ACME") return true;
      if (doctype === "Customer" && name === customer) return true;
      if (doctype === "Customer" && name === "CUST-002") return true;
      return false;
    },
    async getDocument(_tenant, doctype, name) {
      if (doctype === "CRM Contact" && contact && name === contact.name) return contact;
      return null;
    },
  };
}

function command({ name, document, action = "create", roles = ["Sales Manager"], expectedVersion = null }) {
  return {
    schema_version: 1,
    command_id: `cmd-${action}-${name}`,
    tenant_id: "tenant-1",
    aggregate: { doctype: "CRM Customer External Identity", name },
    action,
    expected_version: expectedVersion,
    payload_hash: "0".repeat(64),
    document,
    actor: actor(roles),
  };
}

test("external customer identity fingerprints are exact, shop-scoped and provider-scoped", async () => {
  const shopee = await crmCustomerExternalIdentityKey("shopee", "shop-1", "buyer-1");
  const same = await crmCustomerExternalIdentityKey("shopee", "shop-1", "buyer-1");
  const otherShop = await crmCustomerExternalIdentityKey("shopee", "shop-2", "buyer-1");
  const otherProvider = await crmCustomerExternalIdentityKey("lazada", "shop-1", "buyer-1");
  assert.match(shopee, /^[a-f0-9]{64}$/);
  assert.equal(shopee, same);
  assert.notEqual(shopee, otherShop);
  assert.notEqual(shopee, otherProvider);
  assert.equal(crmCustomerExternalIdentityDocumentName(shopee), `CRM-EXT-${shopee}`);
  assert.notEqual(
    await crmCustomerExternalScopeKey("shopee", "shop-1"),
    await crmCustomerExternalScopeKey("shopee", "shop-2"),
  );
});

test("link command persists only hashes and canonical references, never raw marketplace buyer id", async () => {
  const controller = new CrmCustomerExternalIdentityController();
  const identityKey = await crmCustomerExternalIdentityKey("shopee", "shop-private-123", "buyer-private-456");
  const name = crmCustomerExternalIdentityDocumentName(identityKey);
  const plan = await controller.buildPlan({
    command: command({
      name,
      document: {
        company: "ACME",
        provider: "shopee",
        external_scope_id: "shop-private-123",
        external_identity: "buyer-private-456",
        scope_label: "Shopee Mall",
        linked_customer: "CUST-001",
        status: "Active",
        source: "marketplace:SHOP-1",
      },
    }),
    existing: null,
    now: "2026-08-05T03:30:00.000Z",
    nextVersion: 1,
    reader: reader(),
  });

  assert.equal(plan.document.name, name);
  assert.equal(plan.document.data.identity_key, identityKey);
  assert.match(plan.document.data.scope_key, /^[a-f0-9]{64}$/);
  assert.equal(plan.document.data.linked_customer, "CUST-001");
  assert.equal(plan.document.data.status, "Active");
  assert.equal("external_scope_id" in plan.document.data, false);
  assert.equal("external_identity" in plan.document.data, false);
  const encoded = JSON.stringify(plan.document.data);
  assert.doesNotMatch(encoded, /shop-private-123|buyer-private-456/);
  assert.equal(plan.events[0].event_type, "crm.customer_external_identity.linked");
  assert.doesNotMatch(JSON.stringify(plan.events[0].payload), /shop-private-123|buyer-private-456/);
});

test("only CRM managers may create or alter external customer identities", async () => {
  const controller = new CrmCustomerExternalIdentityController();
  const identityKey = await crmCustomerExternalIdentityKey("lazada", "shop-1", "buyer-1");
  await assert.rejects(
    () => controller.buildPlan({
      command: command({
        name: crmCustomerExternalIdentityDocumentName(identityKey),
        roles: ["Sales User"],
        document: {
          company: "ACME",
          provider: "lazada",
          external_scope_id: "shop-1",
          external_identity: "buyer-1",
          linked_customer: "CUST-001",
          status: "Active",
          source: "marketplace:SHOP-1",
        },
      }),
      existing: null,
      now: "2026-08-05T03:30:00.000Z",
      nextVersion: 1,
      reader: reader(),
    }),
    (error) => error?.code === "PERMISSION_DENIED",
  );
});

test("CRM Contact link must already point to the same canonical Customer", async () => {
  const controller = new CrmCustomerExternalIdentityController();
  const identityKey = await crmCustomerExternalIdentityKey("tiktok_shop", "shop-1", "buyer-1");
  const contact = {
    tenant_id: "tenant-1",
    doctype: "CRM Contact",
    name: "CONTACT-1",
    owner: "sales@example.com",
    docstatus: 0,
    status: "Active",
    version: 1,
    created_at: "2026-08-05T00:00:00.000Z",
    modified_at: "2026-08-05T00:00:00.000Z",
    data: { company: "ACME", full_name: "Buyer", linked_customer: "CUST-002", status: "Active" },
    children: [],
  };
  await assert.rejects(
    () => controller.buildPlan({
      command: command({
        name: crmCustomerExternalIdentityDocumentName(identityKey),
        document: {
          company: "ACME",
          provider: "tiktok_shop",
          external_scope_id: "shop-1",
          external_identity: "buyer-1",
          linked_customer: "CUST-001",
          crm_contact: "CONTACT-1",
          status: "Active",
          source: "marketplace:SHOP-1",
        },
      }),
      existing: null,
      now: "2026-08-05T03:30:00.000Z",
      nextVersion: 1,
      reader: reader({ contact }),
    }),
    (error) => error?.code === "REFERENCE_ERROR",
  );
});

test("reassignment, revocation and reactivation require an explicit audit reason", async () => {
  const controller = new CrmCustomerExternalIdentityController();
  const identityKey = await crmCustomerExternalIdentityKey("shopee", "shop-1", "buyer-1");
  const name = crmCustomerExternalIdentityDocumentName(identityKey);
  const created = await controller.buildPlan({
    command: command({
      name,
      document: {
        company: "ACME",
        provider: "shopee",
        external_scope_id: "shop-1",
        external_identity: "buyer-1",
        linked_customer: "CUST-001",
        status: "Active",
        source: "marketplace:SHOP-1",
      },
    }),
    existing: null,
    now: "2026-08-05T03:30:00.000Z",
    nextVersion: 1,
    reader: reader(),
  });

  await assert.rejects(
    () => controller.buildPlan({
      command: command({ name, action: "save", expectedVersion: 1, document: { ...created.document.data, linked_customer: "CUST-002" } }),
      existing: created.document,
      now: "2026-08-05T03:31:00.000Z",
      nextVersion: 2,
      reader: reader(),
    }),
    /requires change_reason/,
  );

  const reassigned = await controller.buildPlan({
    command: command({
      name,
      action: "save",
      expectedVersion: 1,
      document: { ...created.document.data, linked_customer: "CUST-002", change_reason: "Buyer confirmed account ownership" },
    }),
    existing: created.document,
    now: "2026-08-05T03:31:00.000Z",
    nextVersion: 2,
    reader: reader({ customer: "CUST-002" }),
  });
  assert.equal(reassigned.document.data.linked_customer, "CUST-002");
  assert.equal(reassigned.events[0].event_type, "crm.customer_external_identity.reassigned");

  const revoked = await controller.buildPlan({
    command: command({
      name,
      action: "save",
      expectedVersion: 2,
      document: { ...reassigned.document.data, status: "Revoked", change_reason: "Marketplace account transferred" },
    }),
    existing: reassigned.document,
    now: "2026-08-05T03:32:00.000Z",
    nextVersion: 3,
    reader: reader({ customer: "CUST-002" }),
  });
  assert.equal(revoked.document.data.status, "Revoked");
  assert.equal(revoked.events[0].event_type, "crm.customer_external_identity.revoked");
  assert.equal(revoked.document.data.revocation_reason, "Marketplace account transferred");
});

test("commerce resolver remains exact-only and preserves historical Sales Order customer on replay", async () => {
  const source = await readFile(new URL("../packages/social-commerce/src/marketplace-customer-identity.ts", import.meta.url), "utf8");
  assert.match(source, /crmCustomerExternalIdentityKey\(\s*resolved\.order\.provider,\s*resolved\.order\.shop_id,\s*externalBuyer/);
  assert.match(source, /readExistingMarketplaceSalesOrder/);
  assert.match(source, /status: current \? "linked" : "historical"/);
  assert.match(source, /return \{\s*resolved: withCustomer\(resolved, customer\)/);
  assert.doesNotMatch(source, /levenshtein|soundex|fuzzy|similarity|email\s*===|phone\s*===/i);
});

test("Customer 360 surfaces active exact channel identities through canonical CRM documents", async () => {
  const source = await readFile(new URL("../packages/clouderp-selling/src/crm-customer-360-external-identity-controller.ts", import.meta.url), "utf8");
  assert.match(source, /listDocumentsByDoctype<CrmCustomerExternalIdentityData>/);
  assert.match(source, /document\.data\.linked_customer === data\.customer/);
  assert.match(source, /document\.data\.status === "Active"/);
  assert.match(source, /data\.external_identity_count = rows\.length/);
  assert.match(source, /child_doctype: "CRM Customer 360 External Identity"/);
});
