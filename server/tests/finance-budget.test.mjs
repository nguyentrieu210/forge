import assert from "node:assert/strict";
import test from "node:test";
import {
  FinanceBudgetCommitmentController,
  FinanceBudgetController,
  FinanceBudgetRevisionController,
} from "../dist/packages/clouderp-erpnext/src/finance-budget.js";

const now = "2026-08-03T00:00:00.000Z";

function canonical(doctype, name, data, docstatus = 1, owner = "maker@example.test", version = 1) {
  return { tenant_id: "demo", doctype, name, owner, docstatus, status: docstatus === 1 ? "Submitted" : "Draft", version, created_at: now, modified_at: now, data, children: [] };
}

function reader({ documents = [], masters = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents.find((doc) => doc.doctype === doctype && doc.name === name) ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) { return documents.filter((doc) => doc.doctype === doctype); },
    async hasMasterRecord(_tenant, type, name) { return Boolean(masters[`${type}:${name}`]); },
    async getMasterRecordData(_tenant, type, name) { return masters[`${type}:${name}`] ?? null; },
  };
}

function baseMasters() {
  return {
    "Company:Kairo": { default_currency: "VND" },
    "Currency:VND": { currency_scale: 0 },
    "Account:642-KAIRO": { company: "Kairo", is_group: 0 },
    "Cost Center:OPS": { company: "Kairo" },
    "Branch:HQ": { company: "Kairo" },
  };
}

function context(doctype, name, action, document, options = {}) {
  return {
    command: {
      tenant_id: "demo",
      command_id: `${doctype}-${name}-${action}`,
      aggregate: { doctype, name },
      action,
      document,
      actor: { user_id: options.actor ?? "approver@example.test", roles: options.roles ?? ["Accounts Manager"] },
    },
    existing: options.existing ?? null,
    nextVersion: (options.existing?.version ?? 0) + 1,
    now,
    reader: reader({ documents: options.documents ?? [], masters: options.masters ?? baseMasters() }),
  };
}

const budgetInput = {
  company: "Kairo",
  account: "642-KAIRO",
  budget_against: "Cost Center",
  cost_center: "OPS",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  budget_amount: "1000000",
  control_action: "Stop",
};

function approvedBudget(amountMinor = 1_000_000) {
  return canonical("Finance Budget", "BUD-001", {
    ...budgetInput,
    currency: "VND",
    currency_scale: 0,
    budget_amount_minor: amountMinor,
    budget_amount: String(amountMinor),
    scope_key: "Cost Center:OPS",
  });
}

test("Finance Budget derives company currency and requires four-eyes approval", async () => {
  const controller = new FinanceBudgetController();
  const draft = canonical("Finance Budget", "BUD-001", budgetInput, 0, "maker@example.test");
  const plan = await controller.buildPlan(context("Finance Budget", "BUD-001", "submit", budgetInput, { existing: draft }));
  assert.equal(plan.document.docstatus, 1);
  assert.equal(plan.document.data.currency, "VND");
  assert.equal(plan.document.data.currency_scale, 0);
  assert.equal(plan.document.data.budget_amount_minor, 1_000_000);
  assert.equal(plan.document.data.scope_key, "Cost Center:OPS");
  assert.throws(
    () => controller.buildPlan(context("Finance Budget", "BUD-SELF", "submit", budgetInput, {
      existing: canonical("Finance Budget", "BUD-SELF", budgetInput, 0, "approver@example.test"),
    })),
    /four-eyes/,
  );
});

test("Finance Budget rejects overlapping company-account-scope periods", async () => {
  const controller = new FinanceBudgetController();
  const existingApproved = approvedBudget();
  await assert.rejects(
    controller.buildPlan(context("Finance Budget", "BUD-002", "submit", { ...budgetInput, start_date: "2026-06-01" }, {
      existing: canonical("Finance Budget", "BUD-002", budgetInput, 0),
      documents: [existingApproved],
    })),
    /overlaps submitted budget/,
  );
});

