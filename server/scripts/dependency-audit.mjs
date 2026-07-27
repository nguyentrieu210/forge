#!/usr/bin/env node
/** Fails CI on dependency advisories, except explicitly bounded non-applicable risks. */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const windows = process.platform === "win32";
const command = windows ? (process.env.ComSpec || "cmd.exe") : "pnpm";
const commandArgs = windows ? ["/d", "/s", "/c", "pnpm.cmd audit --json"] : ["audit", "--json"];
const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8" });
if (result.error) throw result.error;

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error(result.stderr || result.stdout || "pnpm audit returned no JSON");
  process.exit(1);
}

const advisories = Object.entries(report.advisories ?? {});
const accepted = new Set(["1124282"]);
const unexpected = advisories.filter(([id]) => !accepted.has(id));
const missingPatch = advisories.find(([id]) => id === "1124282");

// GHSA behind npm advisory 1124282 only affects React Router RSC Mode. Forge uses
// declarative BrowserRouter. Keep the exception valid only while no RSC entrypoint or
// runtime is introduced; if that architecture changes, CI fails even on the allowlist.
if (missingPatch && usesReactServerComponents(path.join(root, "client"))) {
  console.error("dependency audit failed: React Router RSC advisory is no longer non-applicable");
  process.exit(1);
}

if (unexpected.length) {
  for (const [id, advisory] of unexpected) {
    console.error(`${id} ${advisory.module_name ?? "dependency"}: ${advisory.title ?? "security advisory"}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  vulnerabilities: report.metadata?.vulnerabilities ?? {},
  accepted_risks: missingPatch ? [{
    advisory: "1124282",
    package: "react-router",
    scope: "RSC Mode only; Forge uses declarative BrowserRouter",
    drop_in_patch_available: false,
    remediation: "migrate to React Router 8 and React 19 before enabling RSC",
  }] : [],
}, null, 2));

function usesReactServerComponents(directory) {
  const needles = ["react-router/rsc", "RSCHydratedRouter", "RSCStaticRouter", "createCallServer"];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current)) {
      if (["node_modules", "dist", ".git"].includes(entry)) continue;
      const target = path.join(current, entry);
      if (statSync(target).isDirectory()) pending.push(target);
      else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry)) {
        const source = readFileSync(target, "utf8");
        if (needles.some((needle) => source.includes(needle))) return true;
      }
    }
  }
  return false;
}
