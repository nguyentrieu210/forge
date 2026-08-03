import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adapterPath = fileURLToPath(new URL("../../client/packages/adapter-frappe/src/frappe-adapter.ts", import.meta.url));
const source = readFileSync(adapterPath, "utf8");

test("Frappe adapter keeps one session-scoped D1 bookmark transport seam", () => {
  assert.match(source, /private d1Bookmark\s*=\s*""/);
  assert.match(source, /headers\.set\("x-d1-bookmark", this\.d1Bookmark\)/);
  assert.match(source, /response\.headers\?\.\["x-d1-bookmark"\]/);
});

test("bookmark is cleared at authentication/session boundaries", () => {
  const resets = source.match(/this\.d1Bookmark\s*=\s*""/g) ?? [];
  // field initialization + auth/session resets. This deliberately fails if the
  // transport survives logout/login/session expiry and can cross an identity boundary.
  assert.ok(resets.length >= 4, `expected bookmark initialization/resets, found ${resets.length}`);
  assert.match(source, /async login\([\s\S]*?this\.d1Bookmark\s*=\s*""/);
  assert.match(source, /async logout\([\s\S]*?this\.d1Bookmark\s*=\s*""/);
  assert.match(source, /coreMapError\(error\)\.kind === "auth"[\s\S]*?this\.d1Bookmark\s*=\s*""/);
});
