import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";

const NOW = "2026-10-02T00:00:00.000Z";
const HASH = "a".repeat(64);

function glPlan(name, account, debitMinor, {
  creditMinor = 0,
  postingAt = "2026-06-30T12:00:00.000Z",
  currency = "VND",
  currencyScale = 0,
  costCenter,
  dimensions = {},
  doctype = "Journal Entry",
  lineKey = "L1",
  documentData = {},
  action = "create",
  expectedVersion = null,
  version = 1,
  docstatus = 1,
} = {}) {
  const data = { company: "Kairo", posting_at: postingAt, ...documentData };
  return {
    command: {
      schema_version: 1,
      tenant_id: "demo",
      command_id: `cmd-${name}`,
      aggregate: { doctype, name },
      action,
      expected_version: expectedVersion,
      payload_hash: HASH,
      document: data,
      actor: { user_id: "qa@example.test", roles: ["Accounts Manager"] },
    },
    document: {
      tenant_id: "demo",
      doctype,
      name,
      owner: "qa@example.test",
      docstatus,
      status: docstatus === 2 ? "Cancelled" : "Submitted",
      version,
      created_at: NOW,
      modified_at: NOW,
      data,
      children: [],
    },
    gl_entries: [{
      line_key: lineKey,
      account,
      debit_minor: debitMinor,
      credit_minor: creditMinor,
      currency,
      currency_scale: currencyScale,
      ...(costCenter ? { cost_center: costCenter } : {}),
      accounting_dimensions: dimensions,
      posting_at: postingAt,
    }],
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    events: [],
    result: { ok: true },
  };
}

function revisionPlan(name, budget, deltaMinor, {
  postingDate = "2026-01-15",
  action = "create",
  expectedVersion = null,
  version = 1,
  docstatus = 1,
} = {}) {
  const data = {
    budget,
    posting_date: postingDate,
    delta_amount_minor: deltaMinor,
    delta_amount: String(deltaMinor),
    reason: "budget adjustment",
  };
  return {
    command: {
      schema_version: 1,
      tenant_id: "demo",
      command_id: `cmd-${name}-${action}`,
      aggregate: { doctype: "Finance Budget Revision", name },
      action,
      expected_version: expectedVersion,
      payload_hash: HASH,
      document: data,
      actor: { user_id: "qa@example.test", roles: ["Accounts Manager"] },
    },
    document: {
      tenant_id: "demo",
      doctype: "Finance Budget Revision",
      name,
      owner: "qa@example.test",
      docstatus,
      status: docstatus === 2 ? "Cancelled" : "Approved",
      version,
      created_at: NOW,
      modified_at: NOW,
      data,
      children: [],
    },
    gl_entries: [],
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    events: [],
    result: { ok: true },
  };
}

function commitmentPlan(name, budget, amountMinor, {
  postingDate = "2026-08-03",
  sourceDoctype = "Purchase Order",
  sourceName = "PO-DIST",
  commitmentType = "Reserve",
} = {}) {
  const data = {
    budget,
    posting_date: postingDate,
    commitment_type: commitmentType,
    amount_minor: amountMinor,
    amount: String(amountMinor),
    source_doctype: sourceDoctype,
    source_name: sourceName,
  };
  return {
    command: {
      schema_version: 1,
      tenant_id: "demo",
      command_id: `cmd-${name}`,
      aggregate: { doctype: "Finance Budget Commitment", name },
      action: "create",
      expected_version: null,
      payload_hash: HASH,
      document: data,
      actor: { user_id: "qa@example.test", roles: ["Accounts Manager"] },
    },
    document: {
      tenant_id: "demo",
      doctype: "Finance Budget Commitment",
      name,
      owner: "qa@example.test",
      docstatus: 1,
      status: "Committed",
      version: 1,
      created_at: NOW,
      modified_at: NOW,
      data,
      children: [],
    },
    gl_entries: [],
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    events: [],
    result: { ok: true },
  };
}

function seedBudget(store, name, account, amount, {
  action = "Stop",
  against = "Company",
  scope = {},
  rootType = "Expense",
} = {}) {
  store.seedMaster("Account", account, "demo", { company: "Kairo", root_type: rootType });
  store.seedDocument("Finance Budget", name, "demo", {
    company: "Kairo",
    account,
    budget_against: against,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    currency: "VND",
    currency_scale: 0,
    budget_amount_minor: amount,
    control_action: action,
    ...scope,
  }, 1);
}

test("in-memory store atomically enforces actual plus commitments for Stop budgets", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-STOP", "642", 1000);
  store.seedDocument("Finance Budget Commitment", "COM-1", "demo", {
    budget: "BUD-STOP",
    posting_date: "2026-04-01",
    commitment_type: "Reserve",
    amount_minor: 200,
  }, 1);

  await store.execute(glPlan("JE-BASE", "642", 700));
  await store.execute(glPlan("JE-EDGE", "642", 100));
  await assert.rejects(
    store.execute(glPlan("JE-OVER", "642", 1)),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});

