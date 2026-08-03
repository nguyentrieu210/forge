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
  store.seedMaster("User", "sales@example.com", "demo", { enabled: true });
  store.seedMaster("Item", "ITEM-1", "demo", { item_code: "ITEM-1", stock_uom: "Nos", default_sales_uom: "Nos" });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { store, kernel };
}

async function partner(kernel) {
  await mutate(kernel, {
    commandId: "partner-create", actor: salesManager, doctype: "CRM Channel Partner", name: "CRM-PARTNER-1", action: "create", expectedVersion: null,
    document: { company: "Demo", partner_name: "Dealer One", partner_type: "Dealer", customer: "CUST-0001", assigned_to: "sales@example.com", latitude: "10", longitude: "106", checkin_radius_m: "500", status: "Active" },
  });
}

async function salesOrder(kernel) {
  await mutate(kernel, {
    commandId: "so-create", actor: salesUser, doctype: "Sales Order", name: "SO-1", action: "create", expectedVersion: null,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", transaction_date: "2026-08-03", items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty: "2", rate: "100" }], taxes: [] },
  });
  const order = await kernel.readDocument?.("demo", "Sales Order", "SO-1");
  void order;
}

test("Sell-in snapshots exact Sales Order version for the mapped channel partner", async () => {
  const { kernel, store } = setup();
  await partner(kernel);
  await salesOrder(kernel);
  const order = await store.getDocument("demo", "Sales Order", "SO-1");
  await mutate(kernel, { commandId: "so-submit", actor: salesUser, doctype: "Sales Order", name: "SO-1", action: "submit", expectedVersion: 1, document: order.data });

  await mutate(kernel, {
    commandId: "sellin-snapshot", actor: salesUser, doctype: "CRM Sell In Snapshot", name: "CRM-SELLIN-1", action: "create", expectedVersion: null,
    document: { company: "Demo", partner: "CRM-PARTNER-1", sales_order: "SO-1" },
  });
  const snapshot = await store.getDocument("demo", "CRM Sell In Snapshot", "CRM-SELLIN-1");
  assert.equal(snapshot.data.sales_order_version, 2);
  assert.equal(snapshot.data.order_docstatus, 1);
  assert.equal(snapshot.data.order_total, "200.00");
  assert.equal(snapshot.data.recorded_at, NOW);

  await assert.rejects(() => mutate(kernel, {
    commandId: "sellin-duplicate", actor: salesUser, doctype: "CRM Sell In Snapshot", name: "CRM-SELLIN-2", action: "create", expectedVersion: null,
    document: { company: "Demo", partner: "CRM-PARTNER-1", sales_order: "SO-1" },
  }), /already snapshotted/);
});

test("Promotion execution needs assigned actor, active campaign and matching non-outside check-in", async () => {
  const { kernel, store } = setup();
  await partner(kernel);
  await mutate(kernel, {
    commandId: "list-create", actor: salesManager, doctype: "CRM Marketing List", name: "CRM-LIST-PROMO", action: "create", expectedVersion: null,
    document: { company: "Demo", list_name: "Promo list", status: "Draft" },
  });
  await mutate(kernel, { commandId: "list-active", actor: salesManager, doctype: "CRM Marketing List", name: "CRM-LIST-PROMO", action: "save", expectedVersion: 1, document: { status: "Active" } });
  store.seedMaster("Currency", "USD", "demo", { currency_scale: 2 });
  await mutate(kernel, {
    commandId: "contact-create", actor: salesUser, doctype: "CRM Contact", name: "CRM-CONTACT-PROMO", action: "create", expectedVersion: null,
    document: { company: "Demo", first_name: "Promo", email: "promo@example.com", consent_status: "Granted", consent_at: "2026-08-03T09:00:00.000Z", consent_source: "Web form", status: "Active" },
  });
  await mutate(kernel, {
    commandId: "member-create", actor: salesManager, doctype: "CRM Marketing List Member", name: "CRM-MEMBER-PROMO", action: "create", expectedVersion: null,
    document: { company: "Demo", marketing_list: "CRM-LIST-PROMO", contact: "CRM-CONTACT-PROMO", source: "Manual", status: "Active" },
  });
  await mutate(kernel, {
    commandId: "campaign-create", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-PROMO", action: "create", expectedVersion: null,
    document: { company: "Demo", campaign_name: "Dealer display", marketing_list: "CRM-LIST-PROMO", channel: "Other", currency: "USD", budget: "100", start_date: "2026-08-01", end_date: "2026-08-31", status: "Draft" },
  });
  await mutate(kernel, { commandId: "campaign-active", actor: salesManager, doctype: "CRM Campaign", name: "CRM-CAMPAIGN-PROMO", action: "save", expectedVersion: 1, document: { status: "Active" } });
  await mutate(kernel, {
    commandId: "promo-plan", actor: salesManager, doctype: "CRM Promotion Execution", name: "CRM-PROMO-1", action: "create", expectedVersion: null,
    document: { company: "Demo", campaign: "CRM-CAMPAIGN-PROMO", partner: "CRM-PARTNER-1", salesperson: "sales@example.com", planned_date: "2026-08-03", status: "Planned" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "promo-no-checkin", actor: salesUser, doctype: "CRM Promotion Execution", name: "CRM-PROMO-1", action: "save", expectedVersion: 1,
    document: { status: "Executed" },
  }), /Field check-in evidence is required/);
  await mutate(kernel, {
    commandId: "checkin-create", actor: salesUser, doctype: "CRM Field Check-In", name: "CRM-CHECKIN-PROMO", action: "create", expectedVersion: null,
    document: { company: "Demo", partner: "CRM-PARTNER-1", salesperson: "sales@example.com", latitude: "10.0001", longitude: "106.0001" },
  });
  await mutate(kernel, {
    commandId: "promo-execute", actor: salesUser, doctype: "CRM Promotion Execution", name: "CRM-PROMO-1", action: "save", expectedVersion: 1,
    document: { status: "Executed", field_check_in: "CRM-CHECKIN-PROMO" },
  });
  const promo = await store.getDocument("demo", "CRM Promotion Execution", "CRM-PROMO-1");
  assert.equal(promo.status, "Executed");
  assert.equal(promo.data.executed_at, NOW);
  assert.ok(store.snapshot().events.some((event) => event.event_type === "crm.promotion_execution.executed"));
});
