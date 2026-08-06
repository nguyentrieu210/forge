import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";

const root = resolve(process.cwd(), "src");
const runtime = readFileSync(resolve(root, "main-base.tsx"), "utf8");
const registry = readFileSync(resolve(root, "experience-registry.tsx"), "utf8");
const sharedShell = readFileSync(resolve(process.cwd(), "../../packages/shell/src/WorkspaceAppShellV2.tsx"), "utf8");

const forbiddenRuntimeLiterals = [
  "./experiences/",
  'kind === "social-commerce"',
  'kind === "daily-ledger"',
  'kind === "alumdoor-operations"',
  'manifest.id === "alumdoor"',
  "AlumdoorOperationsCenter",
  "DailyDetailedLedger",
];

for (const literal of forbiddenRuntimeLiterals) {
  assert.equal(
    runtime.includes(literal),
    false,
    `main-base.tsx contains app/vertical experience knowledge ${JSON.stringify(literal)}; register it in experience-registry.tsx instead`,
  );
}

for (const required of [
  'from "./experience-registry.js"',
  "isRegisteredRuntimeExperience",
  "resolveRuntimeExperience",
  "resolveRuntimeAppChrome",
]) {
  assert.equal(runtime.includes(required), true, `main-base.tsx is missing runtime boundary ${JSON.stringify(required)}`);
}

for (const required of ["runtimeExperienceFactories", "resolveRuntimeExperience", "resolveRuntimeAppChrome", "workspaceNavigationPolicy"]) {
  assert.equal(registry.includes(required), true, `experience-registry.tsx is missing ${JSON.stringify(required)}`);
}

for (const forbidden of ["ALUMDOOR_", "isAlumdoorSurface", "Nhân sự & Tiền lương", "report:Stock Ledger", "Cutting Policy"]) {
  assert.equal(
    sharedShell.includes(forbidden),
    false,
    `WorkspaceAppShellV2.tsx contains vertical presentation knowledge ${JSON.stringify(forbidden)}; move it to app composition policy`,
  );
}
assert.equal(sharedShell.includes("workspaceNavigationPolicy"), true, "shared workspace shell must consume the generic workspace navigation policy contract");

console.log("runtime architecture boundary guard: PASS");
