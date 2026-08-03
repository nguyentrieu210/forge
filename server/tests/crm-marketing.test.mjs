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
const PIPELINE = "Default Sales Pipeline";
const WON_STAGE = `${PIPELINE}::Won`;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("User", "owner@example.com", "demo", { enabled: true });
  store.seedMaster("Territory", "Vietnam", "demo", { territory_name: "Vietnam" });
  store.seedMaster("CRM Lead Source", "Website", "demo", { source_name: "Website", disabled: false });
  store.seedMaster("CRM Pipeline", PIPELINE, "demo", { pipeline_name: PIPELINE, disabled: false });
  store.seedMaster("CRM Stage", WON_STAGE, "demo", { stage_name: "Won", pipeline: PIPELINE, stage_type: "Won", probability: "100", disabled: false });
  store.seedMaster("CRM Deal Close Reason", "Best fit", "demo", { reason: "Best fit", outcome: "Won", disabled: false });
  const allowAll = { assert() {} };
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, allowAll, () => NOW);
  return { kernel, store };
}

async function createContact(kernel, name, consentStatus, email) {
  const evidence = consentStatus === "Unknown"
    ? {}
    : { consent_at: "2026-08-03T09:00:00.000Z", consent_source: "Web form" };
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesUser, doctype: "CRM Contact", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      first_name: name,
      email,
      territory: "Vietnam",
      consent_status: consentStatus,
      status: "Active",
      ...evidence,
    },
  });
}

async function createSegmentAndList(kernel) {
  await mutate(kernel, {
    commandId: "segment-create", actor: salesManager, doctype: "CRM Segment", name: "CRM-SEG-1", action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      segment_name: "Consented website prospects",
      territory: "Vietnam",
      lead_source: "Website",
      consent_requirement: "Granted",
      status: "Active",
    },
  });
  await mutate(kernel, {
    commandId: "list-create", actor: salesManager, doctype: "CRM Marketing List", name: "CRM-LIST-1", action: "create", expectedVersion: null,
    document: { company: "Demo", list_name: "August opted-in prospects", segment: "CRM-SEG-1", status: "Draft" },
  });
  await mutate(kernel, {
    commandId: "list-activate", actor: salesManager, doctype: "CRM Marketing List", name: "CRM-LIST-1", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  });
}

async function createWonDeal(kernel, name = "CRM-DEAL-MKT-1", amount = "1000") {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesUser, doctype: "CRM Deal", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      opportunity_name: "Attributed won deal",
      party_type: "Customer",
      party: "CUST-0001",
      pipeline: PIPELINE,
      sales_stage: WON_STAGE,
      opportunity_amount: amount,
      currency: "USD",
      expected_close_date: "2026-08-03",
      close_reason: "Best fit",
    },
  });
}

test("CRM app v0.5 packages consent-safe marketing and attribution metadata", async () => {
  const source = await readAppSource(fileURLToPath(new URL("../apps-src/crm/", import.meta.url)));
  const parsed = parseAppManifest(source);
  assert.equal(parsed.version, "0.5.0");
  for (const name of ["CRM Segment", "CRM Marketing List", "CRM Marketing List Member", "CRM Campaign", "CRM Campaign Attribution"]) {
    assert.ok(parsed.doctypes.some((doctype) => doctype.name === name), `${name} must be packaged`);
  }
  assert.ok(parsed.reports.some((report) => report.name === "crm-campaign-attribution-summary"));
  assert.ok(parsed.reports.some((report) => report.name === "crm-marketing-membership-status"));
  assert.ok(parsed.screens.some((screen) => screen.name === "crm-marketing"));
  assert.ok(parsed.charts.some((chart) => chart.name === "crm-campaign-attributed-value"));
});

