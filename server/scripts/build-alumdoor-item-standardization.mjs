#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandardization } from "./lib/alumdoor-item-standardization.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const sqlPath = resolve(repoRoot, "server", "imports", "alumdoor-item-standardization-2026-07-30.sql");
const auditPath = resolve(repoRoot, "server", "imports", "alumdoor-item-standardization-2026-07-30.audit.json");

const { sql, audit } = await buildStandardization(repoRoot);
await writeFile(sqlPath, sql, "utf8");
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
process.stdout.write(`${sqlPath}\n${auditPath}\n`);
