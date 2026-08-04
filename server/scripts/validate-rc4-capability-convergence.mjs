#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_TOTAL = 956;
const MATURITY = ["Missing", "Foundation", "Wired", "RC", "Hardened"];
const VALID_MATURITY = new Set(MATURITY);
const VALID_LANE_STATUS = new Set(["BOOTSTRAPPED", "RUNNING", "BLOCKED", "READY", "CONVERGING", "DONE", "SUPERSEDED/CLOSED"]);
const NON_PROMOTION_EVIDENCE = new Set(["bootstrap", "audit-only", "source-static", "harness-only", "independent-qa-in-progress"]);
const idPattern = "[A-Z]{1,2}\\d{2}-\\d{3}";
const shaPattern = /^[0-9a-f]{40}$/;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const mapPath = path.join(root, "docs", "FORGE_ENTERPRISE_CAPABILITY_MAP.md");
const statusPath = path.join(root, "docs", "FORGE_ENTERPRISE_CAPABILITY_STATUS.md");
const manifestPath = path.join(root, "docs", "agents", "rc4", "RC4_A20_EVIDENCE_MANIFEST.json");

const errors = [];
function fail(message) { errors.push(message); }
function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort();
}
function expandToken(token) {
  const single = new RegExp(`^(${idPattern})$`).exec(token);
  if (single) return [single[1]];
  const range = new RegExp(`^(${idPattern})\\.\\.(${idPattern})$`).exec(token);
  if (!range) throw new Error(`invalid capability token: ${token}`);
  const [startFamily, startText] = range[1].split("-");
  const [endFamily, endText] = range[2].split("-");
  if (startFamily !== endFamily) throw new Error(`cross-family range: ${token}`);
  const start = Number(startText);
  const end = Number(endText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) throw new Error(`invalid capability range: ${token}`);
  return Array.from({ length: end - start + 1 }, (_, offset) => `${startFamily}-${String(start + offset).padStart(3, "0")}`);
}
function countTotal(counts, label) {
  let total = 0;
  for (const maturity of MATURITY) {
    if (!Number.isInteger(counts?.[maturity]) || counts[maturity] < 0) fail(`${label}.${maturity} must be a non-negative integer`);
    else total += counts[maturity];
  }
  if (total !== EXPECTED_TOTAL) fail(`${label} totals ${total}, expected ${EXPECTED_TOTAL}`);
}

