import test from "node:test";
import assert from "node:assert/strict";
import { PurchaseSettlementLifecycleController } from "../dist/packages/clouderp-core/src/purchase-settlement-lifecycle-controller.js";
import { D1RolloutPurchaseAllocationDomainStore } from "../dist/packages/document-kernel/src/index.js";

const now = "2026-07-31T09:45:00.000Z";

function settlementState(nextWindowHasActivity) {
  return {
    queue_key: "QUEUE-1",
    queue_revision: 3,
    window_id: "WINDOW-1",
    window_revision: 2,
    window_sequence: 1,
    window_status: "Settled",
    tolerance_bps: 500,
    nominal_qty_micros: 100_000_000,
    received_qty_micros: 100_000_000,
    next_window_has_activity: nextWindowHasActivity,
    close_entry_id: "CLOSE-1",
    close_committed_at: now,
    close_reason: "Final delivery",
    minimum_qty_micros: 95_000_000,
    maximum_qty_micros: 105_000_000,
    shortage_variance_micros: 0,
    overage_variance_micros: 0,
  };
}

function allocationReader(state) {
  return {
    isPurchaseAllocationEnabled: async () => true,
    getPurchaseAllocationQueueState: async () => null,
    listPurchaseAllocationObligations: async () => [],
    getPurchaseAllocationWindowTotals: async () => ({ nominal_qty_micros: 0, received_qty_micros: 0 }),
    getPurchaseObligationRowState: async () => null,
    listPurchaseReceiptAllocationSources: async () => [],
    listPurchaseReceiptUnappliedSources: async () => [],
    listPurchaseUnappliedQueueSources: async () => [],
    getPurchaseSettlementWindowState: async () => state,
    getPurchaseAllocationOverrideSource: async () => null,
    getDocument: async () => null,
    getMaster: async () => null,
    getExchangeRate: async () => null,
  };
}

test("settlement lifecycle rejects reopening an earlier window after later activity", async () => {
  const controller = new PurchaseSettlementLifecycleController();
  const reader = allocationReader(settlementState(true));
  await assert.rejects(
    () => controller.buildPlan({
      command: {
        command_id: "SETTLE-REOPEN-1",
        tenant_id: "demo",
        aggregate: { doctype: "Purchase Settlement", name: "SETTLE-REOPEN-1" },
        action: "submit",
        expected_version: null,
        payload_hash: "1".repeat(64),
        actor: { user_id: "Administrator", roles: ["System Manager"] },
        document: {
          operation: "Reverse",
          queue_key: "QUEUE-1",
          window_id: "WINDOW-1",
          reason: "Correction requested after later activity",
        },
      },
      existing: null,
      now,
      nextVersion: 1,
      reader,
    }),
    /following window has activity/i,
  );
});

test("D1 rollout reader reports activity from the immediately following window", async () => {
  const queries = [];
  const db = {
    withSession: () => db,
    prepare(sql) {
      queries.push(sql);
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("SELECT queue.queue_key")) return settlementState(false);
              if (sql.includes("AS next_window_has_activity")) return { next_window_has_activity: 1 };
              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
        },
      };
    },
  };

  const store = new D1RolloutPurchaseAllocationDomainStore(db);
  const state = await store.getPurchaseSettlementWindowState("demo", "QUEUE-1", "WINDOW-1");
  assert.equal(state.next_window_has_activity, true);
  assert.equal(queries.some((sql) => sql.includes("MIN(candidate.window_sequence)")), true);
  assert.equal(queries.some((sql) => sql.includes("purchase_unapplied_receipt_entries")), true);
});
