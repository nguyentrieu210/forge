import assert from "node:assert/strict";
import test from "node:test";
import { PlasticProductionRunController } from "../dist/packages/clouderp-erpnext/src/plastic-production.js";
import { baseDocuments, canonical, context, makeReader, runDocument, runningExisting } from "./plastic-production-run-fixtures.mjs";

const controller = new PlasticProductionRunController();

test("new Production Run must begin Planned", async () => {
  await assert.rejects(
    controller.normalize(context({ document: runDocument({ run_status: "Running" }) })),
    /must start in Planned state/i,
  );
});

test("starting Production Run stamps server start time", async () => {
  const existing = canonical("Plastic Production Run", "PRUN-1", runDocument());
  const normalized = await controller.normalize(context({
    action: "update",
    existing,
    now: "2026-08-02T08:05:00.000Z",
    document: runDocument({ run_status: "Running", started_at: "1999-01-01T00:00:00.000Z" }),
  }));
  assert.equal(normalized.started_at, "2026-08-02T08:05:00.000Z");
});

test("pause and resume record server-authoritative downtime", async () => {
  const paused = await controller.normalize(context({
    action: "update",
    existing: runningExisting(),
    now: "2026-08-02T08:30:00.000Z",
    document: runDocument({ run_status: "Paused", pause_reason: "Kẹt liệu" }),
  }));
  assert.equal(paused.paused_at, "2026-08-02T08:30:00.000Z");
  const resumed = await controller.normalize(context({
    action: "update",
    existing: canonical("Plastic Production Run", "PRUN-1", paused),
    now: "2026-08-02T08:45:00.000Z",
    document: runDocument({ run_status: "Running" }),
  }));
  assert.equal(resumed.paused_at, undefined);
  assert.equal(resumed.downtime_events.length, 1);
  assert.equal(resumed.downtime_events[0].reason, "Kẹt liệu");
  assert.equal(resumed.downtime_minutes, "15.000000");
});

test("Production Run rejects tool on an unapproved machine", async () => {
  await assert.rejects(
    controller.normalize(context({ document: runDocument({ machine: "PM-2" }) })),
    /not approved for machine PM-2/i,
  );
});

test("Production Run rejects machine from another plant", async () => {
  const machine = canonical("Plastic Machine", "PM-1", {
    company: "Demo", branch: "Plant-2", process_profile: "PROC-INJ",
    operational_state: "Active", exclusive_resource: 1,
  });
  const documents = baseDocuments([machine]);
  await assert.rejects(
    controller.normalize(context({ domainReader: makeReader({ documents }) })),
    /another branch\/plant/i,
  );
});

test("Production Run rejects overlapping exclusive resource", async () => {
  const overlap = canonical("Plastic Production Run", "PRUN-OTHER", runDocument({
    planned_start: "2026-08-02T09:00:00.000Z", planned_end: "2026-08-02T11:00:00.000Z", planned_qty: "5",
  }));
  await assert.rejects(
    controller.normalize(context({
      document: runDocument({ planned_qty: "5" }), domainReader: makeReader({ runs: [overlap] }),
    })),
    /already has an overlapping Production Run/i,
  );
});

test("Production Run planned allocation cannot exceed Work Order", async () => {
  const allocated = canonical("Plastic Production Run", "PRUN-OTHER", runDocument({
    machine: "PM-2", tool: undefined,
    planned_start: "2026-08-03T09:00:00.000Z", planned_end: "2026-08-03T11:00:00.000Z", planned_qty: "5",
  }));
  await assert.rejects(
    controller.normalize(context({
      document: runDocument({ planned_qty: "6" }), domainReader: makeReader({ runs: [allocated] }),
    })),
    /planned quantity exceeds Work Order quantity/i,
  );
});

test("running Production Run cannot swap assignment", async () => {
  await assert.rejects(
    controller.normalize(context({
      action: "update", existing: runningExisting(),
      document: runDocument({ run_status: "Running", machine: "PM-2" }),
    })),
    /machine cannot change after Production Run starts/i,
  );
});
