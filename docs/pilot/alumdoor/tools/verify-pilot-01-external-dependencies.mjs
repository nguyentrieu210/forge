#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(readFileSync(path.resolve(here, "../PILOT_01_EXTERNAL_SOURCE_DEPENDENCIES_20260805.json"), "utf8"));

function fail(message) { throw new Error(message); }

if (evidence.format !== "forge-alumdoor-pilot-01-external-source-dependencies/v1") fail("unexpected external dependency evidence format");
if (evidence.status !== "SOURCE_SEARCH_EXHAUSTED_EXTERNAL_DEPENDENCIES_REMAIN") fail("external dependency status drift");
if (!evidence.search_scope.current_conversation_uploaded_files_reviewed) fail("current uploaded files must be marked reviewed");
if (!evidence.search_scope.file_library_reviewed) fail("file library must be marked reviewed");
if (!evidence.search_scope.no_additional_alumdoor_authoritative_opening_or_access_source_found) fail("search exhaustion evidence drift");
if (!Array.isArray(evidence.external_source_dependencies) || evidence.external_source_dependencies.length < 1) fail("external dependencies missing");
if (evidence.external_source_dependencies.some((item) => item.may_be_synthesized !== false)) fail("external source dependency must never be marked synthesizable");
if (evidence.production_write_authorized !== false || evidence.production_data_mutated !== false) fail("external dependency evidence must remain preview-only");

const requiredIds = new Set([
  "EXT-AR-OPENING",
  "EXT-AP-OPENING",
  "EXT-STOCK-OPENING",
  "EXT-UOM-AL595",
  "EXT-UOM-BO1VIS",
  "EXT-STOCK-DATE-VIPST700",
  "EXT-PILOT-USERS",
]);
const actualIds = new Set(evidence.external_source_dependencies.map((item) => item.id));
for (const id of requiredIds) if (!actualIds.has(id)) fail(`missing required external dependency ${id}`);

process.stdout.write(`${JSON.stringify({
  status: evidence.status,
  external_dependency_count: evidence.external_source_dependencies.length,
  source_search_exhausted: true,
  production_write_authorized: false,
})}\n`);
