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
const backlog = await readJson(path.join(repoRoot, "docs/agents/r7/R7_GAP_BACKLOG.json"));
const sourceReviews = await Promise.all([
  "R7_MIGRATION_SOURCE_REVIEW.json", "R7_WEBSITE_SOURCE_REVIEW.json", "R7_INTEGRATION_SOURCE_REVIEW.json",
].map((name) => readJson(path.join(repoRoot, "docs/agents/r7", name))));

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
      assert.equal((row.gaps ?? []).length, 0, `${row.domain_id} closed row retains stale gaps`);
    }
    if (row.classification === "INTENTIONAL_DIFFERENCE") assert.ok(String(row.rationale ?? "").trim(), `${row.domain_id} needs intentional-difference rationale`);
    if (row.classification === "OUT_OF_SCOPE") {
      assert.ok(String(row.rationale ?? "").trim(), `${row.domain_id} needs OUT_OF_SCOPE rationale`);
    }
    if (row.classification === "GAP") {
      assert.ok(Array.isArray(row.gaps) && row.gaps.length > 0, `${row.domain_id} needs explicit gap`);
    }
  }
});

test("R7 audit has no unresolved Frappe 16 domains", () => {
  const unresolved = matrix.domains.filter((row) => row.classification === "UNRESOLVED");
  assert.deepEqual(unresolved, [], "every denominator domain must have an evidence-backed audit disposition");
});

test("R7 gap backlog contains exactly the current matrix gaps", () => {
  const gaps = matrix.domains.filter((row) => row.classification === "GAP");
  assert.equal(backlog.gap_count, gaps.length);
  assert.deepEqual(backlog.gaps.map((row) => row.domain_id), gaps.map((row) => row.domain_id));
  for (const row of backlog.gaps) {
    assert.deepEqual(row.gaps, gaps.find((gap) => gap.domain_id === row.domain_id).gaps);
  }
});

test("R7 final source reviews are pinned to the canonical Frappe SHA and close only as intentional differences", () => {
  for (const review of sourceReviews) {
    assert.equal(review.upstream.full_sha, matrix.upstream.full_sha, review.domain_id);
    assert.equal(review.classification, "INTENTIONAL_DIFFERENCE", review.domain_id);
    assert.ok(Array.isArray(review.intentional_differences) && review.intentional_differences.length > 0, review.domain_id);
  }
});

test("R7 platform certification has no GAP or UNRESOLVED disposition", () => {
  const blocking = matrix.domains.filter((row) => ["GAP", "UNRESOLVED"].includes(row.classification));
  assert.deepEqual(blocking, []);
  assert.equal(backlog.gap_count, 0);
  assert.deepEqual(backlog.gaps, []);
});
