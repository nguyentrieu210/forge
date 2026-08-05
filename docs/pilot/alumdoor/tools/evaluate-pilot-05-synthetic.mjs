#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pilotRoot = path.resolve(here, "..");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadPilot05Authorities() {
  const p01 = readJson(path.join(pilotRoot, "PILOT_01_STATUS.json"));
  const p03 = readJson(path.join(pilotRoot, "PILOT_03_STATUS.json"));
  const p04 = readJson(path.join(pilotRoot, "PILOT_04_STATUS.json"));
  return { p01, p03, p04 };
}

function validUtc(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function recoveryFresh(checkpoint) {
  const recovery = checkpoint?.recovery;
  if (!recovery || recovery.verified !== true || recovery.restore_continuity_pass !== true || recovery.pitr_plan_pass !== true) return false;
  if (!validUtc(checkpoint?.checkpoint_at) || !validUtc(recovery.verified_at)) return false;
  const maxAgeHours = Number(recovery.max_age_hours);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return false;
  const checkpointAt = Date.parse(checkpoint.checkpoint_at);
  const verifiedAt = Date.parse(recovery.verified_at);
  return verifiedAt <= checkpointAt && checkpointAt - verifiedAt <= maxAgeHours * 60 * 60 * 1000;
}

function threeDistinctDays(checkpoints) {
  if (!Array.isArray(checkpoints) || checkpoints.length !== 3) return false;
  const days = checkpoints.map((entry) => entry?.day);
  const dates = checkpoints.map((entry) => entry?.date);
  return new Set(days).size === 3
    && new Set(dates).size === 3
    && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 3)
    && dates.every((date) => typeof date === "string" && /^2026-08-0[5-7]$/.test(date));
}

export function makePassingSyntheticExitInput() {
  return {
    scenario_id: "P05-SYN-EXIT-BASELINE",
    synthetic: true,
    checkpoints: [
      {
        day: 1,
        date: "2026-08-05",
        checkpoint_at: "2026-08-05T12:00:00Z",
        runtime_health: true,
        transaction_health: true,
        variances: { stock: 0, ar: 0, ap: 0, finance: 0 },
        blockers: { p0: 0, p1: 0 },
        open_incidents: 0,
        idempotency_stable: true,
        correction_paths_stable: true,
        recovery: {
          verified: true,
          verified_at: "2026-08-05T08:00:00Z",
          max_age_hours: 24,
          restore_continuity_pass: true,
          pitr_plan_pass: true
        }
      },
      {
        day: 2,
        date: "2026-08-06",
        checkpoint_at: "2026-08-06T12:00:00Z",
        runtime_health: true,
        transaction_health: true,
        variances: { stock: 0, ar: 0, ap: 0, finance: 0 },
        blockers: { p0: 0, p1: 0 },
        open_incidents: 0,
        idempotency_stable: true,
        correction_paths_stable: true,
        recovery: {
          verified: true,
          verified_at: "2026-08-06T08:00:00Z",
          max_age_hours: 24,
          restore_continuity_pass: true,
          pitr_plan_pass: true
        }
      },
      {
        day: 3,
        date: "2026-08-07",
        checkpoint_at: "2026-08-07T12:00:00Z",
        runtime_health: true,
        transaction_health: true,
        variances: { stock: 0, ar: 0, ap: 0, finance: 0 },
        blockers: { p0: 0, p1: 0 },
        open_incidents: 0,
        idempotency_stable: true,
        correction_paths_stable: true,
        recovery: {
          verified: true,
          verified_at: "2026-08-07T08:00:00Z",
          max_age_hours: 24,
          restore_continuity_pass: true,
          pitr_plan_pass: true
        }
      }
    ]
  };
}

