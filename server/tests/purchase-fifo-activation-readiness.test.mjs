import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildBackfillArgs,
  parseReadinessArgs,
  resolveEvidenceDirectory,
} from "../scripts/prepare-purchase-fifo-activation.mjs";

test("readiness command accepts only read-only inputs", () => {
  assert.deepEqual(parseReadinessArgs([
    "--tenant", "staging-alu",
    "--input", "fixtures/purchase.json",
    "--output-dir", "/tmp/forge-evidence",
  ]), {
    tenant: "staging-alu",
    input: "fixtures/purchase.json",
    outputDir: "/tmp/forge-evidence",
  });

  for (const flag of ["--execute", "--activate", "--confirm", "--actor", "--expected-checksum"]) {
    assert.throws(
      () => parseReadinessArgs(["--tenant", "staging-alu", flag, "value"]),
      /forbidden in the read-only readiness command/,
    );
  }
});

test("readiness evidence cannot be written inside the repository", () => {
  const repositoryRoot = path.resolve("/workspace/forge");
  assert.throws(
    () => resolveEvidenceDirectory(".", {
      cwd: repositoryRoot,
      repositoryRoot,
      tempRoot: "/tmp",
    }),
    /must be outside repository/,
  );
  assert.throws(
    () => resolveEvidenceDirectory("server/work/evidence", {
      cwd: repositoryRoot,
      repositoryRoot,
      tempRoot: "/tmp",
    }),
    /must be outside repository/,
  );
  assert.equal(
    resolveEvidenceDirectory("/tmp/forge-purchase-evidence", {
      cwd: repositoryRoot,
      repositoryRoot,
      tempRoot: "/tmp",
    }),
    path.resolve("/tmp/forge-purchase-evidence"),
  );
});

test("readiness wrapper never forwards write or activation flags", () => {
  const args = buildBackfillArgs({
    tenant: "staging-alu",
    input: "fixtures/purchase.json",
  }, "/tmp/report.json");

  assert.deepEqual(args, [
    path.join("scripts", "backfill-purchase-receipt-allocations.mjs"),
    "--tenant", "staging-alu",
    "--output", "/tmp/report.json",
    "--input", "fixtures/purchase.json",
  ]);
  assert.equal(args.includes("--execute"), false);
  assert.equal(args.includes("--activate"), false);
});
