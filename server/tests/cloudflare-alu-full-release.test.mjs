import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const script = readFileSync(path.join(serverRoot, "scripts", "cloudflare-alu-full-release.sh"), "utf8");

test("Cloudflare full ALU release preserves the canonical production sequence", () => {
  const required = [
    "git merge-base --is-ancestor \"$TARGET_SHA\" origin/main",
    "FORGE_CLOUDFLARE_FULL_RELEASE:-",
    "pnpm --filter cloudforge run build",
    "pnpm --filter metaforge run build",
    "node server/scripts/stage-client-bundle.mjs",
    "node scripts/migrate-tenant.mjs --tenant \"$TENANT\"",
    "node server/scripts/backup-tenant.mjs",
    "node server/scripts/verify-tenant-backup.mjs",
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

test("Cloudflare full ALU release does not silently turn ordinary pushes into full production mutation", () => {
  assert.match(script, /FORGE_CLOUDFLARE_FULL_RELEASE=alu/);
  assert.match(script, /Refusing full ALU release/);
  assert.doesNotMatch(script, /FORGE_CLOUDFLARE_FULL_RELEASE:-alu/);
});
