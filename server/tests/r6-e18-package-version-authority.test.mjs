import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const scriptPath = path.join(root, "server/scripts/r6-convergence-identity-readonly.mjs");
const convergenceWorkflowPath = path.join(root, ".github/workflows/r6-pass-convergence.yml");
const postReleaseWorkflowPath = path.join(root, ".github/workflows/r6-post-release-certification.yml");
const briefPath = path.join(root, "server/briefs/alumdoor-v2.json");

test("R6 E18 package expectation follows the merged Alumdoor brief instead of a frozen literal", async () => {
  const [script, convergenceWorkflow, postReleaseWorkflow, brief] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(convergenceWorkflowPath, "utf8"),
    readFile(postReleaseWorkflowPath, "utf8"),
    readBriefSource(briefPath),
  ]);

  assert.equal(brief.id, "alumdoor");
  assert.equal(typeof brief.version, "string");
  assert.ok(brief.version.length > 0);

  assert.match(script, /readBriefSource/);
  assert.match(script, /expectedAlumdoorVersion/);
  assert.match(script, /expected_packages:\s*\{\s*alumdoor:\s*expectedAlumdoorVersion\s*\}/);
  assert.doesNotMatch(script, /alumdoor\.version\s*!==\s*["']2\.2\.3["']/);
  assert.doesNotMatch(script, /not_2\.2\.3/);

  assert.match(convergenceWorkflow, /EXPECTED_ALUMDOOR_VERSION/);
  assert.match(convergenceWorkflow, /--expected-alumdoor-version\s+"\$EXPECTED_ALUMDOOR_VERSION"/);

  // The post-release workflow may omit the explicit flag because E18 resolves the exact
  // checkout's brief as its fallback authority. Keep the caller present so that fallback
  // compatibility remains deliberate rather than dead code.
  assert.match(postReleaseWorkflow, /r6-convergence-identity-readonly\.mjs/);
});
