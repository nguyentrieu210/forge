#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(readFileSync(path.resolve(here, "../PILOT_01_CUTOFF_FEASIBILITY_20260805.json"), "utf8"));

const fail = (message) => { throw new Error(message); };

if (evidence.format !== "forge-alumdoor-pilot-01-cutoff-feasibility/v1") fail("unexpected cutoff evidence format");
if (evidence.status !== "CUTOFF_NOT_FROZEN") fail("cutoff evidence must remain not frozen until common source evidence exists");
if (evidence.verdict !== "NOT_PROVEN_BY_CURRENT_UPLOADED_SOURCE_SET") fail("cutoff verdict drift");
if (evidence.evaluated_business_date !== "2026-06-30") fail("evaluated cutoff candidate drift");
if (evidence.production_write_authorized !== false || evidence.production_data_mutated !== false) fail("cutoff review must remain preview-only");
if (evidence.accounts_receivable.opening_nonzero_or_populated_rows !== 0) fail("AR opening observation changed; reevaluate evidence instead of silently freezing cutoff");
if (evidence.accounts_payable.opening_nonzero_or_populated_rows !== 0) fail("AP opening observation changed; reevaluate evidence instead of silently freezing cutoff");
if (evidence.stock.actual_kg_cells_populated !== 0) fail("Stock actual-Kg observation changed; reevaluate evidence");
if (evidence.candidate_assessment.common_cutoff !== "NOT_PROVEN") fail("common cutoff must not be promoted by documentation drift");

process.stdout.write(`${JSON.stringify({
  status: evidence.status,
  evaluated_business_date: evidence.evaluated_business_date,
  common_cutoff: evidence.candidate_assessment.common_cutoff,
  production_write_authorized: false,
})}\n`);
