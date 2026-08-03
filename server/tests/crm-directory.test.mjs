import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("Company", "OtherCo", "demo", { default_currency: "USD" });
  store.seedMaster("Territory", "Vietnam", "demo", { territory_name: "Vietnam" });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function organization(kernel, name, overrides = {}, actor = salesUser) {
  return mutate(kernel, {
    commandId: `${name}-create`, actor, doctype: "CRM Organization", name, action: "create", expectedVersion: null,
    document: { company: "Demo", organization_name: "Acme Corporation", website: "https://www.acme.example", territory: "Vietnam", status: "Active", ...overrides },
  });
}

async function contact(kernel, name, overrides = {}, actor = salesUser) {
  return mutate(kernel, {
    commandId: `${name}-create`, actor, doctype: "CRM Contact", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo", first_name: "An", last_name: "Nguyen", organization: "CRM-ORG-1", email: "An.Buyer@Example.com",
      territory: "Vietnam", consent_status: "Granted", consent_at: "2026-08-03T09:00:00.000Z", consent_source: "Web form", status: "Active", ...overrides,
    },
  });
}

test("CRM v0.5 packages directory, reports and metadata screens", async () => {
  const source = await readAppSource(fileURLToPath(new URL("../apps-src/crm/", import.meta.url)));
  const parsed = parseAppManifest(source);
  assert.equal(parsed.version, "0.5.0");
  for (const name of ["CRM Organization", "CRM Contact"]) assert.ok(parsed.doctypes.some((doctype) => doctype.name === name));
  assert.ok(parsed.reports.some((report) => report.name === "crm-pipeline-forecast"));
  assert.ok(parsed.screens.some((screen) => screen.name === "crm-overview"));
  assert.ok(parsed.screens.some((screen) => screen.name === "crm-performance"));
  assert.ok(parsed.screens.some((screen) => screen.name === "crm-marketing"));
  assert.ok(parsed.roles.some((role) => role.role === "Sales User"));
  assert.ok(parsed.roles.some((role) => role.role === "Sales Manager"));
});

test("Organization dedupe is non-destructive and manager-reviewed", async () => {
  const { kernel, store } = setup();
  await organization(kernel, "CRM-ORG-1");
  let record = await store.getDocument("demo", "CRM Organization", "CRM-ORG-1");
  assert.equal(record.data.domain, "acme.example");

  await assert.rejects(() => organization(kernel, "CRM-ORG-2", { organization_name: "ACME Holdings", domain: "acme.example", website: "https://sales.acme.example" }), /Possible duplicate/);
  await organization(kernel, "CRM-ORG-2", { organization_name: "Imported duplicate", domain: "acme.example", website: "https://sales.acme.example", status: "Duplicate", duplicate_of: "CRM-ORG-1" }, salesManager);
  record = await store.getDocument("demo", "CRM Organization", "CRM-ORG-2");
  assert.equal(record.status, "Duplicate");
  assert.equal(record.data.duplicate_of, "CRM-ORG-1");

  await assert.rejects(() => mutate(kernel, {
    commandId: "org-reactivate-user", actor: salesUser, doctype: "CRM Organization", name: "CRM-ORG-2", action: "save", expectedVersion: 1,
    document: { status: "Active", domain: "other.example", website: "https://other.example" },
  }), /Only a Sales Manager may reactivate/);
  await mutate(kernel, {
    commandId: "org-reactivate-manager", actor: salesManager, doctype: "CRM Organization", name: "CRM-ORG-2", action: "save", expectedVersion: 1,
    document: { status: "Active", domain: "other.example", website: "https://other.example" },
  });
  record = await store.getDocument("demo", "CRM Organization", "CRM-ORG-2");
  assert.equal(record.status, "Active");
  assert.equal(record.data.duplicate_of, undefined);
});

test("Contact enforces company, duplicate review and fresh consent evidence without leaking PII to events", async () => {
  const { kernel, store } = setup();
  await organization(kernel, "CRM-ORG-1");
  await organization(kernel, "CRM-ORG-X", { company: "OtherCo", organization_name: "Other Co", website: "https://otherco.example" });
  await contact(kernel, "CRM-CONTACT-1");

  let record = await store.getDocument("demo", "CRM Contact", "CRM-CONTACT-1");
  assert.equal(record.data.full_name, "An Nguyen");
  assert.equal(record.data.email, "an.buyer@example.com");

  await assert.rejects(() => contact(kernel, "CRM-CONTACT-X", { organization: "CRM-ORG-X", email: "other@example.com" }), /organization belongs to another company/);
  await assert.rejects(() => contact(kernel, "CRM-CONTACT-2", { first_name: "Other", email: "AN.BUYER@example.com" }), /Possible duplicate/);
  await contact(kernel, "CRM-CONTACT-2", { first_name: "Other", email: "AN.BUYER@example.com", status: "Duplicate", duplicate_of: "CRM-CONTACT-1" }, salesManager);

  await assert.rejects(() => mutate(kernel, {
    commandId: "withdraw-without-evidence", actor: salesUser, doctype: "CRM Contact", name: "CRM-CONTACT-1", action: "save", expectedVersion: 1,
    document: { consent_status: "Withdrawn" },
  }), /requires fresh consent_at and consent_source evidence/);
  await mutate(kernel, {
    commandId: "withdraw", actor: salesUser, doctype: "CRM Contact", name: "CRM-CONTACT-1", action: "save", expectedVersion: 1,
    document: { consent_status: "Withdrawn", consent_at: "2026-08-03T10:30:00.000Z", consent_source: "Email reply" },
  });
  record = await store.getDocument("demo", "CRM Contact", "CRM-CONTACT-1");
  assert.equal(record.data.consent_status, "Withdrawn");
  const event = store.snapshot().events.find((candidate) => candidate.event_type === "crm.contact.consent_changed" && candidate.aggregate.name === "CRM-CONTACT-1");
  assert.ok(event);
  assert.equal(Object.hasOwn(event.payload, "email"), false);
  assert.equal(Object.hasOwn(event.payload, "phone"), false);
});
