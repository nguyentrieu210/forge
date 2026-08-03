#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_TOTAL = 956;
const MATURITY_ORDER = ["Missing", "Foundation", "Wired", "RC", "Hardened"];
const VALID_MATURITY = new Set(MATURITY_ORDER);
const idPattern = "[A-Z]{1,2}\\d{2}-\\d{3}";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const mapPath = path.join(repoRoot, "docs", "FORGE_ENTERPRISE_CAPABILITY_MAP.md");
const statusPath = path.join(repoRoot, "docs", "FORGE_ENTERPRISE_CAPABILITY_STATUS.md");

function fail(message) {
  throw new Error(message);
}

function expandToken(token) {
  const single = new RegExp(`^(${idPattern})$`).exec(token);
  if (single) return [single[1]];

  const range = new RegExp(`^(${idPattern})\\.\\.(${idPattern})$`).exec(token);
  if (!range) fail(`invalid capability token: ${token}`);

  const [, startId, endId] = range;
  const [startFamily, startNumberText] = startId.split("-");
  const [endFamily, endNumberText] = endId.split("-");
  if (startFamily !== endFamily) fail(`cross-family range is forbidden: ${token}`);

  const start = Number(startNumberText);
  const end = Number(endNumberText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    fail(`invalid range bounds: ${token}`);
  }

  const result = [];
  for (let n = start; n <= end; n += 1) {
    result.push(`${startFamily}-${String(n).padStart(3, "0")}`);
  }
  return result;
}

function countByMaturity(assignments) {
  const counts = Object.fromEntries(MATURITY_ORDER.map((maturity) => [maturity, 0]));
  for (const { maturity } of assignments.values()) counts[maturity] += 1;
  return counts;
}

function rank(maturity) {
  const index = MATURITY_ORDER.indexOf(maturity);
  if (index < 0) fail(`unknown maturity: ${maturity}`);
  return index;
}

function setPromotion(promotions, ids, maturity, evidence) {
  for (const id of ids) {
    if (promotions.has(id)) fail(`duplicate CF2 promotion: ${id}`);
    promotions.set(id, { maturity, evidence });
  }
}

const mapText = fs.readFileSync(mapPath, "utf8");
const statusText = fs.readFileSync(statusPath, "utf8");

const mapIds = [...mapText.matchAll(new RegExp(`^\\s*-\\s+\`(${idPattern})\``, "gm"))].map((match) => match[1]);
const mapSet = new Set(mapIds);
if (mapIds.length !== EXPECTED_TOTAL || mapSet.size !== EXPECTED_TOTAL) {
  fail(`capability map denominator is ${mapSet.size}/${mapIds.length}; expected ${EXPECTED_TOTAL}`);
}

const startMarker = "<!-- CAPABILITY_REGISTRY_START -->";
const endMarker = "<!-- CAPABILITY_REGISTRY_END -->";
const startIndex = statusText.indexOf(startMarker);
const endIndex = statusText.indexOf(endMarker);
if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) fail("capability registry markers missing");