const mapText = fs.readFileSync(mapPath, "utf8");
const statusText = fs.readFileSync(statusPath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const mapIds = [...mapText.matchAll(/^\s*-\s+`([A-Z]{1,2}\d{2}-\d{3})`/gm)].map((match) => match[1]);
const mapSet = new Set(mapIds);
const mapDuplicates = duplicates(mapIds);
if (mapDuplicates.length) fail(`capability map duplicates: ${mapDuplicates.join(", ")}`);
if (mapIds.length !== EXPECTED_TOTAL || mapSet.size !== EXPECTED_TOTAL) fail(`capability map denominator is ${mapSet.size}/${mapIds.length}, expected ${EXPECTED_TOTAL}`);

const startMarker = "<!-- CAPABILITY_REGISTRY_START -->";
const endMarker = "<!-- CAPABILITY_REGISTRY_END -->";
const start = statusText.indexOf(startMarker);
const end = statusText.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) throw new Error("canonical registry markers missing");
const registry = statusText.slice(start + startMarker.length, end);
const assignments = new Map();
const statusIds = [];
const evidenceRefs = [];
for (const rawLine of registry.split(/\r?\n/)) {
  const row = /^\|\s*(Missing|Foundation|Wired|RC|Hardened)\s*\|\s*(.*?)\s*\|\s*`(E-[A-Z0-9-]+)`\s*\|$/.exec(rawLine.trim());
  if (!row) continue;
  const [, maturity, expression, evidence] = row;
  const tokens = [...expression.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (!tokens.length) { fail(`registry row without capability token: ${rawLine.trim()}`); continue; }
  let ids = [];
  try { ids = tokens.flatMap(expandToken); } catch (error) { fail(String(error)); continue; }
  for (const id of ids) {
    statusIds.push(id);
    evidenceRefs.push(evidence);
    if (assignments.has(id)) fail(`duplicate registry assignment: ${id}`);
    else assignments.set(id, { maturity, evidence });
  }
}
const statusSet = new Set(statusIds);
const missing = [...mapSet].filter((id) => !statusSet.has(id));
const unknown = [...statusSet].filter((id) => !mapSet.has(id));
if (statusIds.length !== EXPECTED_TOTAL || statusSet.size !== EXPECTED_TOTAL) fail(`registry denominator is ${statusSet.size}/${statusIds.length}, expected ${EXPECTED_TOTAL}`);
if (missing.length) fail(`registry missing IDs: ${missing.join(", ")}`);
if (unknown.length) fail(`registry unknown IDs: ${unknown.join(", ")}`);

const actualCounts = Object.fromEntries(MATURITY.map((maturity) => [maturity, 0]));
for (const { maturity } of assignments.values()) actualCounts[maturity] += 1;

const evidenceIndexText = statusText.slice(statusText.indexOf("## Evidence Index"), statusText.indexOf("## Dependency Request"));
const evidenceDefs = [...evidenceIndexText.matchAll(/^- `(E-[A-Z0-9-]+)`:/gm)].map((match) => match[1]);
const evidenceDefSet = new Set(evidenceDefs);
const duplicateEvidenceDefs = duplicates(evidenceDefs);
if (duplicateEvidenceDefs.length) fail(`duplicate Evidence Index bundles: ${duplicateEvidenceDefs.join(", ")}`);
for (const evidence of new Set(evidenceRefs)) if (!evidenceDefSet.has(evidence)) fail(`registry references undefined evidence bundle: ${evidence}`);
for (const evidence of evidenceDefSet) if (!evidenceRefs.includes(evidence)) fail(`Evidence Index bundle is unused by registry: ${evidence}`);

if (manifest.schema_version !== 1) fail(`unsupported manifest schema_version: ${manifest.schema_version}`);
if (manifest.work_item !== "RC4-A20") fail(`manifest work_item must be RC4-A20`);
if (!shaPattern.test(manifest.snapshot?.main_sha ?? "")) fail(`snapshot.main_sha must be an exact 40-char SHA`);
const expectedMain = process.env.RC4_EXPECTED_MAIN_SHA;
if (expectedMain && manifest.snapshot?.main_sha !== expectedMain) fail(`snapshot main ${manifest.snapshot?.main_sha} != PR base ${expectedMain}`);
countTotal(manifest.baseline_counts, "baseline_counts");
countTotal(manifest.candidate_counts, "candidate_counts");
for (const maturity of MATURITY) {
  if (manifest.candidate_counts?.[maturity] !== actualCounts[maturity]) {
    fail(`candidate ${maturity}=${manifest.candidate_counts?.[maturity]} != canonical registry ${actualCounts[maturity]}`);
  }
}

if (!Array.isArray(manifest.lanes)) fail(`manifest.lanes must be an array`);
const expectedAgents = Array.from({ length: 19 }, (_, index) => `A${index + 1}`);
const laneAgents = Array.isArray(manifest.lanes) ? manifest.lanes.map((lane) => lane.agent) : [];
for (const agent of expectedAgents) if (!laneAgents.includes(agent)) fail(`missing worker lane: ${agent}`);
for (const agent of laneAgents) if (!expectedAgents.includes(agent)) fail(`unknown worker lane: ${agent}`);
const duplicateAgents = duplicates(laneAgents);
if (duplicateAgents.length) fail(`duplicate worker lanes: ${duplicateAgents.join(", ")}`);

const laneByAgent = new Map();
for (const lane of manifest.lanes ?? []) {
  laneByAgent.set(lane.agent, lane);
  if (!VALID_LANE_STATUS.has(lane.status)) fail(`${lane.agent}: invalid lane status ${lane.status}`);
  if (typeof lane.branch !== "string" || !lane.branch.startsWith("agent/rc4-")) fail(`${lane.agent}: invalid branch provenance`);
  if (lane.pr !== null && (!Number.isInteger(lane.pr) || lane.pr <= 0)) fail(`${lane.agent}: invalid PR number`);
  if (lane.pr !== null && !shaPattern.test(lane.head_sha ?? "")) fail(`${lane.agent}: PR-backed lane requires exact head_sha`);
  if (lane.head_sha !== null && !shaPattern.test(lane.head_sha ?? "")) fail(`${lane.agent}: invalid head_sha`);
  if (lane.validated_head_sha !== undefined && !shaPattern.test(lane.validated_head_sha)) fail(`${lane.agent}: invalid validated_head_sha`);
  if (lane.workflow_run !== undefined && (!Number.isInteger(lane.workflow_run) || lane.workflow_run <= 0)) fail(`${lane.agent}: invalid workflow_run`);
  if (typeof lane.reason !== "string" || lane.reason.trim().length < 20) fail(`${lane.agent}: convergence reason is missing/too weak`);

  if (lane.accepted_for_maturity === true) {
    if (lane.status === "BOOTSTRAPPED") fail(`${lane.agent}: bootstrap lane cannot be accepted for maturity`);
    if (!shaPattern.test(lane.head_sha ?? "")) fail(`${lane.agent}: accepted lane requires exact head_sha`);
    if (!shaPattern.test(lane.validated_head_sha ?? "")) fail(`${lane.agent}: accepted lane requires exact validated_head_sha`);
    if (!Number.isInteger(lane.workflow_run) || lane.workflow_run <= 0) fail(`${lane.agent}: accepted lane requires executable workflow_run`);
    if (NON_PROMOTION_EVIDENCE.has(lane.evidence_kind)) fail(`${lane.agent}: ${lane.evidence_kind} cannot justify maturity promotion`);
    if (!Array.isArray(lane.promotion_evidence?.capabilities) || lane.promotion_evidence.capabilities.length === 0) fail(`${lane.agent}: accepted lane requires explicit capability IDs`);
    if (!Array.isArray(lane.promotion_evidence?.paths) || lane.promotion_evidence.paths.length === 0) fail(`${lane.agent}: accepted lane requires direct evidence paths`);
    for (const id of lane.promotion_evidence?.capabilities ?? []) if (!mapSet.has(id)) fail(`${lane.agent}: unknown promoted capability ${id}`);
    for (const evidencePath of lane.promotion_evidence?.paths ?? []) {
      if (evidencePath.includes("RC4_A20_")) fail(`${lane.agent}: circular A20 evidence is forbidden: ${evidencePath}`);
    }
  }
}

if (!Array.isArray(manifest.maturity_changes)) fail(`maturity_changes must be an array`);
const changeIds = (manifest.maturity_changes ?? []).map((change) => change.id);
const duplicateChanges = duplicates(changeIds);
if (duplicateChanges.length) fail(`duplicate maturity changes: ${duplicateChanges.join(", ")}`);
const arithmetic = { ...manifest.baseline_counts };
for (const change of manifest.maturity_changes ?? []) {
  if (!mapSet.has(change.id)) { fail(`maturity change references unknown capability: ${change.id}`); continue; }
  if (!VALID_MATURITY.has(change.from) || !VALID_MATURITY.has(change.to) || change.from === change.to) fail(`${change.id}: invalid maturity transition ${change.from} -> ${change.to}`);
  const lane = laneByAgent.get(change.agent);
  if (!lane || lane.accepted_for_maturity !== true) fail(`${change.id}: change lane ${change.agent} is not accepted for maturity`);
  if (!evidenceDefSet.has(change.evidence_ref)) fail(`${change.id}: undefined evidence_ref ${change.evidence_ref}`);
  const current = assignments.get(change.id);
  if (current?.maturity !== change.to) fail(`${change.id}: canonical registry is ${current?.maturity}, manifest target is ${change.to}`);
  if (current?.evidence !== change.evidence_ref) fail(`${change.id}: canonical evidence ${current?.evidence} != change evidence ${change.evidence_ref}`);
  if (VALID_MATURITY.has(change.from) && VALID_MATURITY.has(change.to) && change.from !== change.to) {
    arithmetic[change.from] -= 1;
    arithmetic[change.to] += 1;
  }
}
for (const maturity of MATURITY) if (arithmetic[maturity] !== manifest.candidate_counts?.[maturity]) fail(`maturity arithmetic mismatch for ${maturity}: ${arithmetic[maturity]} != ${manifest.candidate_counts?.[maturity]}`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`RC4 A20 capability convergence: PASS`);
console.log(`Capability denominator: ${assignments.size}/${EXPECTED_TOTAL}`);
console.log(`Evidence bundles: ${evidenceDefSet.size} defined / ${new Set(evidenceRefs).size} referenced`);
console.log(`Worker lanes: ${laneAgents.length}/19`);
console.log(`Accepted maturity lanes: ${(manifest.lanes ?? []).filter((lane) => lane.accepted_for_maturity === true).length}`);
console.log(`Maturity changes: ${(manifest.maturity_changes ?? []).length}`);
console.log(`Maturity: Hardened=${actualCounts.Hardened} RC=${actualCounts.RC} Wired=${actualCounts.Wired} Foundation=${actualCounts.Foundation} Missing=${actualCounts.Missing}`);
