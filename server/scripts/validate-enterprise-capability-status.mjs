#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_TOTAL = 956;
const VALID_MATURITY = new Set(["Missing", "Foundation", "Wired", "RC", "Hardened"]);
const idPattern = "[A-Z]{1,2}\\d{2}-\\d{3}";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const mapPath = path.join(repoRoot, "docs", "FORGE_ENTERPRISE_CAPABILITY_MAP.md");
const statusPath = path.join(repoRoot, "docs", "FORGE_ENTERPRISE_CAPABILITY_STATUS.md");

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

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

  const [, startId, endId] = range;
  const [startFamily, startNumberText] = startId.split("-");
  const [endFamily, endNumberText] = endId.split("-");
  if (startFamily !== endFamily) throw new Error(`cross-family range is forbidden: ${token}`);

  const start = Number(startNumberText);
  const end = Number(endNumberText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    throw new Error(`invalid range bounds: ${token}`);
  }

  const result = [];
  for (let n = start; n <= end; n += 1) {
    result.push(`${startFamily}-${String(n).padStart(3, "0")}`);
  }
  return result;
}

const mapText = fs.readFileSync(mapPath, "utf8");
const statusText = fs.readFileSync(statusPath, "utf8");

const mapIds = [...mapText.matchAll(new RegExp(`^\\s*-\\s+\`(${idPattern})\``, "gm"))].map((match) => match[1]);
const mapDuplicates = duplicates(mapIds);
const mapSet = new Set(mapIds);

const startMarker = "<!-- CAPABILITY_REGISTRY_START -->";
const endMarker = "<!-- CAPABILITY_REGISTRY_END -->";
const startIndex = statusText.indexOf(startMarker);
const endIndex = statusText.indexOf(endMarker);
if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
  die("capability registry markers are missing or malformed");
  process.exit();
}

const registry = statusText.slice(startIndex + startMarker.length, endIndex);
const statusRows = [];
const assignments = new Map();
const statusIds = [];
const duplicateAssignments = [];

for (const rawLine of registry.split(/\r?\n/)) {
  const line = rawLine.trim();
  const row = /^\|\s*(Missing|Foundation|Wired|RC|Hardened)\s*\|\s*(.*?)\s*\|\s*`(E-[A-Z0-9-]+)`\s*\|$/.exec(line);
  if (!row) continue;

  const [, maturity, expression, evidence] = row;
  if (!VALID_MATURITY.has(maturity)) {
    die(`invalid maturity label: ${maturity}`);
    continue;
  }

  const tokens = [...expression.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (tokens.length === 0) {
    die(`registry row has no capability expression: ${line}`);
    continue;
  }

  const expanded = [];
  try {
    for (const token of tokens) expanded.push(...expandToken(token));
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
    continue;
  }

  for (const id of expanded) {
    statusIds.push(id);
    if (assignments.has(id)) duplicateAssignments.push(id);
    else assignments.set(id, { maturity, evidence });
  }
  statusRows.push({ maturity, evidence, count: expanded.length });
}

const statusSet = new Set(statusIds);
const missing = [...mapSet].filter((id) => !statusSet.has(id)).sort();
const unknown = [...statusSet].filter((id) => !mapSet.has(id)).sort();
const statusDuplicates = [...new Set([...duplicates(statusIds), ...duplicateAssignments])].sort();

const maturityCounts = Object.fromEntries([...VALID_MATURITY].map((maturity) => [maturity, 0]));
for (const { maturity } of assignments.values()) maturityCounts[maturity] += 1;

const declaredSection = statusText.slice(0, statusText.indexOf("## Evidence Index"));
const declaredCounts = new Map(
  [...declaredSection.matchAll(/^\|\s*(Hardened|RC|Wired|Foundation|Missing)\s*\|\s*(\d+)\s*\|/gm)]
    .map((match) => [match[1], Number(match[2])]),
);
for (const maturity of VALID_MATURITY) {
  if (declaredCounts.has(maturity) && declaredCounts.get(maturity) !== maturityCounts[maturity]) {
    die(`declared ${maturity} count ${declaredCounts.get(maturity)} != registry ${maturityCounts[maturity]}`);
  }
}

if (mapDuplicates.length) die(`capability map duplicate IDs: ${mapDuplicates.join(", ")}`);
if (mapIds.length !== EXPECTED_TOTAL) die(`capability map contains ${mapIds.length}, expected ${EXPECTED_TOTAL}`);
if (mapSet.size !== EXPECTED_TOTAL) die(`capability map unique count ${mapSet.size}, expected ${EXPECTED_TOTAL}`);
if (statusIds.length !== EXPECTED_TOTAL) die(`expanded status contains ${statusIds.length}, expected ${EXPECTED_TOTAL}`);
if (statusSet.size !== EXPECTED_TOTAL) die(`status unique count ${statusSet.size}, expected ${EXPECTED_TOTAL}`);
if (statusDuplicates.length) die(`duplicate status IDs: ${statusDuplicates.join(", ")}`);
if (missing.length) die(`missing status IDs: ${missing.join(", ")}`);
if (unknown.length) die(`unknown status IDs: ${unknown.join(", ")}`);
if (statusRows.length === 0) die("no maturity registry rows parsed");

console.log(`Capability map: ${mapSet.size} unique IDs`);
console.log(`Capability status: ${statusSet.size} unique IDs`);
console.log(`Missing from status: ${missing.length}`);
console.log(`Unknown in status: ${unknown.length}`);
console.log(`Duplicate status IDs: ${statusDuplicates.length}`);
console.log(`Maturity: Hardened=${maturityCounts.Hardened} RC=${maturityCounts.RC} Wired=${maturityCounts.Wired} Foundation=${maturityCounts.Foundation} Missing=${maturityCounts.Missing}`);
console.log(`Capability status completeness: ${statusSet.size}/${EXPECTED_TOTAL}`);

if (process.exitCode) process.exit(process.exitCode);
