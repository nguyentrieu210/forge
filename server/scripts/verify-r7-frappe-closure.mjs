import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");
const args = new Set(process.argv.slice(2));
const certify = args.has("--certify");
const requireAuditComplete = args.has("--audit-complete") || certify;

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const sourceLockPath = path.join(serverRoot, "source-lock.json");
const ledgerPath = path.join(serverRoot, "docs/spec/source-exact/frappe-framework-domain-ledger.json");
const matrixPath = path.join(repoRoot, "docs/agents/r7/R7_FRAPPE_PARITY_MATRIX.json");

const lock = await readJson(sourceLockPath);
const ledger = await readJson(ledgerPath);
const matrix = await readJson(matrixPath);

const failures = [];
const frappe = (lock.sources ?? []).find((x) => x.app === "frappe");
if (!frappe) failures.push("server/source-lock.json has no frappe entry");
if (frappe?.tag !== matrix.upstream?.tag) failures.push(`Frappe tag drift: lock=${frappe?.tag} matrix=${matrix.upstream?.tag}`);
if (frappe?.full_sha !== matrix.upstream?.full_sha) failures.push(`Frappe SHA drift: lock=${frappe?.full_sha} matrix=${matrix.upstream?.full_sha}`);
if (matrix.upstream?.full_sha?.length !== 40) failures.push("matrix upstream SHA is not a full 40-char commit");

const denominatorIds = (ledger.domains ?? []).map((x) => x.domain_id);
const matrixIds = (matrix.domains ?? []).map((x) => x.domain_id);
if (ledger.domain_count !== denominatorIds.length) failures.push(`ledger domain_count=${ledger.domain_count} but has ${denominatorIds.length} domains`);
if (matrix.denominator?.expected_domain_count !== ledger.domain_count) failures.push("matrix expected_domain_count differs from canonical ledger");
if (matrixIds.length !== ledger.domain_count) failures.push(`matrix has ${matrixIds.length} domains; expected ${ledger.domain_count}`);

const duplicates = matrixIds.filter((id, i) => matrixIds.indexOf(id) !== i);
if (duplicates.length) failures.push(`duplicate matrix domain IDs: ${[...new Set(duplicates)].join(", ")}`);
const missing = denominatorIds.filter((id) => !matrixIds.includes(id));
const unknown = matrixIds.filter((id) => !denominatorIds.includes(id));
if (missing.length) failures.push(`missing denominator domains: ${missing.join(", ")}`);
if (unknown.length) failures.push(`unknown matrix domains: ${unknown.join(", ")}`);

const allowed = new Set(matrix.allowed_classifications ?? []);
const requiredAllowed = ["EXACT_PARITY","SEMANTIC_PARITY","FORGE_SUPERSET","INTENTIONAL_DIFFERENCE","GAP","UNRESOLVED","OUT_OF_SCOPE"];
for (const c of requiredAllowed) if (!allowed.has(c)) failures.push(`allowed_classifications missing ${c}`);

const counts = Object.fromEntries(requiredAllowed.map((x) => [x, 0]));
for (const row of matrix.domains ?? []) {
  if (!allowed.has(row.classification)) {
    failures.push(`${row.domain_id}: invalid classification ${row.classification}`);
    continue;
  }
  counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  if (row.upstream_sha !== matrix.upstream.full_sha) failures.push(`${row.domain_id}: upstream SHA differs from matrix baseline`);
  if (!String(row.lane ?? "").startsWith("R7-")) failures.push(`${row.domain_id}: missing R7 lane`);
  if (["EXACT_PARITY","SEMANTIC_PARITY","FORGE_SUPERSET","INTENTIONAL_DIFFERENCE"].includes(row.classification)) {
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) failures.push(`${row.domain_id}: closed classification requires evidence`);
    if (Array.isArray(row.gaps) && row.gaps.length > 0) failures.push(`${row.domain_id}: closed classification cannot retain stale gap text`);
  }
  if (row.classification === "INTENTIONAL_DIFFERENCE" && !String(row.rationale ?? "").trim()) failures.push(`${row.domain_id}: INTENTIONAL_DIFFERENCE requires rationale`);
  if (row.classification === "OUT_OF_SCOPE" && !String(row.rationale ?? "").trim()) failures.push(`${row.domain_id}: OUT_OF_SCOPE requires rationale`);
  if (row.classification === "GAP" && (!Array.isArray(row.gaps) || row.gaps.length === 0)) failures.push(`${row.domain_id}: GAP requires at least one gap`);
}

const unresolved = (counts.GAP ?? 0) + (counts.UNRESOLVED ?? 0);
const unresolvedOnly = counts.UNRESOLVED ?? 0;
if (requireAuditComplete && unresolvedOnly !== 0) failures.push(`R7-A audit incomplete: UNRESOLVED=${unresolvedOnly}`);
if (certify && unresolved !== 0) failures.push(`R7-A closure blocked: GAP+UNRESOLVED=${unresolved}`);

const result = {
  ok: failures.length === 0,
  mode: certify ? "CERTIFY" : (requireAuditComplete ? "AUDIT_COMPLETE" : "AUDIT"),
  program: matrix.program,
  frappe: { tag: matrix.upstream.tag, sha: matrix.upstream.full_sha },
  denominator: ledger.domain_count,
  counts,
  closure_ready: unresolved === 0,
  failures
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
