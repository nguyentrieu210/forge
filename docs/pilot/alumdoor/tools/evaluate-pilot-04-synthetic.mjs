#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pilotRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pilotRoot, "../../..");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadPilot04Authorities() {
  const lock = readJson(path.join(pilotRoot, "PILOT_00_LOCK.json"));
  const r6 = readJson(path.join(repoRoot, "deploy-evidence/r6-final-production-certification-49315112a211.json"));
  const p01Synthetic = readJson(path.join(pilotRoot, "PILOT_01_SYNTHETIC_FIXTURE_V1.json"));
  const p02 = readJson(path.join(pilotRoot, "PILOT_02_STATUS.json"));
  const p03 = readJson(path.join(pilotRoot, "PILOT_03_STATUS.json"));
  return { lock, r6, p01Synthetic, p02, p03 };
}

function samePackageSet(observed, locked) {
  if (!Array.isArray(observed) || observed.length !== locked.length) return false;
  const byId = new Map(observed.map((entry) => [entry.app_id, entry]));
  return locked.every((expected) => {
    const actual = byId.get(expected.app_id);
    return actual && actual.version === expected.version && actual.content_hash === expected.content_hash;
  });
}

function exactProfile(observed, locked) {
  return observed
    && observed.profile_id === locked.profile_id
    && observed.version === locked.version
    && observed.content_hash === locked.content_hash
    && observed.valid === true
    && Array.isArray(observed.blocked_capabilities)
    && observed.blocked_capabilities.length === 0;
}

function validUtcTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function recoveryFresh(recovery, plannedCutoverAt) {
  if (!recovery || recovery.verified !== true || recovery.restore_test_pass !== true || recovery.pitr_plan_pass !== true) return false;
  if (!validUtcTimestamp(recovery.verified_at) || !validUtcTimestamp(plannedCutoverAt)) return false;
  const maxAgeHours = Number(recovery.max_age_hours);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return false;
  const verifiedAt = Date.parse(recovery.verified_at);
  const cutoverAt = Date.parse(plannedCutoverAt);
  if (verifiedAt > cutoverAt) return false;
  return cutoverAt - verifiedAt <= maxAgeHours * 60 * 60 * 1000;
}

function namedDirectorApproval(approvers) {
  if (!Array.isArray(approvers)) return false;
  const directors = approvers.filter((entry) =>
    entry
    && entry.persona === "Giám đốc"
    && entry.active === true
    && entry.approved === true
    && typeof entry.account === "string"
    && entry.account.endsWith("@example.invalid"),
  );
  return directors.length === 1;
}

export function makePassingSyntheticDecisionInput(authorities = loadPilot04Authorities()) {
  const { lock, r6 } = authorities;
  return {
    scenario_id: "P04-SYN-GO-BASELINE",
    synthetic: true,
    planned_cutover_at: "2026-08-05T12:00:00Z",
    observed_identity: {
      source_sha: lock.certified_release.source_sha,
      bundle_hash: lock.certified_release.bundle_hash,
      packages: structuredClone(lock.packages),
      capability_profile: structuredClone(lock.capability_profile),
    },
    pilot_evidence: {
      pilot_01_preview_status: "PREVIEW_PASS",
      pilot_02_status: "SYNTHETIC_DRY_RUN_PASS",
      pilot_03_status: "SYNTHETIC_PARALLEL_PASS",
    },
    blockers: { p0: 0, p1: 0 },
    reconciliation: { unexplained_variance: 0 },
    recovery: {
      verified: true,
      verified_at: r6.completed_at,
      max_age_hours: 24,
      restore_test_pass: r6.outcomes?.drill_restore === "success",
      pitr_plan_pass: r6.outcomes?.pitr === "success",
    },
    cutoff: { deterministic: true, source_bound: true, delta_procedure_ready: true },
    approvers: [{
      account: "director.synthetic@example.invalid",
      persona: "Giám đốc",
      active: true,
      approved: true,
    }],
  };
}