test("Marketing membership rechecks explicit consent and preserves unsubscribe evidence", async () => {
  const { kernel, store } = setup();
  await createContact(kernel, "CRM-CONTACT-UNKNOWN", "Unknown", "unknown@example.com");
  await createContact(kernel, "CRM-CONTACT-GRANTED", "Granted", "granted@example.com");
  await createSegmentAndList(kernel);

  await assert.rejects(() => mutate(kernel, {
    commandId: "member-unknown-create", actor: salesManager, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-UNKNOWN", action: "create", expectedVersion: null,
    document: { company: "Demo", marketing_list: "CRM-LIST-1", contact: "CRM-CONTACT-UNKNOWN", source: "Manual", status: "Active" },
  }), /requires explicit Granted contact consent/);

  await mutate(kernel, {
    commandId: "member-create", actor: salesManager, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-1", action: "create", expectedVersion: null,
    document: { company: "Demo", marketing_list: "CRM-LIST-1", contact: "CRM-CONTACT-GRANTED", source: "Manual", status: "Active" },
  });
  let member = await store.getDocument("demo", "CRM Marketing List Member", "CRM-MEMBER-1");
  assert.equal(member.data.added_at, NOW);

  await mutate(kernel, {
    commandId: "member-unsubscribe", actor: salesUser, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-1", action: "save", expectedVersion: 1,
    document: { status: "Unsubscribed", unsubscribed_reason: "Recipient opted out" },
  });
  member = await store.getDocument("demo", "CRM Marketing List Member", "CRM-MEMBER-1");
  assert.equal(member.status, "Unsubscribed");
  assert.equal(member.data.unsubscribed_at, NOW);
  assert.equal(member.data.unsubscribed_reason, "Recipient opted out");

  await assert.rejects(() => mutate(kernel, {
    commandId: "member-resubscribe-user", actor: salesUser, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-1", action: "save", expectedVersion: 2,
    document: { status: "Active" },
  }), /Only a Sales Manager may resubscribe/);

  await mutate(kernel, {
    commandId: "member-resubscribe-manager", actor: salesManager, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-1", action: "save", expectedVersion: 2,
    document: { status: "Active" },
  });
  member = await store.getDocument("demo", "CRM Marketing List Member", "CRM-MEMBER-1");
  assert.equal(member.status, "Active");
  assert.equal(member.data.unsubscribed_at, undefined);
  assert.equal(member.data.unsubscribed_reason, undefined);
});

