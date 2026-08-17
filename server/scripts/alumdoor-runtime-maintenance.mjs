#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const serviceHome = process.env.ALUMDOOR_SERVICE_HOME || "C:\\ForgeServices\\Alumdoor";
const maintenanceFile =
  process.env.ALUMDOOR_SERVICE_MAINTENANCE || `${serviceHome}\\maintenance.flag`;

const action = (process.argv[2] || "status").toLowerCase();

function installed() {
  return existsSync(serviceHome);
}

function enabled() {
  return existsSync(maintenanceFile);
}

if (action === "status") {
  console.log(
    `ALUMDOOR_RUNTIME_MAINTENANCE installed=${installed()} enabled=${enabled()} file=${maintenanceFile}`,
  );
  process.exit(0);
}

if (!installed()) {
  // The repository must remain usable before the optional Windows services are
  // installed. In that mode run-local.bat falls back to the existing console
  // launch path and stop-local-dev.mjs owns process cleanup.
  console.log(`ALUMDOOR_RUNTIME_SERVICES_ABSENT action=${action}`);
  process.exit(0);
}

if (action === "on") {
  mkdirSync(dirname(maintenanceFile), { recursive: true });
  writeFileSync(
    maintenanceFile,
    `maintenance requested ${new Date().toISOString()} pid=${process.pid}\n`,
    "utf8",
  );
  console.log(`ALUMDOOR_RUNTIME_MAINTENANCE_ON file=${maintenanceFile}`);
  process.exit(0);
}

if (action === "off") {
  rmSync(maintenanceFile, { force: true });
  console.log(`ALUMDOOR_RUNTIME_MAINTENANCE_OFF file=${maintenanceFile}`);
  process.exit(0);
}

console.error(`Unknown action '${action}'. Use on, off, or status.`);
process.exit(2);
