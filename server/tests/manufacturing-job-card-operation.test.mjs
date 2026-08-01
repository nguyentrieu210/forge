import test from "node:test";
import assert from "node:assert/strict";
import { OperationAwareJobCardController } from "../dist/packages/clouderp-erpnext/src/manufacturing-job-card.js";

function contextFor(operation, completedQty, priorByOperation) {
  const controllerReader = {
    async getDocument(_tenantId, doctype, name) {
      assert.equal(doctype, "Work Order");
      assert.equal(name, "WO-1");
      return {
        tenant_id: "demo",
        doctype: "Work Order",
        name: "WO-1",
        owner: "owner",
        docstatus: 1,
        status: "Not Started",
        version: 1,
        created_at: "2026-08-02T08:00:00.000Z",
        modified_at: "2026-08-02T08:00:00.000Z",
        data: { company: "ALUMDOOR", qty: "10.000000", qty_micros: 10_000_000 },
        children: [],
      };
    },
    async hasMasterRecord() { return true; },
    async getJobCardOperationCompletedQuantityMicros(_tenantId, workOrder, requestedOperation, excludeName) {
      assert.equal(workOrder, "WO-1");
      assert.equal(excludeName, "JC-CURRENT");
      return priorByOperation.get(requestedOperation) ?? 0;
    },
  };
  return {
    command: {
      command_id: "cmd-1",
      tenant_id: "demo",
      actor: { user_id: "worker@example.test", roles: ["Sản xuất"] },
      aggregate: { doctype: "Job Card", name: "JC-CURRENT" },
      action: "submit",
      document: {
        company: "ALUMDOOR",
        work_order: "WO-1",
        operation,
        workstation: "WS-1",
        posting_at: "2026-08-02T09:00:00.000Z",
        completed_qty: completedQty,
        time_logs: [{ row_id: "T1", from_time: "2026-08-02T09:00:00.000Z", to_time: "2026-08-02T10:00:00.000Z" }],
      },
    },
    existing: null,
    nextVersion: 1,
    now: "2026-08-02T10:00:00.000Z",
    reader: controllerReader,
  };
}

test("a completed upstream operation does not consume the next operation allowance", async () => {
  const controller = new OperationAwareJobCardController();
  const prior = new Map([
    ["Cắt", 10_000_000],
    ["Sơn", 0],
  ]);

  const normalized = await controller.normalize(contextFor("Sơn", "10", prior));
  assert.equal(normalized.completed_qty_micros, 10_000_000);
  assert.equal(normalized.total_hours_micros, 1_000_000);
});

test("the same operation still cannot exceed Work Order quantity", async () => {
  const controller = new OperationAwareJobCardController();
  const prior = new Map([["Cắt", 10_000_000]]);

  await assert.rejects(
    () => controller.normalize(contextFor("Cắt", "1", prior)),
    (error) => error?.code === "REFERENCE_VALIDATION_FAILED"
      && /for Cắt exceeds Work Order quantity/.test(error.message)
      && error.details?.prior_operation_qty_micros === 10_000_000,
  );
});
