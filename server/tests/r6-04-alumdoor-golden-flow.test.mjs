import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R6-04 target observer is read-only apart from authentication", async () => {
  const source = await readFile(new URL("../scripts/r6-04-alumdoor-identity-readonly.mjs", import.meta.url), "utf8");

  assert.match(source, /\/release\.json/);
  assert.match(source, /get_app_manifest\?app=/);
  assert.match(source, /get_capability_profile/);
  assert.match(source, /capability_profile_active/);
  assert.match(source, /capability_profile_revisions/);
  assert.match(source, /SELECT a\.profile_id, a\.version, r\.content_hash/);
  assert.match(source, /PILOT_TARGET_OBSERVED/);
  assert.match(source, /mutation: "NONE"/);

  // Authentication is allowed to establish a session for read-only evidence.
  assert.match(source, /raw\("POST", "\/api\/method\/login"/);

  // No business document, app install, migration, provider or D1 mutation is allowed.
  assert.doesNotMatch(source, /\/api\/resource\/[^`"']+.*(?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(source, /frappe\.client\.(?:insert|save|submit|cancel|delete)/);
  assert.doesNotMatch(source, /wrangler[^\n]*(?:deploy|delete|secret|route|kv\s+put|d1\s+migrations\s+apply)/i);
  assert.match(source, /refuses mutating Wrangler arguments/);
});

test("existing Golden Order verifier remains evidence-only and canonical-ledger based", async () => {
  const source = await readFile(new URL("../scripts/verify-alumdoor-golden-order-readonly.mjs", import.meta.url), "utf8");

  assert.match(source, /"Stock Ledger"/);
  assert.match(source, /"Accounts Receivable"/);
  assert.match(source, /linkedDeliveryNames/);
  assert.match(source, /warrantyLookupFilters/);
  assert.match(source, /expected-release-sha/);
  assert.doesNotMatch(source, /frappe\.client\.submit/);
  assert.doesNotMatch(source, /raw\("(?:PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /call\("POST", `\/api\/resource/);
});