test("Warn and Ignore budgets remain non-blocking while Stop respects scope", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-WARN", "643", 100, { action: "Warn" });
  seedBudget(store, "BUD-IGNORE", "644", 100, { action: "Ignore" });
  seedBudget(store, "BUD-CC", "645", 100, {
    against: "Cost Center",
    scope: { cost_center: "OPS", scope_key: "Cost Center:OPS" },
  });

  await store.execute(glPlan("JE-WARN", "643", 150));
  await store.execute(glPlan("JE-IGNORE", "644", 150));
  await store.execute(glPlan("JE-OTHER-CC", "645", 500, { costCenter: "SALES" }));
  await assert.rejects(
    store.execute(glPlan("JE-OPS", "645", 101, { costCenter: "OPS" })),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});

test("budget guard uses dated revisions, Income sign and fails closed on currency mismatch", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-REV", "646", 100);
  store.seedDocument("Finance Budget Revision", "REV-PAST", "demo", {
    budget: "BUD-REV", posting_date: "2026-05-01", delta_amount_minor: 50,
  }, 1);
  store.seedDocument("Finance Budget Revision", "REV-FUTURE", "demo", {
    budget: "BUD-REV", posting_date: "2026-12-01", delta_amount_minor: 1000,
  }, 1);
  await store.execute(glPlan("JE-REV", "646", 150));
  await assert.rejects(store.execute(glPlan("JE-REV-OVER", "646", 1)), /FINANCE_BUDGET_TRANSACTION_EXCEEDED/);

  seedBudget(store, "BUD-INCOME", "511", 100, { rootType: "Income" });
  await assert.rejects(
    store.execute(glPlan("JE-INCOME", "511", 0, { creditMinor: 101 })),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );

  seedBudget(store, "BUD-CURRENCY", "647", 100);
  await assert.rejects(
    store.execute(glPlan("JE-USD", "647", 1, { currency: "USD", currencyScale: 2 })),
    /FINANCE_BUDGET_GL_CURRENCY_SCALE_MISMATCH/,
  );
});


test("linked Purchase Invoice actual automatically consumes PO commitment and cancellation restores it", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-AUTO", "648", 1000);
  store.seedDocument("Purchase Order", "PO-AUTO", "demo", {
    company: "Kairo",
    currency: "VND",
    items: [{ row_id: "PO-ROW", item_code: "ITEM-1", material_request: "MR-AUTO" }],
  }, 1);
  store.seedDocument("Finance Budget Commitment", "COM-AUTO", "demo", {
    budget: "BUD-AUTO",
    posting_date: "2026-04-01",
    commitment_type: "Reserve",
    amount_minor: 1000,
    source_doctype: "Purchase Order",
    source_name: "PO-AUTO",
  }, 1);

  const invoiceData = {
    against_purchase_order: "PO-AUTO",
    items: [{
      row_id: "PI-ROW",
      item_code: "ITEM-1",
      purchase_order: "PO-AUTO",
      purchase_order_item_row_id: "PO-ROW",
      material_request: "MR-AUTO",
    }],
  };
  await store.execute(glPlan("PI-AUTO", "648", 600, {
    doctype: "Purchase Invoice",
    lineKey: "EXPENSE-PI-ROW",
    documentData: invoiceData,
  }));

  // 600 actual + 400 outstanding commitment = exactly the 1000 budget.
  await assert.rejects(
    store.execute(glPlan("JE-AFTER-PI", "648", 1)),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );

  await store.execute(glPlan("PI-AUTO", "648", 0, {
    creditMinor: 600,
    doctype: "Purchase Invoice",
    lineKey: "REV-EXPENSE-PI-ROW",
    documentData: invoiceData,
    action: "cancel",
    expectedVersion: 1,
    version: 2,
    docstatus: 2,
  }));

  // Reversal removes the linked actual, so the original 1000 commitment becomes outstanding again.
  await assert.rejects(
    store.execute(glPlan("JE-AFTER-CANCEL", "648", 1)),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});


