import assert from "node:assert/strict";
import test from "node:test";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };
const PIPELINE = "Default Sales Pipeline";
const WON = `${PIPELINE}::Won`;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("User", "rep@example.com", "demo", { enabled: true });
  store.seedMaster("CRM Pipeline", PIPELINE, "demo", { pipeline_name: PIPELINE, disabled: false });
  store.seedMaster("CRM Stage", WON, "demo", { stage_name: "Won", pipeline: PIPELINE, stage_type: "Won", probability: "100", disabled: false });
  store.seedMaster("CRM Deal Close Reason", "Best fit", "demo", { reason: "Best fit", outcome: "Won", disabled: false });
  const allowAll = { assert() {} };
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, allowAll, () => NOW);
  return { kernel, store };
}

async function createWonDeal(kernel, name = "CRM-DEAL-00001", amount = "1000.00") {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesUser, doctype: "CRM Deal", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      opportunity_name: "Won annual contract",
      party_type: "Customer",
      party: "CUST-0001",
      pipeline: PIPELINE,
      sales_stage: WON,
      opportunity_amount: amount,
      currency: "USD",
      expected_close_date: "2026-08-01",
      close_reason: "Best fit",
    },
  });
}

test("CRM Sales Target requires manager lifecycle and rejects overlapping active quotas", async () => {
  const { kernel, store } = setup();
  const target = {
    company: "Demo",
    target_owner_type: "User",
    target_owner: "rep@example.com",
    currency: "USD",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    target_amount: "100000.00",
    status: "Draft",
  };

  await assert.rejects(() => mutate(kernel, {
    commandId: "target-user-create", actor: salesUser, doctype: "CRM Sales Target", name: "CRM-TARGET-1", action: "create", expectedVersion: null,
    document: target,
  }), /Only a Sales Manager may manage CRM Sales Targets/);

  await mutate(kernel, {
    commandId: "target-1-create", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-1", action: "create", expectedVersion: null,
    document: target,
  });
  await mutate(kernel, {
    commandId: "target-1-activate", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-1", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  });

  await mutate(kernel, {
    commandId: "target-2-create", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-2", action: "create", expectedVersion: null,
    document: { ...target, start_date: "2026-08-15", end_date: "2026-09-15", target_amount: "150000" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "target-2-activate-overlap", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-2", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  }), /overlaps CRM-TARGET-1/);

  await mutate(kernel, {
    commandId: "target-1-close", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-1", action: "save", expectedVersion: 2,
    document: { status: "Closed" },
  });
  await mutate(kernel, {
    commandId: "target-2-activate", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-2", action: "save", expectedVersion: 1,
    document: { status: "Active" },
  });
  const target2 = await store.getDocument("demo", "CRM Sales Target", "CRM-TARGET-2");
  assert.equal(target2.status, "Active");
  assert.ok(store.snapshot().events.some((event) => event.event_type === "crm.sales_target.closed"));
});

test("CRM Commission snapshots won-deal economics and requires payment evidence", async () => {
  const { kernel, store } = setup();
  await createWonDeal(kernel);

  await mutate(kernel, {
    commandId: "commission-rule-create", actor: salesManager, doctype: "CRM Commission Rule", name: "CRM-COMM-RULE-1", action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      rule_name: "Standard sales commission",
      rate: "7.5",
      effective_from: "2026-01-01",
      status: "Active",
    },
  });

  await mutate(kernel, {
    commandId: "commission-create", actor: salesManager, doctype: "CRM Commission Accrual", name: "CRM-COMM-1", action: "create", expectedVersion: null,
    document: {
      company: "Demo",
      deal: "CRM-DEAL-00001",
      payee: "rep@example.com",
      rule: "CRM-COMM-RULE-1",
      earned_on: "2026-08-01",
      status: "Draft",
    },
  });
  let accrual = await store.getDocument("demo", "CRM Commission Accrual", "CRM-COMM-1");
  assert.equal(accrual.data.currency, "USD");
  assert.equal(accrual.data.base_amount, "1000.00");
  assert.equal(accrual.data.rate, "7.5");
  assert.equal(accrual.data.commission_amount, "75.000000");

  await assert.rejects(() => mutate(kernel, {
    commandId: "commission-duplicate", actor: salesManager, doctype: "CRM Commission Accrual", name: "CRM-COMM-2", action: "create", expectedVersion: null,
    document: {
      company: "Demo", deal: "CRM-DEAL-00001", payee: "rep@example.com", rule: "CRM-COMM-RULE-1", earned_on: "2026-08-01", status: "Draft",
    },
  }), /already exists as CRM-COMM-1/);

  await mutate(kernel, {
    commandId: "commission-rule-change", actor: salesManager, doctype: "CRM Commission Rule", name: "CRM-COMM-RULE-1", action: "save", expectedVersion: 1,
    document: { rate: "20" },
  });
  await mutate(kernel, {
    commandId: "commission-approve", actor: salesManager, doctype: "CRM Commission Accrual", name: "CRM-COMM-1", action: "save", expectedVersion: 1,
    document: { status: "Approved" },
  });
  accrual = await store.getDocument("demo", "CRM Commission Accrual", "CRM-COMM-1");
  assert.equal(accrual.data.rate, "7.5", "approved accrual must keep the earned snapshot after rule changes");
  assert.equal(accrual.data.commission_amount, "75.000000");

  await assert.rejects(() => mutate(kernel, {
    commandId: "commission-paid-no-reference", actor: salesManager, doctype: "CRM Commission Accrual", name: "CRM-COMM-1", action: "save", expectedVersion: 2,
    document: { status: "Paid" },
  }), /Payment Entry reference is required/);

  store.seedMaster("Payment Entry", "PAY-0001", "demo", { company: "Demo" });
  await mutate(kernel, {
    commandId: "commission-paid", actor: salesManager, doctype: "CRM Commission Accrual", name: "CRM-COMM-1", action: "save", expectedVersion: 2,
    document: { status: "Paid", payment_reference: "PAY-0001" },
  });
  accrual = await store.getDocument("demo", "CRM Commission Accrual", "CRM-COMM-1");
  assert.equal(accrual.status, "Paid");
  assert.equal(accrual.data.payment_reference, "PAY-0001");

  await assert.rejects(() => mutate(kernel, {
    commandId: "commission-paid-edit", actor: salesManager, doctype: "CRM Commission Accrual", name: "CRM-COMM-1", action: "save", expectedVersion: 3,
    document: { notes: "retroactive change" },
  }), /Paid CRM Commission Accrual is immutable/);
  assert.ok(store.snapshot().events.some((event) => event.event_type === "crm.commission_accrual.paid"));
});