test("Budget revision is append-only and cannot reduce below commitments", async () => {
  const controller = new FinanceBudgetRevisionController();
  const budget = approvedBudget();
  const reserve = canonical("Finance Budget Commitment", "COM-001", {
    budget: "BUD-001", commitment_type: "Reserve", amount_minor: 900_000,
    source_doctype: "Purchase Order", source_name: "PO-001",
  });
  await assert.rejects(
    controller.buildPlan(context("Finance Budget Revision", "REV-001", "submit", {
      budget: "BUD-001", posting_date: "2026-08-03", delta_amount: "-200000", reason: "Cut",
    }, {
      existing: canonical("Finance Budget Revision", "REV-001", {}, 0),
      documents: [budget, reserve],
    })),
    /below existing commitments/,
  );
  const allowed = await controller.buildPlan(context("Finance Budget Revision", "REV-002", "submit", {
    budget: "BUD-001", posting_date: "2026-08-03", delta_amount: "200000", reason: "Approved increase",
  }, {
    existing: canonical("Finance Budget Revision", "REV-002", {}, 0),
    documents: [budget, reserve],
  }));
  assert.equal(allowed.document.data.resulting_budget_amount_minor, 1_200_000);
});

test("Budget commitment stops over-budget reserve and enforces per-source release", async () => {
  const controller = new FinanceBudgetCommitmentController();
  const budget = approvedBudget();
  const po = canonical("Purchase Order", "PO-001", { company: "Kairo" });
  const reserve = canonical("Finance Budget Commitment", "COM-001", {
    budget: "BUD-001", commitment_type: "Reserve", amount_minor: 800_000,
    source_doctype: "Purchase Order", source_name: "PO-001",
  });
  await assert.rejects(
    controller.buildPlan(context("Finance Budget Commitment", "COM-002", "submit", {
      budget: "BUD-001", posting_date: "2026-08-03", commitment_type: "Reserve", amount: "300000",
      source_doctype: "Purchase Order", source_name: "PO-001",
    }, {
      documents: [budget, po, reserve],
      existing: canonical("Finance Budget Commitment", "COM-002", {}, 0),
    })),
    /exceeds the effective budget/,
  );
  await assert.rejects(
    controller.buildPlan(context("Finance Budget Commitment", "COM-REL", "submit", {
      budget: "BUD-001", posting_date: "2026-08-03", commitment_type: "Release", amount: "900000",
      source_doctype: "Purchase Order", source_name: "PO-001",
    }, {
      documents: [budget, po, reserve],
      existing: canonical("Finance Budget Commitment", "COM-REL", {}, 0),
    })),
    /exceeds the amount reserved for the source/,
  );
  const release = await controller.buildPlan(context("Finance Budget Commitment", "COM-REL-OK", "submit", {
    budget: "BUD-001", posting_date: "2026-08-03", commitment_type: "Release", amount: "300000",
    source_doctype: "Purchase Order", source_name: "PO-001",
  }, {
    documents: [budget, po, reserve],
    existing: canonical("Finance Budget Commitment", "COM-REL-OK", {}, 0),
  }));
  assert.equal(release.document.data.committed_after_minor, 500_000);
  assert.equal(release.document.data.available_after_minor, 500_000);
});

test("Warn budget records exceeded state instead of silently pretending it fits", async () => {
  const controller = new FinanceBudgetCommitmentController();
  const budget = canonical("Finance Budget", "BUD-WARN", {
    ...approvedBudget().data, control_action: "Warn", budget_amount_minor: 100_000, budget_amount: "100000",
  });
  const mr = canonical("Material Request", "MR-001", { company: "Kairo" });
  const plan = await controller.buildPlan(context("Finance Budget Commitment", "COM-WARN", "submit", {
    budget: "BUD-WARN", posting_date: "2026-08-03", commitment_type: "Reserve", amount: "150000",
    source_doctype: "Material Request", source_name: "MR-001",
  }, {
    documents: [budget, mr],
    existing: canonical("Finance Budget Commitment", "COM-WARN", {}, 0),
  }));
  assert.equal(plan.document.data.budget_exceeded, true);
  assert.equal(plan.document.data.exceeded_by_minor, 50_000);
  assert.equal(plan.document.data.available_after_minor, -50_000);
});
