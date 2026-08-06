import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(here, "../../client/apps/runtime/src/experiences");
const workspacePath = path.join(runtime, "AlumdoorSalesModeWorkspace.tsx");
const bridgePath = path.join(runtime, "AlumdoorSalesCompanyContextBridge.ts");

test("Sales Sheet consumes server-resolved context currency when legacy Company read is not found", async () => {
  const [workspace, bridge] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(bridgePath, "utf8"),
  ]);

  assert.match(workspace, /useLayoutEffect/);
  assert.match(workspace, /businessContext\.company/);
  assert.match(workspace, /businessContext\.currency/);
  assert.match(workspace, /installAlumdoorSalesCompanyContextBridge\(adapter, company, currency\)/);

  assert.match(bridge, /doctype !== "Company"/);
  assert.match(bridge, /String\(name\)\.trim\(\) !== company/);
  assert.match(bridge, /adapter\.mapError\(error\)\.kind !== "not_found"/);
  assert.match(bridge, /default_currency: currency/);
  assert.match(bridge, /adapter\.getDoc = originalGetDoc/);

  assert.doesNotMatch(bridge, /createDoc\(/, "fallback must never create Company data");
  assert.doesNotMatch(bridge, /updateDoc\(/, "fallback must never mutate Company data");
  assert.doesNotMatch(bridge, /currency:\s*"VND"/, "currency must come from resolved context, never hardcode VND");
});