test("Expense Claim actual automatically consumes its source commitment", async () => {
  const store = new InMemoryMutationStore();
  seedBudget(store, "BUD-EC", "650", 300);
  store.seedDocument("Finance Budget Commitment", "COM-EC", "demo", {
    budget: "BUD-EC",
    posting_date: "2026-04-01",
    commitment_type: "Reserve",
    amount_minor: 300,
    source_doctype: "Expense Claim",
    source_name: "EC-1",
  }, 1);

  await store.execute(glPlan("EC-1", "650", 200, {
    doctype: "Expense Claim",
    lineKey: "EXPENSE-1",
  }));

  // 200 actual + 100 outstanding reserve reaches the budget exactly.
  await assert.rejects(
    store.execute(glPlan("JE-EC-OVER", "650", 1)),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});


test("in-memory fiscal distribution blocks commitment-only mutation against actual plus outstanding", async () => {
  const store = new InMemoryMutationStore();
  const distribution = Array.from({ length: 12 }, (_, index) => ({
    row_id: `DIST-${index + 1}`,
    start_date: `2026-${String(index + 1).padStart(2, "0")}-01`,
    end_date: `2026-${String(index + 1).padStart(2, "0")}-28`,
    percent_bps: index < 4 ? 834 : 833,
    allocation_weight: 1,
    amount_minor: 100,
  }));
  seedBudget(store, "BUD-DIST-STOP", "651", 1200, {
    scope: {
      fiscal_distribution_enabled: true,
      distribution_frequency: "Monthly",
      distribute_equally: true,
      distribution_weight_total: 12,
      budget_distribution: distribution,
    },
  });
  store.seedDocument("Purchase Order", "PO-DIST", "demo", { company: "Kairo" }, 1);

  await store.execute(glPlan("JE-DIST-ACTUAL", "651", 700, {
    postingAt: "2026-08-01T12:00:00.000Z",
  }));
  await store.execute(commitmentPlan("COM-DIST-EDGE", "BUD-DIST-STOP", 100));
  await assert.rejects(
    store.execute(commitmentPlan("COM-DIST-OVER", "BUD-DIST-STOP", 1, { sourceName: "PO-DIST" })),
    /FINANCE_BUDGET_TRANSACTION_EXCEEDED/,
  );
});


test("negative distributed budget revision revalidates historical period utilization", async () => {
  const store = new InMemoryMutationStore();
  const distribution = Array.from({ length: 12 }, (_, index) => ({
    row_id: `DIST-${index + 1}`,
    start_date: `2026-${String(index + 1).padStart(2, "0")}-01`,
    end_date: new Date(Date.UTC(2026, index + 1, 0)).toISOString().slice(0, 10),
    percent_bps: index < 4 ? 834 : 833,
    allocation_weight: 1,
    amount_minor: 100,
  }));
  seedBudget(store, "BUD-REV-DIST", "653", 1200, {
    scope: {
      fiscal_distribution_enabled: true,
      distribution_frequency: "Monthly",
      distribute_equally: true,
      distribution_weight_total: 12,
      budget_distribution: distribution,
    },
  });

  await store.execute(glPlan("JE-REV-DIST-JAN", "653", 100, {
    postingAt: "2026-01-10T12:00:00.000Z",
  }));

  await assert.rejects(
    store.execute(revisionPlan("REV-DIST-BLOCK", "BUD-REV-DIST", -120)),
    /FINANCE_BUDGET_REVISION_DISTRIBUTION_EXCEEDED/,
  );
});

test("negative distributed budget revision is allowed when every affected historical checkpoint still fits", async () => {
  const store = new InMemoryMutationStore();
  const distribution = Array.from({ length: 12 }, (_, index) => ({
    row_id: `DIST-${index + 1}`,
    start_date: `2026-${String(index + 1).padStart(2, "0")}-01`,
    end_date: new Date(Date.UTC(2026, index + 1, 0)).toISOString().slice(0, 10),
    percent_bps: index < 4 ? 834 : 833,
    allocation_weight: 1,
    amount_minor: 100,
  }));
  seedBudget(store, "BUD-REV-OK", "654", 1200, {
    scope: {
      fiscal_distribution_enabled: true,
      distribution_frequency: "Monthly",
      distribute_equally: true,
      distribution_weight_total: 12,
      budget_distribution: distribution,
    },
  });
  await store.execute(glPlan("JE-REV-OK-JAN", "654", 80, {
    postingAt: "2026-01-10T12:00:00.000Z",
  }));
  await store.execute(revisionPlan("REV-DIST-OK", "BUD-REV-OK", -120));
});

test("cancelling positive distributed budget revision revalidates historical checkpoints", async () => {
  const store = new InMemoryMutationStore();
  const distribution = Array.from({ length: 12 }, (_, index) => ({
    row_id: `DIST-${index + 1}`,
    start_date: `2026-${String(index + 1).padStart(2, "0")}-01`,
    end_date: new Date(Date.UTC(2026, index + 1, 0)).toISOString().slice(0, 10),
    percent_bps: index < 4 ? 834 : 833,
    allocation_weight: 1,
    amount_minor: 100,
  }));
  seedBudget(store, "BUD-REV-CANCEL", "655", 1200, {
    scope: {
      fiscal_distribution_enabled: true,
      distribution_frequency: "Monthly",
      distribute_equally: true,
      distribution_weight_total: 12,
      budget_distribution: distribution,
    },
  });
  store.seedDocument("Finance Budget Revision", "REV-POSITIVE", "demo", {
    budget: "BUD-REV-CANCEL",
    posting_date: "2026-01-01",
    delta_amount_minor: 1200,
  }, 1);
  await store.execute(glPlan("JE-REV-CANCEL-JAN", "655", 150, {
    postingAt: "2026-01-10T12:00:00.000Z",
  }));

  await assert.rejects(
    store.execute(revisionPlan("REV-POSITIVE", "BUD-REV-CANCEL", 1200, {
      postingDate: "2026-01-01",
      action: "cancel",
      expectedVersion: 1,
      version: 2,
      docstatus: 2,
    })),
    /FINANCE_BUDGET_REVISION_DISTRIBUTION_EXCEEDED/,
  );
});
