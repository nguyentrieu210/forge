import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeBpmProcess,
  parseBpmStageTimingFacts,
} from "../dist/packages/app-registry/src/index.js";

const FACTS = [
  { process_key: "purchase-approval", instance_id: "PO-1", stage_key: "manager", run_id: "PO-1-manager-1", opened_at: "2026-08-03T00:00:00Z", closed_at: "2026-08-03T00:30:00Z", outcome: "approved" },
  { process_key: "purchase-approval", instance_id: "PO-2", stage_key: "manager", run_id: "PO-2-manager-1", opened_at: "2026-08-03T00:00:00Z", closed_at: "2026-08-03T01:30:00Z", outcome: "approved" },
  { process_key: "purchase-approval", instance_id: "PO-1", stage_key: "director", run_id: "PO-1-director-1", opened_at: "2026-08-03T00:30:00Z", closed_at: "2026-08-03T02:30:00Z", outcome: "approved" },
  { process_key: "purchase-approval", instance_id: "PO-2", stage_key: "director", run_id: "PO-2-director-1", opened_at: "2026-08-03T01:30:00Z" },
  { process_key: "other", instance_id: "X", stage_key: "manager", run_id: "X-1", opened_at: "2026-08-03T00:00:00Z", closed_at: "2026-08-03T05:00:00Z", outcome: "approved" },
];

test("process analytics computes completed and live timing without mixing process keys", () => {
  const result = analyzeBpmProcess(FACTS, "purchase-approval", "2026-08-03T03:30:00Z");
  assert.equal(result.instance_count, 2);
  const manager = result.stage_metrics.find((entry) => entry.stage_key === "manager");
  const director = result.stage_metrics.find((entry) => entry.stage_key === "director");
  assert.equal(manager.completed_runs, 2);
  assert.equal(manager.average_minutes, 60);
  assert.equal(manager.p50_minutes, 30);
  assert.equal(manager.p95_minutes, 90);
  assert.equal(director.completed_runs, 1);
  assert.equal(director.open_runs, 1);
  assert.equal(director.oldest_open_minutes, 120);
});

test("bottleneck ranking prefers p95 evidence and stays deterministic", () => {
  const result = analyzeBpmProcess(FACTS, "purchase-approval", "2026-08-03T03:30:00Z");
  assert.deepEqual(result.bottlenecks.map((entry) => entry.stage_key), ["director", "manager"]);
});

test("rejected runs are counted without being erased from cycle-time evidence", () => {
  const result = analyzeBpmProcess([
    { process_key: "p", instance_id: "1", stage_key: "review", run_id: "r1", opened_at: "2026-08-03T00:00:00Z", closed_at: "2026-08-03T00:10:00Z", outcome: "rejected" },
  ], "p", "2026-08-03T01:00:00Z");
  assert.equal(result.stage_metrics[0].rejected_runs, 1);
  assert.equal(result.stage_metrics[0].average_minutes, 10);
});

test("facts fail closed on duplicate run ids, impossible time and half-closed rows", () => {
  assert.throws(() => parseBpmStageTimingFacts([
    { process_key: "p", instance_id: "1", stage_key: "x", run_id: "r", opened_at: "2026-08-03T00:00:00Z" },
    { process_key: "p", instance_id: "1", stage_key: "x", run_id: "r", opened_at: "2026-08-03T00:00:00Z" },
  ]), /Duplicate BPM stage run/);
  assert.throws(() => parseBpmStageTimingFacts([
    { process_key: "p", instance_id: "1", stage_key: "x", run_id: "r", opened_at: "2026-08-03T01:00:00Z", closed_at: "2026-08-03T00:00:00Z", outcome: "approved" },
  ]), /precedes opened_at/);
  assert.throws(() => parseBpmStageTimingFacts([
    { process_key: "p", instance_id: "1", stage_key: "x", run_id: "r", opened_at: "2026-08-03T00:00:00Z", outcome: "approved" },
  ]), /closed_at and outcome together/);
});

test("live stage facts cannot be evaluated against a clock earlier than opening", () => {
  assert.throws(() => analyzeBpmProcess([
    { process_key: "p", instance_id: "1", stage_key: "x", run_id: "r", opened_at: "2026-08-03T01:00:00Z" },
  ], "p", "2026-08-03T00:00:00Z"), /now precedes/);
});