export function evaluatePilot05Synthetic(input, authorities = loadPilot05Authorities()) {
  const blockers = [];
  const gates = [];
  const checkpoints = Array.isArray(input?.checkpoints) ? input.checkpoints : [];

  function gate(id, pass, detail) {
    gates.push({ id, pass, detail });
    if (!pass) blockers.push({ id, detail });
  }

  gate("SYNTHETIC_ONLY", input?.synthetic === true, "exit rehearsal must be explicitly synthetic");
  gate(
    "REAL_PILOT_BOUNDARY_PRESERVED",
    authorities.p01?.blocking_mode === "EXTERNAL_SOURCE_DEPENDENCY",
    "real Pilot-01 must remain externally blocked; synthetic exit cannot replace real readiness"
  );
  gate(
    "PILOT_03_RECONCILIATION_ACCEPTED",
    authorities.p03?.synthetic_pilot_03?.status === "SYNTHETIC_PARALLEL_PASS"
      && authorities.p03?.synthetic_pilot_03?.days_reconciled === 3
      && authorities.p03?.synthetic_pilot_03?.axis_variances === 0,
    "synthetic Pilot-03 must remain 3/3 zero-variance PASS"
  );
  gate(
    "PILOT_04_DECISION_ACCEPTED",
    authorities.p04?.synthetic_pilot_04?.status === "SYNTHETIC_DECISION_REHEARSAL_PASS"
      && authorities.p04?.synthetic_pilot_04?.go_gates_passed === 11
      && authorities.p04?.synthetic_pilot_04?.cutover_authorized === false,
    "synthetic Pilot-04 must pass while real cutover remains unauthorized"
  );
  gate("HYPERCARE_WINDOW_COMPLETE", threeDistinctDays(checkpoints), "exactly three distinct synthetic hypercare days are required");
  gate(
    "RUNTIME_AND_TRANSACTION_HEALTHY",
    checkpoints.length === 3 && checkpoints.every((entry) => entry.runtime_health === true && entry.transaction_health === true),
    "runtime and representative transaction health must be green at every checkpoint"
  );
  gate(
    "ZERO_UNEXPLAINED_VARIANCE",
    checkpoints.length === 3 && checkpoints.every((entry) => Object.values(entry.variances ?? {}).every((value) => value === 0)),
    "Stock/AR/AP/Finance variance must be exactly zero at every checkpoint"
  );
  gate(
    "NO_OPEN_P0_P1",
    checkpoints.length === 3 && checkpoints.every((entry) => entry.blockers?.p0 === 0 && entry.blockers?.p1 === 0),
    "no unresolved P0 or P1 may remain at exit"
  );
  gate(
    "INCIDENTS_CLOSED",
    checkpoints.length === 3 && checkpoints.every((entry) => entry.open_incidents === 0),
    "all synthetic incidents must be closed with no open incident at exit"
  );
  gate(
    "RECOVERY_CONTINUITY_FRESH",
    checkpoints.length === 3 && checkpoints.every(recoveryFresh),
    "verified restore/PITR continuity evidence must remain fresh for every checkpoint"
  );
  gate(
    "IDEMPOTENCY_STABLE",
    checkpoints.length === 3 && checkpoints.every((entry) => entry.idempotency_stable === true),
    "retry/idempotency behavior must remain stable through hypercare"
  );
  gate(
    "CORRECTION_PATHS_STABLE",
    checkpoints.length === 3 && checkpoints.every((entry) => entry.correction_paths_stable === true),
    "canonical correction/return paths must remain stable through hypercare"
  );

  const syntheticExitVerdict = blockers.length === 0 ? "EXIT" : "NO-EXIT";
  return {
    format: "forge-alumdoor-pilot-05-synthetic-exit/v1",
    scenario_id: input?.scenario_id ?? null,
    synthetic_exit_verdict: syntheticExitVerdict,
    gate_count: gates.length,
    passed_gate_count: gates.filter((entry) => entry.pass).length,
    blockers,
    gates,
    production_write_authorized: false,
    cutover_authorized: false,
    ga_authorized: false,
    accepted_production_reference_authorized: false,
    real_pilot_transition_allowed: false,
    production_data_mutated: false
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = evaluatePilot05Synthetic(makePassingSyntheticExitInput());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.synthetic_exit_verdict !== "EXIT") process.exitCode = 1;
}
