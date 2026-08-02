import assert from "node:assert/strict";
import test from "node:test";
import { PlasticProductionRunController } from "../dist/packages/clouderp-erpnext/src/plastic-production.js";
import {
  baseDocuments, canonical, completedDocument, context, makeReader,
  manufactureStockEntry, materialRows, runDocument, runningExisting,
} from "./plastic-production-run-fixtures.mjs";

const controller = new PlasticProductionRunController();

test("completed Production Run rejects material lot mismatch", async () => {
  await assert.rejects(
    controller.normalize(context({
      action: "submit",
      existing: runningExisting(),
      document: completedDocument({ materials: materialRows({ consumed_qty: "8" }) }),
    })),
    /material lots do not exactly match/i,
  );
});

test("completed Production Run cannot reuse a Manufacture Stock Entry", async () => {
  const prior = canonical("Plastic Production Run", "PRUN-OTHER", runDocument({
    planned_qty: "5", run_status: "Completed", manufacture_stock_entry: "MFG-1", good_qty: "4",
  }), 1);
  await assert.rejects(
    controller.normalize(context({
      action: "submit",
      existing: runningExisting({ planned_qty: "5" }),
      document: completedDocument({ planned_qty: "5" }),
      domainReader: makeReader({ runs: [prior] }),
    })),
    /already linked to Production Run/i,
  );
});

test("completed Production Run cannot exceed posted manufacture quantity", async () => {
  await assert.rejects(
    controller.normalize(context({
      action: "submit",
      existing: runningExisting(),
      document: completedDocument(),
      domainReader: makeReader({ manufactured: 7_000_000 }),
    })),
    /exceeds posted manufactured quantity/i,
  );
});

test("completed Production Run reconciles exact lots without a second stock ledger", async () => {
  const ctx = context({ action: "submit", existing: runningExisting(), document: completedDocument() });
  const normalized = await controller.normalize(ctx);
  assert.equal(normalized.good_qty, "8.000000");
  assert.equal(normalized.regrind_qty, "1.000000");
  assert.equal(normalized.output_batch, "FG-BATCH");
  assert.equal(normalized.ended_at, "2026-08-02T10:30:00.000Z");

  const plan = await controller.buildPlan(ctx);
  assert.deepEqual(plan.stock_entries, []);
  assert.equal(plan.document.status, "Completed");
  assert.equal(plan.document.docstatus, 1);
});

test("Production Run cancellation requires Stock Entry reversal first", async () => {
  const submitted = canonical("Plastic Production Run", "PRUN-1", completedDocument({
    good_qty: "8.000000", regrind_qty: "1.000000", output_batch: "FG-BATCH",
  }), 1);
  await assert.rejects(
    controller.buildPlan(context({ action: "cancel", existing: submitted, document: submitted.data })),
    /Cancel\/reverse the linked Manufacture Stock Entry/i,
  );

  const documents = baseDocuments([manufactureStockEntry({}, 2)]);
  const plan = await controller.buildPlan(context({
    action: "cancel",
    existing: submitted,
    document: submitted.data,
    domainReader: makeReader({ documents }),
  }));
  assert.equal(plan.document.docstatus, 2);
  assert.equal(plan.document.status, "Cancelled");
  assert.deepEqual(plan.stock_entries, []);
});
