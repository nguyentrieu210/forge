import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");
const args = new Set(process.argv.slice(2));
const certify = args.has("--certify");
const auditComplete = args.has("--audit-complete") || certify;

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const lock = await readJson(path.join(serverRoot, "source-lock.json"));
const ledger = await readJson(path.join(serverRoot, "docs/spec/source-exact/erpnext-artifact-resolution-ledger.json"));
const matrix = await readJson(path.join(repoRoot, "docs/agents/r8/R8_BUSINESS_DEPTH_MATRIX.json"));

const failures = [];
const erpnext = (lock.sources ?? []).find((x) => x.app === "erpnext");
if (!erpnext) failures.push("server/source-lock.json has no erpnext entry");
if (erpnext?.tag !== matrix.upstream?.tag) failures.push(`ERPNext tag drift: lock=${erpnext?.tag} matrix=${matrix.upstream?.tag}`);
if (erpnext?.full_sha !== matrix.upstream?.full_sha) failures.push(`ERPNext SHA drift: lock=${erpnext?.full_sha} matrix=${matrix.upstream?.full_sha}`);
if (matrix.upstream?.full_sha?.length !== 40) failures.push("matrix upstream SHA is not a full 40-char commit");
if (ledger.baseline?.tag !== matrix.upstream?.tag || ledger.baseline?.commit !== matrix.upstream?.full_sha) failures.push("canonical ERPNext artifact ledger baseline differs from R8 matrix");
if (ledger.declared_artifact_count !== (ledger.entries ?? []).length) failures.push("canonical ERPNext ledger count does not match its entries");
if (matrix.denominator?.expected_artifact_count !== ledger.declared_artifact_count) failures.push("R8 expected artifact count differs from canonical ledger");

const canonicalIds = (ledger.entries ?? []).map((x) => x.resolution_id);
const coveredIds = (matrix.module_depth ?? []).flatMap((x) => x.artifact_resolution_ids ?? []);
const duplicates = coveredIds.filter((id, i) => coveredIds.indexOf(id) !== i);
const missing = canonicalIds.filter((id) => !coveredIds.includes(id));
const unknown = coveredIds.filter((id) => !canonicalIds.includes(id));
if (coveredIds.length !== canonicalIds.length) failures.push(`R8 module coverage has ${coveredIds.length} artifact refs; expected ${canonicalIds.length}`);
if (duplicates.length) failures.push(`duplicate artifact coverage: ${[...new Set(duplicates)].join(", ")}`);
if (missing.length) failures.push(`missing ERPNext artifacts: ${missing.join(", ")}`);
if (unknown.length) failures.push(`unknown ERPNext artifact refs: ${unknown.join(", ")}`);

if ((matrix.module_depth ?? []).length !== matrix.denominator?.module_count) failures.push("module_depth count differs from denominator");
if ((matrix.flow_depth ?? []).length !== matrix.denominator?.flow_count) failures.push("flow_depth count differs from denominator");
const flowIds = (matrix.flow_depth ?? []).map((x) => x.flow_id);
const duplicateFlows = flowIds.filter((id, i) => flowIds.indexOf(id) !== i);
if (duplicateFlows.length) failures.push(`duplicate flow IDs: ${[...new Set(duplicateFlows)].join(", ")}`);

const requiredAllowed = ["DEEP_PARITY","SEMANTIC_PARITY","FORGE_SUPERSET","INTENTIONAL_DIFFERENCE","PARTIAL","GAP","UNRESOLVED","OUT_OF_SCOPE"];
const allowed = new Set(matrix.allowed_classifications ?? []);
for (const c of requiredAllowed) if (!allowed.has(c)) failures.push(`allowed_classifications missing ${c}`);

const counts = Object.fromEntries(requiredAllowed.map((x) => [x, 0]));
const rows = [...(matrix.module_depth ?? []), ...(matrix.flow_depth ?? [])];
for (const row of rows) {
  const id = row.depth_id ?? row.flow_id ?? "UNKNOWN";
  if (!allowed.has(row.classification)) {
    failures.push(`${id}: invalid classification ${row.classification}`);
    continue;
  }
  counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  if (row.classification === "OUT_OF_SCOPE" && !String(row.rationale ?? "").trim()) failures.push(`${id}: OUT_OF_SCOPE requires rationale`);
  if (row.classification === "GAP" && !String(row.rationale ?? "").trim()) failures.push(`${id}: GAP requires rationale`);
  if (["DEEP_PARITY","SEMANTIC_PARITY","FORGE_SUPERSET","INTENTIONAL_DIFFERENCE","PARTIAL","GAP"].includes(row.classification)) {
    const evidence = row.evidence ?? row.forge_evidence_roots ?? [];
    if (!Array.isArray(evidence) || evidence.length === 0) failures.push(`${id}: resolved/partial/gap classification requires evidence`);
  }
}

const unresolved = counts.UNRESOLVED ?? 0;
const blockers = (counts.UNRESOLVED ?? 0) + (counts.PARTIAL ?? 0) + (counts.GAP ?? 0);
if (auditComplete && unresolved !== 0) failures.push(`R8-A benchmark incomplete: UNRESOLVED=${unresolved}`);
if (certify && blockers !== 0) failures.push(`R8 business closure blocked: UNRESOLVED+PARTIAL+GAP=${blockers}`);

console.log(JSON.stringify({
  ok: failures.length === 0,
  mode: certify ? "CERTIFY" : (auditComplete ? "AUDIT_COMPLETE" : "AUDIT"),
  program: matrix.program,
  erpnext: matrix.upstream,
  artifacts: canonicalIds.length,
  modules: (matrix.module_depth ?? []).length,
  flows: (matrix.flow_depth ?? []).length,
  counts,
  benchmark_complete: unresolved === 0,
  business_closed: blockers === 0,
  failures
}, null, 2));

if (failures.length) process.exit(1);
