import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const script = readFileSync(path.join(serverRoot, "scripts", "cloudflare-alu-full-release.sh"), "utf8");

test("Cloudflare full ALU release preserves build, migration and deploy sequence", () => {
  const required = [
    "git merge-base --is-ancestor \"$TARGET_SHA\" origin/main",
    "expected main",
    "FORGE_CLOUDFLARE_FULL_RELEASE:-",
    "pnpm --filter cloudforge run build",
    "pnpm --filter metaforge run build",
    "node server/scripts/stage-client-bundle.mjs",
    "unset WRANGLER_CI_OVERRIDE_NAME",
    "node scripts/migrate-tenant.mjs --tenant \"$TENANT\"",
    "node scripts/migrate-tenant.mjs \\",
    "node scripts/deploy-tenant.mjs \\",
    "apps-src/alumdoor-worker/wrangler.jsonc",
    "--dispatch-namespace \"$DISPATCH_NAMESPACE\"",
    "apps/gateway-worker/wrangler.jsonc",
  ];

  for (const marker of required) {
    assert.ok(script.includes(marker), `missing full-release marker: ${marker}`);
  }
});

test("Cloudflare full ALU release intentionally performs no backup in this lane", () => {
  assert.doesNotMatch(script, /backup-tenant\.mjs/);
  assert.doesNotMatch(script, /verify-tenant-backup\.mjs/);
  assert.match(script, /without backup \(explicit operator choice\)/);
});

test("Cloudflare full ALU release requires main plus explicit production secret", () => {
  assert.match(script, /FORGE_CLOUDFLARE_FULL_RELEASE=alu/);
  assert.match(script, /Refusing full ALU release/);
  assert.match(script, /expected main/);
  assert.doesNotMatch(script, /FORGE_CLOUDFLARE_FULL_RELEASE:-alu/);
});

test("Cloudflare connected-build Worker name cannot override nested Worker deploys", () => {
  const unsetAt = script.indexOf("unset WRANGLER_CI_OVERRIDE_NAME");
  const appDeployAt = script.indexOf("Deploying Alumdoor app Worker");
  const gatewayDeployAt = script.indexOf("Deploying Gateway");
  assert.ok(unsetAt >= 0, "must clear Workers Builds name override");
  assert.ok(unsetAt < appDeployAt, "must clear override before Alumdoor deploy");
  assert.ok(unsetAt < gatewayDeployAt, "must clear override before Gateway deploy");
});

test("docs and markdown-only commits cannot reach production mutation", () => {
  assert.match(script, /docs\/\*\|\*\.md/);
  assert.match(script, /is_docs_only_change/);
  assert.match(script, /SKIP_MARKER/);
  assert.match(script, /production build skipped: docs\/\*\* and\/or \*\.md only/);
  assert.match(script, /production deploy skipped: docs\/\*\* and\/or \*\.md only/);

  const buildSkipAt = script.indexOf("if is_docs_only_change");
  const buildAt = script.indexOf("pnpm --filter cloudforge run build");
  const deploySkipAt = script.indexOf('if [ -f "$SKIP_MARKER" ]');
  const migrateAt = script.indexOf("Migrating tenant $TENANT without backup");

  assert.ok(buildSkipAt >= 0 && buildSkipAt < buildAt, "docs-only gate must run before build");
  assert.ok(deploySkipAt >= 0 && deploySkipAt < migrateAt, "docs-only gate must run before migration/deploy");
});
