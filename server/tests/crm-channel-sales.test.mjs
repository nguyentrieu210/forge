import assert from "node:assert/strict";
import test from "node:test";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("Currency", "USD", "demo", { currency_scale: 2 });
  store.seedMaster("User", "sales@example.com", "demo", { enabled: true });
  store.seedMaster("User", "rep@example.com", "demo", { enabled: true });
  store.seedMaster("Territory", "Vietnam", "demo", { territory_name: "Vietnam" });
  store.seedMaster("Item", "ITEM-1", "demo", { item_code: "ITEM-1", stock_uom: "Nos" });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function createPartner(kernel, name = "CRM-PARTNER-1", overrides = {}) {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesManager, doctype: "CRM Channel Partner", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo", partner_name: "Dealer One", partner_type: "Dealer", customer: "CUST-0001", territory: "Vietnam",
      assigned_to: "sales@example.com", latitude: "10.0000", longitude: "106.0000", checkin_radius_m: "500", status: "Active", ...overrides,
    },
  });
}

async function createRoute(kernel, name = "CRM-ROUTE-1", overrides = {}) {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesManager, doctype: "CRM Sales Route", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo", route_name: "Monday dealer route", salesperson: "sales@example.com", territory: "Vietnam",
      start_date: "2026-08-03", end_date: "2026-08-03", status: "Draft", ...overrides,
    },
  });
}

test("Channel Partner is a unique active commercial mapping to ERP Customer", async () => {
  const { kernel, store } = setup();
  await createPartner(kernel);
  const partner = await store.getDocument("demo", "CRM Channel Partner", "CRM-PARTNER-1");
  assert.equal(partner.data.customer, "CUST-0001");
  assert.equal(partner.data.checkin_radius_m, "500");
  await assert.rejects(() => createPartner(kernel, "CRM-PARTNER-2", { partner_name: "Duplicate dealer" }), /already mapped to active CRM Channel Partner CRM-PARTNER-1/);
  await assert.rejects(() => mutate(kernel, {
    commandId: "partner-user-edit", actor: salesUser, doctype: "CRM Channel Partner", name: "CRM-PARTNER-1", action: "save", expectedVersion: 1,
    document: { notes: "unauthorized config edit" },
  }), /Only a Sales Manager may manage CRM Channel Partners/);
});

test("Sales Route activates only after validated stops and geo check-in is immutable evidence", async () => {
  const { kernel, store } = setup();
  await createPartner(kernel);
  await createRoute(kernel);

  await assert.rejects(() => mutate(kernel, {
    commandId: "route-empty-activate", actor: salesManager, doctype: "CRM Sales Route", name: "CRM-ROUTE-1", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  }), /requires at least one stop/);

  await mutate(kernel, {
    commandId: "stop-create", actor: salesManager, doctype: "CRM Sales Route Stop", name: "CRM-STOP-1", action: "create", expectedVersion: null,
    document: { company: "Demo", sales_route: "CRM-ROUTE-1", sequence: 1, partner: "CRM-PARTNER-1", planned_date: "2026-08-03" },
  });
  await mutate(kernel, {
    commandId: "route-activate", actor: salesManager, doctype: "CRM Sales Route", name: "CRM-ROUTE-1", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  });

  await assert.rejects(() => mutate(kernel, {
    commandId: "checkin-spoof", actor: salesUser, doctype: "CRM Field Check-In", name: "CRM-CHECKIN-X", action: "create", expectedVersion: null,
    document: { company: "Demo", sales_route: "CRM-ROUTE-1", route_stop: "CRM-STOP-1", partner: "CRM-PARTNER-1", salesperson: "rep@example.com", latitude: "10", longitude: "106" },
  }), /only for themselves/);

  await mutate(kernel, {
    commandId: "checkin-create", actor: salesUser, doctype: "CRM Field Check-In", name: "CRM-CHECKIN-1", action: "create", expectedVersion: null,
    document: { company: "Demo", sales_route: "CRM-ROUTE-1", route_stop: "CRM-STOP-1", partner: "CRM-PARTNER-1", salesperson: "sales@example.com", latitude: "10.0005", longitude: "106.0005" },
  });
  const checkin = await store.getDocument("demo", "CRM Field Check-In", "CRM-CHECKIN-1");
  assert.equal(checkin.status, "Inside Radius");
  assert.equal(checkin.data.checked_in_at, NOW);
  assert.ok(Number(checkin.data.distance_m) > 0);
  await assert.rejects(() => mutate(kernel, {
    commandId: "checkin-edit", actor: salesManager, doctype: "CRM Field Check-In", name: "CRM-CHECKIN-1", action: "save", expectedVersion: 1,
    document: { notes: "rewrite evidence" },
  }), /immutable evidence/);
  const event = store.snapshot().events.find((candidate) => candidate.event_type === "crm.field_check_in.recorded");
  assert.ok(event);
  assert.equal(Object.hasOwn(event.payload, "latitude"), false, "precise location must not leak into outbox event payload");
  assert.equal(Object.hasOwn(event.payload, "longitude"), false, "precise location must not leak into outbox event payload");
});

test("Sell-out is partner-reported revenue evidence with manager confirmation and no inventory ledger", async () => {
  const { kernel, store } = setup();
  await createPartner(kernel);
  await mutate(kernel, {
    commandId: "sellout-create", actor: salesUser, doctype: "CRM Sell Out Report", name: "CRM-SELLOUT-1", action: "create", expectedVersion: null,
    document: {
      company: "Demo", partner: "CRM-PARTNER-1", report_date: "2026-08-03", currency: "USD", status: "Draft",
      lines: [{ item_code: "ITEM-1", qty: "2", unit_price: "10" }],
    },
  });
  let report = await store.getDocument("demo", "CRM Sell Out Report", "CRM-SELLOUT-1");
  assert.equal(report.data.total_amount, "20.00");
  assert.equal(report.children[0].child_doctype, "CRM Sell Out Line");

  await assert.rejects(() => mutate(kernel, {
    commandId: "sellout-user-confirm", actor: salesUser, doctype: "CRM Sell Out Report", name: "CRM-SELLOUT-1", action: "save", expectedVersion: 1,
    document: { status: "Confirmed" },
  }), /Only a Sales Manager may confirm or cancel/);
  await mutate(kernel, {
    commandId: "sellout-confirm", actor: salesManager, doctype: "CRM Sell Out Report", name: "CRM-SELLOUT-1", action: "save", expectedVersion: 1,
    document: { status: "Confirmed" },
  });
  report = await store.getDocument("demo", "CRM Sell Out Report", "CRM-SELLOUT-1");
  assert.equal(report.status, "Confirmed");

  const snapshot = store.snapshot();
  assert.equal(snapshot.stock_entries.length, 0, "sell-out report must not mutate canonical inventory");
  assert.equal(snapshot.gl_entries.length, 0, "sell-out report must not post accounting ledger");
  assert.equal(snapshot.payment_entries.length, 0, "sell-out report must not create AR/AP movements");

  await mutate(kernel, {
    commandId: "sellout-cancel", actor: salesManager, doctype: "CRM Sell Out Report", name: "CRM-SELLOUT-1", action: "save", expectedVersion: 2,
    document: { status: "Cancelled" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "sellout-edit-cancelled", actor: salesManager, doctype: "CRM Sell Out Report", name: "CRM-SELLOUT-1", action: "save", expectedVersion: 3,
    document: { notes: "rewrite history" },
  }), /Cancelled CRM Sell Out Report is immutable/);
});
