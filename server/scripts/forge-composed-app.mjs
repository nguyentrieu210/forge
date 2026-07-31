#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { readComposedBrief } from "./lib/read-composed-brief.mjs";

const args = process.argv.slice(2);
const sourceIndex = args.findIndex((value, index) => !value.startsWith("--") && !args[index - 1]?.startsWith("--"));
if (sourceIndex < 0) {
  console.error("usage: node scripts/forge-composed-app.mjs <overlay.json> [forge-app options]");
  process.exit(1);
}

const source = path.resolve(args[sourceIndex]);
let directory;
try {
  const brief = await readComposedBrief(source);
  directory = await mkdtemp(path.join(os.tmpdir(), "forge-composed-brief-"));
  const composedPath = path.join(directory, "brief.json");
  await writeFile(composedPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");

  const forwarded = [...args];
  forwarded[sourceIndex] = composedPath;
  const child = spawn(process.execPath, [path.resolve(import.meta.dirname, "forge-app.mjs"), ...forwarded], {
    stdio: "inherit",
    env: process.env,
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (value, signal) => {
      if (signal) reject(new Error(`forge-app terminated by ${signal}`));
      else resolve(value ?? 1);
    });
  });
  process.exitCode = code;
} catch (error) {
  console.error(`COMPOSED_BRIEF_FAILED ${error.message}`);
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