test("Campaign activation uses current consent eligibility and never implies provider delivery", async () => {
  const { kernel, store } = setup();
  await createContact(kernel, "CRM-CONTACT-GRANTED", "Granted", "granted@example.com");
  await createSegmentAndList(kernel);

  await mutate(kernel, {
    commandId: "campaign-create", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-1", action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      campaign_name: "August nurture",
      marketing_list: "CRM-LIST-1",
      channel: "Email",
      currency: "USD",
      budget: "250.00",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      owner_user: "owner@example.com",
      status: "Draft",
    },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "campaign-no-members", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-1", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  }), /without at least one currently eligible marketing contact/);

  await mutate(kernel, {
    commandId: "member-create", actor: salesManager, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-1", action: "create", expectedVersion: null,
    document: { company: "Demo", marketing_list: "CRM-LIST-1", contact: "CRM-CONTACT-GRANTED", source: "Manual", status: "Active" },
  });
  await mutate(kernel, {
    commandId: "campaign-activate", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-1", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  });
  let campaign = await store.getDocument("demo", "CRM Campaign", "CRM-CAMPAIGN-1");
  assert.equal(campaign.status, "Active");
  assert.equal(Object.hasOwn(campaign.data, "provider_message_id"), false, "campaign activation must not fake provider delivery evidence");

  await mutate(kernel, {
    commandId: "campaign-pause", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-1", action: "save", expectedVersion: 2,
    document: { status: "Paused" },
  });
  await mutate(kernel, {
    commandId: "contact-withdraw", actor: salesUser, doctype: "CRM Contact", name: "CRM-CONTACT-GRANTED", action: "save", expectedVersion: 1,
    document: { consent_status: "Withdrawn", consent_at: "2026-08-03T11:00:00.000Z", consent_source: "Unsubscribe link" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "campaign-reactivate-withdrawn", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-1", action: "save", expectedVersion: 3,
    document: { status: "Active" },
  }), /without at least one currently eligible marketing contact/);

  campaign = await store.getDocument("demo", "CRM Campaign", "CRM-CAMPAIGN-1");
  assert.equal(campaign.status, "Paused");
});

test("Campaign attribution snapshots value, caps deal allocation at 100 percent and corrects by cancellation", async () => {
  const { kernel, store } = setup();
  await createContact(kernel, "CRM-CONTACT-GRANTED", "Granted", "granted@example.com");
  await createSegmentAndList(kernel);
  await mutate(kernel, {
    commandId: "member-create", actor: salesManager, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-1", action: "create", expectedVersion: null,
    document: { company: "Demo", marketing_list: "CRM-LIST-1", contact: "CRM-CONTACT-GRANTED", source: "Manual", status: "Active" },
  });

  for (const [name, label] of [["CRM-CAMPAIGN-1", "Campaign one"], ["CRM-CAMPAIGN-2", "Campaign two"], ["CRM-CAMPAIGN-3", "Campaign three"]]) {
    await mutate(kernel, {
      commandId: `${name}-create`, actor: salesManager, doctype: "CRM Campaign", name, action: "create", expectedVersion: null,
      document: { company: "Demo", campaign_name: label, marketing_list: "CRM-LIST-1", channel: "Email", currency: "USD", budget: "100", start_date: "2026-08-01", end_date: "2026-08-31", status: "Draft" },
    });
    await mutate(kernel, {
      commandId: `${name}-active`, actor: salesManager, doctype: "CRM Campaign", name, action: "save", expectedVersion: 1,
      document: { status: "Active" },
    });
  }
  await createWonDeal(kernel, "CRM-DEAL-MKT-1", "1000");

  await mutate(kernel, {
    commandId: "attr-60", actor: salesManager, doctype: "CRM Campaign Attribution", name: "CRM-ATTR-60", action: "create", expectedVersion: null,
    document: { company: "Demo", campaign: "CRM-CAMPAIGN-1", deal: "CRM-DEAL-MKT-1", model: "Influenced", attribution_percent: "60", status: "Active" },
  });
  await mutate(kernel, {
    commandId: "attr-40", actor: salesManager, doctype: "CRM Campaign Attribution", name: "CRM-ATTR-40", action: "create", expectedVersion: null,
    document: { company: "Demo", campaign: "CRM-CAMPAIGN-2", deal: "CRM-DEAL-MKT-1", model: "Influenced", attribution_percent: "40", status: "Active" },
  });
  let attr = await store.getDocument("demo", "CRM Campaign Attribution", "CRM-ATTR-60");
  assert.equal(attr.data.deal_amount, "1000");
  assert.equal(attr.data.attributed_value, "600.000000");
  assert.equal(attr.data.deal_status, "Won");

  await assert.rejects(() => mutate(kernel, {
    commandId: "attr-over-100", actor: salesManager, doctype: "CRM Campaign Attribution", name: "CRM-ATTR-1", action: "create", expectedVersion: null,
    document: { company: "Demo", campaign: "CRM-CAMPAIGN-3", deal: "CRM-DEAL-MKT-1", model: "Influenced", attribution_percent: "1", status: "Active" },
  }), /cannot exceed 100%/);

  await mutate(kernel, {
    commandId: "attr-40-cancel", actor: salesManager, doctype: "CRM Campaign Attribution", name: "CRM-ATTR-40", action: "save", expectedVersion: 1,
    document: { status: "Cancelled" },
  });
  await mutate(kernel, {
    commandId: "attr-replacement-40", actor: salesManager, doctype: "CRM Campaign Attribution", name: "CRM-ATTR-40B", action: "create", expectedVersion: null,
    document: { company: "Demo", campaign: "CRM-CAMPAIGN-3", deal: "CRM-DEAL-MKT-1", model: "Influenced", attribution_percent: "40", status: "Active" },
  });
  attr = await store.getDocument("demo", "CRM Campaign Attribution", "CRM-ATTR-40B");
  assert.equal(attr.data.attributed_value, "400.000000");
  assert.ok(store.snapshot().events.some((event) => event.event_type === "crm.campaign_attribution.cancelled"));
});
