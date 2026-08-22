import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { evaluateSourceAppPackages } from "../scripts/lib/alumdoor-import-gate-apps.mjs";

const stable = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))));
const hash = (value) => createHash("sha256").update(stable(value)).digest("hex");
const parser = (value) => ({ id: value.id, version: value.version, nav: value.nav ?? [] });

test("source app gate requires package hash, version and parsed manifest to match", () => {
  const pkg = { version: "1.0.0", id: "alumdoor" };
  const manifest = parser(pkg);
  const result = evaluateSourceAppPackages({
    candidates: [{ expected_id: "alumdoor", file: "alumdoor.json", package_value: pkg }],
    installedRows: [{ app_id: "alumdoor", version: "1.0.0", content_hash: hash(pkg), manifest_json: JSON.stringify(manifest) }],
    parseManifest: parser,
  });
  assert.equal(result.stale_count, 0);
  assert.equal(result.packages[0].exact, true);
});

test("same version with changed content is stale", () => {
  const pkg = { id: "alumdoor", version: "1.0.0", nav: [{ key: "new" }] };
  const result = evaluateSourceAppPackages({
    candidates: [{ expected_id: "alumdoor", file: "alumdoor.json", package_value: pkg }],
    installedRows: [{ app_id: "alumdoor", version: "1.0.0", content_hash: "0".repeat(64), manifest_json: JSON.stringify(parser(pkg)) }],
    parseManifest: parser,
  });
  assert.equal(result.stale_count, 1);
  assert.match(result.packages[0].reasons.join(" "), /content hash differs/);
});

test("missing compiled dependency package fails closed", () => {
  const result = evaluateSourceAppPackages({
    candidates: [{ expected_id: "hrm", file: "hrm.json", package_value: null }],
    installedRows: [],
    parseManifest: parser,
  });
  assert.equal(result.stale_count, 1);
  assert.equal(result.packages[0].exact, false);
});
