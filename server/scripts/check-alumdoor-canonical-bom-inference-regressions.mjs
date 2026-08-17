#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const [sourceArg,itemArg,bomArg,auditArg] = process.argv.slice(2);
if (!sourceArg || !itemArg || !bomArg || !auditArg) throw new Error("Usage: check-alumdoor-canonical-bom-inference-regressions.mjs <source.json> <items.json> <bom.json> <audit.json>");
const readJson = (arg) => JSON.parse(readFileSync(path.resolve(arg), "utf8"));
const source = readJson(sourceArg);
const itemPayload = readJson(itemArg);
const payload = readJson(bomArg);
const audit = readJson(auditArg);
const records = Array.isArray(source) ? source : source.records;
const boms = payload.boms ?? [];
const lines = boms.flatMap((bom) => bom.lines ?? []);
const refs = records.filter((row) => row.source_role === "bom_reference").length;

assert.equal(refs, 1544, "canonical real-source BOM reference count must remain 1544");
assert.equal(payload.source_reference_count, refs);
assert.equal(audit.source_reference_count, refs);
assert.equal(audit.item_projection_count, itemPayload.items.length, "audit must report branch-local Item projection without pretending it is persisted Gate A authority");
assert.equal(audit.blocker_count, 0, "engineering inference ladder must converge data-only Gate B blockers to zero");
assert.equal((audit.blockers ?? []).length, 0, "zero blocker count must have zero blocker inventory");
assert.equal(payload.blocker_count, 0);
assert.equal(payload.resolved_reference_count + payload.excluded_reference_count + payload.blocker_count, refs, "Gate B coverage must remain exact");
assert.equal(audit.resolved_reference_count + audit.excluded_reference_count + audit.blocker_count, refs, "audit coverage must remain exact");
assert.ok(audit.engineering_inference_count > 0, "recovered data gaps must be explicitly marked engineering_inference");
assert.ok(audit.provisional_assumption_count > 0, "low-confidence assumptions must remain visible instead of being forged as source authority");
assert.equal(
  Object.values(audit.resolution_source_counts ?? {}).reduce((sum, n) => sum + n, 0),
  lines.length,
  "every resolved line must have a resolution source",
);
assert.equal(
  Object.values(audit.confidence_counts ?? {}).reduce((sum, n) => sum + n, 0),
  lines.length,
  "every resolved line must have a confidence classification",
);
for (const bom of boms) {
  for (const line of bom.lines ?? []) {
    assert.notEqual(line.item_code, bom.item, `${bom.item} must never contain itself as a canonical BOM component`);
    assert.ok(line.resolution_source, `source row ${line.lineage?.source_row} must retain resolution_source`);
    assert.ok(line.confidence, `source row ${line.lineage?.source_row} must retain confidence`);
    if (line.engineering_inference) {
      assert.equal(line.resolution_source, "engineering_inference");
      assert.ok(Array.isArray(line.assumptions) && line.assumptions.length > 0, `inferred source row ${line.lineage?.source_row} must expose assumptions`);
      assert.equal(line.lineage?.resolution_source, "engineering_inference");
    }
  }
}

function lineForRow(sourceRow) {
  return lines.find((line) => Number(line.lineage?.source_row) === sourceRow);
}

for (const sourceRow of [1108, 1115, 1150, 1188, 1202, 1220, 1256, 1259, 1264, 1820]) {
  const line = lineForRow(sourceRow);
  assert.ok(line, `previously recovered exact source row ${sourceRow} must remain resolved`);
}

const brush = lines.filter((line) => line.item_code === "NVL-PHOTLONG4X5");
assert.ok(brush.length > 0, "PHOTLONG4X5 must resolve under provisional package semantics instead of blocking Gate B");
assert.ok(brush.every((line) => line.engineering_inference), "PHOTLONG4X5 package fallback must never masquerade as authority");
assert.ok(brush.every((line) => line.provisional_assumption), "PHOTLONG4X5 must remain replaceable provisional data");

const sealedRay = lines.filter((line) => line.item_code === "NVL-TOLE1.2x190-RON");
assert.ok(sealedRay.length > 0, "sealed ray family must remain present");
assert.ok(sealedRay.some((line) => line.conversion_factor === 1.78), "sealed ray family must preserve 1.78 kg/m evidence where length UOM is retained");

const shaft = lines.filter((line) => line.item_code === "NVL-TR114-1.8");
assert.ok(shaft.length > 0, "TR114 family must remain present");
assert.ok(shaft.some((line) => line.conversion_factor === 4.4 || String(line.qty_basis ?? "").includes("4.4") || String(line.qty_basis ?? "").includes("4,4")), "TR114 family must preserve 4.4 kg/m consensus");

console.log(`ALUMDOOR_CANONICAL_BOM_INFERENCE_REGRESSION_PASS refs=${refs} resolved=${lines.length} inferred=${audit.engineering_inference_count} provisional=${audit.provisional_assumption_count}`);
