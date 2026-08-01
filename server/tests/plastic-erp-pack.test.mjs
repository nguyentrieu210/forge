import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

test("plastic ERP source passes canonical app pack check", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/pack-app.mjs", "apps-src/plastic-erp", "--check"],
    { cwd: serverRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PACK_CHECK_PASS/);
  assert.match(result.stdout, /plastic-erp@0\.1\.0/);
});
