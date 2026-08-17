#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const seed = await readFile(new URL("./seed-local.mjs", import.meta.url), "utf8");
const smoke = await readFile(new URL("./http-smoke.mjs", import.meta.url), "utf8");

const visitPermission = seed.match(
  /permissions:\s*\[\{([\s\S]*?)\}\],\s*revision:\s*1,\s*\};/,
)?.[1] ?? "";

assert.match(visitPermission, /role:\s*["']System Manager["']/);
assert.match(
  visitPermission,
  /delete:\s*true/,
  "Field Visit smoke fixture must grant delete so submitted-delete reaches lifecycle validation instead of failing earlier at DocPerm",
);
assert.match(
  smoke,
  /deleted\.status\s*===\s*417\s*&&\s*\/submitted document cannot be deleted\/i,
  "HTTP smoke must keep asserting Frappe lifecycle ValidationError/417 for submitted delete",
);

console.log("HTTP_SMOKE_FIXTURE_CONTRACT_PASS");