const registry = statusText.slice(startIndex + startMarker.length, endIndex);
const assignments = new Map();
for (const rawLine of registry.split(/\r?\n/)) {
  const line = rawLine.trim();
  const row = /^\|\s*(Missing|Foundation|Wired|RC|Hardened)\s*\|\s*(.*?)\s*\|\s*`(E-[A-Z0-9-]+)`\s*\|$/.exec(line);
  if (!row) continue;

  const [, maturity, expression, evidence] = row;
  if (!VALID_MATURITY.has(maturity)) fail(`invalid maturity: ${maturity}`);
  const tokens = [...expression.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (!tokens.length) fail(`registry row has no IDs: ${line}`);

  for (const token of tokens) {
    for (const id of expandToken(token)) {
      if (assignments.has(id)) fail(`duplicate registry assignment: ${id}`);
      assignments.set(id, { maturity, evidence });
    }
  }
}

if (assignments.size !== EXPECTED_TOTAL) fail(`registry has ${assignments.size} unique IDs; expected ${EXPECTED_TOTAL}`);
for (const id of mapSet) if (!assignments.has(id)) fail(`registry missing map ID: ${id}`);
for (const id of assignments.keys()) if (!mapSet.has(id)) fail(`registry contains unknown ID: ${id}`);

const before = countByMaturity(assignments);
const expectedBefore = { Hardened: 0, RC: 4, Wired: 448, Foundation: 345, Missing: 159 };
for (const [maturity, expected] of Object.entries(expectedBefore)) {
  if (before[maturity] !== expected) fail(`unexpected baseline ${maturity}: ${before[maturity]} != ${expected}`);
}

// CF2 promotions are intentionally narrow. Every RC promotion below is tied to a
// merged exact integrated Transaction Closure gate plus an RC handoff that names
// the capability IDs. No promotion is inferred merely from merge/code presence.
const promotions = new Map();

setPromotion(promotions, [
  "F01-003", "F01-007", "F01-008", "F01-009", "F01-010", "F01-014", "F01-015",
  "F01-019", "F01-022", "F01-024", "F01-025",
], "RC", "RC-020 + Transaction Closure run 30847056639/job 91797832548");

setPromotion(promotions, [
  "F02-001", "F02-002", "F02-003", "F02-005", "F02-006", "F02-007", "F02-008",
  "F02-012", "F02-013", "F02-017", "F02-018",
], "RC", "RC-021 + Sales/O2C/AR integrated gate in Transaction Closure");

setPromotion(promotions, [
  "F03-001", "F03-002", "F03-003", "F03-006", "F03-007", "F03-008", "F03-009", "F03-010",
], "RC", "RC-022 + Transaction Closure AP reconciliation gate");

setPromotion(promotions, [
  "F04-001", "F04-002", "F04-003", "F04-004", "F04-005", "F04-006",
  "F04-008", "F04-009", "F04-010", "F04-011", "F04-012", "F04-013",
], "RC", "RC-023 + Transaction Closure cash/bank reconciliation gate");

setPromotion(promotions, ["F04-017", "F04-019"], "Wired", "RC-023 delivered source/backend evidence; remaining surface/provider gaps block RC");

setPromotion(promotions, ["W01-011", "W01-013", "W01-014", "W01-022"], "RC", "RC-024/025 + Transaction Closure Inventory/WMS/valuation 38/38");
setPromotion(promotions, ["W01-023", "W01-024"], "Wired", "stock replay/repost path proven; historical downstream COGS/expense restatement still deferred");

const after = new Map([...assignments.entries()].map(([id, value]) => [id, { ...value }]));
const applied = [];
for (const [id, target] of promotions) {
  const current = after.get(id);
  if (!current) fail(`promotion references unknown ID: ${id}`);
  if (rank(target.maturity) < rank(current.maturity)) {
    fail(`CF2 promotion would downgrade ${id}: ${current.maturity} -> ${target.maturity}`);
  }
  if (rank(target.maturity) > rank(current.maturity)) {
    applied.push({ id, from: current.maturity, to: target.maturity, evidence: target.evidence });
    after.set(id, { maturity: target.maturity, evidence: current.evidence });
  }
}

const counts = countByMaturity(after);
const expectedAfter = { Hardened: 0, RC: 50, Wired: 417, Foundation: 330, Missing: 159 };
for (const [maturity, expected] of Object.entries(expectedAfter)) {
  if (counts[maturity] !== expected) fail(`unexpected CF2 ${maturity}: ${counts[maturity]} != ${expected}`);
}
if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== EXPECTED_TOTAL) fail("CF2 maturity total drifted from 956");
if (applied.length !== 50) fail(`CF2 expected 50 maturity promotions, got ${applied.length}`);

console.log(`Capability map: ${mapSet.size} unique IDs`);
console.log(`Capability status baseline: ${assignments.size} unique IDs`);
console.log(`CF2 promotions applied: ${applied.length}`);
console.log(`Before: Hardened=${before.Hardened} RC=${before.RC} Wired=${before.Wired} Foundation=${before.Foundation} Missing=${before.Missing}`);
console.log(`After: Hardened=${counts.Hardened} RC=${counts.RC} Wired=${counts.Wired} Foundation=${counts.Foundation} Missing=${counts.Missing}`);
console.log(`CF2 capability truth candidate: ${after.size}/${EXPECTED_TOTAL}`);
console.log("No Hardened promotion: exact production/failure evidence remains insufficient.");

for (const entry of applied) {
  console.log(`${entry.id}: ${entry.from} -> ${entry.to} | ${entry.evidence}`);
}