export function evaluatePilot04Synthetic(input, authorities = loadPilot04Authorities()) {
  const { lock, r6, p01Synthetic, p02, p03 } = authorities;
  const blockers = [];
  const gates = [];

  function gate(id, pass, detail) {
    gates.push({ id, pass, detail });
    if (!pass) blockers.push({ id, detail });
  }

  gate("SYNTHETIC_ONLY", input?.synthetic === true, "decision rehearsal must be explicitly synthetic");
  gate(
    "LOCKED_RELEASE_IDENTITY",
    input?.observed_identity?.source_sha === lock.certified_release.source_sha
      && input?.observed_identity?.bundle_hash === lock.certified_release.bundle_hash
      && samePackageSet(input?.observed_identity?.packages, lock.packages)
      && exactProfile(input?.observed_identity?.capability_profile, lock.capability_profile),
    "release SHA, bundle, package content and capability profile must exactly match Pilot-00 lock",
  );
  gate(
    "R6_BASELINE_CERTIFIED",
    r6.status === "PILOT-GO"
      && r6.candidate_sha === lock.certified_release.source_sha
      && r6.evidence_matrix?.counts?.pass === 23
      && r6.evidence_matrix?.counts?.total === 23,
    "locked R6 baseline must remain 23/23 PILOT-GO evidence",
  );
  gate(
    "PILOT_01_ACCEPTED_FOR_REHEARSAL",
    input?.pilot_evidence?.pilot_01_preview_status === "PREVIEW_PASS"
      && p01Synthetic.synthetic === true
      && p01Synthetic.satisfies_real_pilot_01_readiness === false,
    "synthetic Pilot-01 PREVIEW_PASS is required and must remain test-only",
  );
  gate(
    "PILOT_02_ACCEPTED_FOR_REHEARSAL",
    input?.pilot_evidence?.pilot_02_status === "SYNTHETIC_DRY_RUN_PASS"
      && p02.synthetic_pilot_02?.status === "SYNTHETIC_DRY_RUN_PASS"
      && p02.synthetic_pilot_02?.segments_passed === 9,
    "synthetic Pilot-02 must be 9/9 PASS",
  );
  gate(
    "PILOT_03_ACCEPTED_FOR_REHEARSAL",
    input?.pilot_evidence?.pilot_03_status === "SYNTHETIC_PARALLEL_PASS"
      && p03.synthetic_pilot_03?.status === "SYNTHETIC_PARALLEL_PASS"
      && p03.synthetic_pilot_03?.days_reconciled === 3
      && p03.synthetic_pilot_03?.axis_variances === 0,
    "synthetic Pilot-03 must reconcile all three days at zero variance",
  );
  gate("NO_P0_P1", input?.blockers?.p0 === 0 && input?.blockers?.p1 === 0, "no unresolved P0 or P1 blocker may exist");
  gate("ZERO_UNEXPLAINED_VARIANCE", input?.reconciliation?.unexplained_variance === 0, "unexplained reconciliation variance must be exactly zero");
  gate("RECOVERY_FRESH", recoveryFresh(input?.recovery, input?.planned_cutover_at), "backup/restore/PITR evidence must be verified and fresh for the rehearsal window");
  gate(
    "CUTOFF_DETERMINISTIC",
    input?.cutoff?.deterministic === true && input?.cutoff?.source_bound === true && input?.cutoff?.delta_procedure_ready === true,
    "cutoff and delta procedure must be deterministic and source-bound",
  );
  gate("SINGLE_NAMED_DIRECTOR_APPROVAL", namedDirectorApproval(input?.approvers), "exactly one active named synthetic Giám đốc account must explicitly approve");

  const syntheticVerdict = blockers.length === 0 ? "GO" : "NO-GO";
  return {
    format: "forge-alumdoor-pilot-04-synthetic-decision/v1",
    scenario_id: input?.scenario_id ?? null,
    synthetic_verdict: syntheticVerdict,
    gate_count: gates.length,
    passed_gate_count: gates.filter((entry) => entry.pass).length,
    blockers,
    gates,
    production_write_authorized: false,
    cutover_authorized: false,
    real_pilot_transition_allowed: false,
    production_data_mutated: false,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = evaluatePilot04Synthetic(makePassingSyntheticDecisionInput());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.synthetic_verdict !== "GO") process.exitCode = 1;
}
