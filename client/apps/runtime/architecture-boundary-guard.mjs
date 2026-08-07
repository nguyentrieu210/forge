import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";

const root = resolve(process.cwd(), "src");
const runtime = readFileSync(resolve(root, "main-base.tsx"), "utf8");
const registry = readFileSync(resolve(root, "experience-registry.tsx"), "utf8");
const sharedShell = readFileSync(resolve(process.cwd(), "../../packages/shell/src/WorkspaceAppShellV2.tsx"), "utf8");

for (const literal of [
  "./experiences/",
  "Alumdoor",
  "SocialCommerce",
  "DailyDetailedLedger",
  "ApprovalInbox",
]) {
  assert.equal(
    registry.includes(literal),
    false,
    `experience-registry.tsx contains hard-coded app/vertical runtime knowledge ${JSON.stringify(literal)}`,
  );
}

for (const required of [
  "isRegisteredRuntimeExperience(_key: string): boolean",
  "return false;",
  "resolveRuntimeExperience(_context: RuntimeExperienceContext)",
  "resolveRuntimeDoctypeExperience(_context: RuntimeDoctypeExperienceContext)",
  "resolveRuntimeAppChrome(_appId: string)",
  "return {};",
]) {
  assert.equal(registry.includes(required), true, `generic runtime reset contract is missing ${JSON.stringify(required)}`);
}

for (const forbiddenRuntimeLiterals of [
  "./experiences/",
  'manifest.id === "alumdoor"',
  "AlumdoorOperationsCenter",
  "DailyDetailedLedger",
]) {
  assert.equal(
    runtime.includes(forbiddenRuntimeLiterals),
    false,
    `main-base.tsx contains app/vertical experience knowledge ${JSON.stringify(forbiddenRuntimeLiterals)}`,
  );
}

for (const required of [
  'from "./experience-registry.js"',
  "isRegisteredRuntimeExperience",
  "resolveRuntimeExperience",
  "resolveRuntimeAppChrome",
]) {
  assert.equal(runtime.includes(required), true, `main-base.tsx is missing compatibility boundary ${JSON.stringify(required)}`);
}

for (const forbidden of ["ALUMDOOR_", "isAlumdoorSurface", "Nhân sự & Tiền lương", "report:Stock Ledger", "Cutting Policy"]) {
  assert.equal(
    sharedShell.includes(forbidden),
    false,
    `WorkspaceAppShellV2.tsx contains vertical presentation knowledge ${JSON.stringify(forbidden)}`,
  );
}

console.log("runtime generic-only architecture guard: PASS");
