#!/usr/bin/env node
/** Refuses a release from an unreviewable source state. */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fail, serverRoot } from "./wrangler-cli.mjs";

function git(args) {
  const result = spawnSync("git", args, { cwd: serverRoot, encoding: "utf8" });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed\n${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

const dirty = git(["status", "--porcelain", "--untracked-files=all"]);
if (dirty) fail(`release source is dirty; commit or remove every change first\n${dirty}`);

const whitespace = git(["diff", "--check", "HEAD^", "HEAD"]);
if (whitespace) fail(`release commit contains whitespace errors\n${whitespace}`);

const branch = git(["branch", "--show-current"]);
if (["main", "master"].includes(branch) && process.env.FORGE_ALLOW_PROTECTED_RELEASE !== "1") {
  fail(`refusing a direct release from protected branch ${branch}; use a reviewed release branch (or set FORGE_ALLOW_PROTECTED_RELEASE=1 in controlled CI)`);
}

const commit = git(["rev-parse", "HEAD"]);
console.log(JSON.stringify({ ok: true, branch: branch || "detached", commit, clean: true }, null, 2));
