import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

const lock = await readJson(path.join(serverRoot, "source-lock.json"));
const ledger = await readJson(path.join(serverRoot, "docs/spec/source-exact/frappe-framework-domain-ledger.json"));
const matrix = await readJson(path.join(repoRoot, "docs/agents/r7/R7_FRAPPE_PARITY_MATRIX.json"));

test("R7 Frappe matrix is bound to canonical Frappe 16 source lock", () => {
  const frappe = lock.sources.find((x) => x.app === "frappe");
  assert.ok(frappe);
  assert.equal(frappe.tag, "v16.19.0");
  assert.equal(frappe.full_sha, "ba18090b141740e75d52aa97bfc525ff2f831f6c");
  assert.equal(matrix.upstream.tag, frappe.tag);
  assert.equal(matrix.upstream.full_sha, frappe.full_sha);
});

test("R7 Frappe matrix covers the canonical 28-domain denominator exactly once", () => {
  assert.equal(ledger.domain_count, 28);
  assert.equal(ledger.domains.length, 28);
  assert.equal(matrix.domains.length, 28);
  const canonical = new Set(ledger.domains.map((x) => x.domain_id));
  const actual = matrix.domains.map((x) => x.domain_id);
  assert.equal(new Set(actual).size, actual.length, "matrix contains duplicate domain IDs");
  assert.deepEqual(new Set(actual), canonical);
});

test("R7 closed dispositions carry evidence and out-of-scope rows carry rationale", () => {
  const closed = new Set(["EXACT_PARITY", "SEMANTIC_PARITY", "FORGE_SUPERSET", "INTENTIONAL_DIFFERENCE"]);
  for (const row of matrix.domains) {
    assert.equal(row.upstream_sha, matrix.upstream.full_sha, row.domain_id);
    if (closed.has(row.classification)) {
      assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, `${row.domain_id} needs evidence`);
    }
    if (row.classification === "OUT_OF_SCOPE") {
      assert.ok(String(row.rationale ?? "").trim(), `${row.domain_id} needs OUT_OF_SCOPE rationale`);
    }
    if (row.classification === "GAP") {
      assert.ok(Array.isArray(row.gaps) && row.gaps.length > 0, `${row.domain_id} needs explicit gap`);
    }
  }
});

test("R7 certification remains blocked while GAP or UNRESOLVED exists", () => {
  const blockers = matrix.domains.filter((row) => row.classification === "GAP" || row.classification === "UNRESOLVED");
  assert.ok(blockers.length > 0, "do not silently turn the initial R7 baseline into a closure claim");
});
